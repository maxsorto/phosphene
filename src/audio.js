// Audio input and analysis. Sources: browser tab (getDisplayMedia),
// microphone, a local file, or a synthetic demo beat. Produces:
//   wave  1024 time-domain samples; scope is the same, auto-gained, for the oscilloscope scenes
//   db    2048-bin high resolution spectrum for the feature extractor
//   level auto-gained bass / mid / high (from true band power) and a beat envelope
//   features: tempo, phase, bars, onsets, key, energy (see features.js)
//   tones: log-frequency spectrum, chroma and the tracked melody (see tones.js)
//   tap   the last 15 s of raw audio, for song recognition fingerprints
// A native host (the desktop wallpaper app) can instead push raw samples in with
// useNative() and pushPCM(); they are analysed here without a Web Audio graph.
import { Features } from './features.js';
import { Tones } from './tones.js';
import { Spectrum } from './spectrum.js';

const CLEAN = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const ANA_FFT = 4096, TAP_SECONDS = 15;
const DEMO_CHORDS = [[220, 261.63, 329.63, 440], [174.61, 220, 261.63, 349.23], [261.63, 329.63, 392, 523.25], [196, 246.94, 293.66, 392]];
const DEMO_ARP = [0, 2, 1, 2, 3, 2, 1, 2];

// Runs on the audio thread and hands the main thread 2048-sample mono chunks.
const TAP_WORKLET = `class Tap extends AudioWorkletProcessor {
  constructor(){ super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs){
    const ch = inputs[0]; if (!ch || !ch.length) return true;
    const n = ch[0].length;
    for (let i = 0; i < n; i++) {
      let s = 0; for (let c = 0; c < ch.length; c++) s += ch[c][i];
      this.buf[this.n++] = s / ch.length;
      if (this.n === 2048) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(2048); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('phosphene-tap', Tap);`;

export class AudioEngine {
  constructor(audioEl) {
    this.el = audioEl;
    this.wave = new Uint8Array(1024).fill(128);
    this.db = new Float32Array(ANA_FFT / 2).fill(-100);
    this.source = 'demo';              // 'demo' | 'tab' | 'mic' | 'file' | 'native'
    this.sensitivity = 1;
    this.level = { b: 0, m: 0, h: 0, beat: 0 };
    this.peak = { b: 1e-5, m: 1e-5, h: 1e-5 }; this.smooth = { b: 0, m: 0, h: 0 };
    this.scope = new Uint8Array(1024).fill(128); this.scopeGain = 1;
    this.lastBeat = 0;
    this.features = new Features(48000, ANA_FFT);
    this.tones = new Tones(48000, ANA_FFT);
    this.tapRate = 48000; this.tap = null; this.tapHead = 0; this.tapFilled = 0;
    this.onBeat = () => {};
    this.onEnded = () => {};
  }

  static tabSupported() {
    const md = navigator.mediaDevices;
    if (!md || !md.getDisplayMedia) return false;
    const ua = navigator.userAgent;              // Safari can share a screen but never its audio
    return !(/Safari/.test(ua) && !/Chrome|Chromium|Edg|CriOS/.test(ua));
  }

  ctx() {
    if (!this.actx) {
      this.actx = new AudioContext();
      this.vis = this.actx.createAnalyser();
      this.vis.fftSize = 1024; this.vis.smoothingTimeConstant = 0.72;
      this.ana = this.actx.createAnalyser();
      this.ana.fftSize = ANA_FFT; this.ana.smoothingTimeConstant = 0.2;
      const prev = this.features;
      this.features = new Features(this.actx.sampleRate, ANA_FFT);
      for (const k of ['onBeat', 'onDrop', 'onKey', 'onTempoChange', 'onGap', 'onGrid']) this.features[k] = prev[k];   // keep the listeners
      const prevTones = this.tones; this.tones = new Tones(this.actx.sampleRate, ANA_FFT); this.tones.onNote = prevTones.onNote;
      this.tapRate = this.actx.sampleRate;
      this.tap = new Float32Array(Math.round(this.tapRate * TAP_SECONDS));
    }
    if (this.actx.state === 'suspended') this.actx.resume();
    return this.actx;
  }

  // The tap feeds a ring buffer of the last 15 s of audio for fingerprinting.
  async ensureTap() {
    if (this.tapNode) return;
    const ctx = this.actx, mute = ctx.createGain(); mute.gain.value = 0;
    try {
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP_WORKLET], { type: 'text/javascript' })));
      const n = new AudioWorkletNode(ctx, 'phosphene-tap', { numberOfOutputs: 1, outputChannelCount: [1] });
      n.port.onmessage = e => this.pushTap(e.data);
      this.tapNode = n;
    } catch {
      const n = ctx.createScriptProcessor(4096, 1, 1);     // fallback for browsers without worklets
      n.onaudioprocess = e => this.pushTap(e.inputBuffer.getChannelData(0));
      this.tapNode = n;
    }
    this.tapNode.connect(mute).connect(ctx.destination);   // kept alive, never heard
  }

  pushTap(chunk) {
    const t = this.tap, n = chunk.length, h = this.tapHead;
    if (h + n <= t.length) t.set(chunk, h);
    else { const k = t.length - h; t.set(chunk.subarray(0, k), h); t.set(chunk.subarray(k), 0); }
    this.tapHead = (h + n) % t.length;
    this.tapFilled = Math.min(t.length, this.tapFilled + n);
  }

  get tapSeconds() { return this.tapFilled / this.tapRate; }

  // A contiguous copy of the most recent `seconds` of audio.
  lastSeconds(seconds) {
    const n = Math.min(this.tapFilled, Math.round(seconds * this.tapRate)), t = this.tap, out = new Float32Array(n);
    const start = (this.tapHead - n + t.length) % t.length;
    if (start + n <= t.length) out.set(t.subarray(start, start + n));
    else { const k = t.length - start; out.set(t.subarray(start)); out.set(t.subarray(0, n - k), k); }
    return out;
  }

  attach(node) {
    node.connect(this.vis); node.connect(this.ana);
    if (this.tapNode) node.connect(this.tapNode);
    this.features.resetLevel();
  }

  stop() {
    if (this.node) { this.node.disconnect(); this.node = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.elSrc) this.elSrc.disconnect();
    if (this.el.pause) this.el.pause();
    this.tapFilled = 0; this.tapHead = 0;
  }

  async useStream(stream, kind) {
    this.stop(); this.ctx(); await this.ensureTap();
    this.stream = stream;
    this.node = this.actx.createMediaStreamSource(stream);
    this.attach(this.node);                         // never to the speakers, so no feedback loop
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (this.source === kind) { this.source = 'demo'; this.onEnded(kind); }
    });
    this.source = kind;
  }

  async useTab() {
    // keep the visualizer in front after the tab is picked (Chrome would otherwise jump to it)
    const opts = { video: true, audio: CLEAN, systemAudio: 'include' };
    if (window.CaptureController) opts.controller = new CaptureController();
    const pending = navigator.mediaDevices.getDisplayMedia(opts);
    try { opts.controller?.setFocusBehavior('no-focus-change'); } catch {}
    const s = await pending;
    s.getVideoTracks().forEach(t => t.stop());
    if (!s.getAudioTracks().length) throw new Error('No audio was shared. Pick a tab and turn on "Share tab audio".');
    await this.useStream(s, 'tab');
  }

  async useMic() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: CLEAN });
    await this.useStream(s, 'mic');
  }

  async useFile(file) {
    this.stop(); this.ctx(); await this.ensureTap();
    if (!this.elSrc) this.elSrc = this.actx.createMediaElementSource(this.el);
    this.attach(this.elSrc);
    this.elSrc.connect(this.actx.destination);
    if (this.el.src) URL.revokeObjectURL(this.el.src);
    this.el.src = URL.createObjectURL(file);
    this.fileName = file.name.replace(/\.[^.]+$/, '');
    await this.el.play();
    this.source = 'file';
  }

  useDemo() { this.stop(); this.source = 'demo'; }

  // A native host pushes mono samples in. The tap ring doubles as the analysis buffer.
  useNative(rate = 48000) {
    this.stop();
    if (!this.spectrum || this.tapRate !== rate) {
      this.tapRate = rate;
      const pf = this.features; this.features = new Features(rate, ANA_FFT);
      for (const k of ['onBeat', 'onDrop', 'onKey', 'onTempoChange', 'onGap', 'onGrid']) this.features[k] = pf[k];
      const pt = this.tones; this.tones = new Tones(rate, ANA_FFT); this.tones.onNote = pt.onNote;
      this.tap = new Float32Array(Math.round(rate * TAP_SECONDS)); this.tapHead = 0; this.tapFilled = 0;
      this.spectrum = new Spectrum(ANA_FFT, 0.2); this.frame = new Float32Array(ANA_FFT);
    }
    this.features.resetLevel(); this.lastPush = 0;
    this.source = 'native';
  }
  pushPCM(chunk) { this.pushTap(chunk); this.lastPush = performance.now() / 1000; }
  // the most recent `out.length` samples (zeros before the ring has filled)
  latest(out) {
    const t = this.tap, n = out.length, have = Math.min(n, this.tapFilled);
    out.fill(0, 0, n - have);
    let at = (this.tapHead - have + t.length) % t.length;
    for (let i = n - have; i < n; i++) { out[i] = t[at]; if (++at === t.length) at = 0; }
  }

  // A silent 124 BPM groove, built straight in the frequency domain: kick, snare and
  // hats, plus a bass line, a pad and an arpeggiated lead over Am F C G, so the
  // melodic ear has a tune to follow.
  demoSpectrum(t) {
    const ph = t * 124 / 60, kick = Math.exp(-(ph % 1) * 6), hat = Math.exp(-((ph * 2 + 0.5) % 1) * 14);
    const snare = (Math.floor(ph) % 2 === 1) ? Math.exp(-(ph % 1) * 9) : 0;
    const swell = 0.5 + 0.5 * Math.sin(t * 0.35), bar = Math.floor(ph / 4) % 8;
    const drop = bar >= 6 ? 1.35 : 1;
    const chord = DEMO_CHORDS[bar >> 1], step = Math.floor(ph * 2), env = Math.exp(-((ph * 2) % 1) * 2.2);
    const lead = chord[DEMO_ARP[step % 8]] * 2, bass = chord[0] / 2;
    const n = this.db.length, hz = 24000 / n, lin = this.lin || (this.lin = new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const f = i * hz;
      lin[i] = 2e-4 * (0.6 + Math.random()) + kick * 0.9 * Math.exp(-f / 70)
        + snare * 0.05 * Math.exp(-Math.abs(f - 1800) / 1500) + (f > 5000 ? hat * 0.02 * Math.exp(-(f - 5000) / 5000) : 0);
    }
    const tone = (f, a) => { const c = f / hz, i0 = Math.max(1, Math.floor(c - 5)), i1 = Math.min(n - 1, Math.ceil(c + 5));
      for (let i = i0; i <= i1; i++) { const d = (i - c) / 1.6; lin[i] += a * Math.exp(-d * d); } };
    tone(bass, 0.3 * (0.6 + 0.4 * kick)); tone(bass * 2, 0.1);
    for (let k = 0; k < 3; k++) tone(chord[k], 0.03 + 0.04 * swell);
    for (let h = 1; h <= 4; h++) tone(lead * h, 0.22 * env * drop / h);
    for (let i = 0; i < n; i++) this.db[i] = 20 * Math.log10(lin[i]) - 6;
    const f0 = bass, tt = t % 1000;
    for (let i = 0; i < 1024; i++) {
      const s = tt + i / 48000;
      const w = 0.5 * kick * Math.sin(s * f0 * 6.283 + 3 * Math.exp(-(ph % 1) * 8))
        + 0.3 * env * Math.sin(s * lead * 6.283) + 0.12 * swell * Math.sin(s * chord[1] * 6.283)
        + 0.12 * hat * (Math.random() - 0.5);
      this.wave[i] = 128 + Math.max(-127, Math.min(127, w * 120));
    }
  }

  // Mean power of a band of the dB spectrum, as an amplitude. Linear, so a kick
  // that is 6 dB louder really is twice as big (the byte spectrum is logarithmic
  // and clips on loud sources, which pinned the bass at full).
  band(lo, hi) {
    const db = this.db, hz = this.tapRate / (2 * db.length);
    const a = Math.max(1, Math.round(lo / hz)), b = Math.min(db.length - 1, Math.round(hi / hz));
    let s = 0; for (let i = a; i < b; i++) s += Math.pow(10, db[i] / 10);
    return Math.sqrt(s / (b - a));
  }

  // Scenes use these as slow, smooth drivers (rotations, flows), so the raw band is
  // eased first, then auto-gained against its recent peak, then given a quick attack
  // and a slow release. The drums have their own fast envelopes (KICK, SNARE, HAT).
  follow(k, raw, up, down) {
    const s = this.smooth[k] += (raw - this.smooth[k]) * 0.3;
    this.peak[k] = Math.max(this.peak[k] * 0.9985, s, 1e-5);
    const v = Math.min(1.5, s / this.peak[k] * 1.15 * this.sensitivity);
    this.level[k] += (v - this.level[k]) * (v > this.level[k] ? up : down);
  }

  update(now, dt) {
    if (this.source === 'demo') this.demoSpectrum(now);
    else if (this.source === 'native') {
      // nothing arriving means the host has gone quiet: let the signal fall to silence
      if (now - this.lastPush > 0.12) this.pushTap(new Float32Array(Math.min(4096, Math.round(dt * this.tapRate))));
      const fr = this.frame; this.latest(fr);
      for (let i = 0; i < 1024; i++) this.wave[i] = Math.max(0, Math.min(255, 128 + fr[ANA_FFT - 1024 + i] * 128));
      this.spectrum.run(fr, this.db);
    } else {
      this.vis.getByteTimeDomainData(this.wave);
      this.ana.getFloatFrequencyData(this.db);
    }
    let sq = 0, pk = 1; for (let i = 0; i < 1024; i++) { const d = this.wave[i] - 128; sq += d * d; if (d > pk) pk = d; else if (-d > pk) pk = -d; }
    this.rms = Math.sqrt(sq / 1024) / 128;
    // the waveform the scenes draw is auto-gained, so a quiet source still fills the scope
    const want = Math.min(14, 96 / pk);
    this.scopeGain += (want - this.scopeGain) * (want < this.scopeGain ? 0.5 : 0.02);
    for (let i = 0; i < 1024; i++) this.scope[i] = Math.max(1, Math.min(255, 128 + (this.wave[i] - 128) * this.scopeGain));
    this.follow('b', this.band(40, 300), 0.5, 0.12); this.follow('m', this.band(300, 3200), 0.3, 0.07); this.follow('h', this.band(3200, 14000), 0.45, 0.1);
    this.features.update(this.db, now, dt, this.rms);
    this.tones.update(this.db, dt, now, this.sensitivity);
    // the beat: the tracked grid once the tempo is locked, kick onsets until then
    const f = this.features.f; let fire = false;
    if (f.locked) { if (f.beatNo !== this.lastGrid) { this.lastGrid = f.beatNo; fire = true; } }
    else if (f.kickHit && now - this.lastBeat > 0.27) fire = true;
    if (fire) { this.lastBeat = now; this.level.beat = 1; this.onBeat(now); }
    this.level.beat *= Math.pow(0.02, dt);
  }
}
