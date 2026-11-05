// Album art -> palette. Finds the two most vivid, most different colours in a
// cover and turns them into the ends of the cosine palette the shaders use, so
// the whole picture takes on the record's colours.

export const DEFAULT_PALETTE = { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], k: 1 };

export function paletteFromImage(img) {
  const S = 40, cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  const bins = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gg = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, lum = (r + gg + b) / 765;
    if (lum < 0.08 || lum > 0.96) continue;                // ignore black borders and white backgrounds
    const key = (r >> 5) << 6 | (gg >> 5) << 3 | (b >> 5);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0, w: 0 };
    const w = 0.25 + sat * sat * 2;                       // vivid colours count more
    e.n++; e.w += w; e.r += r * w; e.g += gg * w; e.b += b * w;
    bins.set(key, e);
  }
  const cols = [...bins.values()].filter(e => e.n >= 3)
    .map(e => ({ c: [e.r / e.w / 255, e.g / e.w / 255, e.b / e.w / 255], w: e.w }))
    .sort((x, y) => y.w - x.w);
  if (cols.length < 2) return null;
  const c1 = cols[0].c;
  // the partner: weighty, but as far from the first colour as possible
  let c2 = cols[1].c, best = -1;
  for (const e of cols.slice(1, 12)) {
    const d = Math.hypot(e.c[0] - c1[0], e.c[1] - c1[1], e.c[2] - c1[2]) * Math.sqrt(e.w / cols[0].w);
    if (d > best) { best = d; c2 = e.c; }
  }
  // a grey or black-and-white cover keeps the default rainbow rather than draining the colour
  const sat = c => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
  if (Math.max(sat(c1), sat(c2)) < 0.3) return null;
  const a = c1.map((v, i) => (v + c2[i]) / 2);
  const b = c1.map((v, i) => { const d = (v - c2[i]) / 2; return Math.sign(d || 1) * Math.max(0.16, Math.abs(d)); });
  // keep some brightness so dark covers do not go muddy
  const lum = a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11;
  if (lum < 0.3) { const k = 0.3 / Math.max(lum, 0.02); for (let i = 0; i < 3; i++) a[i] = Math.min(0.8, a[i] * k); }
  return { a, b, k: 0.4, c1, c2 };
}

export function loadArt(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('artwork failed to load'));
    img.src = '/api/art?u=' + encodeURIComponent(url);
  });
}
