// Fingerprints audio off the main thread so the visuals never stutter.
import { toPcm16k, fingerprint } from './shazam.js';

onmessage = e => {
  const { id, samples, rate } = e.data;
  try {
    const sig = fingerprint(toPcm16k(samples, rate));
    postMessage({ id, ...sig });
  } catch (err) {
    postMessage({ id, error: String(err.message || err) });
  }
};
