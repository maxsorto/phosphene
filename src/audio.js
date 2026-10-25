// Audio input and analysis. Sources: browser tab (getDisplayMedia),
// microphone, a local file, or a synthetic demo beat. Produces a 512-bin
// spectrum plus auto-gained bass / mid / high levels and beat events.

const CLEAN = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

export class AudioEngine {
  constructor(audioEl) {
    this.el = audioEl;
    this.freq = new Uint8Array(512);
    this.source = 'demo';              // 'demo' | 'tab' | 'mic' | 'file'
    this.sensitivity = 1;
    this.level = { b: 0, m: 0, h: 0, beat: 0 };
    this.peak = { b: 0.2, m: 0.2, h: 0.2 };
    this.bassAvg = 0;
    this.lastBeat = 0;
    this.onBeat = () => {};
    this.onEnded = () => {};
  }

  static tabSupported() {
    const md = navigator.mediaDevices;
    if (!md || !md.getDisplayMedia) return false;
    // Safari can share a screen but never its audio.
    const ua = navigator.userAgent;
    return !(/Safari/.test(ua) && !/Chrome|Chromium|Edg|CriOS/.test(ua));
  }

  ctx() {
    if (!this.actx) {
      this.actx = new AudioContext();
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.72;
    }
    if (this.actx.state === 'suspended') this.actx.resume();
    return this.actx;
  }

  stop() {
    if (this.node) { this.node.disconnect(); this.node = null; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.elSrc) this.elSrc.disconnect();
    this.el.pause();
  }

  useStream(stream, kind) {
    this.stop(); this.ctx();
    this.stream = stream;
    this.node = this.actx.createMediaStreamSource(stream);
    this.node.connect(this.analyser);            // never to the speakers, so no feedback loop
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      if (this.source === kind) { this.source = 'demo'; this.onEnded(kind); }
    });
    this.source = kind;
  }

  async useTab() {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: CLEAN, systemAudio: 'include' });
    s.getVideoTracks().forEach(t => t.stop());
    if (!s.getAudioTracks().length) throw new Error('No audio was shared. Pick a tab and turn on "Share tab audio".');
    this.useStream(s, 'tab');
  }

  async useMic() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: CLEAN });
    this.useStream(s, 'mic');
  }

  async useFile(file) {
    this.stop(); this.ctx();
    if (!this.elSrc) this.elSrc = this.actx.createMediaElementSource(this.el);
    this.elSrc.connect(this.analyser);
    this.elSrc.connect(this.actx.destination);
    if (this.el.src) URL.revokeObjectURL(this.el.src);
    this.el.src = URL.createObjectURL(file);
    this.fileName = file.name.replace(/\.[^.]+$/, '');
    await this.el.play();
    this.source = 'file';
  }

  useDemo() { this.stop(); this.source = 'demo'; }

  demoSpectrum(t) {
    const ph = t * 124 / 60, kick = Math.exp(-(ph % 1) * 6), hat = Math.exp(-((ph * 2 + 0.5) % 1) * 14);
    const swell = 0.5 + 0.5 * Math.sin(t * 0.35);
    for (let i = 0; i < 512; i++) {
      const v = kick * 235 * Math.exp(-i / 9)
        + (60 + 70 * swell) * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 0.07)) * Math.exp(-i / 160)
        + hat * 80 * (i > 140 ? Math.exp(-(i - 140) / 120) : 0) + Math.random() * 14;
      this.freq[i] = Math.min(255, v);
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
    else this.analyser.getByteFrequencyData(this.freq);
    const rb = this.band(1, 7), rm = this.band(7, 70), rh = this.band(70, 300);
    this.follow('b', rb); this.follow('m', rm); this.follow('h', rh);
    this.bassAvg += (rb - this.bassAvg) * 0.03;
    if (rb > this.bassAvg * 1.25 + 0.02 && rb > 0.18 && now - this.lastBeat > 0.27) {
      this.lastBeat = now; this.level.beat = 1; this.onBeat(now);
    }
    this.level.beat *= Math.pow(0.02, dt);
  }
}
