// GLSL ES 3.00. Every scene is its own program: COMMON + the scene's function +
// the feedback pass, which melts, swirls, zooms and hue-drifts the previous
// frame before the new one is laid on top. A display pass then adds bloom,
// iridescence, chromatic aberration, tone mapping, grain and a vignette.
import { SCENES } from './scenes.js';
export { SCENES };

export const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

// Shared by every fragment program. Uniform cheat sheet:
//   R resolution  T time  B M H bass/mid/high  BEAT kick envelope (old detector)
//   KICK SNARE HAT onset envelopes  PH beat phase 0..1  BAR bar phase 0..1  BT beats elapsed (eased)
//   BPM tempo  EN energy 0..1  DROP section-drop envelope  BP predicted-beat pulse
//   K symmetry  Z bass-driven distance  C palette offset  TR trail length
//   GOO melt amount  IRID iridescence  PIT dominant pitch 0..1  SGH spectrogram head row
//   PA PB PK cosine palette (album art tints these)
//   P previous frame  F spectrum  ECG heartbeat ring  W waveform  SG spectrogram ring  ART album art
export const COMMON = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T,B,M,H,BEAT,K,Z,C,TR;
uniform float KICK,SNARE,HAT,PH,BAR,BT,BPM,EN,DROP,BP,GOO,IRID,PIT,SGH,HEAD,HASART,PK;
uniform vec3 PA,PB;
uniform sampler2D P, F, ECG, W, SG, ART;
out vec4 o;
#define TAU 6.28318530718
#define PI 3.14159265359
vec3 pal(float t){ return PA + PB*cos(TAU*(t + PK*vec3(0.,.33,.67))); }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float hash1(float n){ return fract(sin(n)*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=rot(.5)*p*2.03; a*=.5; } return v; }
float fbm3(vec2 p){ float v=0.,a=.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=rot(.5)*p*2.03; a*=.5; } return v; }
vec2 curl(vec2 p){ const float e=.02;
  float a=fbm3(p+vec2(0,e)), b=fbm3(p-vec2(0,e)), c=fbm3(p+vec2(e,0)), d=fbm3(p-vec2(e,0));
  return vec2(a-b, d-c)/(2.*e); }
vec2 kale(vec2 p,float n){ float a=atan(p.y,p.x), r=length(p), s=TAU/n; a=mod(a,s); a=abs(a-s*.5); return r*vec2(cos(a),sin(a)); }
float spec(float x){ return texture(F,vec2(clamp(x,0.,1.),.5)).r; }
float wave(float x){ return texture(W,vec2(fract(x),.5)).r*2.-1.; }
float sg(float x,float age){ return texture(SG,vec2(clamp(x,0.,1.),(SGH-age*255.+.5)/256.)).r; }
float ecgAt(float k){                  // linear read from the 256 x 64 heartbeat ring buffer
  k = mod(k, 16384.);
  float k0 = floor(k), k1 = mod(k0+1., 16384.);
  float a = texelFetch(ECG, ivec2(int(mod(k0,256.)), int(k0/256.)), 0).r;
  float b = texelFetch(ECG, ivec2(int(mod(k1,256.)), int(k1/256.)), 0).r;
  return mix(a, b, k-k0);
}
vec3 hue(vec3 c,float a){ const vec3 k=vec3(.57735); float ca=cos(a); return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca); }
float pulse(float w){ return exp(-PH*w); }          // a punch on every predicted beat
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h); }
`;

// The feedback pass. FB_* constants are substituted per scene.
export const FEEDBACK = `
void main(){
  vec2 p = (gl_FragCoord.xy-.5*R)/R.y;
  vec3 col = scene(p);
  if(any(isnan(col)) || any(isinf(col))) col = vec3(0);
  float goo = GOO*FB_MELT;
  vec2 q = p;
  vec2 cn = curl(p*1.4 + vec2(T*.06, -T*.04) + .3*sin(T*.1));
  q += cn*(.004+.012*M+.02*DROP)*goo;                       // melt along a slowly turning flow
  q.y += (.003+.004*B)*goo*FB_DRIP;                         // and drip
  q = rot(.003*FB_SWIRL + .018*FB_SWIRL*M*sin(T*.3)) * q;
  q *= 1. - FB_ZOOM*(.008 + .03*B + .04*BEAT + .03*DROP);
  q += .002*vec2(sin(p.y*7.+T*.7), cos(p.x*7.-T*.6))*(1.+goo);
  vec3 prev = texture(P, q*vec2(R.y/R.x,1.)+.5).rgb;
  prev = max(hue(prev, .02 + .1*H + .4*DROP)*min(TR*FB_KEEP + .08*M, .985) - .004, 0.);
  vec3 acc = col*.55 + prev;
  acc /= 1. + acc*.07;                                      // soft ceiling so loud music never whites out
  o = vec4(acc, 1.);
}`;

export function sceneSource(s) {
  const fb = Object.assign({ zoom: 1, swirl: 1, melt: 1, keep: 1, drip: 0 }, s.fb);
  const consts = `const float FB_ZOOM=${f(fb.zoom)}, FB_SWIRL=${f(fb.swirl)}, FB_MELT=${f(fb.melt)}, FB_KEEP=${f(fb.keep)}, FB_DRIP=${f(fb.drip)};\n`;
  return COMMON + consts + s.glsl + FEEDBACK;
}
const f = n => Number(n).toFixed(3);

export const DISPLAY_FS = COMMON + `
void main(){
  vec2 uv = gl_FragCoord.xy/R;
  vec2 cc = uv-.5; float r2 = dot(cc,cc);
  uv = .5 + cc*(1. + .025*r2*(.5+.5*sin(BAR*TAU)) - .02*r2*DROP);      // the lens breathes with the bar
  vec2 d = cc*(.003+.014*BEAT+.006*B+.012*DROP);
  vec3 c = vec3(texture(P,uv+d).r, texture(P,uv).g, texture(P,uv-d).b);
  vec3 bl = vec3(0); vec2 px = vec2(R.y/R.x,1.)*(.014+.01*DROP);
  for(int i=0;i<8;i++){ float a=float(i)*TAU/8.; bl += texture(P, uv+vec2(cos(a),sin(a))*px).rgb; }
  bl *= .125; vec3 br = max(bl-.45, 0.); c += br*br/(1.+br)*(.6+.6*DROP);   // bloom from the bright bits only, never runaway
  float l = dot(c,vec3(.299,.587,.114));
  c = hue(c, IRID*.5*sin(l*5.+T*.4));                                    // thin-film iridescence
  float avg = 0.;                                                         // auto exposure: 16 taps of the frame
  for(int i=0;i<4;i++) for(int j=0;j<4;j++) avg += dot(texture(P, (vec2(float(i),float(j))+.5)/4.).rgb, vec3(.299,.587,.114));
  float ex = clamp(.9/(avg/16.+.3), .3, 2.2);
  c = 1.-exp(-c*ex);
  l = dot(c,vec3(.299,.587,.114));
  c = max(mix(vec3(l),c,1.45),0.);
  c = c*c*(3.-2.*c);
  c += (hash(gl_FragCoord.xy+fract(T))-.5)*.03;                          // grain
  c *= mix(.35,1.,smoothstep(1.1,.3,length(uv-.5)));
  o = vec4(c,1.);
}`;

// Particle pass for the Swarm scene: 60k points on a Clifford attractor whose
// parameters breathe with the music. No buffers; every vertex is derived from its id.
export const POINTS_VS = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T,B,M,H,BEAT,KICK,SNARE,PH,BAR,C,EN,PK,DROP; uniform vec3 PA,PB; uniform sampler2D F;
out vec3 vc;
#define TAU 6.28318530718
float hash1(float n){ return fract(sin(n)*43758.5453); }
vec3 pal(float t){ return PA + PB*cos(TAU*(t + PK*vec3(0.,.33,.67))); }
void main(){
  float id = float(gl_VertexID);
  vec2 p = vec2(hash1(id*1.37+.1), hash1(id*7.91+.7))*4.-2.;
  float a = 1.6 + .45*sin(T*.11) + .35*M, b = 1.7 + .4*cos(T*.07 + BAR*TAU*.25), c = .7 + .35*sin(T*.13) + .25*B, d = 1.25 + .4*cos(T*.09);
  for(int i=0;i<22;i++) p = vec2(sin(a*p.y) + c*cos(a*p.x), sin(b*p.x) + d*cos(b*p.y));
  float ca = cos(T*.05), sa = sin(T*.05); p = mat2(ca,-sa,sa,ca)*p;
  p *= .42 + .06*B + .05*KICK;
  gl_Position = vec4(p*vec2(R.y/R.x,1.), 0., 1.);
  gl_PointSize = 1.3 + 2.5*KICK + 1.5*DROP;
  float h = hash1(id*3.3);
  vc = pal(h*.25 + C + T*.02 + length(p)*.5) * (.5 + texture(F, vec2(h*.5,.5)).r*1.5) * (.6+.4*EN);
}`;
export const POINTS_FS = `#version 300 es
precision highp float; in vec3 vc; out vec4 o;
void main(){ vec2 d = gl_PointCoord-.5; o = vec4(vc*.06*smoothstep(.5,.1,length(d)), 1.); }`;
