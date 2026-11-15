// The lyrics layer: once Song ID has named the song, its words play over the
// picture and behind the interface, the same way in every scene.
//
// LyricSync fetches the lyrics (/api/lyrics, which asks LRCLIB) and keeps time.
// Song ID's match says where the song was when its excerpt ended (match.pos at
// match.at); the position now is that plus the time since. Synced lyrics give
// each line its second; plain ones are paced evenly across the song.
//
// LyricLayer is plain type over the canvas, in the manner of a music player's
// lyrics view: the line being sung in near-white, the one before and the one
// after smaller and dimmer, sliding up as the song moves on. Nothing in it
// takes the pointer, and only transforms and opacity ever animate.
//
// No lyric text is kept anywhere but memory.

const LEAD = 0.3;                  // a line starts to appear this long before it is sung
const HOLD = 14;                   // and never outstays this when no next line takes its place (a short line leaves sooner)
const KEEP = 8;                    // songs remembered, so a re-check of the same song costs nothing
const NEIGHBOUR = 12;              // the lines before and after are shown only when they are this close in time
const NEAR = 2.5;                  // a new match this close to where we thought we were is the same timeline

// "[01:02.34] words" (several stamps may share a line) -> [{ t, text }], sorted. Blank lines mark a pause.
export function parseLrc(lrc) {
  const out = [];
  for (const row of String(lrc || '').split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = row.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:\.\d+)?>/g, '').replace(/\s+/g, ' ').trim();
    for (const m of stamps) out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(':', '.')), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

// Plain lyrics have no times: spread the lines evenly, leaving a little room for an intro and an outro.
export function paceEvenly(plain, duration) {
  const rows = String(plain || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^\[.*\]$/.test(s));
  if (!rows.length || !(duration > 20)) return [];
  const from = duration * 0.07, span = duration * 0.88 / rows.length;
  return rows.map((text, i) => ({ t: from + i * span, text }));
}

const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
// the last line that has started by t (-1 before the first)
function lineAt(lines, t) {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= t) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at;
}
// Do two versions of the lyrics, each read at its own position, show the same moment of the song?
// The same line with the same neighbours, the same distance into it. A line repeated over and over proves nothing.
function sameMoment(A, ta, B, tb) {
  const i = lineAt(A, ta), j = lineAt(B, tb);
  if (i < 1 || j < 1 || i >= A.length - 1 || j >= B.length - 1) return false;
  const a = [A[i - 1], A[i], A[i + 1]].map(l => norm(l.text)), b = [B[j - 1], B[j], B[j + 1]].map(l => norm(l.text));
  if (!a[1] || a[1] !== b[1] || a[0] !== b[0] || a[2] !== b[2] || (a[0] === a[1] && a[1] === a[2])) return false;
  return Math.abs((ta - A[i].t) - (tb - B[j].t)) < 1;
}

export class LyricSync {
  constructor({ endpoint = '/api/lyrics' } = {}) {
    this.endpoint = endpoint; this.songs = new Map(); this.song = null; this.entry = null;
  }

  // The song on screen (Song ID's match), or null. Cheap to call every frame.
  track(song) {
    if (song === this.song) return;
    this.song = song; this.entry = null;
    if (!song || !song.key || !song.title) return;
    let e = this.songs.get(song.key);
    if (!e) {
      e = { lines: [], alts: [], synced: false, state: 'loading', anchor: null, cands: null, tryAt: 0, triedAt: performance.now() / 1000 };
      this.songs.set(song.key, e);
      if (this.songs.size > KEEP) this.songs.delete(this.songs.keys().next().value);
      this.load(song, e);
    } else if (e.state === 'failed' && performance.now() / 1000 - e.triedAt > 60) { e.state = 'loading'; e.triedAt = performance.now() / 1000; this.load(song, e); }
    this.entry = e;
    this.anchor(song, e);
  }

  async load(song, e) {
    try {
      const q = new URLSearchParams({ title: song.title, artist: song.artist || '' });
      if (song.duration) q.set('duration', Math.round(song.duration));
      const r = await fetch(this.endpoint + '?' + q, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('lyrics ' + r.status);
      const data = await r.json(), ly = data.lyrics;
      if (ly && ly.synced) { e.lines = parseLrc(ly.synced); e.synced = true; e.alts = (data.alts || []).map(a => parseLrc(a.synced)).filter(a => a.length > 3); }
      else if (ly && ly.plain) e.lines = paceEvenly(ly.plain, song.duration || ly.duration);
      e.state = e.lines.length ? 'ready' : 'none';
    } catch { e.state = 'failed'; }
  }

  // Take the match's position. A re-check of a song we are already following keeps its timeline:
  // of the positions the service offers, the one nearest where we thought we were.
  anchor(m, e) {
    if (!Number.isFinite(m.pos) || !Number.isFinite(m.at)) { e.anchor = null; e.cands = null; return; }
    if (e.from === m) return;
    e.from = m;
    const cands = [m.pos, ...(m.alt || [])];
    if (e.anchor) {
      const want = e.anchor.pos + (m.at - e.anchor.at);
      const best = cands.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a);
      if (Math.abs(best - want) < NEAR) { e.anchor = { at: m.at, pos: best }; return; }
    }
    e.anchor = { at: m.at, pos: cands[0] };
    e.cands = cands.length > 1 ? cands : null; e.candsAt = m.at; e.tryAt = 0; e.tries = 0;
  }

  // The same audio can match two recordings (an album cut and a radio edit) whose timelines differ by
  // the length of an intro, and the service may report either. When the lyrics exist for both lengths,
  // the right pairing is the one where both versions show the same line: find it, and keep our version's position.
  settle(e, now) {
    if (!e.cands || now < e.tryAt) return;
    e.tryAt = now + 1;
    if (e.state === 'loading') return;
    if (!e.alts.length || ++e.tries > 90) { e.cands = null; return; }      // nothing to compare with, or no luck: stay with the first
    const dt = now - e.candsAt;
    for (const ci of e.cands) for (const cj of e.cands) {
      if (Math.abs(ci - cj) < 1.5) continue;
      if (e.alts.some(alt => sameMoment(e.lines, ci + dt, alt, cj + dt))) { e.anchor = { at: e.candsAt, pos: ci }; e.cands = null; return; }
    }
  }

  // Seconds into the song, or null when that is not known.
  position(now) {
    const a = this.entry && this.entry.anchor;
    return a ? a.pos + (now - a.at) : null;
  }

  // What to show now: { k, prev, cur, next }, the line being sung with its neighbours, or null for
  // nothing (between lines, an instrumental stretch, no lyrics, no position).
  at(now) {
    const e = this.entry;
    if (!e || e.state !== 'ready' || !e.anchor) return null;
    if (e.synced) this.settle(e, now);
    const pos = this.position(now) + LEAD, L = e.lines, i = lineAt(L, pos);
    if (i < 0) return null;
    const l = L[i], next = L[i + 1], before = L[i - 1];
    if (!l.text || pos >= Math.min(next ? next.t : Infinity, l.t + Math.min(HOLD, 4 + l.text.length * 0.22))) return null;
    return { k: i, cur: l.text, prev: before && l.t - before.t < NEIGHBOUR ? before.text : '', next: next && next.t - pos < NEIGHBOUR ? next.text : '' };
  }

  // For ?debug and the wallpaper's status file: where it thinks it is, never the words.
  info(now) {
    const e = this.entry;
    return e ? { state: e.state, synced: e.synced, lines: e.lines.length, alts: e.alts.length, line: e.state === 'ready' && e.anchor ? lineAt(e.lines, this.position(now) + LEAD) : -1,
      pos: e.anchor ? +this.position(now).toFixed(2) : null, settled: !e.cands } : { state: 'idle' };
  }
}

// ---------- The layer ----------
const SMALL = 0.74;                // the neighbours' size beside the line being sung
const GAP = 0.3;                   // space between lines, as a share of one row of the line being sung

export class LyricLayer {
  constructor(root) {
    this.root = root; this.box = root.querySelector('.ly-box');
    this.els = new Map();          // line number -> its element
    this.key = ''; this.on = false; this.cur = -1; this.fade = -1; this.pulse = 1;
    addEventListener('resize', () => { for (const el of this.els.values()) el.h = 0; this.place(); });
  }

  // { k, prev, cur, next } from LyricSync (or from the leading display), or null for nothing.
  show(ly) {
    const key = ly && ly.cur ? [ly.k, ly.cur, ly.prev, ly.next].join('|') : '';
    if (key === this.key) return;
    this.key = key;
    if (!key) { this.on = false; this.root.classList.remove('on'); return; }   // the block fades out as it stands
    const want = new Map([[ly.k - 1, ly.prev], [ly.k, ly.cur], [ly.k + 1, ly.next]].filter(x => x[1]));
    const fresh = !this.on;
    for (const [k, el] of this.els) {
      if (!fresh && want.get(k) === el.text) continue;
      this.els.delete(k);
      if (fresh) { el.remove(); continue; }                // nothing was showing, so the old lines need no exit
      el.y += (k < ly.k ? -0.5 : 0.5) * el.h;              // a line that has been sung leaves upward
      el.dataset.at = 'gone'; this.put(el);
      setTimeout(() => el.remove(), 600);
    }
    this.cur = ly.k;
    for (const [k, text] of want) {
      if (this.els.has(k)) continue;
      const el = document.createElement('div');
      el.className = 'ly-line' + (text.length > 110 ? ' ly-xlong' : text.length > 64 ? ' ly-long' : '');
      el.textContent = String(text).slice(0, 240); el.text = text; el.h = 0; el.y = 0; el.fresh = true;
      this.box.appendChild(el); this.els.set(k, el);
    }
    this.place();
    this.on = true; this.root.classList.add('on');
  }

  // Stack the lines around the one being sung, whose middle sits on the anchor.
  place() {
    const cur = this.els.get(this.cur);
    if (!cur) return;
    const H = el => el.h || (el.h = el.offsetHeight);
    const row = parseFloat(getComputedStyle(cur).lineHeight) || H(cur), gap = row * GAP;
    const set = (el, mid, at) => {
      const y = mid - H(el) / 2;
      if (el.fresh) {                                      // a new line starts unseen, a little below where it is going
        el.fresh = false; el.y = y + row * 0.5; el.dataset.at = 'gone'; this.put(el);
        void el.offsetWidth;
      }
      el.y = y; el.dataset.at = at; this.put(el);
    };
    const prev = this.els.get(this.cur - 1), next = this.els.get(this.cur + 1);
    set(cur, 0, 'cur');
    if (prev) set(prev, -(H(cur) / 2 + gap + H(prev) * SMALL / 2), 'prev');
    if (next) set(next, H(cur) / 2 + gap + H(next) * SMALL / 2, 'next');
  }
  put(el) { el.style.transform = `translate(-50%, ${el.y.toFixed(1)}px) scale(${el.dataset.at === 'cur' ? 1 : SMALL})`; }

  // Every frame: how much of the picture is there at all (the wallpaper melts in and out), and a
  // very slight swell on the beat. A style is written only when its value changes.
  frame(present, beat) {
    const fade = Math.round(Math.max(0, Math.min(1, present)) * 50) / 50;
    if (fade !== this.fade) { this.fade = fade; this.root.style.opacity = fade; }
    const pulse = this.on ? 1 + Math.round(12 * Math.max(0, Math.min(1, beat))) / 1000 : 1;
    if (pulse !== this.pulse) { this.pulse = pulse; this.box.style.transform = `scale(${pulse})`; }
  }
}
