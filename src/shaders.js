// GLSL ES 3.00. Every scene is its own program: COMMON + the scene's function +
// the feedback pass, which melts, swirls, zooms and hue-drifts the previous
// frame before the new one is laid on top. A display pass then adds bloom,
// clarity, iridescence, chromatic aberration, tone mapping, grain and a vignette.
import { SCENES } from './scenes.js';
export { SCENES };

export const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

// Shared by every fragment program. Uniform cheat sheet:
//   R resolution  T time  B M H bass/mid/high  BEAT kick envelope (old detector)
//   KICK SNARE HAT onset envelopes  PH beat phase 0..1  BAR bar phase 0..1  BT beats elapsed (eased)
//   BPM tempo  EN energy 0..1  DROP section-drop envelope  BP predicted-beat pulse
//   MEL melody pitch height 0..1 (A2..A6, eased)  NOTE pulse on every new melody note
//   MELV how sure the melody tracker is  MELH the note's colour (pitch class by fifths)  TONE harmonic energy
//   K symmetry  Z bass-driven distance  SP turntable angle  C palette offset  TR trail length
//   GOO melt amount  IRID iridescence  SGH SGF spectrogram head row and fraction
//   PA PB PF PD cosine palette (album art and the palette presets set these)
//   HASART art texture loaded  ARTC confidence the art is the song playing (0..1)  ARM tonearm down (music playing, not mid-check)
// Samplers and the helpers that read them:
//   P previous frame   F log spectrum -> spec(x)   CH chroma -> chroma(x)   W waveform -> wave(x)
//   SG history ring -> sg(x, age) and hist(i, age)   ECG heartbeat ring -> ecgAt(k)   ART album art
const UNIFORMS = `
uniform vec2 R; uniform float T,B,M,H,BEAT,K,Z,C,TR;
uniform float KICK,SNARE,HAT,PH,BAR,BT,BPM,EN,DROP,BP,GOO,IRID,SGH,SGF,HEAD,HASART,ARTC,ARM,SP;
uniform float MEL,NOTE,MELV,MELH,TONE;
uniform vec3 PA,PB,PF,PD;
#define TAU 6.28318530718
#define PI 3.14159265359
vec3 pal(float t){ return PA + PB*cos(TAU*(PF*t + PD)); }
float hash1(float n){ return fract(sin(n)*43758.5453); }
`;

export const COMMON = `#version 300 es
precision highp float;
${UNIFORMS}
uniform sampler2D P, F, ECG, W, SG, ART, CH;
out vec4 o;
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=rot(.5)*p*2.03; a*=.5; } return v; }
float fbm3(vec2 p){ float v=0.,a=.5; for(int i=0;i<3;i++){ v+=a*noise(p); p=rot(.5)*p*2.03; a*=.5; } return v; }
// value noise with its gradient, for flows that need no finite differences
vec3 noised(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.-2.*f), du=6.*f*(1.-f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+1.);
  return vec3(a+(b-a)*u.x+(c-a)*u.y+(a-b-c+d)*u.x*u.y, du*(vec2(b-a,c-a)+(a-b-c+d)*u.yx)); }
vec2 curl(vec2 p){ vec2 g = noised(p).yz + noised(p*2.03+7.3).yz*.9; return vec2(g.y,-g.x)*.7; }
vec2 kale(vec2 p,float n){ float a=atan(p.y,p.x), r=length(p), s=TAU/n; a=mod(a,s); a=abs(a-s*.5); return r*vec2(cos(a),sin(a)); }
// the musical spectrum: x 0..1 runs A1 (55 Hz) to 14 kHz, one octave per eighth, notes stand out as peaks
float spec(float x){ return textureLod(F,vec2(clamp(x,0.,1.),.5),0.).r; }
// the same, averaged over a wider band: l = 2 is about a tone, 3.5 a fifth, 4.6 an octave
float specb(float x,float l){ return textureLod(F,vec2(clamp(x,0.,1.),.5),l).r; }
#define MELX (.125+MEL*.5)                          // where the melody's note sits in spec()
// the twelve pitch classes around a circle: note i (A, A#, B ...) sits at x = (i+.5)/12
float chroma(float x){ return texture(CH,vec2(x,.5)).r; }
float wave(float x){ return texture(W,vec2(fract(x),.5)).r*2.-1.; }
// 8.5 s of history, scrolling smoothly: age 0 is now, 1 is the oldest row
float sgRow(float age){ return (SGH-.5+SGF-age*255.)/256.; }
float sg(float x,float age){ return texture(SG,vec2((clamp(x,0.,1.)*191.+.5)/256., sgRow(age))).r; }
// feature history: 0 melody pitch, 1 its confidence, 2 energy, 3 bass, 4 kick, 5 note-ons, 6 mids, 7 highs
float hist(float i,float age){ return texture(SG,vec2((224.5+i)/256., sgRow(age))).r; }
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
vec2 scr(vec2 p){ return p*vec2(R.y/R.x,1.)+.5; }   // scene coordinates to a texture coordinate of the previous frame
float fbk = 1.;                                     // a scene may lower this per pixel to keep part of the picture crisp
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
  q = rot(FB_SWIRL*(.003 + .018*M*sin(T*.3) + .02*(MEL-.5)*MELV)) * q;   // the melody leans the swirl
  q *= 1. - FB_ZOOM*(.008 + .03*B + .04*BEAT + .03*DROP + .012*NOTE);
  q += .002*vec2(sin(p.y*7.+T*.7), cos(p.x*7.-T*.6))*(1.+goo);
  vec3 prev = textureLod(P, scr(q), 0.).rgb;
  // every new note tints the trails, so a tune leaves rings of different colours behind it
  prev = max(hue(prev, .02 + .1*H + .4*DROP + .03*NOTE)*min(TR*FB_KEEP + .08*M, .985) - .004, 0.);
  vec3 acc = col*.55 + prev*fbk;
  acc /= 1. + acc*.07;                                      // soft ceiling so loud music never whites out
  o = vec4(acc, 1.);
}`;

export function sceneSource(s) {
  const fb = Object.assign({ zoom: 1, swirl: 1, melt: 1, keep: 1, drip: 0 }, s.fb);
  const consts = `const float FB_ZOOM=${f(fb.zoom)}, FB_SWIRL=${f(fb.swirl)}, FB_MELT=${f(fb.melt)}, FB_KEEP=${f(fb.keep)}, FB_DRIP=${f(fb.drip)};\n`;
  return COMMON + consts + s.glsl + FEEDBACK;
}
const f = n => Number(n).toFixed(3);

// The display pass reads the frame's mip chain: level 0 for the picture, the
// middle levels for clarity and bloom, the top (1 x 1) level for exposure.
// A look (Focus, Relax, Meditate, Sleep) quiets the picture here: LG brightness, LS saturation, LE how far
// the edges of vision are stilled, LW warmth, LR how much of the beat still reaches the lens.
// The pulse: when a steady modulation is found in the music (modlock.js), fine rings travel outward in
// step with it. MODP is its phase, MODA its strength. It never goes into overall brightness: the rings
// average out across the screen, and each pixel's swing is capped at 4.5% of its own value and 6% of full-scale luminance, under the
// 10% that accessibility rules count as a flash (WCAG 2.3.1).
// As a desktop wallpaper it also blends with the user's own wallpaper. BGA is how
// much of that shows, from 1 (only the wallpaper) to 0 (only the picture). By
// default the canvas simply goes transparent there, so the real desktop shows
// through, whatever it is. With BGM set, a copy of the wallpaper image (BG) is
// drawn instead and pushed around as it gives way, so it seems to liquefy.
export const DISPLAY_FS = COMMON + `
uniform sampler2D BG; uniform float BGA, BGM; uniform vec2 BGS;
uniform float LG, LS, LE, LW, LR, MODP, MODA;
void main(){
  vec2 uv = gl_FragCoord.xy/R;
  vec2 cc = uv-.5; float r2 = dot(cc,cc);
  uv = .5 + cc*(1. + .025*r2*(.5+.5*sin(BAR*TAU))*LR - .02*r2*DROP);   // the lens breathes with the bar
  vec2 d = cc*(.003+.014*BEAT+.006*B+.012*DROP);
  vec3 c = vec3(textureLod(P,uv+d,0.).r, textureLod(P,uv,0.).g, textureLod(P,uv-d,0.).b);
  c = max(c + (c - textureLod(P,uv,3.).rgb)*.3, 0.);                     // clarity: lift detail over its surroundings
  vec3 bl = textureLod(P,uv,2.5).rgb*.5 + textureLod(P,uv,4.).rgb*.35 + textureLod(P,uv,5.5).rgb*.15;
  vec3 br = max(bl-.5, 0.); c += br*br/(1.+br)*(.55+.6*DROP);           // bloom from the bright regions only, never a haze
  float l = dot(c,vec3(.299,.587,.114));
  c = hue(c, IRID*.5*sin(l*5.+T*.4));                                    // thin-film iridescence
  float avg = dot(textureLod(P,vec2(.5),20.).rgb, vec3(.299,.587,.114)); // the whole frame, for exposure
  float ex = clamp(.9/(avg+.3), .3, 2.2);
  c = 1.-exp(-c*ex);
  l = dot(c,vec3(.299,.587,.114));
  c = max(mix(vec3(l),c,1.45*LS),0.);
  c = c*c*(3.-2.*c);
  c += (hash(gl_FragCoord.xy+fract(T))-.5)*.03;                          // grain
  c *= mix(.35,1.,smoothstep(1.1,.3,length(uv-.5)));
  vec2 ar = cc*vec2(R.x/R.y,1.);
  c *= LG*mix(1., smoothstep(.78,.14,length(ar*vec2(.6,1.))), LE*.75);    // a calm look dims and stills the edges of vision
  c = mix(c, c*vec3(1.,.7,.36), LW);
  if(MODA > .0005){                                                       // the pulse, as fine rings moving outward
    float rr = length(ar) + .014*noise(ar*5.+T*.05);
    float lum = dot(c,vec3(.299,.587,.114));
    float amp = min(.045, .0136/pow(max(lum,.05),2.2));                   // 4.5% of the pixel, and never more than 6% of full-scale light
    c *= 1. + MODA*amp*sin(TAU*(rr*26. - MODP))*smoothstep(.66,.22,rr);
  }
  float cover = 1.;
  if(BGA > .001){                                         // the desktop wallpaper, giving way to the picture or coming back
    float m = 1.-BGA;
    vec2 su = gl_FragCoord.xy/R, sa = su*vec2(R.x/R.y,1.);
    float th = .55*noise(sa*3.5+T*.07) + .45*dot(c,vec3(.34));   // the bright parts of the picture burn through first
    float v = smoothstep(BGA*1.3-.3, BGA*1.3, th);
    vec3 seam = pal(th+C)*v*(1.-v)*.9;                     // a glowing edge where one gives way to the other
    if(BGM > .5){
      vec2 flow = curl(sa*2.5+T*.08)*.035 + (c.rg-c.gb)*.12;   // the wallpaper is pushed around by what replaces it
      c = mix(texture(BG, (su-.5)*BGS+.5 + flow*m*(.3+.7*m)).rgb, c, v) + seam;
    } else {
      c = c*v + seam; cover = clamp(v + 3.*v*(1.-v), 0., 1.);   // premultiplied: the real desktop shows through the rest
    }
  }
  o = vec4(c,cover);
}`;

// Overlay passes: additive points drawn into the feedback buffer after a scene.
// No vertex buffers; every vertex is derived from its id.
const POINT_PRELUDE = `#version 300 es
precision highp float;
${UNIFORMS}
uniform sampler2D F, W, CH;
out vec3 vc;
`;
export const OVERLAYS = {
  // Swarm: points on a Clifford attractor whose parameters breathe with the music and lean with the melody.
  swarm: { count: 60000, mobile: 24000, vs: POINT_PRELUDE + `
void main(){
  float id = float(gl_VertexID);
  vec2 p = vec2(hash1(id*1.37+.1), hash1(id*7.91+.7))*4.-2.;
  float mel = (MEL-.5)*MELV;
  float a = 1.6 + .45*sin(T*.11) + .35*M + .5*mel, b = 1.7 + .4*cos(T*.07 + BAR*TAU*.25) - .4*mel, c = .7 + .35*sin(T*.13) + .25*B, d = 1.25 + .4*cos(T*.09);
  for(int i=0;i<22;i++) p = vec2(sin(a*p.y) + c*cos(a*p.x), sin(b*p.x) + d*cos(b*p.y));
  float ca = cos(T*.05), sa = sin(T*.05); p = mat2(ca,-sa,sa,ca)*p;
  p *= .42 + .06*B + .05*KICK;
  gl_Position = vec4(p*vec2(R.y/R.x,1.), 0., 1.);
  gl_PointSize = (1.3 + 2.5*KICK + 1.5*DROP + 1.2*NOTE)*R.y/900.;
  float h = hash1(id*3.3);
  // each particle listens to one note of the scale
  float n = texture(CH, vec2(h,.5)).r;
  vc = pal(h*.25 + C + T*.02 + length(p)*.5) * (.5 + n*1.6 + texture(F, vec2(h,.5)).r) * (.6+.4*EN) * .075;
}` },
  // Beam: the waveform against a delayed copy of itself, as an oscilloscope would draw it:
  // one continuous line, drawn three times a pixel apart so it has some body.
  beam: { count: 2048, mobile: 1024, lines: 3, vs: POINT_PRELUDE + `
uniform vec2 OFF;
void main(){
  float u = float(gl_VertexID)/2048.*(.76-.1*M);          // stop before the delayed copy wraps
  float x = texture(W, vec2(u,.5)).r*2.-1., y = texture(W, vec2(u+.23+.1*M,.5)).r*2.-1.;
  vec2 p = vec2(x,y)*.84*(1.+.2*KICK);
  gl_Position = vec4(p*vec2(R.y/R.x,1.) + OFF*2./R, 0., 1.);
  gl_PointSize = 1.;
  vc = mix(vec3(.4,1.,.55), pal(u*.5+C+MELH*.3), .35)*(.5+.6*M+.5*NOTE)*.5;
}` },
};
export const POINTS_FS = `#version 300 es
precision highp float; in vec3 vc; out vec4 o;
uniform float LINE;
void main(){ vec2 d = gl_PointCoord-.5; o = vec4(vc*mix(smoothstep(.5,.1,length(d)), 1., LINE), 1.); }`;
