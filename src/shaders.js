// GLSL ES 3.00 shaders. Every scene renders into a feedback buffer that
// zooms, swirls and hue-drifts the previous frame, then a display pass adds
// chromatic aberration, tone mapping and a vignette.

export const SCENES = [
  { name: 'Fractal Bloom',    blurb: 'Kaleidoscopic IFS fractal' },
  { name: 'Wormhole',         blurb: 'Bass-driven tunnel flight' },
  { name: 'Liquid Dream',     blurb: 'Domain-warped oil flow' },
  { name: 'Spectral Mandala', blurb: 'Every ring is a frequency band' },
  { name: 'Gyroid Flight',    blurb: 'Raymarched 3D lattice' },
  { name: 'Julia Bloom',      blurb: 'Morphing Julia set fractal' },
  { name: 'Hyperspace',       blurb: 'Star streaks at warp speed' },
  { name: 'Moiré',            blurb: 'Op-art interference rings' },
  { name: 'Neon Horizon',     blurb: 'Synthwave grid and spectrum skyline' },
  { name: 'Pulsar',           blurb: 'Ridgelines from spectrum history' },
];

export const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T,B,M,H,BEAT,K,Z,C,TR; uniform int S;
uniform sampler2D P, F, HIS; uniform float HROW;
out vec4 o;
#define TAU 6.28318530718
vec3 pal(float t){ return .5+.5*cos(TAU*(t+vec3(0.,.33,.67))); }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=rot(.5)*p*2.03; a*=.5; } return v; }
vec2 kale(vec2 p,float n){ float a=atan(p.y,p.x), r=length(p), s=TAU/n; a=mod(a,s); a=abs(a-s*.5); return r*vec2(cos(a),sin(a)); }
float spec(float x){ return texture(F,vec2(clamp(x,0.,1.),.5)).r; }
float hist(float x,float age){ return texture(HIS,vec2(clamp(x,0.,1.),(HROW-age+.5)/64.)).r; }
vec3 hue(vec3 c,float a){ const vec3 k=vec3(.57735); float ca=cos(a); return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca); }
`;

export const SCENE_FS = COMMON + `
vec3 s0(vec2 p){                       // Kaleidoscopic IFS fractal
  p *= rot(T*.05)*(1.6-.4*B);
  p = kale(p,K);
  vec3 c = vec3(0); float sc = 1.;
  for(int i=0;i<7;i++){
    float fi = float(i), e = spec(fi/7.*.5);
    p = abs(p) - vec2(.6+.12*sin(T*.13), .35+.1*cos(T*.1));
    p = rot(.4+T*.03+fi*.2+.25*M)*p;
    p *= 1.4; sc *= 1.4;
    float ring = abs(length(p)-.4-.3*e)/sc, line = abs(p.y)/sc;
    c += pal(fi*.12+T*.04+C)*(.006/(ring+.004)+.002/(line+.004))*(.4+1.5*e);
  }
  return c*.38;
}
vec3 s1(vec2 p){                       // Wormhole tunnel
  p *= rot(T*.1+.4*sin(T*.21));
  float r = max(length(p),.001), a = atan(p.y,p.x);
  float v = .35/r + Z, u = a/TAU*K;
  float w = fbm(vec2(cos(a),sin(a))*1.5 + vec2(v*.3,T*.05));
  float g = abs(sin(u*3.14159+w*3.))*abs(sin(v*1.5708+w*2.));
  float ring = spec(fract(v*.04));
  vec3 c = pal(v*.04+u*.05+w+C)*pow(g,.6)*(.3+1.6*ring);
  c += pal(v*.07+.5+C)*pow(1.-g,10.)*(.4+2.*B);
  return c*smoothstep(0.,.35,r)*.8;
}
vec3 s2(vec2 p){                       // Domain-warped liquid
  p *= 1.4+.3*sin(T*.1);
  float t = T*.15;
  vec2 q = vec2(fbm(p+t), fbm(p+vec2(5.2,1.3)-t));
  vec2 r = vec2(fbm(p+3.*q+vec2(1.7,9.2)+.8*B+t*.5), fbm(p+3.*q+vec2(8.3,2.8)-t*.4));
  float f = fbm(p+3.*r+M);
  vec3 c = pal(f*2.2+length(q)*.8+C+T*.02)*pow(f,3.)*2.2;
  c += pal(f+.5+C)*pow(length(r),6.)*(.08+H*.5);
  c *= .4+.6*smoothstep(.35,.75,f);              // dark veins between the flows
  return c*.35;
}
vec3 s3(vec2 p){                       // Spectral mandala
  p *= rot(-T*.08);
  float r = length(p), a = atan(p.y,p.x);
  vec3 c = vec3(0);
  for(int i=0;i<14;i++){
    float fi = float(i)/14., e = spec(fi*.6+.01);
    float rr = .05+fi*.62 + e*.07*sin(a*K+T*2.+fi*6.) + .025*e*sin(a*K*2.-T*3.);
    c += pal(fi+T*.05+C)*(.0015+.006*e)/abs(r-rr);
  }
  float pet = pow(abs(cos(a*K*.5+T)),18.)*exp(-r*2.5)*(.3+B);
  c += pal(T*.1+C+.3)*pet;
  return c*.5;
}
float gyr(vec3 q){
  q.xy = rot(q.z*.08)*q.xy;
  float g = abs(dot(sin(q*3.),cos(q.zxy*3.)))/3. - .02 - .05*B;
  return max(g, .55-length(q.xy));              // keep a clear flight tunnel
}
vec3 s4(vec2 p){                       // Gyroid lattice flight
  vec3 ro = vec3(.15*sin(T*.2),.15*cos(T*.17),Z*2.);
  vec3 rd = normalize(vec3(rot(T*.07)*p,1.));
  float t = .1, g = 1.; vec3 glow = vec3(0);
  for(int i=0;i<90;i++){
    vec3 q = ro+rd*t; g = gyr(q);
    glow += pal(q.z*.08+C+T*.02)*exp(-abs(g)*40.)*.01;
    if(abs(g)<.001 || t>14.) break;
    t += abs(g)*.6;
  }
  vec3 q = ro+rd*t;
  vec3 c = glow*(.5+2.*spec(fract(q.z*.02)));
  if(t<14.){
    vec2 e = vec2(.004,0);
    vec3 n = normalize(vec3(gyr(q+e.xyy)-gyr(q-e.xyy), gyr(q+e.yxy)-gyr(q-e.yxy), gyr(q+e.yyx)-gyr(q-e.yyx)));
    float fr = pow(1.-abs(dot(n,rd)),3.);
    vec3 base = pal(q.z*.1+dot(n,vec3(.3,.5,.2))*.4+C+T*.03);
    c += base*(.15+fr*2.)*exp(-t*.3)*(.6+1.2*spec(fract(q.z*.02)));
  }
  return c;
}
vec3 s5(vec2 p){                       // Julia set, c traces the Mandelbrot cardioid edge
  p *= rot(T*.03)*(2.5-.35*B);
  float a = T*.06+.6*M+1.;
  vec2 e1 = vec2(cos(a),sin(a)), e2 = vec2(cos(2.*a),sin(2.*a));
  vec2 c = (e1*.5-e2*.25)*1.015;
  vec2 z = p; float n = 0., tr = 1e3;
  for(int i=0;i<80;i++){
    z = vec2(z.x*z.x-z.y*z.y, 2.*z.x*z.y) + c;
    tr = min(tr, abs(length(z)-.45-.3*spec(.08)));
    if(dot(z,z)>16.) break;
    n++;
  }
  vec3 col = vec3(0);
  if(n<79.){
    float sm = n - log2(log2(dot(z,z))) + 4.;
    col = pal(sm*.04+T*.05+C)*pow(clamp(sm/28.,0.,1.),1.6)*1.6;
  }
  col += pal(tr*2.+C+.5)*.0025/(tr+.01)*(.3+1.2*B);
  return col*.7;
}
vec3 s6(vec2 p){                       // Hyperspace star streaks
  p *= rot(T*.05);
  float a = atan(p.y,p.x)/TAU+.5, r = length(p);
  vec3 c = vec3(0);
  for(int l=0;l<3;l++){
    float fl = float(l), n = 90.+fl*60.;
    float u = a*n + fl*.37, id = floor(u);
    float h = hash(vec2(id, fl));
    float z = fract(h*7.1 + Z*(.25+.1*fl)*(.6+h));
    float rr = z*z*1.5, len = .015+.05*z+.3*B*z*z;
    float da = abs(fract(u)-.5)/n*TAU*r;
    float d = max(abs(r-rr)-len, 0.);
    float st = smoothstep(.0035*(1.+2.*z), 0., da)*smoothstep(.02, 0., d)*z;
    c += mix(vec3(1), pal(h+C+T*.02), .6)*st*(.8+2.*spec(h*.6));
  }
  c += pal(T*.1+C)*.02/(r+.04)*(.3+B);
  return c;
}
vec3 s7(vec2 p){                       // Moire interference
  vec2 o1 = .28*vec2(sin(T*.3), cos(T*.23))*(1.+.6*B);
  vec2 o2 = rot(T*.1)*-o1;
  float f = 42.+18.*M;
  float m = sin(length(p-o1)*f-T*2.)*sin(length(p-o2)*f+T*1.5);
  float k = sin(kale(p,K).y*f*.5+T);
  float ink = smoothstep(-.05,.1,m*(.75+.25*k));
  vec3 c = mix(vec3(.01), mix(vec3(.9), pal(length(p)*.6+T*.05+C), .55+.4*H), ink);
  return c*(.45+.8*spec(fract(length(p)*.6)));
}
vec3 s8(vec2 p){                       // Neon horizon
  vec3 c = vec3(0);
  float hz = -.06;
  if(p.y < hz){
    float d = hz-p.y;
    vec2 g = vec2(p.x/d, 1./d + Z*3.)*.5;
    vec2 f = abs(fract(g)-.5)/max(fwidth(g),1e-4);
    float line = 1.-min(min(f.x,f.y)*.45,1.);
    float e = spec(fract(abs(g.x)*.05));
    c += pal(g.y*.02+C+.6)*line*(.5+1.6*e)*smoothstep(.02,.3,d)*(1.+B);
    c += pal(C+.6)*.004/(d+.01);
  } else {
    vec2 q = p-vec2(0,.2);
    float r = length(q), R0 = .3+.025*B;
    float bars = q.y>.02 ? 1. : step(0., sin(q.y*70.+T*3.));
    c += mix(pal(C+.05), pal(C+.3), clamp(q.y/R0*.5+.5,0.,1.))*smoothstep(R0, R0-.005, r)*bars*1.1;
    c += pal(C+.1)*.012/(abs(r-R0-.01)+.015)*(.2+B);
    float x = abs(p.x);
    float m = hz + .3*spec(x*.35)*smoothstep(1.7,.25,x)*(.5+B);
    c += mix(vec3(1), pal(x*.2+C+.5), .6)*smoothstep(.006, 0., abs(p.y-m));
  }
  return c;
}
vec3 s9(vec2 p){                       // Pulsar ridgelines, front to back with hidden-line removal
  vec3 c = vec3(0);
  for(int i=0;i<42;i++){
    float fi = float(i);
    float y = -.44 + fi*.021;
    float x = abs(p.x);
    float env = smoothstep(.62, .06, x);
    float h = hist(.02+x*.55, fi*1.5)*env*env*.34 + .004*noise(vec2(p.x*40., fi*3.+T));
    float d = p.y-(y+h);
    float ink = smoothstep(.0032, .0012, abs(d));
    c += mix(vec3(.92), pal(fi*.015+C+T*.03), .35+.4*H)*ink*(.7+.6*B)*smoothstep(.75,.55,x);
    if(d < .003) break;
  }
  return c;
}
void main(){
  vec2 p = (gl_FragCoord.xy-.5*R)/R.y;
  vec3 col;
  if(S==0) col=s0(p); else if(S==1) col=s1(p); else if(S==2) col=s2(p); else if(S==3) col=s3(p); else if(S==4) col=s4(p);
  else if(S==5) col=s5(p); else if(S==6) col=s6(p); else if(S==7) col=s7(p); else if(S==8) col=s8(p); else col=s9(p);
  if(any(isnan(col)) || any(isinf(col))) col = vec3(0);
  // feedback: zoom, swirl, hue-drift the previous frame
  vec2 q = p*rot(.003+.015*M*sin(T*.3));
  float fz = S==2 || S==5 ? .3 : S>=7 ? .15 : 1.;       // liquid, op-art and line scenes keep their detail
  q *= 1.-fz*(.008+.03*B+.04*BEAT);
  q += .002*vec2(sin(p.y*7.+T*.7),cos(p.x*7.-T*.6));
  vec3 prev = texture(P, q*vec2(R.y/R.x,1.)+.5).rgb;
  prev = max(hue(prev,.02+.1*H)*min(TR+.08*M,.97)-.004, 0.);
  prev *= S==9 ? .45 : S==7 ? .6 : 1.;         // crisp lines for pulsar and moire
  o = vec4(col*.55+prev, 1.);
}`;

export const DISPLAY_FS = COMMON + `
void main(){
  vec2 uv = gl_FragCoord.xy/R;
  vec2 d = (uv-.5)*(.003+.014*BEAT+.006*B);
  vec3 c = vec3(texture(P,uv+d).r, texture(P,uv).g, texture(P,uv-d).b);
  c = 1.-exp(-c*1.1);
  float l = dot(c,vec3(.299,.587,.114));
  c = max(mix(vec3(l),c,1.45),0.);             // saturate
  c = c*c*(3.-2.*c);                            // contrast
  c *= mix(.35,1.,smoothstep(1.1,.3,length(uv-.5)));
  o = vec4(c,1.);
}`;
