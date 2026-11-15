// Vercel serverless function: looks a named song up on LRCLIB (lrclib.net, a
// free and open lyrics database, no key) and returns its lyrics, time-synced
// when LRCLIB has them. Nothing is stored here; the words pass straight through.
//
//   GET /api/lyrics?title=...&artist=...&duration=<seconds, optional>
//   -> { lyrics: { synced, plain, duration } | null, alts: [{ synced, duration }] }
//
// `synced` is LRC text ("[mm:ss.xx] line"), `plain` is only sent when there is
// no synced version. `alts` are synced versions of other lengths (a radio edit
// beside the album cut): the recognition service can report the position on
// either one's timeline, and the visualizer uses them to tell which.
// The Mac app answers this same route natively (wallpaper/Sources/Engine.swift);
// keep the two in step.

const BASE = 'https://lrclib.net/api/search';
const UA = 'Phosphene visualizer';
const MAX_ALTS = 4, OTHER_LENGTH = 4;        // seconds apart before a version counts as a different cut

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// "Song (feat. X) - Remastered 2011" -> "Song"
export const cleanTitle = s => String(s || '').replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim();
const firstArtist = s => String(s || '').split(/,|&|;|\s+(?:feat\.?|ft\.?|featuring|with|x)\s+/i)[0].trim();

async function search(title, artist) {
  const r = await fetch(BASE + '?' + new URLSearchParams({ track_name: title, artist_name: artist }), {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('LRCLIB answered ' + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

// The best version for this song, and synced versions of other lengths.
export function pick(results, title, duration) {
  const want = norm(cleanTitle(title)) || norm(title);
  const same = results.filter(r => { const t = norm(cleanTitle(r.trackName)) || norm(r.trackName); return t && (t === want || t.startsWith(want) || want.startsWith(t)); });
  const far = r => duration && r.duration ? Math.abs(r.duration - duration) : 0;
  const byLength = list => list.map((r, i) => [r, i]).sort((a, b) => far(a[0]) - far(b[0]) || a[1] - b[1]).map(x => x[0]);
  const synced = byLength(same.filter(r => r.syncedLyrics && !r.instrumental));
  if (synced.length) {
    const best = synced[0], alts = [], seen = new Set([best.syncedLyrics]);
    for (const r of synced) {
      if (alts.length >= MAX_ALTS) break;
      if (!r.duration || !best.duration || Math.abs(r.duration - best.duration) <= OTHER_LENGTH || seen.has(r.syncedLyrics)) continue;
      seen.add(r.syncedLyrics); alts.push({ synced: r.syncedLyrics, duration: r.duration });
    }
    return { lyrics: { synced: best.syncedLyrics, plain: null, duration: best.duration || null }, alts };
  }
  const plain = byLength(same.filter(r => r.plainLyrics && !r.instrumental))[0];
  return { lyrics: plain ? { synced: null, plain: plain.plainLyrics, duration: plain.duration || null } : null, alts: [] };
}

export async function findLyrics(title, artist, duration) {
  let out = pick(await search(title, artist), title, duration);
  const t2 = cleanTitle(title), a2 = firstArtist(artist);
  if (!out.lyrics && (t2 !== title || a2 !== artist) && t2) out = pick(await search(t2, a2), title, duration);
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const title = String(req.query?.title || '').trim(), artist = String(req.query?.artist || '').trim();
  const duration = Math.round(+req.query?.duration) || 0;
  if (!title || title.length > 200 || artist.length > 200 || duration < 0 || duration > 7200) { res.status(400).json({ error: 'bad song' }); return; }
  try {
    const out = await findLyrics(title, artist, duration);
    res.setHeader('Cache-Control', out.lyrics ? 'public, max-age=3600, s-maxage=86400' : 'public, max-age=300, s-maxage=600');
    res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
}
