// Song ID: names what is playing. Waits for a few seconds of music, fingerprints
// the most recent audio in a worker, asks the recognition proxy, and tries again
// with a longer excerpt when there is no match. Re-checks after a gap of silence
// (a new song) and every so often while the same song plays on.
//
// Only the fingerprint (spectral peaks) leaves the device, never audio.

const STAGES = [4, 8, 12];           // seconds of music to send on each try
const RETRY_GAP = 30, RETRY_MAX = 6, LONG_GAP = 120, RECHECK = 75, SILENCE = 2;

export class SongID {
  constructor(audio, { onStatus = () => {}, onMatch = () => {}, endpoint = '/api/recognize' } = {}) {
    this.audio = audio; this.onStatus = onStatus; this.onMatch = onMatch; this.endpoint = endpoint;
    this.enabled = false; this.busy = false; this.match = null;
    this.musicSince = 0; this.stage = 0; this.nextTry = 0; this.failures = 0; this.ended = true;
    this.reqId = 0; this.pending = new Map();
    this.worker = new Worker(new URL('./songid-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = e => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); p(e.data); } };
  }

  // Forget the current song and start listening afresh (new source, toggled on).
  reset() {
    this.match = null; this.stage = 0; this.failures = 0; this.nextTry = 0; this.musicSince = 0; this.ended = true;
  }

  get active() { return this.enabled && this.audio.source !== 'demo' && !!this.audio.tap; }

  update(now) {
    if (!this.active || this.busy) return;
    const f = this.audio.features.f;
    if (f.quiet) {
      if (f.quietFor > SILENCE && !this.ended) { this.ended = true; this.stage = 0; this.failures = 0; this.nextTry = 0; }
      this.musicSince = 0;
      return;
    }
    if (!this.musicSince) this.musicSince = now;
    const heard = Math.min(now - this.musicSince, this.audio.tapSeconds);
    if (this.match && !this.ended) {                         // same song still playing: recheck now and then
      if (now >= this.nextTry && heard >= 12) this.identify(12, now);
      return;
    }
    if (this.stage < STAGES.length) {
      if (heard >= STAGES[this.stage] && now >= this.nextTry) this.identify(STAGES[this.stage], now);
      else if (this.stage === 0) this.onStatus('listening', heard);
    } else if (now >= this.nextTry && heard >= 12) this.identify(12, now);
  }

  async identify(seconds, now = performance.now() / 1000, manual = false) {
    if (!this.audio.tap || this.busy) return;
    const avail = this.audio.tapSeconds;
    if (avail < 3) { if (manual) this.onStatus('short'); return; }
    this.busy = true;
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
        const changed = !this.match || this.match.key !== data.match.key;
        this.match = data.match; this.ended = false; this.failures = 0; this.stage = STAGES.length;
        this.nextTry = now + RECHECK;
        this.onMatch(data.match, changed);
        this.onStatus('match', data.match);
      } else {
        this.stage++;
        if (this.stage >= STAGES.length) {
          this.failures++;
          this.nextTry = now + (this.failures > RETRY_MAX ? LONG_GAP : RETRY_GAP);
        } else this.nextTry = now + 0.5;
        if (this.match && !this.ended) this.nextTry = now + RECHECK / 2;
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
