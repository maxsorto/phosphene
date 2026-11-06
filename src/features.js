// Musical intelligence from the live spectrum. Turns a stream of high-resolution
// spectra into things the scenes can dance to:
//   - onsets per band (kick, snare, hat) with adaptive thresholds
//   - tempo and beat phase (autocorrelation of the onset envelope, then a phase lock)
//   - bars (the beat index where the kick lands hardest is the downbeat)
//   - energy, lift and drops (a jump after a build-up)
//   - chroma and musical key (Krumhansl-Schmuckler profile matching)
// Everything runs on the device in a fraction of a millisecond per frame.

const HOP = 0.02;                 // onset envelope rate: 50 Hz
const RING = 512;                 // 10.24 s of envelope
const MIN_BPM = 60, MAX_BPM = 200;
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const BANDS = { kick: [30, 150], snare: [150, 2600], hat: [5000, 14000], any: [30, 14000] };

export class Features {
  constructor(sampleRate = 48000, fftSize = 4096) {
    this.rate = sampleRate; this.bins = fftSize / 2;
    this.hz = sampleRate / fftSize;
    this.prev = new Float32Array(this.bins).fill(-100);
    this.range = {};
    for (const k in BANDS) this.range[k] = [Math.max(1, Math.round(BANDS[k][0] / this.hz)), Math.min(this.bins - 1, Math.round(BANDS[k][1] / this.hz))];
    // chroma: which pitch class each bin belongs to, and how much to trust it
    this.pc = new Int8Array(this.bins).fill(-1); this.pcw = new Float32Array(this.bins);
    for (let i = 1; i < this.bins; i++) {
      const f = i * this.hz;
      if (f < 55 || f > 5000) continue;
      const n = 12 * Math.log2(f / 440);
      this.pc[i] = ((Math.round(n) % 12) + 12 + 9) % 12;              // A=9
      const off = Math.abs(n - Math.round(n));                      // trust bins near a note centre
      this.pcw[i] = (1 - off * 1.6) * (f < 2000 ? 1 : 2000 / f);
    }

    this.stat = {};
    for (const k of ['kick', 'snare', 'hat', 'any']) this.stat[k] = { mean: 0, varc: 1, last: -10 };
    this.env = new Float32Array(RING); this.kenv = new Float32Array(RING);
    this.head = 0; this.slotT = 0; this.acc = 0; this.kacc = 0; this.accN = 0;

    this.f = {
      kick: 0, snare: 0, hat: 0, flux: 0, kickHit: false, snareHit: false, hatHit: false,
      bpm: 0, period: 0.5, phase: 0, bar: 0, beatNo: 0, beatPulse: 0, tempoConf: 0, locked: false,
      energy: 0, lift: 1, build: 0, drop: 0, quiet: true, quietFor: 0,
      chroma: new Float32Array(12), key: -1, minor: false, keyName: '', keyConf: 0, keyHue: 0,
      centroid: 0, pitchHz: 0, shift: 0, shiftFor: 0, chromaShift: 0, chromaShiftFor: 0,
    };
    this.fast = 0; this.slow = 0; this.peakE = 1e-3; this.slowHist = []; this.lastDrop = -10;
    this.anchor = 0; this.lastTempoT = 0; this.lastPhaseT = 0; this.cand = { bpm: 0, n: 0 };
    this.downWeights = new Float32Array(4); this.downIdx = 0; this.lastBeatNo = -1;
    this.chromaLT = new Float32Array(12); this.keyCand = { k: -1, since: 0 };
    this.quietSince = 0;
    // timbre: 24 log-spaced bands averaged per second into a 20 s ring; the last
    // 5 s are compared against the 15 s before them (no overlap, so transients
    // and section ripples average out)
    this.edges = new Int32Array(25);
    for (let i = 0; i <= 24; i++) this.edges[i] = Math.min(this.bins - 1, Math.max(1, Math.round(40 * Math.pow(300, i / 24) / this.hz)));
    this.secRing = Array.from({ length: 20 }, () => new Float32Array(24)); this.secN = 0; this.secHead = 0;
    this.secAcc = new Float32Array(24); this.secCount = 0; this.secT = 0;
    this.chRing = Array.from({ length: 20 }, () => new Float32Array(12)); this.chAcc = new Float32Array(12);
    this.tempoSince = 0; this.lockSince = 0; this.wasLocked = false; this.gridT = 0;
    this.onBeat = () => {}; this.onDrop = () => {}; this.onKey = () => {}; this.onTempoChange = () => {}; this.onGap = () => {}; this.onGrid = () => {};
  }

  // db: Float32Array of dB values, this.bins long. now in seconds. rms: time-domain
  // level 0..1 (optional); with it, "quiet" is judged against the input's own noise floor.
  update(db, now, dt, rms = null) {
    const f = this.f, r = this.range;
    // ---- spectral flux per band, on log magnitude so quiet tracks count too
    let fx = { kick: 0, snare: 0, hat: 0, any: 0 }, e = 0, cen = 0, cw = 0, pk = 0, pkI = 1;
    const chroma = f.chroma.fill(0);
    for (let i = 1; i < this.bins; i++) {
      const v = db[i] > -100 ? db[i] : -100, d = v - this.prev[i];
      this.prev[i] = v;
      const lin = Math.pow(10, v / 20);
      if (i < 1200) { e += lin * lin; cen += lin * i; cw += lin; }
      if (lin > pk && i > 2) { pk = lin; pkI = i; }
      if (this.pc[i] >= 0) chroma[this.pc[i]] += lin * this.pcw[i];
      if (d <= 0) continue;
      if (i >= r.kick[0] && i <= r.kick[1]) fx.kick += d;
      if (i >= r.snare[0] && i <= r.snare[1]) fx.snare += d;
      if (i >= r.hat[0] && i <= r.hat[1]) fx.hat += d;
      if (i >= r.any[0] && i <= r.any[1]) fx.any += d;
    }
    for (const k in fx) fx[k] /= (r[k][1] - r[k][0]);
    f.flux = fx.any;
    f.centroid = cw > 0 ? Math.min(1, (cen / cw) * this.hz / 6000) : 0;
    f.pitchHz = pkI * this.hz;

    // ---- onsets with adaptive thresholds (mean + k * std over about a second)
    for (const k of ['kick', 'snare', 'hat']) {
      const s = this.stat[k], x = fx[k];
      s.mean += (x - s.mean) * 0.02; s.varc += ((x - s.mean) ** 2 - s.varc) * 0.02;
      const th = s.mean + (k === 'kick' ? 1.6 : 2.0) * Math.sqrt(s.varc) + 0.4;
      const hit = x > th && now - s.last > (k === 'kick' ? 0.14 : 0.09) && !f.quiet;
      f[k + 'Hit'] = hit;
      if (hit) { s.last = now; f[k] = Math.min(1.5, 0.6 + (x - th) / (th + 1e-6)); }
      else f[k] *= Math.pow(k === 'hat' ? 0.001 : 0.01, dt);
    }

    // ---- energy, lift and drops
    const rms0 = Math.sqrt(e / 1200);
    this.fast += (rms0 - this.fast) * Math.min(1, dt * 8);
    this.slow += (rms0 - this.slow) * Math.min(1, dt * 0.25);
    this.peakE = Math.max(this.peakE * Math.pow(0.97, dt), this.fast, 1e-4);
    f.energy = Math.min(1, this.fast / this.peakE);
    f.lift = this.slow > 1e-5 ? this.fast / this.slow : 1;
    if (rms !== null) {
      // quiet is relative to the running music level (a 3 s average), so it works the
      // same for a loud tab and a faint microphone: 18 dB below it is a gap
      this.lvl = this.lvl === undefined ? rms : this.lvl + (rms - this.lvl) * Math.min(1, dt / 3);
      const quietRaw = rms < Math.max(0.0012, this.lvl * 0.12);
      // a skip leaves a signature: a drop to the floor for 0.12 to 2 s, then music again
      if (quietRaw) this.quietT = (this.quietT || 0) + dt;
      else { if (this.quietT > 0.12 && this.quietT < 2 && now - (this.gapT || 0) > 10) { this.gapT = now; this.onGap(this.quietT, now); } this.quietT = 0; }
      f.quiet = this.quietT > 0.35;                      // a dip between beats is not silence
    } else f.quiet = rms0 < 2e-4;
    if (!f.quiet) this.quietSince = now;
    f.quietFor = now - this.quietSince;
    if (this.slotT === 0) this.slotT = now;
    // build: is the slow energy rising over the last ~8 s?
    this.slowHist.push([now, this.slow]);
    while (this.slowHist.length && now - this.slowHist[0][0] > 8) this.slowHist.shift();
    const old = this.slowHist[0] ? this.slowHist[0][1] : this.slow;
    f.build = Math.max(0, Math.min(1, (this.slow - old) / (old + 1e-5)));
    if (f.lift > 1.9 && f.kickHit && now - this.lastDrop > 10 && this.slow > 2e-4 && this.slowHist.length > 100) {
      this.lastDrop = now; f.drop = 1; this.onDrop(now);
    }
    f.drop *= Math.pow(0.3, dt);

    // ---- onset envelope on a fixed 50 Hz grid
    this.acc += fx.any; this.kacc += fx.kick; this.accN++;
    while (now - this.slotT >= HOP) {
      this.env[this.head] = this.acc / Math.max(1, this.accN);
      this.kenv[this.head] = this.kacc / Math.max(1, this.accN);
      this.head = (this.head + 1) % RING; this.slotT += HOP;
      this.acc = 0; this.kacc = 0; this.accN = 0;
    }

    // ---- tempo every half second, phase every quarter second
    if (now - this.lastTempoT > 0.5) { this.lastTempoT = now; this.tempo(now); }
    if (f.bpm && now - this.lastPhaseT > 0.25) { this.lastPhaseT = now; this.lockPhase(now); }
    if (f.bpm) {
      const P = f.period, pos = (now - this.anchor) / P;
      f.phase = pos - Math.floor(pos);
      f.beatNo = Math.floor(pos);
      if (f.beatNo !== this.lastBeatNo) {
        this.lastBeatNo = f.beatNo; f.beatPulse = 1;
        // the downbeat is the beat where kicks hit hardest
        const idx = ((f.beatNo % 4) + 4) % 4;
        for (let i = 0; i < 4; i++) this.downWeights[i] *= 0.93;
        this.downWeights[idx] += this.kickAround(now);
        let best = 0; for (let i = 1; i < 4; i++) if (this.downWeights[i] > this.downWeights[best]) best = i;
        this.downIdx = best;
        this.onBeat(f.beatNo, idx === this.downIdx, now);
      }
      f.bar = ((((f.beatNo - this.downIdx) % 4) + 4) % 4 + f.phase) / 4;
    }
    f.beatPulse *= Math.pow(0.02, dt);
    f.locked = f.tempoConf > 0.3 && !f.quiet;
    if (f.locked && !this.wasLocked) this.lockSince = now;
    this.wasLocked = f.locked;

    // ---- chroma and key (long-term average, hysteresis on changes)
    let cmax = 1e-9; for (let i = 0; i < 12; i++) cmax = Math.max(cmax, chroma[i]);
    for (let i = 0; i < 12; i++) { chroma[i] /= cmax; this.chromaLT[i] += (chroma[i] - this.chromaLT[i]) * Math.min(1, dt * 0.2) * (f.quiet ? 0 : 1); }
    if (!f.quiet && now - (this.lastKeyT || 0) > 1) { this.lastKeyT = now; this.estimateKey(now); }

    // ---- timbre shift: the last five seconds against the fifteen before them
    if (!f.quiet) {
      const e = this.edges, acc = this.secAcc;
      for (let i = 0; i < 24; i++) {
        let sum = 0; const a = e[i], z = Math.max(a + 1, e[i + 1]);
        for (let j = a; j < z; j++) sum += Math.max(-100, db[j]);
        acc[i] += sum / (z - a);
      }
      for (let i = 0; i < 12; i++) this.chAcc[i] += chroma[i];
      this.secCount++;
      if (!this.secT) this.secT = now;
      if (now - this.secT >= 1) {
        const row = this.secRing[this.secHead], crow = this.chRing[this.secHead];
        for (let i = 0; i < 24; i++) { row[i] = acc[i] / this.secCount; acc[i] = 0; }
        for (let i = 0; i < 12; i++) { crow[i] = this.chAcc[i] / this.secCount; this.chAcc[i] = 0; }
        this.secCount = 0; this.secT = now;
        this.secHead = (this.secHead + 1) % 20; this.secN = Math.min(20, this.secN + 1);
        f.shift = this.secN >= 9 ? this.profileDistance() : 0;
        f.chromaShift = this.secN >= 9 ? this.chromaDistance() : 0;
      }
      f.shiftFor = f.shift > 0.45 ? f.shiftFor + dt : 0;
      f.chromaShiftFor = f.chromaShift > 0.3 ? f.chromaShiftFor + dt : 0;
    } else { f.shift = 0; f.shiftFor = 0; }
  }

  // Mean band difference in dB between the two windows with loudness removed (so
  // a volume change alone is not a change of song), scaled so 8 dB reads as 1.
  // A chorus moves a few dB; a different record moves the tilt and the formants more.
  profileDistance() {
    const a = new Float32Array(24), b = new Float32Array(24), n = this.secN, lo = 4;   // skip the kick bands below ~120 Hz
    for (let k = 0; k < n; k++) {
      const row = this.secRing[(this.secHead - 1 - k + 40) % 20], dst = k < 5 ? a : b;
      for (let i = 0; i < 24; i++) dst[i] += row[i];
    }
    const na = Math.min(5, n), nb = n - na;
    let ma = 0, mb = 0;
    for (let i = lo; i < 24; i++) { a[i] /= na; b[i] /= nb; ma += a[i]; mb += b[i]; }
    ma /= 24 - lo; mb /= 24 - lo;
    let d = 0;
    for (let i = lo; i < 24; i++) d += Math.min(14, Math.abs((a[i] - ma) - (b[i] - mb)));
    return Math.max(0, Math.min(1, d / (24 - lo) / 8));
  }

  // Harmonic content of the last five seconds against the fifteen before: 1 - cosine similarity.
  chromaDistance() {
    const a = new Float32Array(12), b = new Float32Array(12), n = this.secN;
    for (let k = 0; k < n; k++) {
      const row = this.chRing[(this.secHead - 1 - k + 40) % 20], dst = k < 5 ? a : b;
      for (let i = 0; i < 12; i++) dst[i] += row[i];
    }
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return Math.max(0, Math.min(1, 1 - dot / Math.sqrt(na * nb + 1e-9)));
  }

  // A new source: forget the level and the timbre history.
  resetLevel() { this.lvl = undefined; this.quietT = 0; this.gapT = 0; this.quietSince = 0; this.resetProfile(); }

  // Forget the history so a new song starts with a clean reference.
  resetProfile() { this.secN = 0; this.secCount = 0; this.secAcc.fill(0); this.chAcc.fill(0); this.f.shift = 0; this.f.shiftFor = 0; this.f.chromaShift = 0; this.f.chromaShiftFor = 0; }

  // kick energy in the envelope within an eighth of a beat of now
  kickAround(now) {
    const w = Math.max(1, Math.round(this.f.period / 8 / HOP));
    let s = 0;
    for (let i = 0; i <= w; i++) s += this.kenv[(this.head - 1 - i + RING) % RING];
    return s;
  }

  tempo(now) {
    const env = this.env, f = this.f;
    let mean = 0; for (let i = 0; i < RING; i++) mean += env[i]; mean /= RING;
    let e0 = 0; for (let i = 0; i < RING; i++) e0 += (env[i] - mean) ** 2;
    if (e0 < 1e-6) { f.tempoConf *= 0.8; return; }
    const minL = Math.round(60 / MAX_BPM / HOP), maxL = Math.round(60 / MIN_BPM / HOP);
    const ac = new Float32Array(maxL * 3 + 2);
    for (let L = minL; L <= Math.min(RING - 64, maxL * 3); L++) {
      let s = 0;
      for (let i = 0; i < RING - L; i++) s += (env[(this.head + i) % RING] - mean) * (env[(this.head + i + L) % RING] - mean);
      ac[L] = s / e0;
    }
    let bestL = minL, bestS = -1, sum = 0, n = 0;
    for (let L = minL; L <= maxL; L++) {
      const bpm = 60 / (L * HOP);
      const prior = Math.exp(-0.5 * ((Math.log2(bpm / 122)) / 0.55) ** 2);      // most music sits near 120
      const s = (ac[L] + 0.55 * ac[2 * L] + 0.3 * ac[3 * L]) * (0.55 + 0.45 * prior);
      sum += s; n++;
      if (s > bestS) { bestS = s; bestL = L; }
    }
    // refine the lag with a parabola through the neighbours
    const a = ac[bestL - 1] || 0, b = ac[bestL], c = ac[bestL + 1] || 0;
    const den = a - 2 * b + c, shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
    let bpm = 60 / ((bestL + shift) * HOP);
    const conf = Math.max(0, Math.min(1, (bestS - sum / n) * 3));
    if (conf < 0.12) { f.tempoConf = Math.max(0, f.tempoConf - 0.15); return; }
    // keep the octave the current tempo lives in when the new guess is its double or half
    if (f.bpm) {
      if (Math.abs(bpm / f.bpm - 2) < 0.08) bpm /= 2;
      else if (Math.abs(bpm / f.bpm - 0.5) < 0.02) bpm *= 2;
    }
    if (!f.bpm || Math.abs(bpm - f.bpm) / f.bpm < 0.04) {
      if (!f.bpm) this.tempoSince = now;
      f.bpm = f.bpm ? f.bpm + (bpm - f.bpm) * 0.3 : bpm;
      this.cand.n = 0;
    } else {
      // a different tempo has to win three runs in a row before we switch
      if (this.cand.bpm && Math.abs(bpm - this.cand.bpm) / this.cand.bpm < 0.04) this.cand.n++;
      else { this.cand.bpm = bpm; this.cand.n = 1; }
      if (this.cand.n >= 3) {
        const old = f.bpm; f.bpm = bpm; this.cand.n = 0; this.anchor = now; this.lastBeatNo = -1;
        const ratio = bpm / old, stable = now - this.tempoSince > 12;         // a switch during lock-in is not a change of song
        this.tempoSince = now;
        if (stable && Math.abs(ratio - 2) > 0.08 && Math.abs(ratio - 0.5) > 0.03 && Math.abs(ratio * 3 - 2) > 0.06 && Math.abs(ratio * 2 - 3) > 0.1) this.onTempoChange(old, bpm, now);
      }
    }
    f.period = 60 / f.bpm;
    f.tempoConf += (conf - f.tempoConf) * 0.4;
  }

  // Find where the beats sit inside the period by scoring every phase offset
  // against the last eight beats of the onset envelope, then ease the anchor there.
  lockPhase(now) {
    const P = this.f.period, env = this.env, steps = Math.max(4, Math.round(P / HOP));
    let best = 0, bestS = -1;
    for (let s = 0; s < steps; s++) {
      const phi = s * HOP;
      let sum = 0;
      for (let k = 0; k < 8; k++) {
        const t = phi + k * P, idx = t / HOP, i0 = Math.floor(idx), fr = idx - i0;
        const a = env[(this.head - 1 - i0 + RING * 4) % RING], b = env[(this.head - 2 - i0 + RING * 4) % RING];
        sum += (a * (1 - fr) + b * fr) * (1 - k * 0.07);
      }
      if (sum > bestS) { bestS = sum; best = s; }
    }
    const measured = now - best * HOP;                      // most recent beat time
    if (!this.anchor) { this.anchor = measured; return; }
    let d = (measured - this.anchor) % P;                    // wrapped into [-P/2, P/2]
    if (d > P / 2) d -= P; if (d < -P / 2) d += P;
    // a steady song keeps its grid; a jump of a third of a beat after a stable lock is a clue
    if (this.f.locked && now - this.lockSince > 10 && Math.abs(d) > P * 0.3 && now - this.gridT > 10) { this.gridT = now; this.onGrid(d / P, now); }
    this.anchor += d * 0.25;
    while (now - this.anchor > P * 64) this.anchor += P * 64;   // keep the number small
  }

  estimateKey(now) {
    const c = this.chromaLT, f = this.f;
    const mean = c.reduce((a, b) => a + b) / 12;
    let best = -1, bestR = -2, second = -2;
    for (let k = 0; k < 24; k++) {
      const prof = k < 12 ? MAJOR : MINOR, root = k % 12;
      const pm = prof.reduce((a, b) => a + b) / 12;
      let num = 0, da = 0, dbb = 0;
      for (let i = 0; i < 12; i++) {
        const x = c[(i + root) % 12] - mean, y = prof[i] - pm;
        num += x * y; da += x * x; dbb += y * y;
      }
      const r = num / Math.sqrt(da * dbb + 1e-9);
      if (r > bestR) { second = bestR; bestR = r; best = k; }
      else if (r > second) second = r;
    }
    const conf = Math.max(0, Math.min(1, (bestR - second) * 4 + bestR * 0.3));
    if (best !== this.keyCand.k) { this.keyCand = { k: best, since: now }; }
    const current = f.key < 0 ? -1 : f.key + (f.minor ? 12 : 0);
    if (best !== current && now - this.keyCand.since >= 2 && conf > 0.15) {
      f.key = best % 12; f.minor = best >= 12;
      f.keyName = NOTE[f.key] + (f.minor ? 'm' : '');
      f.keyHue = ((f.key * 7) % 12) / 12;                        // circle of fifths around the hue wheel
      this.onKey(f.keyName, f.keyHue);
    }
    f.keyConf = conf;
  }
}
