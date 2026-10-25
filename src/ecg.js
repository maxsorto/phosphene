// Heartbeat trace for the Pulsar and Vitals scenes. Each detected beat fires
// a PQRST complex into a ring buffer (256 x 64 samples, about 77 s).
// Pulsar stacks the last few seconds as ridgelines, 0.15 s apart; Vitals sweeps it like a
// bedside monitor. Also measures the music's BPM.

export const ROW = 256;            // samples per ridgeline
export const ROWS = 64;
export const ROW_SECONDS = 1.2;

export class ECG {
  constructor() {
    this.n = ROW * ROWS;
    this.dtSample = ROW_SECONDS / ROW;
    this.trace = new Float32Array(this.n);
    this.head = 0;                     // fractional sample index, wraps at n
    this.beatT = -10;
    this.amp = 1;
    this.beats = [];
    this.bpm = 0;
  }

  beat(now, strength) {
    this.beatT = now;
    this.amp = 0.75 + 0.45 * Math.min(1, strength);
    this.beats.push(now);
    if (this.beats.length > 10) this.beats.shift();
    const iv = [];
    for (let i = 1; i < this.beats.length; i++) {
      const d = this.beats[i] - this.beats[i - 1];
      if (d > 0.25 && d < 2) iv.push(d);
    }
    if (iv.length >= 2) {
      iv.sort((a, b) => a - b);
      this.bpm = Math.round(60 / iv[iv.length >> 1]);
    }
  }

  // One heartbeat, t seconds after the R peak. The P wave is placed ahead of
  // the next expected beat so the rhythm reads naturally.
  wave(t) {
    const g = (c, w, a) => a * Math.exp(-(((t - c) / w) ** 2));
    const period = this.bpm ? 60 / this.bpm : 0.9;
    return g(0.012, 0.008, -0.12)      // Q
         + g(0.03, 0.011, 1.0)         // R
         + g(0.052, 0.01, -0.28)       // S
         + g(0.24, 0.055, 0.26)        // T
         + g(period - 0.14, 0.03, 0.1); // P of the next beat
  }

  update(now, dt, mid) {
    const to = this.head + dt / this.dtSample;
    for (let i = Math.ceil(this.head); i <= to; i++) {
      const ts = now - (to - i) * this.dtSample;
      const since = ts - this.beatT;
      const v = since >= 0 && since < 2 ? this.wave(since) * this.amp : 0;
      this.trace[i % this.n] = v + (Math.random() - 0.5) * 0.015 + 0.02 * mid * Math.sin(ts * 9);
    }
    this.head = to % this.n;
  }
}
