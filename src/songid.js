// Song ID: names what is playing, and is honest about how sure it is.
//
// States (songId.state):
//   off          Song ID is disabled or the source is the demo beat
//   quiet        a real gap of silence; waiting for music
//   listening    music is playing, collecting enough seconds to ask (stage 0: 4 s, 1: 8 s, 2: 12 s)
//   identifying  a fingerprint is on its way to the service
//   known        a song was named and nothing suggests it has changed
//   suspect      clues suggest the song may have changed; a check runs within a few seconds, always
//   unknown      asked and got no answer; keeps listening and retries with a back-off
//
// It does not poll. After a match it knows roughly when the song ends (the
// service says how far in we are, a lookup says how long it is) and checks
// again just after that. Before then only clues trigger a check: a skip gap
// (a drop to the noise floor for a fraction of a second), a long silence, a
// tempo switch, a sustained timbre shift or a key change. A false alarm raises
// the bar for a while. Only the fingerprint (spectral peaks) leaves the device.

const STAGES = [4, 8, 12];           // seconds of music to send on each try
const RETRY_GAP = 30, RETRY_MAX = 6, LONG_GAP = 120, SILENCE = 1.5;
const FALLBACK_LENGTH = 240;         // when the duration is unknown, assume four minutes
const CLUE_WINDOW = 12, MIN_GAP = 20, FALSE_ALARM_COOL = 90;
const DOUBT_DELAY = 4, CHECK_SPACING = 10, AFTER_GAP = 5, FETCH_TIMEOUT = 15000, WORKER_TIMEOUT = 8000;
const WEIGHT = { silence: 9, gap: 4, tempo: 2, timbre: 2, chroma: 2, grid: 2, key: 1 };
const QUIET_CHECK = 90;             // while known, one check this often if anything at all looked different

export class SongID {
  constructor(audio, { onMatch = () => {}, onState = () => {}, onError = () => {}, endpoint = '/api/recognize' } = {}) {
    this.audio = audio; this.onMatch = onMatch; this.onState = onState; this.onError = onError; this.endpoint = endpoint;
    this.enabled = false; this.busy = false; this.match = null;
    this.debug = /[?&]debug/.test(location.search);
    this.reqId = 0; this.pending = new Map();
    this.worker = new Worker(new URL('./songid-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = e => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); p(e.data); } };
    this.state = 'off'; this.stateSince = 0; this.heard = 0;
    this.reset();
  }

  // Forget the current song and start listening afresh (new source, toggled on).
  reset() {
    this.match = null; this.stage = 0; this.failures = 0; this.nextTry = 0; this.musicSince = 0;
    this.expectedEnd = 0; this.clues = []; this.lastTry = 0; this.falseAlarmT = -1e9; this.lastTimbreClue = 0; this.matchT = 0;
    this.gapAt = 0; this.suspectAt = 0; this.anyClueT = 0; this.lastChromaClue = 0; this.hidden = false;
    this.setState(this.active ? 'listening' : 'off');
  }

  get active() { return this.enabled && this.audio.source !== 'demo' && !!this.audio.tap; }
  get need() { return STAGES[Math.min(this.stage, STAGES.length - 1)]; }

  setState(s, now = performance.now() / 1000) {
    if (s === this.state) return;
    if (this.debug) console.log('[songid]', this.state, '->', s, this.match ? '(' + this.match.title + ')' : '');
    this.state = s; this.stateSince = now;
    this.onState(s, now);
  }

  // A hint that the song may have changed. Weights add up within CLUE_WINDOW seconds.
  clue(kind, now = performance.now() / 1000) {
    if (!this.active) return;
    if (this.debug) console.log('[songid] clue', kind);
    if (!this.match) {
      // still searching: a skip means the excerpt would straddle two songs, so start the listen over
      if (kind === 'gap' || kind === 'silence') { this.musicSince = now; this.stage = 0; this.nextTry = 0; }
      return;
    }
    this.clues.push({ t: now, w: WEIGHT[kind] || 1, kind });
    this.anyClueT = now;
    if (kind === 'gap' || kind === 'silence') {
      // a skip: the song on screen is almost certainly gone, so stop showing it right away
      // (the match is kept only to tell "same song" from "new song" when the answer comes)
      this.gapAt = now; this.hidden = true; this.onMatch(null, true);
      this.doubt(now);
    }
    else if (this.state === 'known' && this.evidence(now) >= this.doubtLevel(now)) this.doubt(now);
  }
  // How much it takes to doubt: a medium clue; two of them for a while after a false alarm.
  doubtLevel(now) { return now - this.falseAlarmT < FALSE_ALARM_COOL ? 3 : 2; }
  doubt(now) { this.suspectAt = now; this.setState('suspect', now); }
  // When the owed check will run: a short delay after the doubt began, spaced from the
  // last check, and after a skip only once a few seconds of the new song are in.
  checkAt() {
    return Math.max((this.suspectAt || 0) + DOUBT_DELAY, this.lastTry + CHECK_SPACING, this.gapAt ? this.gapAt + AFTER_GAP : 0);
  }
  evidence(now) {
    this.clues = this.clues.filter(c => now - c.t < CLUE_WINDOW);
    return this.clues.reduce((s, c) => s + c.w, 0);
  }
  // The song is over (silence, or its known length ran out): drop it, listen for the next.
  songEnded(at, next = 'listening') {
    this.match = null; this.expectedEnd = 0; this.stage = 0; this.failures = 0; this.nextTry = 0; this.musicSince = at; this.clues = []; this.hidden = false;
    this.audio.features.resetProfile?.();
    this.onMatch(null, true);
    this.setState(next, at);
  }

  update(now) {
    if (!this.active) { if (this.state !== 'off') this.reset(); return; }
    if (this.state === 'off') this.setState('listening', now);
    const f = this.audio.features.f;
    if (this.busy) return;

    if (f.quiet && f.quietFor > SILENCE) {                 // a real gap: whatever played is over
      if (this.match) this.songEnded(now, 'quiet');
      this.musicSince = 0;
      this.setState('quiet', now);
      return;
    }
    if (!this.musicSince) this.musicSince = now;
    this.heard = Math.min(now - this.musicSince, this.audio.tapSeconds);
    const heard = this.heard;
    if (this.debug && now - (this.debugT || 0) > 2) {
      this.debugT = now;
      console.log('[songid]', this.state, { heard: +heard.toFixed(1), stage: this.stage, nextTry: +Math.max(0, this.nextTry - now).toFixed(1), rms: +(this.audio.rms || 0).toFixed(4), tap: +this.audio.tapSeconds.toFixed(1), evidence: this.evidence(now), song: this.match?.title || null });
    }

    if (this.match) {
      if (this.expectedEnd && now > this.expectedEnd) { this.songEnded(this.expectedEnd); return; }
      if (f.shiftFor > 3 && now - this.lastTimbreClue > MIN_GAP) { this.lastTimbreClue = now; this.clue('timbre', now); }
      if (f.chromaShiftFor > 3 && now - this.lastChromaClue > MIN_GAP) { this.lastChromaClue = now; this.clue('chroma', now); }
      if (this.state === 'known' && this.evidence(now) >= this.doubtLevel(now)) this.doubt(now);
      // a crossfade between similar songs can slip past every clue: if anything at all looked
      // different since the last check and that was a while ago, one quiet check
      if (this.state === 'known' && now - this.lastTry > QUIET_CHECK && this.anyClueT > this.lastTry) this.doubt(now);
      if (this.state === 'suspect' && now >= this.checkAt() && heard >= 5) {
        // doubt is a promise to check: send the newest audio (only what came after a skip)
        const since = this.gapAt ? now - this.gapAt : 99;
        this.clues = [];
        this.identify(Math.min(8, since, heard), now, false, 'change');
      }
      return;
    }
    if (this.state === 'quiet') this.setState('listening', now);
    if (this.stage < STAGES.length) {
      if (heard >= STAGES[this.stage] && now >= this.nextTry) this.identify(STAGES[this.stage], now);
    } else if (now >= this.nextTry && heard >= 12) this.identify(12, now);
  }

  async identify(seconds, now = performance.now() / 1000, manual = false, reason = 'new') {
    if (!this.audio.tap || this.busy) return;
    const avail = this.audio.tapSeconds;
    if (avail < 3) { if (manual) this.onError('Not enough audio yet'); return; }
    this.busy = true; this.lastTry = now;
    const before = this.state;
    this.setState('identifying', now);
    try {
      const samples = this.audio.lastSeconds(Math.min(seconds, avail));
      const sig = await this.fingerprint(samples);
      if (sig.error) throw new Error(sig.error);
      const r = await fetch(this.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: sig.uri, samplems: sig.samplems, language: navigator.language?.slice(0, 5) }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'service ' + r.status);
      const data = await r.json();
      const t = performance.now() / 1000;
      const fresh = this.clues.filter(c => c.t > now);               // clues that arrived while we were asking still count
      if (data.match) {
        const m = data.match, changed = !this.match || this.match.key !== m.key;
        if (!changed && reason === 'change') this.falseAlarmT = t;     // same song: the clues lied
        this.match = m; this.failures = 0; this.stage = STAGES.length; this.clues = fresh; this.suspectAt = 0; this.hidden = false;
        if (!fresh.some(c => c.kind === 'gap' || c.kind === 'silence')) this.gapAt = 0;
        if (changed) { this.matchT = t; this.audio.features.resetProfile?.(); }
        // when does it end? the offset is where the excerpt started, so add the excerpt length
        const into = (m.offset ?? 0) + Math.min(seconds, avail);
        const length = m.duration || FALLBACK_LENGTH;
        this.expectedEnd = t + Math.max(15, length - into) + 2;
        this.onMatch(m, changed);
        this.setState('known', t);
      } else if (this.match) {
        // a change was suspected and the check found nothing: stop claiming the old song
        this.match = null; this.expectedEnd = 0; this.clues = []; this.gapAt = 0; this.suspectAt = 0; this.hidden = false; this.onMatch(null, true);
        this.stage = 1; this.musicSince = t - Math.min(avail, 6); this.nextTry = t + 2;
        this.setState('unknown', t);
      } else {
        this.stage++;
        if (this.stage >= STAGES.length) {
          this.failures++;
          this.nextTry = t + (this.failures > RETRY_MAX ? LONG_GAP : RETRY_GAP);
          this.setState('unknown', t);
        } else { this.nextTry = t + 0.5; this.setState('listening', t); }
      }
    } catch (e) {
      const t = performance.now() / 1000;
      this.nextTry = t + 60; this.lastTry = t + 30; this.clues = [];          // back off, and do not re-doubt at once
      if (this.debug) console.warn('[songid] error', e);
      this.onError(e.name === 'TimeoutError' ? 'Song ID timed out' : e.message);
      this.setState(this.match ? 'known' : before === 'identifying' ? 'listening' : before, t);
    } finally {
      this.busy = false;
    }
  }

  fingerprint(samples) {
    return new Promise(res => {
      const id = ++this.reqId;
      this.pending.set(id, res);
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); res({ error: 'fingerprint timed out' }); } }, WORKER_TIMEOUT);
      this.worker.postMessage({ id, samples, rate: this.audio.tapRate }, [samples.buffer]);
    });
  }
}
