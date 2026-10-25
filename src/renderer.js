// WebGL2 renderer: a ping-pong pair of feedback buffers plus a 512x1
// spectrum texture. Resolution adapts to keep the frame rate smooth.
import { VS, SCENE_FS, DISPLAY_FS } from './shaders.js';

export class Renderer {
  constructor(canvas, { mobile = false } = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.floatOK = !!gl.getExtension('EXT_color_buffer_float');
    this.maxPixels = mobile ? 1.3e6 : 4.2e6;
    this.quality = 'auto';             // 'auto' | 'low' | 'medium' | 'high'
    this.autoScale = mobile ? 0.7 : 1;
    this.frameTimes = [];
    this.lastAdapt = 0;

    this.scene = this.program(SCENE_FS);
    this.display = this.program(DISPLAY_FS);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.specTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(512));
    this.texParams();

    // 64 rows of spectrum history (a ring buffer) for scenes that draw the past.
    this.histTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.histTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 64, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(512 * 64));
    this.texParams();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.histRow = 0; this.frame = 0;

    this.bufs = [];
    this.resize();
  }

  shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  program(fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this.shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, this.shader(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
  }

  texParams() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

  scale() {
    return { low: 0.5, medium: 0.75, high: 1, auto: this.autoScale }[this.quality];
  }

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

  uniforms(u, s) {
    const gl = this.gl, f = (n, v) => { if (u[n]) gl.uniform1f(u[n], v); };
    if (u.R) gl.uniform2f(u.R, this.W, this.H);
    f('T', s.t % 3600); f('B', s.b); f('M', s.m); f('H', s.h); f('BEAT', s.beat);
    f('K', s.k); f('Z', s.z); f('C', s.c); f('TR', s.trails);
    if (u.S) gl.uniform1i(u.S, s.scene);
    if (u.P) gl.uniform1i(u.P, 0);
    if (u.F) gl.uniform1i(u.F, 1);
    if (u.HIS) gl.uniform1i(u.HIS, 2);
    f('HROW', this.histRow);
  }

  render(spectrum, state) {
    const gl = this.gl, [src, dst] = this.bufs;
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 1, gl.RED, gl.UNSIGNED_BYTE, spectrum);
    if (++this.frame % 2 === 0) {
      this.histRow = (this.histRow + 1) % 64;
      gl.bindTexture(gl.TEXTURE_2D, this.histTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.histRow, 512, 1, gl.RED, gl.UNSIGNED_BYTE, spectrum);
    }

    gl.useProgram(this.scene.p); this.uniforms(this.scene.u, state);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.histTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, this.W, this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.display.p); this.uniforms(this.display.u, state);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.t);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.bufs = [dst, src];
  }
}
