// Vercel serverless function: forwards a fingerprint to Shazam's recognition
// service and returns a trimmed-down answer. Needed because the browser cannot
// call that service directly (no CORS) and should not carry its headers.
// Free, but unofficial: if Shazam changes the endpoint this stops working.

const TZ = 'America/New_York';
const UA = 'Dalvik/2.1.0 (Linux; U; Android 10; Pixel 4 Build/QQ3A.200805.001)';
const MAX_BODY = 400_000;

export async function recognizeSignature(uri, samplems, language = 'en') {
  const id = () => crypto.randomUUID().toUpperCase();
  const url = `https://amp.shazam.com/discovery/v5/en/US/android/-/tag/${id()}/${id()}`
    + '?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3';
  const body = JSON.stringify({
    timezone: TZ, signature: { uri, samplems }, timestamp: Date.now(), context: {}, geolocation: {},
  });
  const r = await fetch(url, {
    method: 'POST', body,
    headers: {
      'X-Shazam-Platform': 'ANDROID', 'X-Shazam-AppVersion': '14.1.0', 'Accept': '*/*',
      'Content-Type': 'application/json', 'Accept-Language': language, 'User-Agent': UA,
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('Shazam answered ' + r.status);
  return r.json();
}

// How long the song is, from the free iTunes API (lookup by Apple Music id,
// else a search by title and artist). Lets the visualizer know when the song
// will end instead of polling.
export async function lookupDuration(apple, title, artist) {
  const urls = [];
  if (apple) urls.push('https://itunes.apple.com/lookup?id=' + encodeURIComponent(apple) + '&entity=song');
  if (title) urls.push('https://itunes.apple.com/search?term=' + encodeURIComponent(title + ' ' + (artist || '')) + '&entity=song&limit=1');
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const j = await r.json();
      const ms = j.results?.find(x => x.trackTimeMillis)?.trackTimeMillis;
      if (ms) return Math.round(ms / 1000);
    } catch {}
  }
  return null;
}

// Keep only what the visualizer needs.
export function trim(res) {
  const t = res?.track;
  if (!t || !res.matches?.length) return { match: null, retryms: res?.retryms || 0 };
  const song = t.sections?.find(s => s.type === 'SONG');
  const meta = n => song?.metadata?.find(m => m.title === n)?.text || null;
  const apple = t.hub?.actions?.find(a => a.type === 'applemusicplay')?.id || null;
  return {
    match: {
      title: t.title, artist: t.subtitle, album: meta('Album'), year: meta('Released'),
      genre: t.genres?.primary || null, art: t.images?.coverarthq || t.images?.coverart || null,
      bg: t.images?.background || null, url: t.url || null, key: t.key, isrc: t.isrc || null,
      offset: res.matches[0].offset ?? null, apple,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const { uri, samplems, language } = req.body || {};
  if (typeof uri !== 'string' || !uri.startsWith('data:audio/vnd.shazam.sig;base64,') || uri.length > MAX_BODY
      || !Number.isFinite(samplems) || samplems < 500 || samplems > 20000) {
    res.status(400).json({ error: 'bad signature' }); return;
  }
  try {
    const raw = await recognizeSignature(uri, Math.round(samplems), /^[a-z]{2}(-[A-Z]{2})?$/.test(language || '') ? language : 'en');
    const out = trim(raw);
    if (out.match) out.match.duration = await lookupDuration(out.match.apple, out.match.title, out.match.artist);
    res.status(200).json(out);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
}
