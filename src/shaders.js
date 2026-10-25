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
  { name: 'Pulsar',           blurb: 'Ridgelines of the beat, back in time' },
  { name: 'Vitals',           blurb: 'A heart monitor for your music' },
  { name: 'Vinyl',            blurb: 'Grooves lit by the spectrum' },
];

export const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T,B,M,H,BEAT,K,Z,C,TR; uniform int S;
uniform sampler2D P, F, ECG; uniform float HEAD;
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
float ecgAt(float k){                  // linear read from the 256 x 64 heartbeat ring buffer
  k = mod(k, 16384.);
  float k0 = floor(k), k1 = mod(k0+1., 16384.);
  float a = texelFetch(ECG, ivec2(int(mod(k0,256.)), int(k0/256.)), 0).r;
  float b = texelFetch(ECG, ivec2(int(mod(k1,256.)), int(k1/256.)), 0).r;
  return mix(a, b, k-k0);
}
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
vec3 s9(vec2 p){                       // Pulsar: ridgelines of the heartbeat history, front to back
  vec3 c = vec3(0);
  float x = abs(p.x), xn = (p.x+.62)/1.24, dk = 1.6/R.x/1.24*256.;
  if(x > .66) return c;
  float env = .3+.7*smoothstep(.62,.08,x);
  for(int i=0;i<40;i++){
    float fi = float(i);
    float y = -.43 + fi*.022;
    float k = HEAD - fi*32. - (1.-xn)*256.;         // each line is 0.15 s further back
    float a = ecgAt(k-dk), b = ecgAt(k), e = ecgAt(k+dk);
    float g = .15*env + .004*noise(vec2(p.x*40., fi*3.));
    float lo = y+g*min(b,min(a,e)), hi = y+g*max(b,max(a,e));
    float d = max(max(lo-p.y, p.y-hi), 0.);
    float ink = smoothstep(.0032, .0012, d);
    c += mix(vec3(.92), pal(fi*.015+C+T*.03), .35+.4*H)*ink*(.7+.6*B)*smoothstep(.66,.56,x);
    if(p.y < hi+.003) break;
  }
  return c;
}
vec3 s10(vec2 p){                      // Vitals: green phosphor sweep over a monitor grid
  const vec3 G = vec3(.22,1.,.42);
  const float SW = 853.;                        // samples per 4 s sweep
  float px = 1./R.y;
  vec2 gp = p*10.;
  float dg = min(abs(fract(gp.x+.5)-.5), abs(fract(gp.y+.5)-.5))/10.;
  vec2 gq = p*50.;
  float dq = min(abs(fract(gq.x+.5)-.5), abs(fract(gq.y+.5)-.5))/50.;
  vec3 c = G*(.11*smoothstep(1.5*px,0.,dg) + .035*smoothstep(px,0.,dq));
  float headU = fract(HEAD/SW);
  float u = gl_FragCoord.x/R.x, du = 1.5/R.x;
  float age = fract(headU-u);                   // 0 at the head, 1 just ahead of it
  float k = HEAD - age*SW, dk = du*SW;
  float y0 = ecgAt(k-dk), y1 = ecgAt(k), y2 = age < du ? y1 : ecgAt(k+dk);   // never join across the head
  float base = -.06, gain = .3+.06*B;
  float lo = base+gain*min(y1,min(y0,y2)), hi = base+gain*max(y1,max(y0,y2));
  float d = max(max(lo-p.y, p.y-hi), 0.);
  float live = exp(-age*1.1)*smoothstep(1.,.965,age);
  c += G*(smoothstep(2.4*px,.6*px,d)*1.5 + .0035/(d+.004)*.35)*live;
  vec2 hp = vec2((headU-.5)*R.x/R.y, base+gain*ecgAt(HEAD));
  c += G*.006/(length(p-hp)+.006)*(.8+B);
  return c;
}
vec3 s11(vec2 p){                      // Vinyl: a spinning record, grooves lit by the spectrum
  const float R0 = .46, L = .15;
  float r = length(p), a = atan(p.y,p.x);
  float spin = T*3.49 + BEAT*.35;               // 33 1/3 rpm, nudged on every kick
  vec3 c = vec3(0);
  if(r < R0){
    float aa = a - spin;
    float t = clamp((r-L)/(R0-L), 0., 1.);
    float band = spec(t*.45+.01);
    float groove = .5+.5*sin(r*900.);
    float wear = noise(vec2(cos(aa),sin(aa))*5.+r*90.);
    float gap = smoothstep(.0, .006, abs(fract(t*5.+.5)-.5)*(R0-L)/5.);   // gaps between tracks
    c = mix(vec3(.05), pal(t*1.5+C+T*.03), .35+.6*band)*(.45+.55*groove)*(.6+3.2*band)*(.7+.6*wear)*mix(.25,1.,gap);
    float sheen = pow(abs(cos(a-.7)), 28.) + .5*pow(abs(cos(a+1.1)), 60.);
    c += vec3(.9)*sheen*(.22+.45*groove)*step(L+.01, r);
    if(r < L){
      vec2 q = rot(-spin)*p;
      c = pal(C+.1)*.8*(.85+.3*B);
      c *= 1.-.6*smoothstep(.0025,0.,abs(r-.125))-.6*smoothstep(.002,0.,abs(r-.04));
      c = mix(c, vec3(.95), smoothstep(.0028,0.,abs(q.y-.075))*step(abs(q.x),.045));
      c *= smoothstep(.011,.015,r)*smoothstep(L,L-.004,r);
    }
    c *= smoothstep(R0, R0-.004, r);
  }
  c += vec3(.6)*.0015/(abs(r-R0)+.002)*(.3+B);
  return c;
}
void main(){
  vec2 p = (gl_FragCoord.xy-.5*R)/R.y;
  vec3 col;
  if(S==0) col=s0(p); else if(S==1) col=s1(p); else if(S==2) col=s2(p); else if(S==3) col=s3(p); else if(S==4) col=s4(p);
  else if(S==5) col=s5(p); else if(S==6) col=s6(p); else if(S==7) col=s7(p); else if(S==8) col=s8(p); else if(S==9) col=s9(p); else if(S==10) col=s10(p); else col=s11(p);
  if(any(isnan(col)) || any(isinf(col))) col = vec3(0);
  // feedback: zoom, swirl, hue-drift the previous frame
  vec2 q = p*rot(.003+.015*M*sin(T*.3));
  float fz = S>=10 ? 0. : S==2 || S==5 ? .3 : S>=7 ? .15 : 1.;       // liquid, op-art and line scenes keep their detail
  q *= 1.-fz*(.008+.03*B+.04*BEAT);
  q += .002*vec2(sin(p.y*7.+T*.7),cos(p.x*7.-T*.6));
  vec3 prev = texture(P, q*vec2(R.y/R.x,1.)+.5).rgb;
  prev = max(hue(prev,.02+.1*H)*min(TR+.08*M,.97)-.004, 0.);
  prev *= S>=10 ? .35 : S==9 ? .45 : S==7 ? .6 : 1.;   // crisp lines for vitals, pulsar and moire
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
