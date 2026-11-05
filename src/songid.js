// Song ID: names what is playing. Waits for a few seconds of music, fingerprints
// the most recent audio in a worker, asks the recognition proxy, and tries again
// with a longer excerpt when there is no match.
//
// It does not poll. After a match it knows roughly when the song ends (the
// service says how far in we are, the lookup says how long it is) and checks
// again just after that. Before then it only acts on clues that the song has
// changed: a gap of silence (strong), a new tempo (medium), a sustained shift in
// timbre (medium), a new key (weak). Enough clues inside a short window trigger
// one check; a false alarm raises the bar for a while.
//
// Only the fingerprint (spectral peaks) leaves the device, never audio.

const STAGES = [4, 8, 12];           // seconds of music to send on each try
const RETRY_GAP = 30, RETRY_MAX = 6, LONG_GAP = 120, SILENCE = 1.5;
const FALLBACK_LENGTH = 240;         // when the duration is unknown, assume four minutes
const CLUE_WINDOW = 12, MIN_GAP = 20, FALSE_ALARM_COOL = 90;
const WEIGHT = { silence: 9, tempo: 2, timbre: 2, key: 1 };

export class SongID {
  constructor(audio, { onStatus = () => {}, onMatch = () => {}, endpoint = '/api/recognize' } = {}) {
    this.audio = audio; this.onStatus = onStatus; this.onMatch = onMatch; this.endpoint = endpoint;
    this.enabled = false; this.busy = false; this.match = null;
    this.reqId = 0; this.pending = new Map();
    this.worker = new Worker(new URL('./songid-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = e => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); p(e.data); } };
    this.reset();
  }

  // Forget the current song and start listening afresh (new source, toggled on).
  reset() {
    this.match = null; this.stage = 0; this.failures = 0; this.nextTry = 0; this.musicSince = 0; this.ended = true;
    this.expectedEnd = 0; this.clues = []; this.lastTry = 0; this.falseAlarmT = -1e9; this.lastTimbreClue = 0; this.matchT = 0;
  }

  get active() { return this.enabled && this.audio.source !== 'demo' && !!this.audio.tap; }

  // A hint that the song may have changed. Weights add up within CLUE_WINDOW seconds.
  clue(kind, now = performance.now() / 1000) {
    if (!this.match || this.ended) return;
    this.clues.push({ t: now, w: WEIGHT[kind] || 1, kind });
  }
  evidence(now) {
    this.clues = this.clues.filter(c => now - c.t < CLUE_WINDOW);
    return this.clues.reduce((s, c) => s + c.w, 0);
  }
  // How much evidence it takes: more right after a match, much more after a false alarm.
  needed(now) {
    let n = 3;
    if (now - this.matchT < 45) n = 4;
    if (now - this.falseAlarmT < FALSE_ALARM_COOL) n = 5;
    return n;
  }
  songEnded(at) {
    this.ended = true; this.stage = 0; this.failures = 0; this.nextTry = 0; this.musicSince = at; this.clues = [];
    this.audio.features.resetProfile?.();
  }

  update(now) {
    if (!this.active || this.busy) return;
    const f = this.audio.features.f;
    if (f.quiet) {
      if (f.quietFor > SILENCE && !this.ended) this.songEnded(now);
      if (this.ended) this.musicSince = 0;
      return;
    }
    if (!this.musicSince) this.musicSince = now;
    const heard = Math.min(now - this.musicSince, this.audio.tapSeconds);

    if (this.match && !this.ended) {
      if (this.expectedEnd && now > this.expectedEnd) { this.songEnded(this.expectedEnd); return; }
      if (f.shiftFor > 3 && now - this.lastTimbreClue > MIN_GAP) { this.lastTimbreClue = now; this.clue('timbre', now); }
      if (this.evidence(now) >= this.needed(now) && now - this.lastTry > MIN_GAP && heard >= 6) {
        this.clues = [];
        this.identify(8, now, false, 'change');
      }
      return;
    }
    if (this.stage < STAGES.length) {
      if (heard >= STAGES[this.stage] && now >= this.nextTry) this.identify(STAGES[this.stage], now);
      else if (this.stage === 0) this.onStatus('listening', heard);
    } else if (now >= this.nextTry && heard >= 12) this.identify(12, now);
  }

  async identify(seconds, now = performance.now() / 1000, manual = false, reason = 'new') {
    if (!this.audio.tap || this.busy) return;
    const avail = this.audio.tapSeconds;
    if (avail < 3) { if (manual) this.onStatus('short'); return; }
    this.busy = true; this.lastTry = now;
    this.onStatus('sending', Math.min(seconds, avail));
    try {
      const samples = this.audio.lastSeconds(Math.min(seconds, avail));
      const sig = await this.fingerprint(samples);
      if (sig.error) throw new Error(sig.error);
      const r = await fetch(this.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: sig.uri, samplems: sig.samplems, language: navigator.language?.slice(0, 5) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'service ' + r.status);
      const data = await r.json();
      if (data.match) {
        const m = data.match, changed = !this.match || this.match.key !== m.key;
        if (!changed && reason === 'change') this.falseAlarmT = now;     // same song: the clues lied
        this.match = m; this.ended = false; this.failures = 0; this.stage = STAGES.length; this.clues = [];
        if (changed) { this.matchT = now; this.audio.features.resetProfile?.(); }
        // when does it end? the offset is where the excerpt started, so add the excerpt length
        const into = (m.offset ?? 0) + Math.min(seconds, avail);
        const length = m.duration || FALLBACK_LENGTH;
        this.expectedEnd = now + Math.max(15, length - into) + 2;
        this.onMatch(m, changed);
        this.onStatus('match', m);
      } else {
        if (this.match && !this.ended) {                                  // mid-song check found nothing: wait for the end
          this.nextTry = now + MIN_GAP;
          if (reason === 'change') this.falseAlarmT = now;
        } else {
          this.stage++;
          if (this.stage >= STAGES.length) {
            this.failures++;
            this.nextTry = now + (this.failures > RETRY_MAX ? LONG_GAP : RETRY_GAP);
          } else this.nextTry = now + 0.5;
        }
        this.onStatus('nomatch', this.stage);
      }
    } catch (e) {
      this.nextTry = now + 60;
      this.onStatus('error', e.message);
    } finally {
      this.busy = false;
    }
  }

  fingerprint(samples) {
    return new Promise(res => {
      const id = ++this.reqId;
      this.pending.set(id, res);
      this.worker.postMessage({ id, samples, rate: this.audio.tapRate }, [samples.buffer]);
    });
  }
}
