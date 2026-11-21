// WebGL2 renderer: one program per scene (compiled on first use and pre-warmed
// for the next scene), a ping-pong pair of mip-mapped feedback buffers, and the
// textures the scenes read: log spectrum, chroma, waveform, the history ring,
// the heartbeat ring and album art. Overlay passes draw additive points for
// scenes that ask for them. The canvas stays at display resolution; the
// feedback buffers scale per scene and adapt to keep the frame rate smooth.
import { VS, DISPLAY_FS, OVERLAYS, POINTS_FS, SCENES, sceneSource } from './shaders.js';
import { LS } from './tones.js';

const F1 = ['T', 'B', 'M', 'H', 'BEAT', 'K', 'Z', 'C', 'TR', 'KICK', 'SNARE', 'HAT', 'PH', 'BAR', 'BT', 'BPM', 'EN', 'DROP', 'BP',
  'GOO', 'IRID', 'ARTC', 'MEL', 'NOTE', 'MELV', 'MELH', 'TONE', 'SP', 'ARM', 'LG', 'LS', 'LE', 'LW', 'LR', 'MODP', 'MODA'];
const F3 = ['PA', 'PB', 'PF', 'PD'];
const SAMPLERS = ['P', 'F', 'ECG', 'W', 'SG', 'ART', 'CH', 'BG'];
const SG_ROWS = 256, SG_W = 256, SG_INTERVAL = 1 / 30, HIST_AT = 224;

export class Renderer {
  constructor(canvas, { mobile = false, transparent = false } = {}) {
    this.canvas = canvas;
    // (the desktop wallpaper needs a canvas the real desktop can show through)
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: transparent, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.mobile = mobile;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.maxPixels = mobile ? 1.3e6 : 4.2e6;
    this.quality = 'auto';             // 'auto' | 'low' | 'medium' | 'high'
    this.autoScale = mobile ? 0.7 : 1;
    this.sceneScale = 1;               // heavy scenes render their buffer a little smaller
    this.frameTimes = [];
    this.lastAdapt = 0;
    this.programs = new Map();
    this.overlays = {};

    this.display = this.program(VS, DISPLAY_FS);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.specTex = this.tex(gl.R8, LS, 1, gl.RED, gl.UNSIGNED_BYTE);
    this.texParams(false, false, true); gl.generateMipmap(gl.TEXTURE_2D);      // mips give band averages
    this.chromaTex = this.tex(gl.R8, 12, 1, gl.RED, gl.UNSIGNED_BYTE, false, true);
    this.waveTex = this.tex(gl.R8, 1024, 1, gl.RED, gl.UNSIGNED_BYTE);
    this.sgTex = this.tex(gl.R8, SG_W, SG_ROWS, gl.RED, gl.UNSIGNED_BYTE, true);
    this.ecgTex = this.tex(gl.R16F, 256, 64, gl.RED, gl.FLOAT);
    this.artTex = this.tex(gl.RGBA8, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE);
    this.bgTex = this.tex(gl.RGBA8, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE); this.bgAspect = 0;
    this.sgRow = new Uint8Array(SG_W);
    this.hasArt = 0; this.ecgHead = 0; this.sgHead = 0; this.sgLast = 0;

    this.bufs = [];
    this.resize();
  }

  tex(internal, w, h, format, type, repeatY = false, repeatX = false) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    this.texParams(repeatY, repeatX);
    return t;
  }

  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this.shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
  }

  // Scene programs compile lazily. A failed scene is remembered so one bad
  // shader never takes the whole app down.
  programFor(i) {
    if (!this.programs.has(i)) {
      try { this.programs.set(i, this.program(VS, sceneSource(SCENES[i]))); }
      catch (e) { console.error('Scene ' + SCENES[i].name + ' failed to compile:', e.message); this.programs.set(i, null); this.lastError = SCENES[i].name + ': ' + e.message; }
    }
    return this.programs.get(i);
  }
  prewarm(i) { if (!this.programs.has(i)) setTimeout(() => this.programFor(i), 50); }

  overlayFor(name) {
    if (!(name in this.overlays)) {
      const o = OVERLAYS[name];
      try { this.overlays[name] = { ...this.program(o.vs, POINTS_FS), count: this.mobile ? o.mobile : o.count, lines: o.lines || 0 }; }
      catch (e) { console.error('Overlay ' + name + ' failed to compile:', e.message); this.overlays[name] = null; this.lastError = name + ': ' + e.message; }
    }
    return this.overlays[name];
  }

  texParams(repeatY = false, repeatX = false, mips = false) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeatY ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  }

  target(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.floatOK ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
      this.floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    this.texParams(false, false, true);
    gl.generateMipmap(gl.TEXTURE_2D);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t, f, w, h };
  }

  scale() { return { low: 0.5, medium: 0.75, high: 1, auto: this.autoScale }[this.quality]; }
  setQuality(q) { this.quality = q; this.resize(); }
  setSceneScale(s) { if (s !== this.sceneScale) { this.sceneScale = s; this.resize(); } }

  // The canvas follows the display; the feedback buffers follow the quality and
  // the scene. The picture so far is carried over, so a change of size never flashes.
  resize() {
    const gl = this.gl, dpr = window.devicePixelRatio || 1;
    const cssW = innerWidth, cssH = innerHeight;
    const cap = Math.sqrt(this.maxPixels / (cssW * cssH));
    const s = Math.min(dpr, cap);
    const CW = Math.max(1, Math.round(cssW * s)), CH = Math.max(1, Math.round(cssH * s));
    if (CW !== this.CW || CH !== this.CH) { this.CW = CW; this.CH = CH; this.canvas.width = CW; this.canvas.height = CH; }
    const k = this.scale() * this.sceneScale;
    const W = Math.max(1, Math.round(CW * k)), H = Math.max(1, Math.round(CH * k));
    if (W === this.W && H === this.H) return;
    const old = this.bufs;
    this.W = W; this.H = H;
    this.bufs = [this.target(W, H), this.target(W, H)];
    if (old.length) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, old[0].f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.bufs[0].f);
      gl.blitFramebuffer(0, 0, old[0].w, old[0].h, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, this.bufs[0].t); gl.generateMipmap(gl.TEXTURE_2D);
      old.forEach(b => { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); });
    }
  }

  // Step resolution down when frames run long, back up when there is headroom.
  adapt(dt, now) {
    if (this.quality !== 'auto') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (now - this.lastAdapt < 3) return;
    let next = this.autoScale;
    if (avg > 1 / 45) next = Math.max(0.4, this.autoScale - 0.15);
    else if (avg < 1 / 58 && this.autoScale < 1) next = Math.min(1, this.autoScale + 0.1);
    if (next !== this.autoScale) { this.autoScale = next; this.lastAdapt = now; this.resize(); }
  }

  // Album art becomes a texture (the Vinyl label, the Oracle's iris).
  setArt(img) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.artTex);
    if (!img) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); this.hasArt = 0; return; }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.texParams();
    this.hasArt = 1;
  }

  // The desktop wallpaper the picture blends with (wallpaper app only).
  setBackdrop(img) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    if (!img) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); this.bgAspect = 0; return; }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.texParams();
    this.bgAspect = img.naturalWidth / img.naturalHeight;
  }

  uniforms(u, s, w, h) {
    const gl = this.gl;
    if (u.R) gl.uniform2f(u.R, w, h);
    for (const k of F1) if (u[k]) gl.uniform1f(u[k], k === 'T' ? s.T % 3600 : s[k]);
    for (const k of F3) if (u[k]) gl.uniform3fv(u[k], s[k]);
    SAMPLERS.forEach((k, i) => { if (u[k]) gl.uniform1i(u[k], i); });
    if (u.HASART) gl.uniform1f(u.HASART, this.hasArt);
    if (u.BGA) gl.uniform1f(u.BGA, s.BGA || 0);
    if (u.BGM) gl.uniform1f(u.BGM, this.bgAspect ? 1 : 0);
    if (u.BGS) { const a = w / h, b = this.bgAspect || a; gl.uniform2f(u.BGS, b > a ? a / b : 1, b > a ? 1 : b / a); }   // fill the screen, cropping the overflow
    if (u.HEAD) gl.uniform1f(u.HEAD, this.ecgHead);
    if (u.SGH) gl.uniform1f(u.SGH, this.sgHead);
    if (u.SGF) gl.uniform1f(u.SGF, Math.min(1, Math.max(0, (s.T - this.sgLast) / SG_INTERVAL)));
  }

  bindAll(src) {
    const gl = this.gl, T = [src, this.specTex, this.ecgTex, this.waveTex, this.sgTex, this.artTex, this.chromaTex, this.bgTex];
    T.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.activeTexture(gl.TEXTURE0);
  }

  render(audio, state, ecg) {
    const gl = this.gl, scene = SCENES[state.scene];
    this.setSceneScale(scene.res || 1);
    const [src, dst] = this.bufs;
    const prog = this.programFor(state.scene);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LS, 1, gl.RED, gl.UNSIGNED_BYTE, audio.tones.bytes);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, this.chromaTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 12, 1, gl.RED, gl.UNSIGNED_BYTE, audio.tones.chromaBytes);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, 1, gl.RED, gl.UNSIGNED_BYTE, audio.scope);
    if (state.T - this.sgLast >= SG_INTERVAL || state.T < this.sgLast) {   // a history row every 1/30 s: 8.5 s in all
      this.sgLast = state.T - this.sgLast > 2 * SG_INTERVAL || state.T < this.sgLast ? state.T : this.sgLast + SG_INTERVAL;
      this.sgHead = (this.sgHead + 1) % SG_ROWS;
      const row = this.sgRow;
      row.set(audio.tones.bytes);
      for (let i = 0; i < 8; i++) row[HIST_AT + i] = Math.max(0, Math.min(255, state.hist[i] * 255));
      gl.bindTexture(gl.TEXTURE_2D, this.sgTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.sgHead, SG_W, 1, gl.RED, gl.UNSIGNED_BYTE, row);
    }
    if (scene.ecg) {
      gl.bindTexture(gl.TEXTURE_2D, this.ecgTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 64, gl.RED, gl.FLOAT, ecg.trace);
      this.ecgHead = ecg.head;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, this.W, this.H);
    if (prog) {
      gl.useProgram(prog.p); this.uniforms(prog.u, state, this.W, this.H);
      this.bindAll(src.t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const ov = scene.overlay && this.overlayFor(scene.overlay);
    if (ov) {
      gl.useProgram(ov.p); this.uniforms(ov.u, state, this.W, this.H);
      this.bindAll(src.t);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.disableVertexAttribArray(0);
      if (ov.lines) {                                      // a line strip, drawn a few times a pixel apart
        gl.uniform1f(ov.u.LINE, 1);
        for (let k = 0; k < ov.lines; k++) { gl.uniform2f(ov.u.OFF, [0, 0.7, -0.7][k], [0, 0.7, 0.7][k]); gl.drawArrays(gl.LINE_STRIP, 0, ov.count); }
      } else { gl.uniform1f(ov.u.LINE, 0); gl.drawArrays(gl.POINTS, 0, ov.count); }
      gl.enableVertexAttribArray(0);
      gl.disable(gl.BLEND);
    }

    this.bindAll(dst.t);
    gl.generateMipmap(gl.TEXTURE_2D);                    // the display pass blooms and meters from the mips
    gl.useProgram(this.display.p); this.uniforms(this.display.u, state, this.CW, this.CH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.CW, this.CH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.bufs = [dst, src];
  }

  // A row of pixels across the middle of what was just drawn, as linear luminance (the flicker meter reads it).
  strip(out) {
    const gl = this.gl, n = out.length, px = this.stripPx && this.stripPx.length === n * 4 ? this.stripPx : (this.stripPx = new Uint8Array(n * 4));
    const step = Math.max(1, Math.floor(this.CW / n)), x0 = (this.CW - step * n) >> 1, y = this.CH >> 1;
    if (step === 1) gl.readPixels(Math.max(0, x0), y, n, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    else { const row = this.stripRow && this.stripRow.length === this.CW * 4 ? this.stripRow : (this.stripRow = new Uint8Array(this.CW * 4));
      gl.readPixels(0, y, this.CW, 1, gl.RGBA, gl.UNSIGNED_BYTE, row); for (let i = 0; i < n; i++) px.set(row.subarray((x0 + i * step) * 4, (x0 + i * step) * 4 + 4), i * 4); }
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < n; i++) out[i] = 0.2126 * lin(px[4 * i]) + 0.7152 * lin(px[4 * i + 1]) + 0.0722 * lin(px[4 * i + 2]);
  }

  // Milliseconds of GPU time per frame for one scene (debugging: ?debug then phosphene.bench()).
  bench(i, audio, state, ecg, frames = 60) {
    const gl = this.gl, px = new Uint8Array(4), keep = state.scene, t = state.T;
    const sync = () => { gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    state.scene = i;
    for (let k = 0; k < 12; k++) { state.T += 1 / 60; this.render(audio, state, ecg); }
    sync();
    const t0 = performance.now();
    for (let k = 0; k < frames; k++) { state.T += 1 / 60; this.render(audio, state, ecg); }
    sync();
    const ms = (performance.now() - t0) / frames;
    state.scene = keep; state.T = t;
    return ms;
  }
}
