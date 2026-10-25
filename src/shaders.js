// GLSL ES 3.00 shaders. Every scene renders into a feedback buffer that
// zooms, swirls and hue-drifts the previous frame, then a display pass adds
// chromatic aberration, tone mapping and a vignette.

export const SCENES = [
  { name: 'Fractal Bloom',    blurb: 'Kaleidoscopic IFS fractal' },
  { name: 'Wormhole',         blurb: 'Bass-driven tunnel flight' },
  { name: 'Liquid Dream',     blurb: 'Domain-warped oil flow' },
  { name: 'Spectral Mandala', blurb: 'Every ring is a frequency band' },
  { name: 'Gyroid Flight',    blurb: 'Raymarched 3D lattice' },
];

export const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 R; uniform float T,B,M,H,BEAT,K,Z,C,TR; uniform int S;
uniform sampler2D P, F;
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
void main(){
  vec2 p = (gl_FragCoord.xy-.5*R)/R.y;
  vec3 col;
  if(S==0) col=s0(p); else if(S==1) col=s1(p); else if(S==2) col=s2(p); else if(S==3) col=s3(p); else col=s4(p);
  // feedback: zoom, swirl, hue-drift the previous frame
  vec2 q = p*rot(.003+.015*M*sin(T*.3));
  float fz = S==2 ? .3 : 1.;                    // the liquid scene keeps its own detail
  q *= 1.-fz*(.008+.03*B+.04*BEAT);
  q += .002*vec2(sin(p.y*7.+T*.7),cos(p.x*7.-T*.6));
  vec3 prev = texture(P, q*vec2(R.y/R.x,1.)+.5).rgb;
  prev = max(hue(prev,.02+.1*H)*min(TR+.08*M,.97)-.004, 0.);
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
