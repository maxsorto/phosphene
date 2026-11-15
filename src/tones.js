// The melodic ear. Turns the high-resolution spectrum into what a musician
// would point at:
//   bytes   a log-frequency spectrum, two bins per semitone over eight octaves
//           (A1 55 Hz to 14 kHz), whitened so notes stand out as peaks and
//           drums and hiss fall away
//   chroma  the twelve pitch classes (A, A#, B ...), whatever the octave
//   m       the tracked melody: pitch height, the note's name, a pulse on
//           every new note, and how confident the tracker is
// A linear spectrum gives the whole melodic range about 8% of its width; this
// gives every octave the same room, so tunes move things as much as kicks do.

const A1 = 55, PER = 2, SEMIS = 96;
export const LS = SEMIS * PER;                 // 192 bins
export const NOTE_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const MEL_LO = 12 * PER, MEL_HI = 60 * PER;     // melody is looked for from A2 (110 Hz) to A6 (1760 Hz)
const WIN = 12;                                 // whitening window: six semitones either side

export class Tones {
  constructor(rate = 48000, fftSize = 4096) {
    const hz = rate / fftSize, bins = fftSize / 2;
    this.pos = new Float32Array(LS); this.lo = new Int32Array(LS); this.hi = new Int32Array(LS);
    for (let k = 0; k < LS; k++) {
      const f = A1 * Math.pow(2, k / (12 * PER)), p = f / hz, w = p * (Math.pow(2, 1 / (24 * PER)) - 1);
      this.pos[k] = Math.min(bins - 2, p);
      this.lo[k] = Math.ceil(p - w); this.hi[k] = Math.min(bins - 1, Math.floor(p + w));
    }
    this.dbt = new Float32Array(LS); this.pre = new Float32Array(LS + 1); this.prom = new Float32Array(LS);
    this.out = new Float32Array(LS); this.bytes = new Uint8Array(LS);
    this.chroma = new Float32Array(12); this.chromaBytes = new Uint8Array(12);
    this.maxDb = -70;
    this.cur = -1; this.cand = -1; this.candN = 0; this.lostFor = 0;
    this.m = { mel: 0.5, raw: 0.5, conf: 0, note: 0, semis: 36, pc: 0, hue: 0, name: '', tone: 0 };
    this.onNote = () => {};
  }

  // db: the analyser's dB spectrum. sens: the user's sensitivity setting.
  update(db, dt, now, sens = 1) {
    const { pos, lo, hi, dbt, pre, prom, out, m } = this;
    // 1. resample to semitone bins: the peak inside each bin's span, or an interpolation where
    //    the FFT is coarser than the bin (the low octaves). +3 dB per octave evens the tilt.
    let mx = -200;
    for (let k = 0; k < LS; k++) {
      let v;
      if (hi[k] >= lo[k]) { v = -200; for (let i = lo[k]; i <= hi[k]; i++) if (db[i] > v) v = db[i]; }
      else { const i = pos[k] | 0, fr = pos[k] - i; v = db[i] * (1 - fr) + db[i + 1] * fr; }
      if (!(v > -200)) v = -200;
      v += 3 * k / (12 * PER);
      dbt[k] = v; if (v > mx) mx = v;
    }
    this.maxDb = Math.max(mx, this.maxDb - 8 * dt, -95);        // the reference level falls 8 dB a second
    const floor = this.maxDb - 52;
    // 2. prominence: how far each bin stands above its neighbourhood, in dB
    pre[0] = 0;
    for (let k = 0; k < LS; k++) pre[k + 1] = pre[k] + (dbt[k] > floor ? dbt[k] : floor);
    let tone = 0;
    for (let k = 0; k < LS; k++) {
      const a = k - WIN < 0 ? 0 : k - WIN, b = k + WIN > LS - 1 ? LS - 1 : k + WIN;
      const mean = (pre[b + 1] - pre[a]) / (b - a + 1);
      const level = Math.min(1, Math.max(0, (dbt[k] - floor) / 52));
      const p = Math.max(0, (dbt[k] > floor ? dbt[k] : floor) - mean) / 13;
      prom[k] = p > 1.5 ? 1.5 : p;
      const gate = level < 0.12 ? 0 : level < 0.3 ? (level - 0.12) / 0.18 : 1;
      let target = (0.78 * Math.min(1, prom[k]) + 0.22 * level * level) * gate * sens;
      if (target > 1) target = 1;
      out[k] += (target - out[k]) * (target > out[k] ? 0.65 : Math.min(1, dt * 7));
      this.bytes[k] = out[k] * 255;
      if (k >= MEL_LO && k <= MEL_HI + 24) tone += out[k];
    }
    m.tone += (Math.min(1, tone / 36) - m.tone) * Math.min(1, dt * 10);

    // 3. chroma from the whitened spectrum (A2 upward, where pitch is resolved)
    const ch = this.chroma; let cmax = 0.5;
    for (let c = 0; c < 12; c++) {
      let s = 0;
      for (let k = (12 + c) * PER; k < 84 * PER; k += 12 * PER) s += out[k] + out[k + 1];
      ch[c] = s; if (s > cmax) cmax = s;
    }
    for (let c = 0; c < 12; c++) this.chromaBytes[c] = Math.min(255, ch[c] / cmax * 255);

    // 4. melody: the most salient peak, counting its second, third and fourth harmonics,
    //    with a preference for staying near the current note
    let best = -1, bestS = 0;
    for (let k = MEL_LO; k <= MEL_HI; k++) {
      const p = prom[k];
      if (p < 0.3 || p < prom[k - 1] || p < prom[k + 1]) continue;
      let s = p + 0.5 * prom[k + 24] + 0.3 * prom[k + 38] + 0.2 * prom[k + 48];
      s *= 1 - 0.3 * Math.abs(k - 66) / 54;                       // gentle pull toward the vocal range
      if (this.cur >= 0 && Math.abs(k - this.cur) <= 5) s *= 1.3;
      if (s > bestS) { bestS = s; best = k; }
    }
    const conf = Math.min(1, bestS / 1.6);
    if (best >= 0 && conf > 0.24) {
      this.lostFor = 0;
      // parabola through the peak for a pitch finer than the bins
      const a = dbt[best - 1], b = dbt[best], c = dbt[best + 1], den = a - 2 * b + c;
      const fine = best + (den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0);
      const semis = fine / PER, n = Math.round(semis);
      if (n !== Math.round(m.semis) || this.cur < 0) {
        // a different note has to hold for two frames before it counts
        if (n === this.cand) this.candN++; else { this.cand = n; this.candN = 1; }
        // (an octave jump is the tracker's commonest mistake, so it has to hold much longer)
        const octave = this.cur >= 0 && Math.abs(n - Math.round(m.semis)) === 12;
        if (this.candN >= (octave ? 6 : 2) || this.cur < 0) {
          m.semis = semis; this.cur = best; m.note = 1;
          m.pc = ((n % 12) + 12) % 12; m.name = NOTE_NAMES[m.pc] + (Math.floor((n + 9) / 12) + 1);
          this.onNote(n, m.name, now);
        }
      } else { m.semis = semis; this.cur = best; this.candN = 0; }
      m.conf += (conf - m.conf) * Math.min(1, dt * 12);
    } else {
      this.lostFor += dt;
      m.conf += (0 - m.conf) * Math.min(1, dt * 3);
      if (this.lostFor > 1.5) this.cur = -1;
    }
    m.raw = Math.min(1, Math.max(0, (m.semis - 12) / 48));
    m.mel += (m.raw - m.mel) * Math.min(1, dt * 12);
    m.note *= Math.pow(0.02, dt);
    // the note's colour: pitch classes laid around the wheel by fifths, eased the short way round
    let d = ((m.pc * 7) % 12) / 12 - m.hue; d -= Math.round(d);
    m.hue = (m.hue + d * Math.min(1, dt * 8) + 1) % 1;
  }
}
