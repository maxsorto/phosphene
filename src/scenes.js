// The scenes. Each is a GLSL function `vec3 scene(vec2 p)` plus feedback
// settings: zoom (how hard the previous frame is pushed outward), swirl, melt
// (curl-noise smearing, scaled by the Goo setting), keep (trail length) and
// drip (downward ooze). Uniforms and helpers are listed at the top of shaders.js.
//
// What the music gives a scene:
//   spec(x) / specb(x, lod)  the log spectrum, an octave per eighth, notes as peaks
//   chroma(x)                the twelve pitch classes around a circle
//   sg(x, age), hist(i, age) the last 8.5 s of the spectrum and of the features
//   MEL NOTE MELV MELH       the tracked melody: height, a pulse per note, confidence, colour
//   KICK SNARE HAT, B M H    drums and band levels;  PH BAR BT  the beat grid
//
// Flags: ecg (reads the heartbeat ring), monitor (shows the readouts overlay),
// overlay (adds a point pass: 'swarm' or 'beam'), art (shows the album cover),
// res (renders its buffer smaller: heavy raymarchers). Every art scene scales
// its cover by ARTC, the confidence that the cover is the song playing: 1 while
// it is known, 0.4 while a change is suspected, 0 otherwise. So all of them
// appear, grey out and clear together.

export const SCENES = [
  // ------------------------------------------------------------ 01
  { name: 'Fractal Bloom', blurb: 'Kaleidoscopic IFS fractal', glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.05 + .1*sin(BAR*TAU))*(1.6-.4*B-.2*KICK);
  p = kale(p,K);
  vec3 c = vec3(0); float sc = 1.;
  float lean = (MEL-.5)*MELV;                            // the tune bends the fold
  for(int i=0;i<7;i++){
    float fi = float(i), e = min(1., specb(.1+fi*.085, 2.5)*1.7);   // seven bands, low notes to high
    p = abs(p) - vec2(.6+.12*sin(T*.13)+.12*lean, .35+.1*cos(T*.1)+.04*pulse(5.));
    p = rot(.4+T*.03+fi*.2+.25*M+.8*lean)*p;
    p *= 1.4; sc *= 1.4;
    float ring = abs(length(p)-.4-.3*e)/sc, line = abs(p.y)/sc;
    c += pal(fi*.12+T*.04+C)*(.006/(ring+.004)+.002/(line+.004))*(.3+1.5*e);
    c += vec3(1)*.0015/(line+.004)*(SNARE+.5*NOTE);
  }
  return c*.38;
}` },
  // ------------------------------------------------------------ 02
  { name: 'Wormhole', blurb: 'A tunnel where every beat and note is a ring of light racing away', fb: { zoom: .25, keep: .6, melt: .5 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.08+.4*sin(T*.21)+.15*sin(BAR*TAU));
  p -= .07*vec2(sin(T*.31),cos(T*.27));                  // the far end wanders
  float r = max(length(p),.001), a = atan(p.y,p.x);
  float depth = .35/r, v = depth + Z*.6;
  a += (MEL-.5)*MELV*min(depth,6.)*.2;                   // the tune twists the tunnel
  float u = a/TAU*K;
  float w = fbm3(vec2(cos(a),sin(a))*1.5 + vec2(v*.3,T*.05));
  float g = abs(sin(u*PI+w*3.))*abs(sin(v*1.5708+w*2.));  // the wall's panels
  // sound travels down the tunnel: what you see at each depth is the music a moment ago
  float age = clamp((depth-.5)*.16, 0., 1.);
  float en = hist(2.,age), kk = hist(4.,age), nn = hist(5.,age);
  float around = abs(fract(a/TAU*2.)-.5)*2.;
  float e = spec(.08+around*.58);                        // and around it, the notes sounding now
  vec3 c = pal(v*.04+u*.05+w+C)*pow(g,.6)*(.1+.9*en*en+1.6*kk)*(.45+1.5*e);
  c += pal(hist(0.,age)*.9+C+.25)*nn*(.35+.9*pow(g,.4));  // each note is a ring in its own colour
  c += pal(v*.07+.5+C)*pow(1.-g,10.)*(.3+1.6*B+1.5*kk);   // seams glow with the bass
  c += vec3(1)*HAT*step(.96,hash(floor(vec2(u*3.,v*1.5))))*.6*smoothstep(1.,2.5,depth);
  c += pal(MELH+C)*.02/(r+.03)*(.3+NOTE+B);              // the far end glows the colour of the note
  return c*smoothstep(0.,.3,r)*(.3+.7*smoothstep(.45,1.5,depth))*.85;   // the mouth of the tunnel stays dim
}` },
  // ------------------------------------------------------------ 03
  { name: 'Liquid Dream', blurb: 'Marbled oil, each vein a note', fb: { zoom: .3, melt: 1.6, drip: .5 }, glsl: `
vec3 scene(vec2 p){
  float rr = length(p);
  p += .05*(KICK+.6*NOTE)*sin(rr*28.-T*9.)*p/(rr+.1);
  p *= 1.4+.3*sin(T*.1);
  p += .35*(MEL-.5)*MELV*vec2(cos(T*.13),sin(T*.13));    // the tune pushes the whole pool
  float t = T*(.12+.12*EN);
  vec2 q = vec2(fbm3(p+t), fbm3(p+vec2(5.2,1.3)-t));
  vec2 r = vec2(fbm3(p+3.*q+vec2(1.7,9.2)+.8*B+t*.5), fbm3(p+3.*q+vec2(8.3,2.8)-t*.4));
  float f = fbm(p+3.*r+M);
  float e = spec(.125 + abs(fract(f*1.3)-.5));           // each contour of the marble listens to a note
  vec3 c = pal(f*2.2+length(q)*.8+C+T*.02)*(.1+1.7*pow(f,2.5));
  c *= .45+2.4*e;
  c += pal(f+.5+C)*pow(length(r),5.)*(.1+H*.5);
  c += pal(f*4.+C+.3)*pow(f,6.)*1.5*(.5+SNARE);
  c *= .35+.65*smoothstep(.3,.7,f);
  return c*.55;
}` },
  // ------------------------------------------------------------ 04
  { name: 'Spectral Mandala', blurb: 'Every ring is a band of notes, the crown is the scale', glsl: `
vec3 scene(vec2 p){
  p *= rot(-T*.08);
  float r = length(p), a = atan(p.y,p.x);
  vec3 c = vec3(0);
  for(int i=0;i<14;i++){
    float fi = float(i)/14., e = min(1., specb(.11+fi*.52, 1.5)*1.7), dir = mod(float(i),2.)*2.-1.;
    float rr = .05+fi*.62 + e*.07*sin(a*K+dir*(T*2.+BT*.5)+fi*6.) + .025*e*sin(a*K*2.-T*3.);
    c += pal(fi+T*.05+C)*(.0015+.006*e)/abs(r-rr);
  }
  float pet = pow(abs(cos(a*K*.5+T)),18.)*exp(-r*2.5)*(.3+B);
  c += pal(T*.1+C+.3)*pet;
  c += vec3(1)*pow(abs(cos(a*K*.5+T+PI/K)),30.)*exp(-r*1.5)*SNARE*.8;
  c += pal(C)*.01/(r+.02)*KICK;
  // the crown: twelve arcs, one for each note of the scale
  float an = fract(a/TAU+.5), ch = chroma((floor(an*12.)+.5)/12.);
  float arc = smoothstep(.5,.4,abs(fract(an*12.)-.5));
  c += pal(an+C)*arc*(.001+.011*ch*ch)/(abs(r-.72-.05*ch)+.002);
  // and the ring at the melody's pitch rings out with every note
  c += mix(vec3(1),pal(MELH+C),.5)*NOTE*.0045/(abs(r-.05-MEL*.62)+.004);
  return c*.5;
}` },
  // ------------------------------------------------------------ 05
  { name: 'Gyroid Flight', blurb: 'Raymarched lattice, lit by the song racing ahead', res: .7, glsl: `
float gyr(vec3 q){
  q.xy = rot(q.z*(.08+.08*(MEL-.5)*MELV))*q.xy;          // the tune winds the lattice tighter or looser
  float g = abs(dot(sin(q*3.),cos(q.zxy*3.)))/3. - .02 - .05*B - .03*KICK;
  return max(g, .55-length(q.xy));
}
vec3 scene(vec2 p){
  vec3 ro = vec3(.15*sin(T*.2),.15*cos(T*.17),Z*2.);
  vec3 rd = normalize(vec3(rot(T*.07+.25*sin(BAR*TAU))*p,1.));
  float t = .1, g = 1., gn = 0., gf = 0.;                // glow gathered near and far, coloured after the march
  for(int i=0;i<40;i++){
    vec3 q = ro+rd*t; g = gyr(q);
    float w = exp(-abs(g)*40.)*.021, far = min(t*.12,1.);
    gn += w*(1.-far); gf += w*far;
    if(abs(g)<.002 || t>11.) break;
    t += abs(g)*.86;
  }
  vec3 q = ro+rd*t;
  vec3 glow = pal(ro.z*.08+C+T*.02)*gn + pal(ro.z*.08+.5+C+T*.02)*gf;
  // around the flight path is pitch, ahead is the last few seconds
  float around = abs(fract(atan(q.y,q.x)/TAU*2.)-.5)*2.;
  float e = sg(.08+around*.58, clamp((t-.5)*.06,0.,1.));
  vec3 c = glow*(.5+2.6*e)*(1.+SNARE+.6*NOTE);
  if(t<11.){
    const vec2 k = vec2(1,-1)*.004;
    vec3 n = normalize(k.xyy*gyr(q+k.xyy) + k.yyx*gyr(q+k.yyx) + k.yxy*gyr(q+k.yxy) + k.xxx*gyr(q+k.xxx));
    float fr = pow(1.-abs(dot(n,rd)),3.);
    vec3 base = pal(q.z*.1+dot(n,vec3(.3,.5,.2))*.4+C+T*.03);
    c += base*(.15+fr*2.)*exp(-t*.3)*(.5+2.*e);
  }
  return mix(c, c.bgr, DROP*.7);
}` },
  // ------------------------------------------------------------ 06
  { name: 'Julia Bloom', blurb: 'A Julia set whose shape is the melody', fb: { zoom: .3 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.03)*(2.5-.35*B-.3*KICK);
  // c walks the edge of the Mandelbrot cardioid: every pitch is its own shape,
  // and each new note pushes it over the edge for a moment
  float a = T*.05 + 1. + 2.6*(MEL-.5)*MELV + .25*M + .08*sin(BAR*TAU);
  vec2 e1 = vec2(cos(a),sin(a)), e2 = vec2(cos(2.*a),sin(2.*a));
  vec2 c = (e1*.5-e2*.25)*(1.012+.035*NOTE);
  float trap = .45+.35*spec(MELX);                       // the orbit trap swells with the melody's note
  vec2 z = p; float n = 0., tr = 1e3;
  for(int i=0;i<80;i++){
    z = vec2(z.x*z.x-z.y*z.y, 2.*z.x*z.y) + c;
    tr = min(tr, abs(length(z)-trap));
    if(dot(z,z)>16.) break;
    n++;
  }
  vec3 col = vec3(0);
  if(n<79.){
    float sm = n - log2(log2(dot(z,z))) + 4.;
    col = pal(sm*.04+T*.05+C)*pow(clamp(sm/28.,0.,1.),1.6)*1.6;
    col *= .75+1.1*spec(.125+abs(fract(sm*.05)-.5));     // the escape bands light with the notes
    col += vec3(1)*smoothstep(.5,0.,abs(fract(sm*.25-BT*.5)-.5))*.15*(SNARE+.6*NOTE);
  }
  col += pal(tr*2.+C+.5)*.0025/(tr+.01)*(.3+1.2*B+.8*NOTE);
  return col*.7;
}` },
  // ------------------------------------------------------------ 07
  { name: 'Hyperspace', blurb: 'Warp speed: every star listens to one note', fb: { melt: .3 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.05+.35*(MEL-.5)*MELV);
  float ang = atan(p.y,p.x), a = ang/TAU+.5, r = length(p);
  vec3 c = vec3(0);
  for(int l=0;l<3;l++){
    float fl = float(l), n = 90.+fl*60.;
    float u = a*n + fl*.37, id = floor(u);
    float h = hash(vec2(id, fl));
    float z = fract(h*7.1 + Z*(.25+.1*fl)*(.6+h) + DROP*.3);
    float e = spec(.125+h*.5);
    float rr = z*z*1.5, len = .015+.05*z+(.3*B+.5*KICK+.5*e)*z*z;
    float da = abs(fract(u)-.5)/n*TAU*r;
    float d = max(abs(r-rr)-len, 0.);
    float st = smoothstep(.0035*(1.+2.*z), 0., da)*smoothstep(.02, 0., d)*z;
    c += mix(vec3(1), pal(h+C+T*.02), .65)*st*(.6+3.2*e);
  }
  // gas streaming past
  float neb = fbm3(vec2(cos(ang),sin(ang))*1.7 + vec2(log(r+.03)*1.4-Z*.3, T*.03));
  c += pal(neb*1.4+C+.2)*pow(neb,3.)*.9*smoothstep(.06,.5,r)*(.3+EN);
  // the core: twelve notes around a ring
  float ch = chroma((floor(a*12.)+.5)/12.);
  c += pal(a+C)*smoothstep(.014,.004,abs(r-.11-.02*B))*smoothstep(.5,.35,abs(fract(a*12.)-.5))*(.12+1.6*ch*ch);
  c += pal(T*.1+C)*.02/(r+.04)*(.3+B+BP*.5);
  c += pal(C+.5)*smoothstep(.03,0.,abs(r-.2-.6*fract(BT*.5)))*.4*BP;
  return c;
}` },
  // ------------------------------------------------------------ 08
  { name: 'Moiré', blurb: 'Op-art rings, tighter as the tune climbs', fb: { zoom: .15, keep: .6, melt: .2 }, glsl: `
vec3 scene(vec2 p){
  vec2 o1 = .28*vec2(sin(T*.3), cos(T*.23))*(1.+.6*B);
  vec2 o2 = rot(T*.1)*-o1;
  float f = 42.+18.*M+8.*sin(BAR*TAU)+30.*(MEL-.5)*MELV;  // higher notes, finer rings
  float m = sin(length(p-o1)*f-T*2.)*sin(length(p-o2)*f+T*1.5);
  float k = sin(kale(p,K).y*f*.5+T);
  float ink = smoothstep(-.05,.1,m*(.75+.25*k));
  ink = mix(ink, 1.-ink, SNARE*.7);
  vec3 c = mix(vec3(.01), mix(vec3(.9), pal(length(p)*.6+T*.05+C), .55+.4*H), ink);
  c *= (.4+1.3*spec(.125+abs(fract(length(p)*.9)-.5)))*(1.+.4*KICK);
  c += pal(MELH+C)*ink*NOTE*.25;
  return c;
}` },
  // ------------------------------------------------------------ 09
  { name: 'Neon Horizon', blurb: 'Synthwave road, mountains cut from the song', fb: { zoom: .15, melt: .3 }, glsl: `
vec3 scene(vec2 p){
  const float hz = -.07;
  p = rot(.025*sin(BAR*TAU))*p;
  vec3 c = vec3(0);
  if(p.y < hz){
    float d = hz-p.y;
    vec2 g = vec2(p.x/d, 1./d)*.5; g.y += BT;            // one row passes under you every beat
    vec2 f = abs(fract(g)-.5)/max(fwidth(g),1e-4);
    float line = 1.-min(min(f.x,f.y)*.45,1.);
    float e = spec(.1+abs(floor(g.x+.5))*.03);           // each lane is a few notes, low in the middle
    c += pal(g.y*.02+C+.6)*line*(.35+1.9*e)*smoothstep(.01,.25,d)*(1.+B+.6*KICK);
    c += pal(C+.75)*exp(-abs(.5/d-5.*(1.-PH))*1.6)*.3*(.3+KICK)*smoothstep(0.,.1,d);   // a bar of light runs in on each beat
    c += pal(C+.6)*.004/(d+.01);
    // the wet road: the sky a moment ago, mirrored
    vec2 m = vec2(p.x+.006*sin(d*120.-T*4.)*(.5+B), hz+d*.9);
    c += textureLod(P, scr(m), 2.).rgb*.3*smoothstep(0.,.04,d)*(1.-.7*line);
    fbk = .3;
  } else {
    float y = p.y-hz;
    c += pal(C+.62)*.09*exp(-y*4.);
    vec2 sp = p*46.; vec2 ip = floor(sp); float hs = hash(ip);
    float star = smoothstep(.09,0.,length(fract(sp)-.5))*step(.93,hs)*(.25+.75*HAT*hash(ip+3.));
    vec2 q = p-vec2(0,.11);
    float r = length(q), R0 = .24+.02*B+.03*KICK;
    float yy = clamp((q.y+R0)/(2.*R0),0.,1.);            // 0 at the sun's foot, 1 at its top
    float cut = smoothstep(0.,.06, fract(q.y*15.-T*.35) - .75*max(0.,1.-yy/.6));   // stripes widen toward the foot and slide down
    float disc = smoothstep(R0, R0-.004, r);
    fbk = 1.-.6*disc;                                    // keep the stripes crisp
    c += mix(pal(C+.3), pal(C+.05), yy)*disc*cut*(1.1+.5*KICK);
    c += pal(C+.1)*.014/(abs(r-R0-.012)+.016)*(.25+B) + pal(MELH*.3+C+.2)*exp(-r*4.)*.14*(1.+NOTE);
    c += vec3(1)*star*(1.-disc);
    // three ridges of mountains cut from the spectrogram: the nearest is now, the farthest a moment ago
    for(int i=2;i>=0;i--){
      float fi = float(i), x = abs(p.x)/(1.+.25*fi);
      float prof = sg(.06+x*.5, .015+fi*.1);
      float m = hz+.012+.05*fi + (.17-.03*fi)*prof*smoothstep(.03,.4,x)*smoothstep(1.6,.5,x) + .012*noise(vec2(p.x*9.+fi*5.,fi));
      float mask = smoothstep(.003,0., p.y-m);
      vec3 body = pal(fi*.12+C+.55)*(.04+.06*fi) + pal(C+.9)*.3*prof*smoothstep(m-.09,m,p.y);
      c = mix(c, body, mask);
      c += mix(vec3(1), pal(x*.3+C+.5), .6)*smoothstep(.005,0.,abs(p.y-m))*(1.-fi*.25)*(.5+prof);
    }
  }
  return c;
}` },
  // ------------------------------------------------------------ 10
  { name: 'Pulsar', blurb: 'Ridgelines of the spectrum, each a moment further back', fb: { zoom: .15, keep: .5, melt: .25, drip: -.4 }, glsl: `
float rl(float x, float age){                            // one ridgeline: the spectrum then, bass in the middle
  float ax = abs(x)/.64, v = sg(.03+.7*ax, age);
  return (v*v*.6+v*.4)*smoothstep(1.,.72,ax);
}
vec3 scene(vec2 p){
  const float N = 32., Y0 = -.44, DY = .022, A = .18;
  vec3 c = vec3(0);
  float dx = 1.5/R.y;
  bool open = true;
  if(abs(p.x) < .66){
    // only the few lines that can reach this pixel, nearest first; the first to cover it hides the rest
    float i0 = max(0., ceil((p.y-A-Y0)/DY)), i1 = min(N-1., floor((p.y-Y0)/DY+.15));
    for(int j=0;j<10;j++){
      float i = i0+float(j); if(i > i1) break;
      float age = i/N*.42, y = Y0+i*DY;
      float a = rl(p.x-dx,age), b = rl(p.x,age), e = rl(p.x+dx,age);
      float lo = y+A*min(b,min(a,e)), hi = y+A*max(b,max(a,e));
      float d = max(max(lo-p.y, p.y-hi), 0.);
      float ink = smoothstep(2.4/R.y, .8/R.y, d);
      if(ink > 0. || p.y < hi){
        float k = hist(4.,age), n = hist(5.,age);        // kicks and new notes ride back through the stack
        vec3 lc = mix(vec3(.92), pal(i*.02+C+hist(0.,age)*.7), .4+.5*n);
        c = lc*ink*(.5+1.4*k+.8*n+.5*B*step(i,.5))*(1.-i/N*.45)*smoothstep(.66,.6,abs(p.x));
        open = false; break;
      }
    }
  }
  if(open){
    // behind the stack: the pulsar itself, two beams sweeping a quarter turn a beat
    vec2 q = p-vec2(0,.43); float r = length(q), an = atan(q.y,q.x);
    c += pal(C+.55)*pow(abs(cos(an-BT*PI*.5)),70.)*exp(-r*2.)*(.2+.5*EN);
    c += mix(vec3(1),pal(MELH+C),.4)*.001/(r*r+.0005)*(.35+1.3*BP);
    vec2 sp = p*52.; float hs = hash(floor(sp));
    c += vec3(.8,.9,1.)*smoothstep(.08,0.,length(fract(sp)-.5))*step(.95,hs)*(.2+.6*HAT);
  }
  return c;
}` },
  // ------------------------------------------------------------ 11
  { name: 'Vitals', blurb: 'A bedside monitor for the song: pulse, melody, bass, spectrum', ecg: true, monitor: true, fb: { zoom: 0, keep: .5, melt: .35, drip: -.5 }, glsl: `
vec3 trace(float d, float px, vec3 col){ return col*(smoothstep(2.4*px,.6*px,d)*1.5 + .0035/(d+.004)*.3); }
vec3 scene(vec2 p){
  const vec3 G = vec3(.22,1.,.42), CY = vec3(.3,.9,1.), YL = vec3(1.,.85,.25);
  const float SW = 853., XR = .84;                        // samples in a 4 s sweep; traces use the left 84%
  float px = 1./R.y;
  vec2 uv = gl_FragCoord.xy/R;
  vec2 gp = p*10.; float dg = min(abs(fract(gp.x+.5)-.5), abs(fract(gp.y+.5)-.5))/10.;
  vec2 gq = p*50.; float dq = min(abs(fract(gq.x+.5)-.5), abs(fract(gq.y+.5)-.5))/50.;
  vec3 c = G*(.07*smoothstep(1.5*px,0.,dg) + .022*smoothstep(px,0.,dq));
  c += vec3(.45)*.3*smoothstep(1.5*px,0.,abs(fract(uv.y*4.+.5)-.5)/4.);   // lane dividers
  if(uv.x > XR){ fbk = .2; return c*.35 + vec3(.45)*.3*smoothstep(1.5/R.x,0.,uv.x-XR); }
  float u = uv.x/XR, du = 1.5/R.x/XR;
  float headU = fract(HEAD/SW), age = fract(headU-u);
  float live = exp(-age*1.1)*smoothstep(1.,.965,age);
  float a2 = age*.469, da = du*.469;                      // the same moment in the 8.5 s history
  // I  the pulse: every kick is a heartbeat
  { float k = HEAD-age*SW, dk = du*SW;
    float y0 = ecgAt(k-dk), y1 = ecgAt(k), y2 = age < du ? y1 : ecgAt(k+dk);
    float base = .315, gain = .13+.03*B;
    float lo = base+gain*min(y1,min(y0,y2)), hi = base+gain*max(y1,max(y0,y2));
    c += trace(max(max(lo-p.y, p.y-hi), 0.), px, G)*live;
    vec2 hp = vec2((headU*XR-.5)*R.x/R.y, base+gain*ecgAt(HEAD));
    c += G*.005/(length(p-hp)+.005)*(.8+B); }
  // II  the melody: the tune's pitch as a line, broken where there is no clear note
  { float m0 = hist(0.,a2-da), m1 = hist(0.,a2), m2 = hist(0.,a2+da), cf = smoothstep(.12,.4,hist(1.,a2));
    float base = .025, gain = .2;
    float lo = base+gain*min(m1,min(m0,m2)), hi = base+gain*max(m1,max(m0,m2));
    float d = max(max(lo-p.y, p.y-hi), 0.);
    c += trace(d, px, mix(CY, pal(m1*1.2+C), .5))*live*cf;
    c += vec3(1)*hist(5.,a2)*smoothstep(.014,0.,d)*live*cf;            // a spark where each note begins
    vec2 hp = vec2((headU*XR-.5)*R.x/R.y, base+gain*hist(0.,0.));
    c += CY*.004/(length(p-hp)+.005)*(.3+MELV+NOTE); }
  // III  the bass, filled like a pulse oximeter
  { float v0 = hist(3.,a2-da), v1 = hist(3.,a2), v2 = hist(3.,a2+da);
    float base = -.235, gain = .2;
    float lo = base+gain*min(v1,min(v0,v2)), hi = base+gain*max(v1,max(v0,v2));
    c += trace(max(max(lo-p.y, p.y-hi), 0.), px, YL)*live;
    c += YL*.13*step(base,p.y)*step(p.y,base+gain*v1)*live; }
  // IV  the spectrum as a scrolling strip: pitch upward, time along the sweep
  { float yy = uv.y*4.;
    if(yy > .06 && yy < .97){ float e = sg(.06+yy*.7, a2); c += pal(yy*.8+C+.2)*e*e*1.7*live; } }
  return c*(1.+.5*DROP);
}` },
  // ------------------------------------------------------------ 12
  { name: 'Vinyl', blurb: 'A record seen from a drifting angle, the song rippling out through its grooves', art: true, fb: { zoom: .25, keep: .8, melt: .5 }, glsl: `
vec3 scene(vec2 p){
  const float R0 = .46, L = .15;
  p *= max(1., R.y/R.x*1.02);                             // fit the record across narrow screens
  // the camera drifts around and breathes between overhead and a low angle
  float ti = .36+.2*sin(T*.11)+.12*DROP, az = .45*sin(T*.07);
  vec3 ro = 1.55*vec3(sin(az)*sin(ti), cos(ti), -cos(az)*sin(ti));
  vec3 fw = normalize(-ro), rt = normalize(cross(fw, vec3(0,0,-1))), up = cross(fw, rt);
  vec3 rd = normalize(fw*1.55 + rt*p.x + up*p.y);
  vec2 q = (ro - rd*(ro.y/rd.y)).xz;                      // where the view meets the turntable
  float r = length(q), a = atan(q.y,q.x), spin = SP+BEAT*.2;
  vec3 c = vec3(0);
  // sound leaves the record's edge as rings across the table
  float o = max(r-R0,0.)*.3;
  c += pal(hist(0.,o)*.8+C)*(hist(4.,o)+.5*hist(5.,o))*exp(-o*9.)*.4*step(R0,r);
  if(r < R0){
    fbk = .3;
    float aa = a-spin, t = clamp((r-L)/(R0-L),0.,1.);
    float age = t*.3;                                     // label to rim is the last two and a half seconds
    float en = hist(2.,age), kk = hist(4.,age), nn = hist(5.,age);
    vec3 tint = pal(hist(0.,age)*.9+C+t*.2);              // each ring keeps the colour of the note that made it
    float groove = mix(.75, .5+.5*sin(r*560.), smoothstep(.7,.15,fwidth(r)*560.));
    float wear = noise(vec2(cos(aa),sin(aa))*5.+r*90.);
    float gap = smoothstep(0.,.006, abs(fract(t*5.+.5)-.5)*(R0-L)/5.);
    c = mix(vec3(.04), tint, .3+.5*en)*(.4+.6*groove)*(.3+1.3*en+2.6*kk+1.6*nn)*(.7+.6*wear)*mix(.25,1.,gap);
    c *= 1.+.08*sin(aa);                                  // a slight warp, once a turn
    // light catches the grooves in a bow tie and splits into colours that slide as the view tilts
    float bow = pow(abs(cos(a-.7-az)),26.) + .5*pow(abs(cos(a+1.1-az)),60.);
    vec3 holo = .5+.5*cos(TAU*(r*5.-ti*4.+vec3(0.,.33,.67)));
    c += mix(vec3(.9), holo, .65)*bow*(.2+.45*groove)*step(L+.01,r);
    if(r < L){
      vec2 ql = rot(-spin)*q;
      vec3 lab = pal(C+.1)*.8*(.85+.3*B);
      lab *= 1.-.6*smoothstep(.0025,0.,abs(r-.125))-.6*smoothstep(.002,0.,abs(r-.04));
      lab = mix(lab, vec3(.95), smoothstep(.0028,0.,abs(ql.y-.075))*step(abs(ql.x),.045));
      float sure = HASART*ARTC;                           // the cover is on the label only while the song is known
      vec3 art = texture(ART, ql/(2.*L)+.5).rgb*(.85+.3*B);
      art = mix(vec3(dot(art,vec3(.3,.59,.11))), art, smoothstep(.3,1.,sure));
      c = mix(lab, art, smoothstep(0.,.3,sure));
      c *= smoothstep(.011,.015,r)*smoothstep(L,L-.004,r);
    }
    c *= smoothstep(R0, R0-.004, r);
  }
  c += vec3(.6)*.0015/(abs(r-R0)+.002)*(.3+B);
  // strobe dots on the platter's rim
  c += vec3(1.,.55,.3)*smoothstep(.3,.1,abs(fract((a-spin)/TAU*60.)-.5))*smoothstep(.006,.003,abs(r-.487))*.5;
  // tonearm: on the groove while music plays, lifted in silence and while a skip is being checked
  vec2 pv = vec2(.6,.3);
  float play = -1.9-.35*fract(T*.012)+.004*KICK, rest = -1.72;
  float th = mix(rest, play, smoothstep(0.,1.,ARM));
  vec2 hd = pv+.52*vec2(cos(th),sin(th));
  float arm = seg(q, pv, hd);
  c = mix(c, vec3(.82), smoothstep(.011,.006,arm));
  c = mix(c, vec3(.95), smoothstep(.028,.02,length(q-hd)));
  c = mix(c, vec3(.3), smoothstep(.045,.04,length(q-pv)));
  c += vec3(.4)*.0015/(abs(length(q-pv)-.045)+.003);
  c += pal(MELH+C)*.0005/(dot(q-hd,q-hd)+.0004)*(KICK+.7*NOTE)*ARM;    // sparks at the stylus
  if(arm < .03 || length(q-pv) < .05) fbk = .3;
  return c;
}` },
  // ------------------------------------------------------------ 13
  { name: 'Aurora', blurb: 'Curtains of light over a still lake, brightest where the notes are', res: .8, fb: { zoom: .15, melt: .6, drip: -.3, keep: .9 }, glsl: `
float veil(vec2 q, float t){                              // thin wandering curtains, seen from below
  q = rot(1.15)*q;                                        // they sweep across the sky, a little toward you
  q.x += .9*noise(q*.3+vec2(0.,t*.15));
  float n = noise(vec2(q.x*1.1, q.y*.2-t*.1));
  return pow(1.-abs(n*2.-1.), 5.)*(.55+.45*noise(vec2(q.y*5.+t*.6, q.x*.5)));   // rays within each curtain
}
vec3 scene(vec2 p){
  const float hz = -.14;
  if(p.y < hz){                                           // the lake: the sky a moment ago, rippled
    float d = hz-p.y;
    vec2 m = vec2(p.x+.012*sin(d*70.-T*2.)*(1.+2.*B)*smoothstep(0.,.1,d), hz+d);
    fbk = .2;
    return textureLod(P, scr(m), 1.).rgb*(.75-.9*d) + pal(C+.3)*.002/(d+.004)*(.4+SNARE);
  }
  vec3 rd = normalize(vec3(p.x, p.y-hz+.03, .9));
  vec2 sp = p*60.; vec2 ip = floor(sp); float hs = hash(ip);
  vec3 c = vec3(.8,.9,1.)*smoothstep(.09,0.,length(fract(sp)-.5))*step(.94,hs)*(.2+.8*HAT*hash(ip+1.));
  float jit = hash(gl_FragCoord.xy+fract(T)*7.);
  vec3 au = vec3(0);
  for(int i=0;i<15;i++){
    float fi = (float(i)+jit)/15.;
    vec2 q = rd.xz*((.9+fi*1.3)/rd.y);                    // where this ray crosses a layer of the sky
    float far = exp(-dot(q,q)*.0035);
    q.y += T*.12;
    float e = spec(.1+.55*abs(fract(q.x*.045+.5)-.5)*2.); // across the sky is up the scale
    vec3 col = mix(vec3(.1,1.,.5), pal(fi*.45+C+.45), smoothstep(0.,.8,fi));
    au += col*veil(q*.5,T)*far*(1.-.5*fi)*(.3+1.7*e+.6*KICK*(1.-fi)+.5*NOTE*fi);
  }
  c += au*.16*smoothstep(0.,.12,rd.y)*(.7+.6*EN);
  float shore = hz+.01+.02*noise(vec2(p.x*6.,3.))+.012*noise(vec2(p.x*23.,7.));
  return c*smoothstep(shore-.002, shore+.004, p.y);
}` },
  // ------------------------------------------------------------ 14
  { name: 'Goop', blurb: 'Gooey blobs that drip and merge, one for each octave of the song', fb: { zoom: .1, melt: 2, drip: 1.2, keep: .9 }, glsl: `
vec3 scene(vec2 p){
  float d = 0., w = 0.;
  float lean = (MEL-.5)*MELV;
  for(int i=0;i<8;i++){
    float fi = float(i), h = hash1(fi*3.1+.7), h2 = hash1(fi*5.3+.2);
    float e = min(1., specb(.09+fi*.08, 3.)*2.6);
    float fall = fract(T*.045*(.6+h2) + h);
    vec2 c = vec2(sin(T*.25*(.5+h)+fi*2.1)*.65 + .3*lean*(h-.5), .55 - fall*1.3 + .1*cos(T*.3+fi) + .12*lean);
    float r = .1 + .17*e + .05*KICK + .03*sin(T*2.+fi) + .03*NOTE;
    float g = r*r/dot(p-c,p-c);
    d += g; w += g*fi;
  }
  float band = fract(w/max(d,1e-3)*.12 + C);
  float iso = smoothstep(.85,1.15,d);
  vec3 c = pal(band + d*.05 + T*.02)*(.6+.4*sin(d*7.-T*2.5))*iso;
  float rim = smoothstep(.9,1.4,d)*(1.-smoothstep(1.4,2.6,d));
  c += mix(vec3(1),pal(MELH+C),.5*NOTE)*rim*.45*(.6+.8*SNARE+.8*NOTE);
  c += pal(C+.5)*smoothstep(.45,.85,d)*(1.-iso)*.55*(.5+B);
  c += pal(C+.15)*pow(smoothstep(2.,5.,d),2.)*.6;
  vec2 gl = p - vec2(-.02,.03);
  c += vec3(1)*iso*smoothstep(1.,1.6,d)*pow(max(0.,1.-length(gl)*1.6),3.)*.25;
  return c*.9;
}` },
  // ------------------------------------------------------------ 15
  { name: 'Oracle', blurb: 'An all-seeing eye that follows the melody, the cover in its iris', art: true, fb: { zoom: .3, melt: .8 }, glsl: `
vec3 eye(vec2 p, float s, vec2 look){
  p /= s;
  float open = 1. - .95*DROP;
  float lidW = .95, lidH = .5*open;
  float alm = lidH*max(0., 1.-p.x*p.x/(lidW*lidW));
  float inside = smoothstep(.01,0., abs(p.y)-alm);
  vec2 g = p-look;                                        // the iris slides, the white and the lids stay
  float r = length(g), a = atan(g.y,g.x);
  float pup = .13 + .08*EN + .06*KICK + .04*NOTE, iris = .42;
  float t = clamp((r-pup)/(iris-pup),0.,1.);
  vec3 ic = pal(t*.6 + C + .1*sin(a*7.+T))*(.3 + 1.7*spec(.125+t*.5))*(.6+.4*noise(vec2(a*6.,r*30.)+T*.2));
  ic += vec3(1)*pow(abs(sin(a*K*2.+r*40.-T*3.)),20.)*.25*(.5+H);
  if(HASART > .5) ic = mix(ic, texture(ART, vec2(cos(a),sin(a))*t*.5+.5).rgb*1.2, .5*ARTC);
  vec3 col = vec3(.95,.93,.9)*(1.-.15*length(p));
  col = mix(col, ic, smoothstep(iris+.01, iris-.01, r));
  col = mix(col, vec3(0), smoothstep(pup+.01, pup-.01, r));
  col += vec3(1)*smoothstep(.06,0.,length(p-vec2(-.1,.12)))*.9;
  col *= inside;
  col += pal(C+.5)*smoothstep(.02,0.,abs(abs(p.y)-alm))*.8*step(abs(p.x), lidW);
  return col;
}
vec3 scene(vec2 p){
  vec2 look = vec2(.12*sin(T*.4), .26*(MEL-.5)*MELV);     // it looks up as the tune climbs
  vec3 c = pal(length(p)+C+T*.03)*fbm3(p*3.+T*.1)*.1*(1.+B);
  c += eye(p*rot(.1*sin(T*.3)), .55+.05*B, look);
  vec2 q = kale(p, K) - vec2(.78+.05*sin(T*.4), 0.);
  c += eye(q*rot(T*.2), .22, look)*.8*step(.52,length(p));
  return c;
}` },
  // ------------------------------------------------------------ 16
  { name: 'Sigil', blurb: 'Rune rings turning at the tempo, the outer one spelling the scale', fb: { zoom: .5, melt: .4 }, glsl: `
vec3 scene(vec2 p){
  p *= rot(T*.04 + .25*sin(BAR*TAU)) * (1.05 - .08*KICK);
  float r = length(p), a = atan(p.y,p.x);
  vec3 c = vec3(0);
  for(int i=0;i<5;i++){ float fi=float(i); float rr=.12+fi*.13+.02*specb(.15+fi*.1,2.); c += pal(fi*.2+C)*.0012/abs(r-rr)*(.5+B); }
  float n = floor(K*.5)+2.;
  float an = mod(a+PI/n+(MEL-.5)*MELV*1.2, TAU/n)-PI/n;   // the polygons turn with the tune
  float poly = r*cos(an);
  c += pal(C+.5)*.0014/abs(poly-.4)*(.6+KICK);
  c += pal(C+.7)*.0014/abs(poly-.26)*(.6+SNARE+.8*NOTE);
  for(int j=0;j<3;j++){
    float fj = float(j), ra = .18 + fj*.17, w = 24. + fj*12.;
    float aa = a + T*(.1-.08*fj)*(mod(fj,2.)*2.-1.);
    vec2 cell = vec2(aa/TAU*w, (r-ra)*22.);
    vec2 id = floor(cell), fc = fract(cell)-.5;
    float h = hash(id+fj*7.);
    // inner runes each listen to a pitch; the outer ring is the twelve notes, four times round
    float e = j == 2 ? chroma((mod(id.x,12.)+.5)/12.) : spec(.125+h*.5);
    float tick = step(.45,h)*smoothstep(.12,.05,abs(fc.x))*step(abs(fc.y),.42*(.3+e));
    float dt_ = step(.9,h)*smoothstep(.2,.1,length(fc));
    c += pal(h+C+fj*.2)*(tick+dt_)*(.3+1.6*e)*step(abs(cell.y),.5)*(.6+.6*SNARE*step(.7,h));
  }
  c += pal(MELH*.4+C+.3)*.004/(abs(r*cos(mod(a+PI/3.,TAU/3.)-PI/3.)-.08)+.006)*(.5+B+BP+NOTE);
  return c*(.7+.5*EN);
}` },
  // ------------------------------------------------------------ 17
  { name: 'Oil Slick', blurb: 'Thin-film rainbows that slide with the tune', fb: { zoom: .1, melt: 1.8, keep: .9 }, glsl: `
vec3 scene(vec2 p){
  float t = T*.1;
  vec2 q = p*2.;
  float h = fbm(q + t) + .5*fbm3(q*2.3 - t*1.3 + 2.*B);
  float rr = length(p);
  h += .25*KICK*sin(rr*25. - T*10.)*exp(-rr*2.);
  h += .1*SNARE*sin(p.x*40.+T*5.);
  vec2 drop = .32*vec2(cos(MELH*TAU),sin(MELH*TAU));       // each note drops a pebble at its own spot
  float dr = length(p-drop);
  h += .14*NOTE*sin(dr*34.-T*9.)*exp(-dr*3.);
  float ms = (hist(0.,0.)+hist(0.,.03)+hist(0.,.06)+hist(0.,.09))*.25;   // the melody over the last second, so the film glides
  float th = h*6. + M*2. + C*2. + 1.4*(ms-.5);              // the film thickens and thins as the tune moves
  vec3 film = .5+.5*cos(th*vec3(1.,1.15,1.3)*3. + vec3(0,2.,4.));
  film = mix(film, pal(h*1.5+C), .35);
  vec2 g = vec2(dFdx(h), dFdy(h))*R.y*.5;                  // the surface's slope, free from the rasteriser
  float sp = pow(max(0., 1.-length(g*.12 - vec2(.25,.35))), 6.);
  vec3 c = film*(.25+.75*smoothstep(.25,.85,h)) + sp*.9*(.5+.5*H);
  c *= .55 + .45*smoothstep(.1,.5,h);
  return c*.6;
}` },
  // ------------------------------------------------------------ 18
  { name: 'Chladni', blurb: 'Sand on a singing plate: the melody picks the pattern', fb: { zoom: .1, melt: .5, keep: .7 }, glsl: `
vec3 scene(vec2 p){
  vec2 q = p*rot(T*.03)*1.25;
  float mm = 2. + 6.*MEL, nn = 1.5 + 3.5*M + 1.5*sin(T*.1+BAR*TAU*.5);
  float ch = cos(mm*PI*q.x)*cos(nn*PI*q.y) - cos(nn*PI*q.x)*cos(mm*PI*q.y);
  float sand = smoothstep(.1,.0,abs(ch))*(.6+.6*EN);
  float grain = noise(p*180.+T*(1.+10.*KICK+6.*NOTE));
  vec3 c = pal(ch*.4+C+T*.02)*sand*(.5+.8*grain);
  c += pal(C+.5)*.02/(abs(ch)+.08)*B*(1.-sand);
  c += vec3(1)*sand*smoothstep(.6,.9,grain)*(KICK+.6*NOTE);
  float edge = max(abs(q.x),abs(q.y));
  c *= smoothstep(1.,.85,edge);
  c += pal(C+.2)*.003/(abs(edge-.95)+.004)*(.3+SNARE);
  return c*.9;
}` },
  // ------------------------------------------------------------ 19
  { name: 'Canyon', blurb: 'Flying over a terrain made of the song', res: .85, fb: { zoom: .2, melt: .2, keep: .6 }, glsl: `
float hmap(vec2 xz){ float x = min(abs(xz.x)*.3,1.); return (2.1-1.1*x)*sg(.05+x*.62, fract(xz.y*.025))*smoothstep(0.,.5,abs(xz.x)) + .2*noise(xz*.8); }
vec3 scene(vec2 p){
  vec3 ro = vec3(.4*sin(T*.15), 1.1 + .1*sin(T*.3), 0.);
  vec3 rd = normalize(vec3(p.x, p.y-.3, 1.3));
  rd.xy = rot(.08*sin(BAR*TAU))*rd.xy;
  float t = .2, h = 0.; vec3 pos = ro; bool hit = false;
  for(int i=0;i<60;i++){
    pos = ro + rd*t; h = hmap(pos.xz);
    if(pos.y < h){ hit = true; break; }
    t += max(.035, (pos.y-h)*.5);
    if(t > 24.) break;
  }
  vec3 c = vec3(0);
  if(hit){
    float x = abs(pos.x)*.3, age = fract(pos.z*.025), e = sg(.05+min(x,1.)*.62, age);
    vec3 base = pal(x*1.2 + C + e*.4 + pos.z*.02);
    vec2 g = abs(fract(pos.xz*vec2(3.,1.5))-.5);
    float wire = smoothstep(.08,.0,min(g.x,g.y));
    c = base*(.08 + 1.3*e)*(.55+.45*smoothstep(0.,1.6,pos.y))*exp(-t*.12) + base*wire*(.5+KICK+1.5*hist(5.,age))*exp(-t*.08);
    c += pal(pos.y*.35+C+.3)*smoothstep(.07,0.,abs(fract(pos.y*5.)-.5))*.4*exp(-t*.1);   // strata up the canyon walls
    c += vec3(1)*wire*SNARE*.3*exp(-t*.1);
  }
  c += pal(C+.6)*.025/(abs(rd.y+.05)+.04)*(.4+B)*(hit?.3:1.);
  c += pal(MELH*.3+C+.1)*smoothstep(.12,.0,length(rd.xy-vec2(0.,.12)))*(.3+.4*BP+.5*NOTE)*(hit?0.:1.);
  return c;
}` },
  // ------------------------------------------------------------ 20
  { name: 'Sonar', blurb: 'A radar sweep of the song: out from the centre is up the scale', fb: { zoom: 0, keep: .5, melt: .2 }, glsl: `
vec3 scene(vec2 p){
  float r = length(p), a = atan(p.y,p.x)/TAU+.5;
  float sweep = (SGH+SGF)/256.;
  float age = fract(sweep - a);
  float e = sg(.04+r*.95, age);
  vec3 c = pal(r*1.2 + C + age*.15)*e*e*2.6*(1.-age*.6);
  c += vec3(1)*smoothstep(.8,1.,e)*.45*(1.-age);
  c += pal(C+.3)*smoothstep(.012,0.,abs(fract(a - sweep + .5)-.5))*(.5+B+BP)*smoothstep(.9,.1,r);
  c += pal(C+.3)*exp(-age*18.)*.35*e;
  float rings = .0015/(abs(fract(r*5.)-.5)/5.+.004);
  c += vec3(.35,.9,.6)*rings*.12;
  c += pal(C)*.003/(abs(r-.45-.04*KICK)+.004)*.5;
  c += vec3(.35,.9,.6)*.002/(abs(fract(a*8.)-.5)/8.+.004)*.03*step(.1,r);
  c += mix(vec3(1),pal(MELH+C),.6)*NOTE*.003/(abs(r-(MELX-.04)/.95)+.004)*exp(-age*6.);   // the note just played rings at its radius
  return c*smoothstep(.95,.7,r);
}` },
  // ------------------------------------------------------------ 21
  { name: 'Scope', blurb: 'Oscilloscope beam, a ring of the waveform, twelve lamps for the notes', overlay: 'beam', fb: { zoom: .05, keep: .6, melt: .3 }, glsl: `
vec3 scene(vec2 p){
  vec3 c = vec3(0);
  const vec3 PH0 = vec3(.4,1.,.55);
  vec2 gq = p*8.;
  float dg = min(abs(fract(gq.x+.5)-.5), abs(fract(gq.y+.5)-.5))/8.;
  c += PH0*.06*smoothstep(1.5/R.y,0.,dg);
  // the waveform wrapped around a ring, in the palette colour
  float r = length(p), a = atan(p.y,p.x)/TAU+.5;
  float w = wave(a + fract(T*.1));
  float d = abs(r - .46 - .16*w*(1.+B));
  c += pal(a+C+MELH*.2)*(.004/(d+.004))*(.5+H)*smoothstep(.2,.3,r);
  // twelve lamps around the dial, one per note
  float seg12 = floor(a*12.), ch = chroma((seg12+.5)/12.);
  c += pal(seg12/12.+C)*smoothstep(.014,.005,abs(r-.66))*smoothstep(.36,.22,abs(fract(a*12.)-.5))*(.08+1.6*ch*ch);
  c += pal(C+.5)*.0015/(abs(r-.72-.02*KICK)+.003)*(.3+B);
  return c;
}` },
  // ------------------------------------------------------------ 22
  { name: 'Swarm', blurb: 'Sixty thousand particles on a strange attractor, each tuned to a note', overlay: 'swarm', fb: { zoom: .4, melt: 1.2, swirl: 1.5 }, glsl: `
vec3 scene(vec2 p){
  float r = length(p);
  return pal(r+C+T*.02)*.015/(r+.1)*(.5+B) + pal(C+.5)*.02*fbm3(p*2.+T*.05)*(1.+KICK+NOTE);
}` },
  // ------------------------------------------------------------ 23
  { name: 'Crystal', blurb: 'Voronoi cells, each lit by its own note', fb: { zoom: .2, melt: .5, keep: .7 }, glsl: `
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
  float e = spec(.125+h*.5);                               // this cell's note
  vec3 c = pal(h+C+T*.03)*(.12+1.6*e)*smoothstep(.0,.15,edge);
  c *= .7+.3*sin(sqrt(md)*30.-T*3.);
  c += vec3(1)*smoothstep(.05,0.,edge)*(.4+SNARE*1.5);
  c += pal(h+C+.5)*pow(1.-sqrt(md),6.)*(KICK+.3*BP);
  c += vec3(1)*NOTE*smoothstep(.07,0.,abs(h-MEL))*smoothstep(0.,.1,edge)*.9;   // the melody's own cells flash
  return c*.8;
}` },
  // ------------------------------------------------------------ 24
  { name: 'Julia Bloom V2', blurb: 'Julia Bloom that comes apart and rejoins as something new every time', res: .7, fb: { zoom: .3 }, glsl: `
// The shape the pieces rejoin as, drawn at random for each cycle.
void jshape(float k, out float n, out float sg, out float mir, out float fo, out float ro){
  float blk = floor(k/4.), i = mod(k,4.);
  float m = hash1(blk*3.1+.7) < .5 ? 1. : 3., o = floor(hash1(blk*5.3+1.9)*4.);
  n = 2.+mod(i*m+o, 4.);                                   // two to five arms, a different count each time
  sg = hash1(k*7.7+2.3) < .35 ? -1. : 1.;                  // sometimes the mirrored-angle cousin, which has one more corner
  mir = hash1(k*4.3+5.1) < .3 ? 1. : 0.;                   // sometimes folded down the middle: skulls, masks, moths
  fo = hash1(k*9.1+3.3) < .35 ? .12+.2*hash1(k*2.9+8.) : 0.;   // sometimes the fractal itself folds and grows limbs
  ro = hash1(k*1.7+4.)*TAU;
}
// The brink for a shape: the parameter where it is just about to come apart (for two arms, the edge of the cardioid).
vec2 jedge(float n, float sg, float t){
  float rho = pow(n, -1./(n-1.));
  return rho*vec2(cos(t),sin(t)) - pow(rho,n)*vec2(cos(sg*n*t), sin(sg*n*t));
}
vec3 scene(vec2 p){
  // every sixteen beats the pieces drift apart, and what they rejoin as is something else
  float cyc = BT/16., k = floor(cyc), s = smoothstep(.8,1.,fract(cyc));
  float n1,g1,m1,f1,r1, n2,g2,m2,f2,r2;
  jshape(k,n1,g1,m1,f1,r1); jshape(k+1.,n2,g2,m2,f2,r2);
  float sep = 4.*s*(1.-s);                                 // furthest apart in the middle of the change
  float mir = mix(m1,m2,s), fo = mix(f1,f2,s), deg = mix(n1,n2,s);
  p.x = mix(p.x, abs(p.x), mir);
  p = rot(T*.03+mix(r1,r2,s))*p*(2.5-.35*B-.3*KICK) + mir*vec2(.3*sin(T*.031), .1*cos(T*.027));
  // the melody walks the parameter along the brink, as in Julia Bloom: every pitch is its own shape,
  // and each new note pushes it over the edge for a moment
  float a = T*.05 + 1. + 2.6*(MEL-.5)*MELV + .25*M + .08*sin(BAR*TAU);
  vec2 c = mix(jedge(n1,g1,a), jedge(n2,g2,a), s)*(1.012+.035*NOTE+.4*sep+.8*fo);
  float trap = .45+.35*spec(MELX);
  vec2 z = p; float n = 0., tr = 1e3, ins = 1e3, d2 = dot(z,z);
  for(int i=0;i<48;i++){
    z.x = mix(z.x, abs(z.x), fo);
    float lr = .5*log(d2+1e-12), th = atan(z.y, z.x+1e-9);
    vec2 zn = exp(n1*lr)*vec2(cos(g1*n1*th), sin(g1*n1*th));
    if(s>0.) zn = mix(zn, exp(n2*lr)*vec2(cos(g2*n2*th), sin(g2*n2*th)), s);
    z = zn + c;
    d2 = dot(z,z);
    tr = min(tr, abs(sqrt(d2)-trap));
    ins = min(ins, d2);
    if(d2>16.) break;
    n++;
  }
  vec3 col = vec3(0);
  if(n<47.){
    float sm = n - log(max(log(d2),1e-3))/log(deg) + 4.;
    col = pal(sm*.04+T*.05+C)*pow(clamp(sm/28.,0.,1.),1.6)*1.6;
    col *= .75+1.1*spec(.125+abs(fract(sm*.05)-.5));     // the escape bands light with the notes
    col += vec3(1)*smoothstep(.5,0.,abs(fract(sm*.25-BT*.5)-.5))*.15*(SNARE+.6*NOTE);
  } else {
    // where a shape has filled in: pooled colour, marbled, darker the deeper it sits
    float m = sqrt(ins), pool = fbm3(p*4.+m*3.+vec2(0.,T*.05));
    col = pal(m*2.+pool+C+.35)*pool*pool*(.5+.9*B+.6*NOTE)*smoothstep(0.,.6,m);
  }
  col += pal(tr*2.+C+.5)*.0025/(tr+.01)*(.3+1.2*B+.8*NOTE);
  return col*.7;
}` },
];
