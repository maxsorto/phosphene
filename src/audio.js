// Audio input and analysis. Sources: browser tab (getDisplayMedia),
// microphone, a local file, or a synthetic demo beat. Produces:
//   freq  512 bins for the scene shaders (smoothed, 0..255)
//   wave  1024 time-domain samples for the oscilloscope scenes
//   db    2048-bin high resolution spectrum for the feature extractor
//   level auto-gained bass / mid / high and a kick envelope
//   features: tempo, phase, bars, onsets, key, energy (see features.js)
//   tap   the last 15 s of raw audio, for song recognition fingerprints
import { Features } from './features.js';

const CLEAN = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const ANA_FFT = 4096, TAP_SECONDS = 15;

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
    this.freq = new Uint8Array(512);
    this.wave = new Uint8Array(1024).fill(128);
    this.db = new Float32Array(ANA_FFT / 2).fill(-100);
    this.source = 'demo';              // 'demo' | 'tab' | 'mic' | 'file'
    this.sensitivity = 1;
    this.level = { b: 0, m: 0, h: 0, beat: 0 };
    this.peak = { b: 0.2, m: 0.2, h: 0.2 };
    this.bassAvg = 0;
    this.lastBeat = 0;
    this.features = new Features(48000, ANA_FFT);
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
      for (const k of ['onBeat', 'onDrop', 'onKey', 'onTempoChange', 'onGap']) this.features[k] = prev[k];   // keep the listeners
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
    this.el.pause();
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
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: CLEAN, systemAudio: 'include' });
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

  // A silent 124 BPM groove, built straight in the frequency domain.
  demoSpectrum(t) {
    const ph = t * 124 / 60, kick = Math.exp(-(ph % 1) * 6), hat = Math.exp(-((ph * 2 + 0.5) % 1) * 14);
    const snare = (Math.floor(ph) % 2 === 1) ? Math.exp(-(ph % 1) * 9) : 0;
    const swell = 0.5 + 0.5 * Math.sin(t * 0.35), bar = Math.floor(ph / 4) % 8;
    const drop = bar >= 6 ? 1.35 : 1;
    for (let i = 0; i < 512; i++) {
      const v = kick * 235 * Math.exp(-i / 9)
        + (60 + 70 * swell) * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 0.07)) * Math.exp(-i / 160) * drop
        + snare * 90 * Math.exp(-Math.abs(i - 40) / 30)
        + hat * 80 * (i > 140 ? Math.exp(-(i - 140) / 120) : 0) + Math.random() * 14;
      this.freq[i] = Math.min(255, v);
    }
    const n = this.db.length;
    for (let i = 0; i < n; i++) {
      const v = this.freq[Math.min(511, i >> 2)] / 255 * (0.9 + 0.1 * Math.random());
      this.db[i] = 20 * Math.log10(Math.max(v, 1e-5)) - 10;
    }
    const f0 = 55 * (1 + (bar % 2) * 0.5), tt = t % 1000;
    for (let i = 0; i < 1024; i++) {
      const s = tt + i / 48000;
      const w = 0.5 * kick * Math.sin(s * f0 * 6.283 + 3 * Math.exp(-(ph % 1) * 8))
        + 0.25 * swell * Math.sin(s * 220 * 6.283) * Math.sin(s * 3.1)
        + 0.12 * hat * (Math.random() - 0.5);
      this.wave[i] = 128 + Math.max(-127, Math.min(127, w * 120));
    }
  }

  band(a, b) { let s = 0; for (let i = a; i < b; i++) s += this.freq[i]; return s / ((b - a) * 255); }

  follow(k, raw) {
    this.peak[k] = Math.max(this.peak[k] * 0.996, raw, 0.12);
    const v = Math.min(1.5, raw / this.peak[k] * this.sensitivity);
    this.level[k] += (v - this.level[k]) * (v > this.level[k] ? 0.55 : 0.12);
  }

  update(now, dt) {
    if (this.source === 'demo') this.demoSpectrum(now);
    else {
      this.vis.getByteFrequencyData(this.freq);
      this.vis.getByteTimeDomainData(this.wave);
      this.ana.getFloatFrequencyData(this.db);
    }
    let sq = 0; for (let i = 0; i < 1024; i++) { const d = (this.wave[i] - 128) / 128; sq += d * d; }
    this.rms = Math.sqrt(sq / 1024);
    const rb = this.band(1, 7), rm = this.band(7, 70), rh = this.band(70, 300);
    this.follow('b', rb); this.follow('m', rm); this.follow('h', rh);
    this.bassAvg += (rb - this.bassAvg) * 0.03;
    if (rb > this.bassAvg * 1.25 + 0.02 && rb > 0.18 && now - this.lastBeat > 0.27) {
      this.lastBeat = now; this.level.beat = 1; this.onBeat(now);
    }
    this.level.beat *= Math.pow(0.02, dt);
    this.features.update(this.db, now, dt, this.rms);
  }
}
