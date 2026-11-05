// Song recognition fingerprint. Turns 16 kHz mono PCM into the compact
// "signature" that Shazam's recognition service accepts: a sliding 2048-point
// spectrum every 128 samples, spectral peaks picked against their past
// neighbours, binned into four frequency bands and packed into a small binary
// blob. Written from the public description of the format (reverse engineered
// by the SongRec project). Only peaks leave the device, never audio.
//
// Works in the browser, in a Worker and in Node. No dependencies.

const N = 2048, STEP = 128, BINS = 1025, HIST = 256, RATE = 16000;
const NEAR = [-10, -7, -4, -3, 1, 2, 5, 8];                       // same spectrum, 3 passes back
const FAR = [-53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249];   // ring offsets, other passes
const BAND_HZ = [250, 520, 1450, 3500, 5500];
const HZ_PER_BIN64 = RATE / 2 / 1024 / 64;

// Hann window over 2049 points with both end points dropped, so no sample is ever zeroed.
const WIN = new Float64Array(N);
for (let i = 0; i < N; i++) WIN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 1) / (N + 1));

// Radix-2 FFT tables.
const REV = new Uint16Array(N);
for (let i = 0; i < N; i++) { let r = 0, x = i; for (let b = 0; b < 11; b++) { r = (r << 1) | (x & 1); x >>= 1; } REV[i] = r; }
const TW_RE = new Float64Array(N / 2), TW_IM = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) { TW_RE[i] = Math.cos(-2 * Math.PI * i / N); TW_IM[i] = Math.sin(-2 * Math.PI * i / N); }
const re = new Float64Array(N), im = new Float64Array(N);

// Power spectrum of a windowed 2048-sample frame, scaled the way the format expects.
function power(src, out) {
  for (let i = 0; i < N; i++) { re[REV[i]] = src[i]; im[REV[i]] = 0; }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, stride = N / size;
    for (let start = 0; start < N; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = TW_RE[k * stride], wi = TW_IM[k * stride], a = start + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  for (let i = 0; i < BINS; i++) {
    const v = (re[i] * re[i] + im[i] * im[i]) / 131072;
    out[i] = v < 1e-10 ? 1e-10 : v;
  }
}

const wrap = i => ((i % HIST) + HIST) % HIST;

export class Fingerprinter {
  constructor() {
    this.ring = new Float64Array(N); this.ringPos = 0;
    this.frame = new Float64Array(N);
    this.raw = Array.from({ length: HIST }, () => new Float64Array(BINS));
    this.spread = Array.from({ length: HIST }, () => new Float64Array(BINS));
    this.pos = 0;            // next write slot in the spectrum rings
    this.passes = 0;
    this.peaks = [[], [], [], []];
    this.samples = 0;
    this.carry = new Float64Array(STEP); this.carryN = 0;
  }

  // Feed 16 kHz mono samples on the 16-bit integer scale (-32768..32767).
  feed(pcm) {
    this.samples += pcm.length;
    let i = 0;
    if (this.carryN) {
      while (this.carryN < STEP && i < pcm.length) this.carry[this.carryN++] = pcm[i++];
      if (this.carryN < STEP) return;
      this.pass(this.carry, 0); this.carryN = 0;
    }
    for (; i + STEP <= pcm.length; i += STEP) this.pass(pcm, i);
    while (i < pcm.length) this.carry[this.carryN++] = pcm[i++];
  }

  pass(src, off) {
    const ring = this.ring;
    for (let i = 0; i < STEP; i++) ring[(this.ringPos + i) % N] = src[off + i];
    this.ringPos = (this.ringPos + STEP) % N;
    for (let i = 0; i < N; i++) this.frame[i] = ring[(this.ringPos + i) % N] * WIN[i];

    const raw = this.raw[this.pos], sp = this.spread[this.pos];
    power(this.frame, raw);

    // Spread each peak over the next two bins and back over three earlier passes,
    // so a peak only counts if it stands above its neighbourhood in time and frequency.
    const p1 = this.spread[wrap(this.pos - 1)], p3 = this.spread[wrap(this.pos - 3)], p6 = this.spread[wrap(this.pos - 6)];
    for (let i = 0; i < BINS; i++) {
      let v = raw[i];
      if (i < 1023) v = Math.max(v, raw[i + 1], raw[i + 2]);
      sp[i] = v;
      v = p1[i] = Math.max(p1[i], v);
      v = p3[i] = Math.max(p3[i], v);
      p6[i] = Math.max(p6[i], v);
    }
    this.pos = (this.pos + 1) % HIST;
    this.passes++;
    if (this.passes >= 46) this.pick();
  }

  // Peaks are judged 46 passes late so their future is known as well as their past.
  pick() {
    const m46 = this.raw[wrap(this.pos - 46)], s49 = this.spread[wrap(this.pos - 49)];
    const far = FAR.map(o => this.spread[wrap(this.pos + o)]);
    for (let bin = 10; bin < 1015; bin++) {
      const v = m46[bin];
      if (v < 1 / 64 || v < s49[bin - 1]) continue;
      let mx = 0;
      for (const o of NEAR) mx = Math.max(mx, s49[bin + o]);
      if (v <= mx) continue;
      for (const f of far) mx = Math.max(mx, f[bin - 1]);
      if (v <= mx) continue;

      const mag = Math.log(Math.max(1 / 64, v)) * 1477.3 + 6144;
      const before = Math.log(Math.max(1 / 64, m46[bin - 1])) * 1477.3 + 6144;
      const after = Math.log(Math.max(1 / 64, m46[bin + 1])) * 1477.3 + 6144;
      const curve = mag * 2 - before - after;
      const fine = bin * 64 + (after - before) * 32 / curve;
      const hz = fine * HZ_PER_BIN64;
      if (hz < BAND_HZ[0] || hz > BAND_HZ[4]) continue;
      const band = hz <= BAND_HZ[1] ? 0 : hz <= BAND_HZ[2] ? 1 : hz <= BAND_HZ[3] ? 2 : 3;
      this.peaks[band].push(this.passes - 46, Math.round(mag), Math.round(fine));
    }
  }

  get peakCount() { return this.peaks.reduce((n, p) => n + p.length / 3, 0); }
  get samplems() { return Math.round(this.samples / RATE * 1000); }

  // Binary signature: a 48-byte header, then one length-prefixed block of peaks per band.
  encode() {
    const body = [];
    for (let band = 0; band < 4; band++) {
      const pk = this.peaks[band];
      if (!pk.length) continue;
      const part = [];
      let last = 0;
      for (let i = 0; i < pk.length; i += 3) {
        const pass = pk[i], mag = pk[i + 1] - 1, bin = pk[i + 2] - 1;
        if (pass - last >= 0xff) { part.push(0xff, pass & 255, (pass >> 8) & 255, (pass >> 16) & 255, (pass >> 24) & 255); last = pass; }
        part.push(pass - last, mag & 255, (mag >> 8) & 255, bin & 255, (bin >> 8) & 255);
        last = pass;
      }
      u32(body, 0x60030040 + band); u32(body, part.length);
      for (const b of part) body.push(b);
      for (let p = (4 - part.length % 4) % 4; p > 0; p--) body.push(0);
    }
    const out = [];
    u32(out, 0xcafe2580); u32(out, 0); u32(out, body.length + 8); u32(out, 0x94119c00);
    u32(out, 0); u32(out, 0); u32(out, 0); u32(out, 3 << 27);                  // 3 = 16 kHz
    u32(out, 0); u32(out, 0); u32(out, Math.round(this.samples + RATE * 0.24)); u32(out, (15 << 19) + 0x40000);
    u32(out, 0x40000000); u32(out, body.length + 8);
    for (const b of body) out.push(b);
    const bytes = Uint8Array.from(out);
    const crc = crc32(bytes.subarray(8));
    bytes[4] = crc & 255; bytes[5] = (crc >>> 8) & 255; bytes[6] = (crc >>> 16) & 255; bytes[7] = (crc >>> 24) & 255;
    return bytes;
  }

  uri() { return 'data:audio/vnd.shazam.sig;base64,' + b64(this.encode()); }
}

function u32(arr, v) { arr.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }

let CRC;
function crc32(bytes) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
  }
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC[(crc ^ bytes[i]) & 255];
  return (crc ^ -1) >>> 0;
}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Float samples (-1..1) at any rate -> 16 kHz on the 16-bit scale, with a box
// filter over the source span of each output sample to tame aliasing.
export function toPcm16k(float32, srcRate) {
  const ratio = srcRate / RATE, n = Math.floor(float32.length / ratio);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += float32[j];
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s / (b - a) * 32767)));
  }
  return out;
}

// One-shot: 16 kHz samples in, request payload out.
export function fingerprint(pcm16k) {
  const f = new Fingerprinter();
  f.feed(pcm16k);
  return { uri: f.uri(), samplems: f.samplems, peaks: f.peakCount };
}
