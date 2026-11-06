// WebGL2 renderer: one program per scene (compiled on first use and pre-warmed
// for the next scene), a ping-pong pair of feedback buffers, and the textures
// the scenes read: spectrum, waveform, spectrogram ring, heartbeat ring, album
// art. A particle pass draws attractors for scenes that ask for it. Resolution
// adapts to keep the frame rate smooth.
import { VS, DISPLAY_FS, POINTS_VS, POINTS_FS, SCENES, sceneSource } from './shaders.js';

const F1 = ['T', 'B', 'M', 'H', 'BEAT', 'K', 'Z', 'C', 'TR', 'KICK', 'SNARE', 'HAT', 'PH', 'BAR', 'BT', 'BPM', 'EN', 'DROP', 'BP', 'GOO', 'IRID', 'PIT', 'HASART', 'ARTC', 'PK'];
const SG_ROWS = 256, SG_INTERVAL = 1 / 30;

export class Renderer {
  constructor(canvas, { mobile = false } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.mobile = mobile;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.maxPixels = mobile ? 1.3e6 : 4.2e6;
    this.quality = 'auto';             // 'auto' | 'low' | 'medium' | 'high'
    this.autoScale = mobile ? 0.7 : 1;
    this.frameTimes = [];
    this.lastAdapt = 0;
    this.programs = new Map();
    this.pointCount = mobile ? 24000 : 60000;

    this.display = this.program(VS, DISPLAY_FS);
    this.points = this.program(POINTS_VS, POINTS_FS);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.specTex = this.tex(gl.R8, 512, 1, gl.RED, gl.UNSIGNED_BYTE);
    this.waveTex = this.tex(gl.R8, 1024, 1, gl.RED, gl.UNSIGNED_BYTE);
    this.sgTex = this.tex(gl.R8, 512, SG_ROWS, gl.RED, gl.UNSIGNED_BYTE, true);
    this.ecgTex = this.tex(gl.R16F, 256, 64, gl.RED, gl.FLOAT);
    this.artTex = this.tex(gl.RGBA8, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE);
    this.hasArt = 0; this.ecgHead = 0; this.sgHead = 0; this.sgLast = 0;

    this.bufs = [];
    this.resize();
  }

  tex(internal, w, h, format, type, repeatY = false) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    this.texParams(repeatY);
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
      catch (e) { console.error('Scene ' + SCENES[i].name + ' failed to compile:', e.message); this.programs.set(i, null); }
    }
    return this.programs.get(i);
  }
  prewarm(i) { if (!this.programs.has(i)) setTimeout(() => this.programFor(i), 50); }

  texParams(repeatY = false) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeatY ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  }

  target(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.floatOK ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
      this.floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    this.texParams();
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f };
  }

  scale() { return { low: 0.5, medium: 0.75, high: 1, auto: this.autoScale }[this.quality]; }
  setQuality(q) { this.quality = q; this.resize(); }

  resize() {
    const gl = this.gl, dpr = window.devicePixelRatio || 1;
    const cssW = innerWidth, cssH = innerHeight;
    const cap = Math.sqrt(this.maxPixels / (cssW * cssH));
    const s = Math.min(dpr, cap) * this.scale();
    const W = Math.max(1, Math.round(cssW * s)), H = Math.max(1, Math.round(cssH * s));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    this.bufs.forEach(b => { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); });
    this.bufs = [this.target(W, H), this.target(W, H)];
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

  uniforms(u, s) {
    const gl = this.gl;
    if (u.R) gl.uniform2f(u.R, this.W, this.H);
    for (const k of F1) if (u[k]) gl.uniform1f(u[k], k === 'T' ? s.T % 3600 : k === 'HASART' ? this.hasArt : s[k]);
    if (u.PA) gl.uniform3fv(u.PA, s.PA);
    if (u.PB) gl.uniform3fv(u.PB, s.PB);
    if (u.P) gl.uniform1i(u.P, 0);
    if (u.F) gl.uniform1i(u.F, 1);
    if (u.ECG) gl.uniform1i(u.ECG, 2);
    if (u.W) gl.uniform1i(u.W, 3);
    if (u.SG) gl.uniform1i(u.SG, 4);
    if (u.ART) gl.uniform1i(u.ART, 5);
    if (u.HEAD) gl.uniform1f(u.HEAD, this.ecgHead);
    if (u.SGH) gl.uniform1f(u.SGH, this.sgHead);
  }

  bindAll(src) {
    const gl = this.gl, T = [src, this.specTex, this.ecgTex, this.waveTex, this.sgTex, this.artTex];
    T.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.activeTexture(gl.TEXTURE0);
  }

  render(audio, state, ecg) {
    const gl = this.gl, [src, dst] = this.bufs, scene = SCENES[state.scene];
    const prog = this.programFor(state.scene);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 1, gl.RED, gl.UNSIGNED_BYTE, audio.freq);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, 1, gl.RED, gl.UNSIGNED_BYTE, audio.wave);
    if (state.T - this.sgLast >= SG_INTERVAL) {           // one spectrogram row per 1/30 s: 8.5 s of history
      this.sgLast = state.T; this.sgHead = (this.sgHead + 1) % SG_ROWS;
      gl.bindTexture(gl.TEXTURE_2D, this.sgTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.sgHead, 512, 1, gl.RED, gl.UNSIGNED_BYTE, audio.freq);
    }
    if (scene.ecg) {
      gl.bindTexture(gl.TEXTURE_2D, this.ecgTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 64, gl.RED, gl.FLOAT, ecg.trace);
      this.ecgHead = ecg.head;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, this.W, this.H);
    if (prog) {
      gl.useProgram(prog.p); this.uniforms(prog.u, state);
      this.bindAll(src.t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (scene.points) {
      gl.useProgram(this.points.p); this.uniforms(this.points.u, state);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.disableVertexAttribArray(0);
      gl.drawArrays(gl.POINTS, 0, this.pointCount);
      gl.enableVertexAttribArray(0);
      gl.disable(gl.BLEND);
    }

    gl.useProgram(this.display.p); this.uniforms(this.display.u, state);
    gl.bindTexture(gl.TEXTURE_2D, dst.t);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.bufs = [dst, src];
  }
}
