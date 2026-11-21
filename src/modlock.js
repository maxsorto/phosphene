// The pulse detector. Functional music (Brain.fm's, for one) carries a steady amplitude
// modulation: the loudness of part of the mix is rippled a fixed number of times a second,
// in step with the beat. Woods et al. 2024 describe it as 16 Hz for focus, confined to
// 200 Hz to 1 kHz. This finds such a ripple in whatever is playing and locks onto it:
//   rate    how many ripples a second (4 to 40 Hz is searched)
//   depth   how deep, 0..1: the gain dips from 1 to 1 - depth
//   phase   where in the ripple the sound is now, from an oscillator kept in step with it
//   narrow  the ripple lives in the mid band and is absent above 2 kHz. Drums and strummed
//           notes ripple every band at once, so this is what tells the two apart.
// Raw samples go in through push(). Two band envelopes are kept at 200 samples a second,
// and five times a second the last four seconds of the mid one are searched for a line.
const FE = 200;                       // envelope samples a second
const RING = 1024;                    // 5.12 s of envelope
const WIN = 800;                      // 4 s are analysed
const HALF = 50;                      // the level each sample is measured against: a quarter second either side
const F_LO = 4, F_HI = 40, F_STEP = 0.125;
const HOP = 40;                       // analyse every 0.2 s
const TAU = Math.PI * 2;

// RBJ biquads, direct form 1 with the state kept in plain numbers
function biquad(type, f, rate, q = Math.SQRT1_2) {
  const w = TAU * f / rate, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b = type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [(1 - c) / 2, 1 - c, (1 - c) / 2];
  return { b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: -2 * c / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function run(s, x) {
  const y = s.b0 * x + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
  s.x2 = s.x1; s.x1 = x; s.y2 = s.y1; s.y1 = Math.abs(y) < 1e-20 ? 0 : y;
  return y;
}
const wrap = a => a - TAU * Math.round(a / TAU);

export class ModLock {
  constructor(rate = 48000) {
    this.rate = rate;
    this.mid = [biquad('hp', 200, rate), biquad('hp', 200, rate), biquad('lp', 1000, rate), biquad('lp', 1000, rate)];
    this.high = [biquad('hp', 2000, rate), biquad('hp', 2000, rate), biquad('lp', 6000, rate)];
    this.envM = new Float32Array(RING); this.envH = new Float32Array(RING);
    this.k = 0;                        // envelope samples so far
    this.frac = 0; this.accM = 0; this.accH = 0; this.accN = 0;
    this.sinceHop = 0;
    this.skew = null;                  // wall clock minus envelope clock, smoothed
    this.r = new Float32Array(WIN); this.rh = new Float32Array(WIN);
    this.hann = new Float32Array(WIN); let ws = 0;
    for (let i = 0; i < WIN; i++) { this.hann[i] = 0.5 - 0.5 * Math.cos(TAU * (i + 0.5) / WIN); ws += this.hann[i]; }
    this.hannSum = ws;
    this.nf = Math.round((F_HI - F_LO) / F_STEP) + 1;
    this.mag = new Float32Array(this.nf); this.sorted = new Float32Array(this.nf);
    // what the search found last, and the oscillator that follows it
    this.found = { rate: 0, depth: 0, prom: 0, m: 0, high: 0, phase: 0, at: 0 };
    this.osc = { f: 0, ph: 0, k: 0 };
    this.held = 0; this.narrowHeld = 0; this.lostFor = 99; this.err = 0;   // seconds followed, seconds with the mid-band signature, seconds since it was last seen
    this.rateOut = 0; this.depthOut = 0;
  }

  // Samples in, with the wall clock time (seconds) at which they arrived.
  push(chunk, wall) {
    const mid = this.mid, high = this.high, step = FE / this.rate;
    let frac = this.frac, accM = this.accM, accH = this.accH, accN = this.accN;
    for (let i = 0; i < chunk.length; i++) {
      const x = chunk[i];
      let m = x; for (let j = 0; j < 4; j++) m = run(mid[j], m);
      let h = x; for (let j = 0; j < 3; j++) h = run(high[j], h);
      accM += m < 0 ? -m : m; accH += h < 0 ? -h : h; accN++;
      frac += step;
      if (frac >= 1) {
        frac -= 1;
        const at = this.k % RING;
        this.envM[at] = accM / accN; this.envH[at] = accH / accN;
        this.k++; accM = accH = accN = 0;
        if (++this.sinceHop >= HOP && this.k >= WIN + 2 * HALF) { this.sinceHop = 0; this.analyse(); }
      }
    }
    this.frac = frac; this.accM = accM; this.accH = accH; this.accN = accN;
    if (wall !== undefined) {
      const skew = wall - (this.k + frac) / FE;
      // chunks arrive in bursts: follow the clock slowly, jump only when it has plainly moved (a pause, a new source)
      this.skew = this.skew === null || Math.abs(skew - this.skew) > 0.25 ? skew : this.skew + (skew - this.skew) * 0.02;
    }
  }

  // One band's envelope over the window, each sample as a fraction above or below the level around it.
  ripple(env, out) {
    const start = this.k - WIN - HALF;                     // the window ends a quarter second ago, so its level is known both sides
    let sum = 0, quiet = 0;
    for (let i = start - HALF; i < start + HALF; i++) sum += env[((i % RING) + RING) % RING];
    for (let n = 0; n < WIN; n++) {
      const i = start + n;
      sum += env[(i + HALF) % RING] - env[((i - HALF) % RING + RING) % RING];
      const mean = sum / (2 * HALF);
      if (mean < 2e-4) { out[n] = 0; quiet++; } else out[n] = env[i % RING] / mean - 1;
    }
    return quiet / WIN;
  }

  // The ripple's strength and phase at one rate.
  line(r, f) {
    const w = TAU * f / FE, c = Math.cos(w), s = Math.sin(w), hann = this.hann;
    let re = 0, im = 0, cr = 1, ci = 0;
    for (let n = 0; n < WIN; n++) {
      const v = r[n] * hann[n];
      re += v * cr; im -= v * ci;
      const t = cr * c - ci * s; ci = cr * s + ci * c; cr = t;
    }
    return { m: 2 * Math.hypot(re, im) / this.hannSum, ph: Math.atan2(im, re) };
  }

  analyse() {
    const quiet = this.ripple(this.envM, this.r), score = this.mag, nf = this.nf;
    const hq = this.ripple(this.envH, this.rh);
    let best = 0;
    if (quiet < 0.25) for (let j = 0; j < nf; j++) {
      const f = F_LO + j * F_STEP, m = this.line(this.r, f).m, h = hq > 0.5 ? 0 : this.line(this.rh, f).m;
      // a ripple that is also there above 2 kHz is most likely drums or strumming: it counts for a fifth
      score[j] = m * (0.2 + 0.8 * Math.max(0, Math.min(1, 1 - h / (m + 1e-9))));
      if (score[j] > score[best]) best = j;
    } else score.fill(0);
    // the true rate sits between two search steps: a parabola through the peak and its neighbours finds it
    let f = F_LO + best * F_STEP;
    if (best > 0 && best < nf - 1) {
      const a = score[best - 1], b = score[best], c = score[best + 1], den = a - 2 * b + c;
      if (den < 0) f += F_STEP * 0.5 * (a - c) / den;
    }
    // a ripple already being followed is kept while it still stands clear of its neighbours, even if
    // some other line (a drum pattern, say) is momentarily taller
    this.sorted.set(score); this.sorted.sort();
    const floor = this.sorted[nf >> 1] || 1e-9, o = this.osc;
    if (o.f && this.held > 0) {
      const j0 = Math.round((o.f - F_LO) / F_STEP); let near = -1;
      for (let j = Math.max(1, j0 - 2); j <= Math.min(nf - 2, j0 + 2); j++) if (score[j] >= score[j - 1] && score[j] >= score[j + 1] && (near < 0 || score[j] > score[near])) near = j;
      if (near >= 0 && near !== best && score[near] >= 4.5 * floor && score[near] >= 0.4 * score[best]) { best = near; f = F_LO + best * F_STEP; const a = score[best - 1], b = score[best], c = score[best + 1], den = a - 2 * b + c; if (den < 0) f += F_STEP * 0.5 * (a - c) / den; }
    }
    const peak = score[best];
    const at = this.line(this.r, f);
    const fd = this.found;
    fd.rate = f; fd.m = at.m; fd.prom = peak / floor; fd.depth = Math.min(1, 2 * at.m / (1 + at.m));
    fd.high = hq > 0.5 ? 0 : this.line(this.rh, f).m;
    const kc = this.k - HALF - WIN / 2;                    // the envelope sample at the window's centre
    fd.phase = at.ph + TAU * f * (WIN / 2) / FE; fd.at = kc;

    const strong = fd.prom >= (this.held > 0 ? 4.5 : 7) && fd.depth >= 0.04 && quiet < 0.25 && best > 0 && best < nf - 1, dt = HOP / FE;
    let ok = false, fresh = false;
    if (strong) {
      if (o.f && Math.abs(f - o.f) < 0.3) {
        const e = wrap(fd.phase - (o.ph + TAU * o.f * (kc - o.k) / FE));
        // a small phase error each time means the oscillator and the sound agree on the rate
        o.ph = wrap(o.ph + TAU * o.f * (kc - o.k) / FE + 0.35 * e); o.k = kc;
        o.f += 0.06 * e / (TAU * dt);
        this.err += (Math.abs(e) - this.err) * 0.2;
        ok = Math.abs(e) < 0.9;
      } else if (!o.f || this.lostFor > 1) { o.f = f; o.ph = wrap(fd.phase); o.k = kc; this.err = 1; this.held = 0; fresh = true; }
    }
    if (ok || fresh) this.lostFor = 0;
    else { this.lostFor += dt; if (this.lostFor > 1.2) this.held = 0; if (this.lostFor > 4) o.f = 0; }
    if (ok) this.held += dt;
    const narrow = ok && fd.high < 0.45 * at.m && fd.depth >= 0.04 && f >= 7.5;
    this.narrowHeld = narrow ? this.narrowHeld + dt : Math.max(0, this.narrowHeld - 2 * dt);
    if (this.locked) { this.rateOut += (o.f - this.rateOut) * (this.rateOut ? 0.25 : 1); this.depthOut += (fd.depth - this.depthOut) * (this.depthOut ? 0.25 : 1); }
    else if (this.lostFor > 4) { this.rateOut = 0; this.depthOut = 0; }
  }

  // A steady ripple has been followed for a couple of seconds.
  get locked() { return this.held >= 3 && this.lostFor < 1.2; }
  // Locked, and it has the mid-band-only signature of functional music for this many seconds.
  get narrowFor() { return this.locked ? this.narrowHeld : 0; }
  // Ripples counted since the oscillator's reference, at a wall clock time: its fraction is the phase.
  cycles(wall) {
    const o = this.osc;
    if (!o.f || this.skew === null) return 0;
    return o.ph / TAU + o.f * ((wall - this.skew) * FE - o.k) / FE;
  }
  info() {
    const fd = this.found;
    return { locked: this.locked, rate: +this.rateOut.toFixed(2), depth: +this.depthOut.toFixed(3), held: +this.held.toFixed(1), narrow: +this.narrowFor.toFixed(1),
      raw: +fd.rate.toFixed(2), prom: +fd.prom.toFixed(1), high: +(fd.high / Math.max(1e-6, fd.m)).toFixed(2), err: +this.err.toFixed(2) };
  }
}
