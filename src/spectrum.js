// A spectrum analyser in plain JavaScript, matching the Web Audio AnalyserNode:
// Blackman window, FFT, magnitudes scaled by 1/N, smoothed over time, in dB.
// Used when audio arrives as raw samples from a native host (the desktop
// wallpaper) rather than through a Web Audio graph.

export class Spectrum {
  constructor(size = 4096, smoothing = 0.2) {
    this.n = size; this.s = smoothing;
    const n = size, bits = Math.log2(n);
    this.win = new Float32Array(n);
    for (let i = 0; i < n; i++) this.win[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / n) + 0.08 * Math.cos(4 * Math.PI * i / n);
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } this.rev[i] = r; }
    this.cos = new Float32Array(n / 2); this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(-2 * Math.PI * i / n); this.sin[i] = Math.sin(-2 * Math.PI * i / n); }
    this.re = new Float32Array(n); this.im = new Float32Array(n);
    this.mag = new Float32Array(n / 2);
  }

  // samples: the latest `size` samples (-1..1). out: size/2 values in dB.
  run(samples, out) {
    const { n, re, im, rev, win, cos, sin, mag, s } = this;
    for (let i = 0; i < n; i++) { re[rev[i]] = samples[i] * win[i]; im[rev[i]] = 0; }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, stride = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * stride], wi = sin[k * stride], a = start + k, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    for (let i = 0; i < n / 2; i++) {
      const m = Math.hypot(re[i], im[i]) / n;
      mag[i] = s * mag[i] + (1 - s) * m;
      out[i] = mag[i] > 1e-10 ? 20 * Math.log10(mag[i]) : -200;
    }
  }
}
