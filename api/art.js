// Vercel serverless function: relays album artwork from Shazam's image hosts
// with CORS headers, so the browser can read its pixels for the palette and
// upload it as a texture. Only those hosts are allowed.

const HOSTS = /^(([a-z0-9-]+\.)*mzstatic\.com|images\.shazam\.com|([a-z0-9-]+\.)*shazamcdn\.com|is[0-9]-ssl\.mzstatic\.com)$/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = req.query?.u;
  let url;
  try { url = new URL(u); } catch { res.status(400).send('bad url'); return; }
  if (url.protocol !== 'https:' || !HOSTS.test(url.hostname)) { res.status(400).send('host not allowed'); return; }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) { res.status(r.status).send('upstream ' + r.status); return; }
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) { res.status(400).send('not an image'); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_000_000) { res.status(413).send('too large'); return; }
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).send(String(e.message || e).slice(0, 200));
  }
}
