// The scenes. Each is a GLSL function `vec3 scene(vec2 p)` plus feedback
// settings: zoom (how hard the previous frame is pulled inward), swirl, melt
// (curl-noise smearing, scaled by the Goo setting), keep (trail length) and
// drip (downward ooze). Uniforms are listed at the top of shaders.js.
//
// Flags: ecg (reads the heartbeat ring), monitor (shows the BPM overlay),
// points (adds the particle pass), art (shows the album cover). Every art
// scene scales its cover by ARTC, the confidence that the cover is the song
// playing: 1 while it is known, 0.4 while a change is suspected, 0 otherwise.
// So all of them appear, grey out and clear together.

export const SCENES = [
  // ------------------------------------------------------------ 01
  { name: 'Fractal Bloom', blurb: 'Kaleidoscopic IFS fractal', glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.05 + .1*sin(BAR*TAU))*(1.6-.4*B-.2*KICK);
  p = kale(p,K);
  vec3 c = vec3(0); float sc = 1.;
  for(int i=0;i<7;i++){
    float fi = float(i), e = spec(fi/7.*.5);
    p = abs(p) - vec2(.6+.12*sin(T*.13), .35+.1*cos(T*.1)+.04*pulse(5.));
    p = rot(.4+T*.03+fi*.2+.25*M)*p;
    p *= 1.4; sc *= 1.4;
    float ring = abs(length(p)-.4-.3*e)/sc, line = abs(p.y)/sc;
    c += pal(fi*.12+T*.04+C)*(.006/(ring+.004)+.002/(line+.004))*(.4+1.5*e);
    c += vec3(1)*.0015/(line+.004)*SNARE;
  }
  return c*.38;
}` },
  // ------------------------------------------------------------ 02
  { name: 'Wormhole', blurb: 'Bass-driven tunnel flight', glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.1+.4*sin(T*.21)+.15*sin(BAR*TAU));
  float r = max(length(p),.001), a = atan(p.y,p.x);
  float v = .35/r + Z, u = a/TAU*K;
  float w = fbm(vec2(cos(a),sin(a))*1.5 + vec2(v*.3,T*.05));
  float g = abs(sin(u*PI+w*3.))*abs(sin(v*1.5708+w*2.));
  float ring = spec(fract(v*.04));
  vec3 c = pal(v*.04+u*.05+w+C)*pow(g,.6)*(.3+1.6*ring);
  c += pal(v*.07+.5+C)*pow(1.-g,10.)*(.4+2.*B+1.5*KICK);
  c += pal(C+.2)*exp(-fract(v*.08-BT*.25)*9.)*.5*(.3+BP);
  c += vec3(1)*HAT*step(.96,hash(floor(vec2(u*3.,v*1.5))))*.6;
  return c*smoothstep(0.,.35,r)*.8;
}` },
  // ------------------------------------------------------------ 03
  { name: 'Liquid Dream', blurb: 'Domain-warped oil flow', fb: { zoom: .3, melt: 1.6, drip: .5 }, glsl: `
vec3 scene(vec2 p){
  float rr = length(p);
  p += .05*KICK*sin(rr*28.-T*9.)*p/(rr+.1);
  p *= 1.4+.3*sin(T*.1);
  float t = T*(.15+.15*EN);
  vec2 q = vec2(fbm(p+t), fbm(p+vec2(5.2,1.3)-t));
  vec2 r = vec2(fbm(p+3.*q+vec2(1.7,9.2)+.8*B+t*.5), fbm(p+3.*q+vec2(8.3,2.8)-t*.4));
  float f = fbm(p+3.*r+M);
  vec3 c = pal(f*2.2+length(q)*.8+C+T*.02)*pow(f,3.)*2.2;
  c += pal(f+.5+C)*pow(length(r),6.)*(.08+H*.5);
  c += pal(f*4.+C+.3)*pow(f,6.)*1.5*(.5+SNARE);
  c *= .4+.6*smoothstep(.35,.75,f);
  return c*.35;
}` },
  // ------------------------------------------------------------ 04
  { name: 'Spectral Mandala', blurb: 'Every ring is a frequency band', glsl: `
vec3 scene(vec2 p){
  p *= rot(-T*.08);
  float r = length(p), a = atan(p.y,p.x);
  vec3 c = vec3(0);
  for(int i=0;i<14;i++){
    float fi = float(i)/14., e = spec(fi*.6+.01), dir = mod(float(i),2.)*2.-1.;
    float rr = .05+fi*.62 + e*.07*sin(a*K+dir*(T*2.+BT*.5)+fi*6.) + .025*e*sin(a*K*2.-T*3.);
    c += pal(fi+T*.05+C)*(.0015+.006*e)/abs(r-rr);
  }
  float pet = pow(abs(cos(a*K*.5+T)),18.)*exp(-r*2.5)*(.3+B);
  c += pal(T*.1+C+.3)*pet;
  c += vec3(1)*pow(abs(cos(a*K*.5+T+PI/K)),30.)*exp(-r*1.5)*SNARE*.8;
  c += pal(C)*.01/(r+.02)*KICK;
  return c*.5;
}` },
  // ------------------------------------------------------------ 05
  { name: 'Gyroid Flight', blurb: 'Raymarched 3D lattice', glsl: `
float gyr(vec3 q){
  q.xy = rot(q.z*.08)*q.xy;
  float g = abs(dot(sin(q*3.),cos(q.zxy*3.)))/3. - .02 - .05*B - .03*KICK;
  return max(g, .55-length(q.xy));
}
vec3 scene(vec2 p){
  vec3 ro = vec3(.15*sin(T*.2),.15*cos(T*.17),Z*2.);
  vec3 rd = normalize(vec3(rot(T*.07+.25*sin(BAR*TAU))*p,1.));
  float t = .1, g = 1.; vec3 glow = vec3(0);
  for(int i=0;i<90;i++){
    vec3 q = ro+rd*t; g = gyr(q);
    glow += pal(q.z*.08+C+T*.02)*exp(-abs(g)*40.)*.01;
    if(abs(g)<.001 || t>14.) break;
    t += abs(g)*.6;
  }
  vec3 q = ro+rd*t;
  vec3 c = glow*(.5+2.*spec(fract(q.z*.02)))*(1.+SNARE);
  if(t<14.){
    vec2 e = vec2(.004,0);
    vec3 n = normalize(vec3(gyr(q+e.xyy)-gyr(q-e.xyy), gyr(q+e.yxy)-gyr(q-e.yxy), gyr(q+e.yyx)-gyr(q-e.yyx)));
    float fr = pow(1.-abs(dot(n,rd)),3.);
    vec3 base = pal(q.z*.1+dot(n,vec3(.3,.5,.2))*.4+C+T*.03);
    c += base*(.15+fr*2.)*exp(-t*.3)*(.6+1.2*spec(fract(q.z*.02)));
  }
  return mix(c, c.bgr, DROP*.7);
}` },
  // ------------------------------------------------------------ 06
  { name: 'Julia Bloom', blurb: 'Morphing Julia set fractal', fb: { zoom: .3 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.03)*(2.5-.35*B-.3*KICK);
  float a = T*.06+.6*M+1.+.08*sin(BAR*TAU);
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
    col += vec3(1)*smoothstep(.5,0.,abs(fract(sm*.25-BT*.5)-.5))*.15*SNARE;
  }
  col += pal(tr*2.+C+.5)*.0025/(tr+.01)*(.3+1.2*B);
  return col*.7;
}` },
  // ------------------------------------------------------------ 07
  { name: 'Hyperspace', blurb: 'Star streaks at warp speed', fb: { melt: .3 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.05);
  float a = atan(p.y,p.x)/TAU+.5, r = length(p);
  vec3 c = vec3(0);
  for(int l=0;l<3;l++){
    float fl = float(l), n = 90.+fl*60.;
    float u = a*n + fl*.37, id = floor(u);
    float h = hash(vec2(id, fl));
    float z = fract(h*7.1 + Z*(.25+.1*fl)*(.6+h) + DROP*.3);
    float rr = z*z*1.5, len = .015+.05*z+.3*B*z*z+.5*KICK*z*z;
    float da = abs(fract(u)-.5)/n*TAU*r;
    float d = max(abs(r-rr)-len, 0.);
    float st = smoothstep(.0035*(1.+2.*z), 0., da)*smoothstep(.02, 0., d)*z;
    c += mix(vec3(1), pal(h+C+T*.02), .6)*st*(.8+2.*spec(h*.6));
  }
  c += pal(T*.1+C)*.02/(r+.04)*(.3+B+BP*.5);
  c += pal(C+.5)*smoothstep(.03,0.,abs(r-.2-.6*fract(BT*.5)))*.4*BP;
  return c;
}` },
  // ------------------------------------------------------------ 08
  { name: 'Moiré', blurb: 'Op-art interference rings', fb: { zoom: .15, keep: .6, melt: .2 }, glsl: `
vec3 scene(vec2 p){
  vec2 o1 = .28*vec2(sin(T*.3), cos(T*.23))*(1.+.6*B);
  vec2 o2 = rot(T*.1)*-o1;
  float f = 42.+18.*M+8.*sin(BAR*TAU);
  float m = sin(length(p-o1)*f-T*2.)*sin(length(p-o2)*f+T*1.5);
  float k = sin(kale(p,K).y*f*.5+T);
  float ink = smoothstep(-.05,.1,m*(.75+.25*k));
  ink = mix(ink, 1.-ink, SNARE*.7);
  vec3 c = mix(vec3(.01), mix(vec3(.9), pal(length(p)*.6+T*.05+C), .55+.4*H), ink);
  return c*(.45+.8*spec(fract(length(p)*.6)))*(1.+.4*KICK);
}` },
  // ------------------------------------------------------------ 09
  { name: 'Neon Horizon', blurb: 'Synthwave grid, spectrogram mountains', fb: { zoom: .15, melt: .3 }, glsl: `
vec3 scene(vec2 p){
  vec3 c = vec3(0);
  float hz = -.06;
  if(p.y < hz){
    float d = hz-p.y;
    vec2 g = vec2(p.x/d, 1./d + BT)*.5;
    vec2 f = abs(fract(g)-.5)/max(fwidth(g),1e-4);
    float line = 1.-min(min(f.x,f.y)*.45,1.);
    float e = spec(fract(abs(g.x)*.05));
    c += pal(g.y*.02+C+.6)*line*(.5+1.6*e)*smoothstep(.02,.3,d)*(1.+B+.6*KICK);
    c += pal(C+.6)*.004/(d+.01);
  } else {
    vec2 q = p-vec2(0,.2);
    float r = length(q), R0 = .3+.025*B+.03*KICK;
    float bars = q.y>.02 ? 1. : step(0., sin(q.y*70.+T*3.));
    c += mix(pal(C+.05), pal(C+.3), clamp(q.y/R0*.5+.5,0.,1.))*smoothstep(R0, R0-.005, r)*bars*1.1;
    c += pal(C+.1)*.012/(abs(r-R0-.01)+.015)*(.2+B);
    vec2 sp = p*50.; vec2 ip = floor(sp); float hs = hash(ip);
    c += vec3(1)*smoothstep(.08,0.,length(fract(sp)-.5)-.01)*step(.94,hs)*(.3+.7*HAT*hash(ip+3.))*step(R0+.05,r);
    for(int i=2;i>=0;i--){
      float fi = float(i), age = fi*.3+.03, x = abs(p.x)*(.5+.25*fi);
      float m = hz + (.05+.12*fi) + .25*sg(x*.35, age)*smoothstep(1.7,.25,x)*(.5+B);
      float mask = smoothstep(.004,0., p.y-m);
      c = mix(c, pal(fi*.15+C+.5)*(.08+.1*fi)*(1.+KICK*.5), mask);
      c += mix(vec3(1), pal(x*.2+C+.5), .6)*smoothstep(.006,0.,abs(p.y-m))*(1.-fi*.3);
    }
  }
  return c;
}` },
  // ------------------------------------------------------------ 10
  { name: 'Pulsar', blurb: 'Ridgelines of the beat, back in time', ecg: true, fb: { zoom: .15, keep: .45, melt: 0 }, glsl: `
vec3 scene(vec2 p){
  vec3 c = vec3(0);
  float x = abs(p.x), xn = (p.x+.62)/1.24, dk = 1.6/R.x/1.24*256.;
  if(x > .66) return c;
  float env = .3+.7*smoothstep(.62,.08,x);
  for(int i=0;i<40;i++){
    float fi = float(i);
    float y = -.43 + fi*.022;
    float k = HEAD - fi*32. - (1.-xn)*256.;
    float a = ecgAt(k-dk), b = ecgAt(k), e = ecgAt(k+dk);
    float g = .15*env + .004*noise(vec2(p.x*40., fi*3.));
    float lo = y+g*min(b,min(a,e)), hi = y+g*max(b,max(a,e));
    float d = max(max(lo-p.y, p.y-hi), 0.);
    float ink = smoothstep(.0032, .0012, d);
    c += mix(vec3(.92), pal(fi*.015+C+T*.03), .35+.4*H)*ink*(.7+.6*B+.4*KICK)*smoothstep(.66,.56,x);
    if(p.y < hi+.003) break;
  }
  return c;
}` },
  // ------------------------------------------------------------ 11
  { name: 'Vitals', blurb: 'A heart monitor for your music', ecg: true, monitor: true, fb: { zoom: 0, keep: .35, melt: 0 }, glsl: `
vec3 scene(vec2 p){
  const vec3 G = vec3(.22,1.,.42), CY = vec3(.3,.85,1.);
  const float SW = 853.;
  float px = 1./R.y;
  vec2 gp = p*10.;
  float dg = min(abs(fract(gp.x+.5)-.5), abs(fract(gp.y+.5)-.5))/10.;
  vec2 gq = p*50.;
  float dq = min(abs(fract(gq.x+.5)-.5), abs(fract(gq.y+.5)-.5))/50.;
  vec3 c = G*(.11*smoothstep(1.5*px,0.,dg) + .035*smoothstep(px,0.,dq));
  float headU = fract(HEAD/SW);
  float u = gl_FragCoord.x/R.x, du = 1.5/R.x;
  float age = fract(headU-u);
  float k = HEAD - age*SW, dk = du*SW;
  float y0 = ecgAt(k-dk), y1 = ecgAt(k), y2 = age < du ? y1 : ecgAt(k+dk);
  float base = .02, gain = .3+.06*B;
  float lo = base+gain*min(y1,min(y0,y2)), hi = base+gain*max(y1,max(y0,y2));
  float d = max(max(lo-p.y, p.y-hi), 0.);
  float live = exp(-age*1.1)*smoothstep(1.,.965,age);
  c += G*(smoothstep(2.4*px,.6*px,d)*1.5 + .0035/(d+.004)*.35)*live;
  vec2 hp = vec2((headU-.5)*R.x/R.y, base+gain*ecgAt(HEAD));
  c += G*.006/(length(p-hp)+.006)*(.8+B);
  // pleth: the bass history as a second trace on the same sweep
  float a2 = age*.47, b2 = -.36, g2 = .16;
  float v0 = sg(.012, a2 - du*.47), v1 = sg(.012, a2), v2 = sg(.012, a2 + du*.47);
  float lo2 = b2+g2*min(v1,min(v0,v2)), hi2 = b2+g2*max(v1,max(v0,v2));
  float d2 = max(max(lo2-p.y, p.y-hi2), 0.);
  c += CY*(smoothstep(2.*px,.6*px,d2)*1.1 + .003/(d2+.004)*.3)*live;
  return c;
}` },
  // ------------------------------------------------------------ 12
  { name: 'Vinyl', blurb: 'Grooves lit by the spectrum, the cover on the label', art: true, fb: { zoom: 0, keep: .35, melt: 0 }, glsl: `
vec3 scene(vec2 p){
  const float R0 = .46, L = .15;
  float r = length(p), a = atan(p.y,p.x);
  float spin = T*3.49 + BEAT*.35;
  vec3 c = vec3(0);
  if(r < R0){
    float aa = a - spin;
    float t = clamp((r-L)/(R0-L), 0., 1.);
    float band = spec(t*.45+.01);
    float groove = .5+.5*sin(r*900.);
    float wear = noise(vec2(cos(aa),sin(aa))*5.+r*90.);
    float gap = smoothstep(.0, .006, abs(fract(t*5.+.5)-.5)*(R0-L)/5.);
    c = mix(vec3(.05), pal(t*1.5+C+T*.03), .35+.6*band)*(.45+.55*groove)*(.6+3.2*band)*(.7+.6*wear)*mix(.25,1.,gap);
    float sheen = pow(abs(cos(a-.7)), 28.) + .5*pow(abs(cos(a+1.1)), 60.);
    c += vec3(.9)*sheen*(.22+.45*groove)*step(L+.01, r);
    if(r < L){
      vec2 q = rot(-spin)*p;
      vec3 lab = pal(C+.1)*.8*(.85+.3*B);
      lab *= 1.-.6*smoothstep(.0025,0.,abs(r-.125))-.6*smoothstep(.002,0.,abs(r-.04));
      lab = mix(lab, vec3(.95), smoothstep(.0028,0.,abs(q.y-.075))*step(abs(q.x),.045));
      float sure = HASART*ARTC;                   // the cover is on the label only while the song is known
      vec3 art = texture(ART, q/(2.*L)+.5).rgb*(.85+.3*B);
      art = mix(vec3(dot(art,vec3(.3,.59,.11))), art, smoothstep(.3,1.,sure));   // greys out while in doubt
      c = mix(lab, art, smoothstep(0.,.3,sure));
      c *= smoothstep(.011,.015,r)*smoothstep(L,L-.004,r);
    }
    c *= smoothstep(R0, R0-.004, r);
  }
  c += vec3(.6)*.0015/(abs(r-R0)+.002)*(.3+B);
  // tonearm: on the groove while the song is known, lifted to its rest when unsure
  // (only where there is room beside the record)
  if(R.x > R.y*1.15){
    vec2 pv = vec2(min(.6, .5*R.x/R.y-.08), .42);
    float play = -1.9 - .35*fract(T*.012) + .004*KICK, rest = -1.55;
    float th = mix(rest, play, smoothstep(0.,1.,ARTC));
    vec2 hd = pv + .52*vec2(cos(th),sin(th));
    float arm = seg(p, pv, hd);
    c = mix(c, vec3(.82), smoothstep(.011,.006,arm));
    c = mix(c, vec3(.95), smoothstep(.028,.02,length(p-hd)));
    c = mix(c, vec3(.3), smoothstep(.045,.04,length(p-pv)));
    c += vec3(.4)*.0015/(abs(length(p-pv)-.045)+.003);
  }
  return c;
}` },
  // ------------------------------------------------------------ 13
  { name: 'Aurora', blurb: 'Curtains of light over a dark lake', fb: { zoom: .2, melt: .6, drip: -.3 }, glsl: `
vec3 scene(vec2 p){
  vec3 c = vec3(0);
  vec2 sp = p*70.; vec2 ip = floor(sp); float hs = hash(ip);
  c += vec3(.8,.9,1.)*smoothstep(.07,0.,length(fract(sp)-.5)-.01)*step(.95,hs)*(.25+.75*HAT*hash(ip+1.))*smoothstep(-.25,-.1,p.y);
  float y = p.y;
  for(int i=0;i<18;i++){
    float fi = float(i)/18.;
    float base = -.15 + fi*.75;
    float x = p.x + .5*sin(p.x*1.5 + T*.25 + fi*4.) + fi;
    float curtain = fbm(vec2(x*1.3 + T*.12, fi*3. + T*.06));
    float streak = pow(noise(vec2(x*18., T*.4 + fi*7.)), 2.5);
    float e = spec(fi*.35+.02);
    float cy = base + .3*curtain*(1.+.6*M);
    float d = abs(y - cy);
    float glow = exp(-d*(14.-6.*streak))*(.25+e*1.6)*(.5+streak);
    vec3 col = mix(vec3(.15,1.,.45), pal(fi*.6+C+.4), smoothstep(.1,.6,fi));
    c += col*glow*.12*smoothstep(-.3,.1,y)*(1.+.5*KICK*streak);
  }
  // the lake: a dim, rippled reflection
  float lake = smoothstep(-.18,-.3,y);
  vec2 rp = vec2(p.x + .01*sin(p.y*60.+T*2.)*(1.+B), -.5-y);
  float ref = fbm(rp*3. + T*.1)*.5;
  c = mix(c, pal(C+.5)*ref*.25*(.4+B) + vec3(.02,.05,.08), lake);
  c += pal(C+.3)*.004/(abs(y+.19)+.006)*(.4+SNARE);
  return c;
}` },
  // ------------------------------------------------------------ 14
  { name: 'Goop', blurb: 'Gooey blobs that drip and merge', fb: { zoom: .1, melt: 2, drip: 1.2, keep: .9 }, glsl: `
vec3 scene(vec2 p){
  float d = 0., w = 0.;
  for(int i=0;i<8;i++){
    float fi = float(i), h = hash1(fi*3.1+.7), h2 = hash1(fi*5.3+.2);
    float e = spec(fi/8.*.5+.02);
    float fall = fract(T*.045*(.6+h2) + h);
    vec2 c = vec2(sin(T*.25*(.5+h)+fi*2.1)*.65, .55 - fall*1.3 + .1*cos(T*.3+fi));
    float r = .1 + .17*e + .05*KICK + .03*sin(T*2.+fi);
    float g = r*r/dot(p-c,p-c);
    d += g; w += g*fi;
  }
  // a drip trail under each blob
  float band = fract(w/max(d,1e-3)*.12 + C);
  float iso = smoothstep(.85,1.15,d);
  vec3 c = pal(band + d*.05 + T*.02)*(.6+.4*sin(d*7.-T*2.5))*iso;
  float rim = smoothstep(.9,1.4,d)*(1.-smoothstep(1.4,2.6,d));
  c += vec3(1)*rim*.45*(.6+.8*SNARE);
  c += pal(C+.5)*smoothstep(.45,.85,d)*(1.-iso)*.55*(.5+B);
  c += pal(C+.15)*pow(smoothstep(2.,5.,d),2.)*.6;
  vec2 gl = p - vec2(-.02,.03);
  c += vec3(1)*iso*smoothstep(1.,1.6,d)*pow(max(0.,1.-length(gl)*1.6),3.)*.25;
  return c*.9;
}` },
  // ------------------------------------------------------------ 15
  { name: 'Oracle', blurb: 'An all-seeing eye, the cover in its iris', art: true, fb: { zoom: .3, melt: .8 }, glsl: `
vec3 eye(vec2 p, float s){
  p /= s;
  float open = 1. - .95*DROP;
  float lidW = .95, lidH = .5*open;
  float alm = lidH*max(0., 1.-p.x*p.x/(lidW*lidW));
  float inside = smoothstep(.01,0., abs(p.y)-alm);
  float r = length(p), a = atan(p.y,p.x);
  float pup = .13 + .08*EN + .06*KICK, iris = .42;
  float t = clamp((r-pup)/(iris-pup),0.,1.);
  vec3 ic = pal(t*.6 + C + .1*sin(a*7.+T))*(.3 + 1.5*spec(t*.5+.02))*(.6+.4*noise(vec2(a*6.,r*30.)+T*.2));
  ic += vec3(1)*pow(abs(sin(a*K*2.+r*40.-T*3.)),20.)*.25*(.5+H);
  if(HASART > .5) ic = mix(ic, texture(ART, vec2(cos(a),sin(a))*t*.5+.5).rgb*1.2, .5*ARTC);
  vec3 col = vec3(.95,.93,.9)*(1.-.15*r);
  col = mix(col, ic, smoothstep(iris+.01, iris-.01, r));
  col = mix(col, vec3(0), smoothstep(pup+.01, pup-.01, r));
  col += vec3(1)*smoothstep(.06,0.,length(p-vec2(-.1,.12)))*.9;
  col *= inside;
  col += pal(C+.5)*smoothstep(.02,0.,abs(abs(p.y)-alm))*.8*step(abs(p.x), lidW);
  return col;
}
vec3 scene(vec2 p){
  vec3 c = pal(length(p)+C+T*.03)*fbm(p*3.+T*.1)*.08*(1.+B);
  c += eye(p*rot(.1*sin(T*.3)), .55+.05*B);
  vec2 q = kale(p, K) - vec2(.78+.05*sin(T*.4), 0.);
  c += eye(q*rot(T*.2), .22)*.8*step(.52,length(p));
  return c;
}` },
  // ------------------------------------------------------------ 16
  { name: 'Sigil', blurb: 'Rune rings turning at the tempo', fb: { zoom: .5, melt: .4 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.04 + .25*sin(BAR*TAU)) * (1.05 - .08*KICK);
  float r = length(p), a = atan(p.y,p.x);
  vec3 c = vec3(0);
  for(int i=0;i<5;i++){ float fi=float(i); float rr=.12+fi*.13+.015*spec(fi*.15+.02); c += pal(fi*.2+C)*.0012/abs(r-rr)*(.5+B); }
  float n = floor(K*.5)+2.;
  float an = mod(a+PI/n, TAU/n)-PI/n;
  float poly = r*cos(an);
  c += pal(C+.5)*.0014/abs(poly-.4)*(.6+KICK);
  c += pal(C+.7)*.0014/abs(poly-.26)*(.6+SNARE);
  for(int j=0;j<3;j++){
    float fj = float(j), ra = .18 + fj*.17, w = 24. + fj*12.;
    float aa = a + T*(.1-.08*fj)*(mod(fj,2.)*2.-1.);
    vec2 cell = vec2(aa/TAU*w, (r-ra)*22.);
    vec2 id = floor(cell), fc = fract(cell)-.5;
    float h = hash(id+fj*7.);
    float e = spec(fract(h*.9)*.5);
    float tick = step(.45,h)*smoothstep(.12,.05,abs(fc.x))*step(abs(fc.y),.42*(.3+e));
    float dt_ = step(.9,h)*smoothstep(.2,.1,length(fc));
    c += pal(h+C+fj*.2)*(tick+dt_)*(.4+1.2*e)*step(abs(cell.y),.5)*(.6+.6*SNARE*step(.7,h));
  }
  c += pal(C+.3)*.004/(abs(r*cos(mod(a+PI/3.,TAU/3.)-PI/3.)-.08)+.006)*(.5+B+BP);
  return c*(.7+.5*EN);
}` },
  // ------------------------------------------------------------ 17
  { name: 'Oil Slick', blurb: 'Thin-film rainbows on black oil', fb: { zoom: .1, melt: 1.8, keep: .9 }, glsl: `
vec3 scene(vec2 p){
  float t = T*.1;
  vec2 q = p*2.;
  float h = fbm(q + t) + .5*fbm(q*2.3 - t*1.3 + 2.*B);
  float rr = length(p);
  h += .25*KICK*sin(rr*25. - T*10.)*exp(-rr*2.);
  h += .1*SNARE*sin(p.x*40.+T*5.);
  float th = h*6. + M*2. + C*2.;
  vec3 film = .5+.5*cos(th*vec3(1.,1.15,1.3)*3. + vec3(0,2.,4.));
  film = mix(film, pal(h*1.5+C), .35);
  const float e = .012;
  vec2 g = vec2(fbm(q+vec2(e,0)+t)-fbm(q-vec2(e,0)+t), fbm(q+vec2(0,e)+t)-fbm(q-vec2(0,e)+t))/e;
  float sp = pow(max(0., 1.-length(g*.12 - vec2(.25,.35))), 6.);
  vec3 c = film*(.25+.75*smoothstep(.25,.85,h)) + sp*.9*(.5+.5*H);
  c *= .55 + .45*smoothstep(.1,.5,h);
  return c*.6;
}` },
  // ------------------------------------------------------------ 18
  { name: 'Chladni', blurb: 'Sand on a singing plate, modes from the pitch', fb: { zoom: .1, melt: .5, keep: .7 }, glsl: `
vec3 scene(vec2 p){
  vec2 q = p*rot(T*.03)*1.25;
  float mm = 2. + 6.*PIT, nn = 1.5 + 3.5*M + 1.5*sin(T*.1+BAR*TAU*.5);
  float ch = cos(mm*PI*q.x)*cos(nn*PI*q.y) - cos(nn*PI*q.x)*cos(mm*PI*q.y);
  float sand = smoothstep(.1,.0,abs(ch))*(.6+.6*EN);
  float grain = noise(p*180.+T*(1.+10.*KICK));
  vec3 c = pal(ch*.4+C+T*.02)*sand*(.5+.8*grain);
  c += pal(C+.5)*.02/(abs(ch)+.08)*B*(1.-sand);
  c += vec3(1)*sand*smoothstep(.6,.9,grain)*KICK;
  float edge = max(abs(q.x),abs(q.y));
  c *= smoothstep(1.,.85,edge);
  c += pal(C+.2)*.003/(abs(edge-.95)+.004)*(.3+SNARE);
  return c*.9;
}` },
  // ------------------------------------------------------------ 19
  { name: 'Canyon', blurb: 'Flying over a terrain made of your spectrogram', fb: { zoom: .2, melt: .2, keep: .6 }, glsl: `
float hmap(vec2 xz){ float x = abs(xz.x)*.3; return 2.2*sg(x, fract(xz.y*.025))*smoothstep(0.,.4,abs(xz.x)) + .2*noise(xz*.8); }
vec3 scene(vec2 p){
  vec3 ro = vec3(.4*sin(T*.15), 1.1 + .1*sin(T*.3), 0.);
  vec3 rd = normalize(vec3(p.x, p.y-.3, 1.3));
  rd.xy = rot(.08*sin(BAR*TAU))*rd.xy;
  float t = .2, h = 0.; vec3 pos = ro; bool hit = false;
  for(int i=0;i<72;i++){
    pos = ro + rd*t; h = hmap(pos.xz);
    if(pos.y < h){ hit = true; break; }
    t += max(.03, (pos.y-h)*.45);
    if(t > 24.) break;
  }
  vec3 c = vec3(0);
  if(hit){
    float x = abs(pos.x)*.3, e = sg(x, fract(pos.z*.025));
    vec3 base = pal(x*1.2 + C + e*.4 + pos.z*.02);
    vec2 g = abs(fract(pos.xz*vec2(3.,1.5))-.5);
    float wire = smoothstep(.08,.0,min(g.x,g.y));
    c = base*(.08 + 1.2*e)*exp(-t*.12) + base*wire*(.5+KICK)*exp(-t*.08);
    c += vec3(1)*wire*SNARE*.3*exp(-t*.1);
  }
  c += pal(C+.6)*.025/(abs(rd.y+.05)+.04)*(.4+B)*(hit?.3:1.);
  c += pal(C+.1)*smoothstep(.12,.0,length(rd.xy-vec2(0.,.12)))*(.3+.4*BP)*(hit?0.:1.);
  return c;
}` },
  // ------------------------------------------------------------ 20
  { name: 'Sonar', blurb: 'A radar sweep over the spectrogram', fb: { zoom: 0, keep: .5, melt: .2 }, glsl: `
vec3 scene(vec2 p){
  float r = length(p), a = atan(p.y,p.x)/TAU+.5;
  float sweep = SGH/256.;
  float age = fract(sweep - a);
  float e = sg(r*1.15+.005, age);
  vec3 c = pal(r*1.2 + C + age*.15)*e*e*2.4*(1.-age*.6);
  c += vec3(1)*smoothstep(.85,1.,e)*.4*(1.-age);
  c += pal(C+.3)*smoothstep(.012,0.,abs(fract(a - sweep + .5)-.5))*(.5+B+BP)*smoothstep(.9,.1,r);
  c += pal(C+.3)*exp(-age*18.)*.35*e;
  float rings = .0015/(abs(fract(r*5.)-.5)/5.+.004);
  c += vec3(.35,.9,.6)*rings*.12;
  c += pal(C)*.003/(abs(r-.45-.04*KICK)+.004)*.5;
  c += vec3(.35,.9,.6)*.002/(abs(fract(a*8.)-.5)/8.+.004)*.03*step(.1,r);
  return c*smoothstep(.95,.7,r);
}` },
  // ------------------------------------------------------------ 21
  { name: 'Scope', blurb: 'Oscilloscope and a phosphor Lissajous', fb: { zoom: .05, keep: .55, melt: .3 }, glsl: `
vec3 scene(vec2 p){
  vec3 c = vec3(0);
  const vec3 PH0 = vec3(.4,1.,.55);
  vec2 gq = p*8.;
  float dg = min(abs(fract(gq.x+.5)-.5), abs(fract(gq.y+.5)-.5))/8.;
  c += PH0*.06*smoothstep(1.5/R.y,0.,dg);
  // circular trace: the waveform wrapped around a ring, in the palette colour
  float r = length(p), a = atan(p.y,p.x)/TAU+.5;
  float w = wave(a + fract(T*.1));
  float rr = .46 + .16*w*(1.+B);
  float d = abs(r - rr);
  c += pal(a+C)*(.004/(d+.004))*(.5+H)*smoothstep(.2,.3,r);
  // Lissajous: the waveform against a delayed copy of itself, drawn as segments
  float dm = 1e3; vec2 prev = vec2(wave(0.), wave(.23))*.4;
  for(int i=1;i<=96;i++){
    float u = float(i)/96.;
    vec2 pt = vec2(wave(u), wave(u+.23+.1*M))*.4*(1.+.2*KICK);
    dm = min(dm, seg(p, prev, pt)); prev = pt;
  }
  c += PH0*.0035/(dm+.0035)*(.6+.6*M);
  c += PH0*.0008/(dm*dm+.002)*.08;
  c += pal(C+.5)*.0015/(abs(r-.72-.02*KICK)+.003)*(.3+B);
  return c;
}` },
  // ------------------------------------------------------------ 22
  { name: 'Swarm', blurb: 'Sixty thousand particles on a strange attractor', points: true, fb: { zoom: .4, melt: 1.2, swirl: 1.5 }, glsl: `
vec3 scene(vec2 p){
  float r = length(p);
  return pal(r+C+T*.02)*.015/(r+.1)*(.5+B) + pal(C+.5)*.02*fbm(p*2.+T*.05)*(1.+KICK);
}` },
  // ------------------------------------------------------------ 23
  { name: 'Crystal', blurb: 'Voronoi cells lit band by band', fb: { zoom: .2, melt: .5, keep: .7 }, glsl: `
vec3 scene(vec2 p){
  vec2 q = p*4.*rot(T*.02);
  vec2 ip = floor(q), fp = fract(q);
  float md = 8., md2 = 8.; vec2 mid = ip;
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 g = vec2(float(i),float(j));
    vec2 o = vec2(hash(ip+g), hash(ip+g+7.));
    o = .5+.4*sin(T*.5*(.5+o)+o*TAU);
    vec2 rr = g + o - fp; float d = dot(rr,rr);
    if(d<md){ md2=md; md=d; mid=ip+g; } else if(d<md2) md2=d;
  }
  float edge = sqrt(md2)-sqrt(md);
  float h = hash(mid*1.3);
  float e = spec(h*.6+.01);
  vec3 c = pal(h+C+T*.03)*(.15+1.3*e)*smoothstep(.0,.15,edge);
  c *= .7+.3*sin(sqrt(md)*30.-T*3.);
  c += vec3(1)*smoothstep(.05,0.,edge)*(.4+SNARE*1.5);
  c += pal(h+C+.5)*pow(1.-sqrt(md),6.)*(KICK+.3*BP);
  return c*.8;
}` },
];
