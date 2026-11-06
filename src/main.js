import { SCENES } from './shaders.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { ECG } from './ecg.js';
import { SongID } from './songid.js';
import { paletteFromImage, loadArt, DEFAULT_PALETTE } from './palette.js';

const $ = id => document.getElementById(id);
const body = document.body;
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches;
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('phosphene.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('phosphene.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- Core ----------
let renderer;
try {
  renderer = new Renderer($('gl'), { mobile });
} catch (e) {
  $('fatal').style.display = 'grid';
  $('fatal').textContent = 'Phosphene needs WebGL2. Try a recent Chrome, Edge, Arc or Safari. (' + e.message + ')';
  throw e;
}
const audio = new AudioEngine($('audio'));
const ecg = new ECG();
addEventListener('resize', () => renderer.resize());

// Everything the shaders read, by uniform name.
const u = {
  T: 0, B: 0, M: 0, H: 0, BEAT: 0, K: 8, Z: 0, C: 0, TR: 0.78,
  KICK: 0, SNARE: 0, HAT: 0, PH: 0, BAR: 0, BT: 0, BPM: 0, EN: 0, DROP: 0, BP: 0,
  GOO: 0.5, IRID: 0.4, PIT: 0, PK: 1, ARTC: 0, PA: [0.5, 0.5, 0.5], PB: [0.5, 0.5, 0.5], scene: 0,
};
u.C = params.has('colors') ? +params.get('colors') || 0 : Math.random();
let auto = params.get('auto') !== '0', beatsInScene = 0, sceneStart = 0, trailsSetting = 0.4;
let gooSetting = params.has('goo') ? Math.max(0, Math.min(1, +params.get('goo'))) : store.get('goo', 0.5);
let keyColors = store.get('keycolors', true), cTarget = null;
let last = performance.now() / 1000;
const palette = { cur: { ...DEFAULT_PALETTE }, to: { ...DEFAULT_PALETTE } };

// ---------- Toast ----------
let toastTimer;
function toast(title, sub = '', ms = 2200) {
  $('toastTitle').textContent = title; $('toastSub').textContent = sub;
  $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), ms);
}

// ---------- Now playing pill (top right) ----------
// Rendered from Song ID's state every frame, so it never claims more than it knows:
// Searching (listening / identifying), the song (a few seconds when named and every
// 30 s after), the song dimmed with "might have changed" while clues pile up,
// "Unknown song" when a check comes back empty.
const NP_EVERY = 30, NP_FOR = 4.5;
let npShownAt = -1e9, npNext = 0, npKey = '';
if (params.get('np') === '1') body.classList.add('np-on');
const np = $('np');
function npRender(now) {
  const st = songId.state;
  let show = false, title = '', sub = '', cls = '';
  if (st === 'listening') {
    show = true; cls = 'searching'; title = 'Searching…';
    sub = songId.stage === 0 ? 'listening · ' + Math.ceil(Math.max(0, songId.need - songId.heard)) + ' s' : 'no match yet · listening longer';
  } else if (st === 'identifying') {
    show = true;
    if (song) { title = song.title; sub = 'checking…'; cls = 'suspect'; }
    else { title = 'Searching…'; sub = 'identifying'; cls = 'searching'; }
  } else if (st === 'suspect') {
    show = true; cls = 'suspect'; title = song ? song.title : 'Searching…';
    const inS = Math.ceil(songId.checkAt() - now);
    sub = inS > 0 ? 'might have changed · checking in ' + inS + ' s' : 'might have changed · checking';
  } else if (st === 'unknown') {
    cls = 'searching'; title = 'Unknown song';
    const wait = songId.nextTry - now;
    sub = wait > 3 ? 'trying again in ' + Math.ceil(wait) + ' s' : 'listening…';
    show = now - songId.stateSince < NP_FOR || wait <= 3;
  } else if (st === 'known' && song) {
    title = song.title; const line = musicLine(); sub = song.artist + (line ? ' · ' + line : '');
    const key = 'known:' + song.key;
    if (npKey !== key) { npKey = key; npShownAt = now; npNext = now + NP_EVERY; }          // just named (or confirmed): show now
    else if (now >= npNext) { npShownAt = now; npNext = now + NP_EVERY; }
    show = now - npShownAt < NP_FOR;
  }
  if (st !== 'known') npKey = st;
  if (show) {
    if ($('npTitle').textContent !== title) $('npTitle').textContent = title;
    if ($('npSub').textContent !== sub) $('npSub').textContent = sub;
  }
  np.classList.toggle('show', show);
  np.classList.toggle('searching', cls === 'searching');
  np.classList.toggle('suspect', cls === 'suspect');
}

// ---------- Scenes ----------
const num = i => String(i + 1).padStart(2, '0');
const dots = $('dots');
SCENES.forEach((s, i) => {
  const d = document.createElement('button');
  d.title = num(i) + ' ' + s.name; d.onclick = () => setScene(i);
  dots.appendChild(d);
});
function setScene(i, { quiet = false } = {}) {
  u.scene = (i + SCENES.length) % SCENES.length;
  beatsInScene = 0; sceneStart = last; pendingSwitch = false;
  $('sceneName').textContent = SCENES[u.scene].name;
  $('sceneNum').textContent = num(u.scene);
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === u.scene));
  body.classList.toggle('scene-monitor', !!SCENES[u.scene].monitor);
  renderer.prewarm((u.scene + 1) % SCENES.length);
  if (!quiet) toast(num(u.scene) + '   ' + SCENES[u.scene].name, SCENES[u.scene].blurb);
}
function nextLook() {
  setScene(u.scene + 1);
  setSymmetry([4, 6, 8, 10, 12][Math.random() * 5 | 0]);
  u.C = cTarget !== null ? cTarget + (Math.random() - 0.5) * 0.2 : Math.random();
}
function setAuto(on) {
  auto = on;
  $('autoBtn').classList.toggle('on', on);
  $('autoSwitch').classList.toggle('on', on);
  $('autoSwitch').setAttribute('aria-checked', on);
}
function setSymmetry(k) { u.K = Math.max(2, Math.min(16, k)); $('symVal').textContent = u.K; }
function shiftColors() { u.C += 0.17; if (cTarget !== null) cTarget += 0.17; }

// Scene changes land on a downbeat once the scene has had its eight bars.
let pendingSwitch = false;
const F = () => audio.features.f;
audio.onBeat = now => {
  ecg.beat(now, audio.level.b);
  if (np.classList.contains('show') && songId.state === 'known') { np.classList.remove('beat'); void np.offsetWidth; np.classList.add('beat'); }
  if (SCENES[u.scene].monitor) {
    $('heart').classList.remove('beat'); void $('heart').offsetWidth; $('heart').classList.add('beat');
  }
  beatsInScene++;
  if (Math.random() < 0.1) { u.C += 0.15 + Math.random() * 0.3; if (cTarget !== null) cTarget = u.C; }
  if (auto && (beatsInScene >= 48 || now - sceneStart > 45)) {
    if (F().locked) pendingSwitch = true; else nextLook();
  }
};
audio.features.onBeat = (n, downbeat, now) => {
  if (pendingSwitch && downbeat) nextLook();
  else if (auto && downbeat && now - sceneStart > 70) nextLook();
};
audio.features.onDrop = now => {
  if (auto && now - sceneStart > 12) nextLook();
  u.C += 0.33; if (cTarget !== null) cTarget = u.C;
};
audio.features.onKey = (name, hueV) => {
  songId.clue('key');
  if (!keyColors) return;
  cTarget = Math.floor(u.C) + hueV;
  updateNow();
};
audio.features.onTempoChange = () => songId.clue('tempo');
audio.features.onGap = (len, now) => songId.clue('gap', now);
audio.features.onGrid = (jump, now) => songId.clue('grid', now);

// ---------- Sources ----------
const SOURCE_TEXT = {
  demo: ['Demo beat', 'Built-in and silent'],
  tab:  ['Browser tab', 'Live, straight from the source'],
  mic:  ['Microphone', 'Listening out loud'],
};
let song = null;
function musicLine() {
  const f = F(), bits = [];
  if (f.locked && f.bpm) bits.push(Math.round(f.bpm) + ' BPM');
  if (f.key >= 0 && f.keyConf > 0.2) bits.push(f.keyName);
  return bits.join(' · ');
}
function updateNow() {
  const s = audio.source;
  body.classList.remove('src-demo', 'src-tab', 'src-mic', 'src-file');
  body.classList.add('src-' + s);
  const [title, sub] = s === 'file' ? [audio.fileName, 'Local file'] : SOURCE_TEXT[s];
  $('nowTitle').textContent = title; $('nowSub').textContent = sub;
}
async function startSource(kind) {
  try {
    if (kind === 'tab') await audio.useTab();
    else if (kind === 'mic') await audio.useMic();
    else if (kind === 'file') { $('fileInput').click(); return; }
    else audio.useDemo();
    onSourceChanged();
    enter();
  } catch (e) {
    toast(kind === 'tab' ? 'Sharing cancelled' : 'Could not start the microphone', e.message.slice(0, 90));
  }
}
async function startFile(file) {
  try { await audio.useFile(file); body.classList.remove('paused'); onSourceChanged(); enter(); }
  catch (e) { toast('Could not play that file', e.message.slice(0, 90)); }
}
audio.onEnded = () => { onSourceChanged(); updateNow(); toast('Audio sharing stopped', 'Back to the demo beat'); };

function enter() {
  updateNow();
  body.classList.remove('welcome');
  $('welcome').classList.add('gone');
  closeSettings();
  poke();
}
function showWelcome() {
  closeSettings();
  body.classList.add('welcome');
  $('welcome').classList.remove('gone');
}

if (!AudioEngine.tabSupported()) {
  const t = $('srcTab');
  t.disabled = true;
  t.querySelector('.source-sub').textContent = mobile
    ? 'Needs a desktop browser. Use the microphone here.'
    : 'Needs Chrome, Edge or Arc. Safari cannot share tab audio.';
}
document.querySelectorAll('.source').forEach(b => b.onclick = () => startSource(b.dataset.source));
$('fileInput').onchange = e => { const f = e.target.files[0]; if (f) startFile(f); e.target.value = ''; };
addEventListener('dragover', e => { e.preventDefault(); body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) body.classList.remove('dragging'); });
addEventListener('drop', e => {
  e.preventDefault(); body.classList.remove('dragging');
  const f = [...e.dataTransfer.files].find(f => f.type.startsWith('audio') || /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(f.name));
  if (f) startFile(f);
});

// File transport
const el = $('audio');
$('playBtn').onclick = () => { if (el.paused) el.play(); else el.pause(); };
el.addEventListener('play', () => body.classList.remove('paused'));
el.addEventListener('pause', () => body.classList.add('paused'));
el.addEventListener('timeupdate', () => {
  if (el.duration) $('progressFill').style.width = (el.currentTime / el.duration * 100) + '%';
});
$('progress').onclick = e => {
  const r = e.currentTarget.getBoundingClientRect();
  if (el.duration) el.currentTime = (e.clientX - r.left) / r.width * el.duration;
};

// ---------- Song ID ----------
let errorToastT = -1e9;
const songId = new SongID(audio, {
  onError: msg => { if (last - errorToastT > 300) { errorToastT = last; toast('Song ID', String(msg).slice(0, 80)); } },
  onState: s => { $('idBtn').classList.toggle('busy', s === 'identifying'); },
  onMatch: async (m, changed) => {
    if (!m) { clearSongDisplay(); return; }
    song = m;
    if (!changed) return;
    body.classList.remove('has-art'); $('npArt').style.backgroundImage = ''; renderer.setArt(null);
    if (m.genre) body.dataset.genre = m.genre.toLowerCase();
    try {
      const img = await loadArt(m.art || m.bg);
      if (song !== m) return;
      $('npArt').style.backgroundImage = `url("${img.src}")`;
      body.classList.add('has-art');
      renderer.setArt(img);
      const p = paletteFromImage(img);
      if (p) { palette.to = p; cTarget = Math.floor(u.C) + hueOf(p.c1); }
    } catch {}
  },
});
songId.enabled = store.get('songid', true);
if (songId.debug) window.phosphene = { audio, songId, renderer, u };   // ?debug exposes the internals
function hueOf([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-4) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) + 1) % 1;
}
function clearSongDisplay() {
  song = null; body.classList.remove('has-art'); delete body.dataset.genre;
  $('npArt').style.backgroundImage = ''; renderer.setArt(null);
  palette.to = { ...DEFAULT_PALETTE };
}
function onSourceChanged() { clearSongDisplay(); songId.reset(); cTarget = null; }
function setSongId(on) {
  songId.enabled = on; store.set('songid', on);
  $('idSwitch').classList.toggle('on', on); $('idSwitch').setAttribute('aria-checked', on);
  $('idBtn').classList.toggle('off', !on);
  clearSongDisplay(); songId.reset();
}
function identifyNow() {
  if (audio.source === 'demo') { toast('Pick a real source first', 'Song ID needs the mic, a tab or a file'); return; }
  if (!songId.enabled) setSongId(true);
  songId.identify(12, last, true);
}

// ---------- Dock and settings ----------
$('nowBtn').onclick = () => { if (song?.url) window.open(song.url, '_blank', 'noopener'); else showWelcome(); };
$('nowBtn').oncontextmenu = e => { e.preventDefault(); showWelcome(); };
$('changeSource').onclick = showWelcome;
$('prevBtn').onclick = () => setScene(u.scene - 1);
$('nextBtn').onclick = () => setScene(u.scene + 1);
$('autoBtn').onclick = () => { setAuto(!auto); toast(auto ? 'Auto-cycle on' : 'Auto-cycle off'); };
$('autoSwitch').onclick = () => setAuto(!auto);
$('colorBtn').onclick = shiftColors;
$('idBtn').onclick = identifyNow;
$('idSwitch').onclick = () => setSongId(!songId.enabled);
$('keySwitch').onclick = () => { keyColors = !keyColors; store.set('keycolors', keyColors); $('keySwitch').classList.toggle('on', keyColors); if (!keyColors) cTarget = null; };
$('symDown').onclick = () => setSymmetry(u.K - 2);
$('symUp').onclick = () => setSymmetry(u.K + 2);
$('sens').oninput = e => { audio.sensitivity = +e.target.value; };
$('trails').oninput = e => { trailsSetting = +e.target.value; };
$('goo').oninput = e => { gooSetting = +e.target.value; store.set('goo', gooSetting); };
$('goo').value = gooSetting;
$('idSwitch').classList.toggle('on', songId.enabled); $('idBtn').classList.toggle('off', !songId.enabled);
$('keySwitch').classList.toggle('on', keyColors);
document.querySelectorAll('#quality button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#quality button').forEach(x => x.classList.toggle('on', x === b));
  renderer.setQuality(b.dataset.q);
});

const settings = $('settings');
function closeSettings() { settings.classList.remove('open'); }
$('settingsBtn').onclick = e => { e.stopPropagation(); settings.classList.toggle('open'); };
$('settingsClose').onclick = closeSettings;
$('showKeys').onclick = () => { closeSettings(); $('keys').classList.add('open'); };
$('keysClose').onclick = () => $('keys').classList.remove('open');
$('keys').onclick = e => { if (e.target === $('keys')) $('keys').classList.remove('open'); };

const fsOK = document.fullscreenEnabled || document.webkitFullscreenEnabled;
if (!fsOK) body.classList.add('no-fs');
function toggleFullscreen() {
  if (!fsOK) return;
  const d = document, de = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
}
$('fsBtn').onclick = toggleFullscreen;

// ---------- Idle hiding ----------
const dock = $('dock');
let idleTimer, overDock = false, hiddenByUser = false;
dock.addEventListener('pointerenter', () => { overDock = true; });
dock.addEventListener('pointerleave', () => { overDock = false; poke(); });
function showUI() { body.classList.remove('idle'); if (!hiddenByUser) dock.classList.remove('hidden'); }
function hideUI() {
  if (overDock || settings.classList.contains('open') || body.classList.contains('welcome')) return;
  dock.classList.add('hidden'); body.classList.add('idle');
}
function poke() { showUI(); clearTimeout(idleTimer); idleTimer = setTimeout(hideUI, 3200); }
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') poke(); });

// ---------- Touch gestures on the canvas ----------
let down = null, lastTap = 0;
const cv = $('gl');
cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
cv.addEventListener('pointerup', e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
  if (body.classList.contains('welcome')) return;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { setScene(u.scene + (dx < 0 ? 1 : -1)); return; }
  if (settings.classList.contains('open')) { closeSettings(); return; }
  if (e.pointerType === 'mouse') return;
  const now = performance.now();
  if (now - lastTap < 300) { toggleFullscreen(); lastTap = 0; return; }
  lastTap = now;
  if (dock.classList.contains('hidden')) poke(); else hideUI();
});
cv.addEventListener('dblclick', toggleFullscreen);

// ---------- Keyboard ----------
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { closeSettings(); $('keys').classList.remove('open'); return; }
  if (body.classList.contains('welcome') && k !== '?') return;
  const sk = '1234567890-='.indexOf(e.key), sk2 = '!@#$%^&*()_+'.indexOf(e.key);
  if (e.key.length === 1 && sk >= 0 && sk < SCENES.length) setScene(sk);
  else if (e.key.length === 1 && sk2 >= 0 && sk2 + 12 < SCENES.length) setScene(sk2 + 12);
  else if (k === ' ' || k === 'arrowright') { e.preventDefault(); setScene(u.scene + 1); }
  else if (k === 'arrowleft') setScene(u.scene - 1);
  else if (k === 'a') { setAuto(!auto); toast(auto ? 'Auto-cycle on' : 'Auto-cycle off'); }
  else if (k === ']') { setSymmetry(u.K + 2); toast('Symmetry ' + u.K); }
  else if (k === '[') { setSymmetry(u.K - 2); toast('Symmetry ' + u.K); }
  else if (k === 'c') shiftColors();
  else if (k === 'g') { gooSetting = gooSetting > 0.66 ? 0 : gooSetting > 0.33 ? 1 : 0.5; $('goo').value = gooSetting; store.set('goo', gooSetting); toast('Goo ' + ['off', 'medium', 'max'][gooSetting * 2 | 0]); }
  else if (k === 'i') identifyNow();
  else if (k === 'arrowup' || k === 'arrowdown') {
    e.preventDefault();
    audio.sensitivity = Math.max(0.3, Math.min(3, audio.sensitivity + (k === 'arrowup' ? 0.15 : -0.15)));
    $('sens').value = audio.sensitivity; toast('Sensitivity ' + audio.sensitivity.toFixed(2));
  }
  else if (k === 'f') toggleFullscreen();
  else if (k === 'h') { hiddenByUser = !hiddenByUser; if (hiddenByUser) { dock.classList.add('hidden'); closeSettings(); } else poke(); }
  else if (k === '?') $('keys').classList.toggle('open');
  if (!hiddenByUser) poke();
});

// ---------- Frame loop ----------
const bars = [...document.querySelectorAll('.eq i')];
function frame() {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - last); last = now;
  audio.update(now, dt);
  const L = audio.level, f = F();
  // palette eases toward the album's colours, hue toward the key
  const k = Math.min(1, dt * 1.5);
  for (let i = 0; i < 3; i++) {
    palette.cur.a[i] += (palette.to.a[i] - palette.cur.a[i]) * k;
    palette.cur.b[i] += (palette.to.b[i] - palette.cur.b[i]) * k;
  }
  palette.cur.k += (palette.to.k - palette.cur.k) * k;
  if (cTarget !== null) { let d = (cTarget - u.C) % 1; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; u.C += d * Math.min(1, dt * 0.4); }

  Object.assign(u, {
    T: now, B: L.b, M: L.m, H: L.h, BEAT: Math.max(L.beat, f.kick), TR: 0.62 + 0.4 * trailsSetting,
    KICK: f.kick, SNARE: f.snare, HAT: f.hat, PH: f.phase, BAR: f.bar, BPM: f.bpm, EN: f.energy, DROP: f.drop, BP: f.beatPulse,
    GOO: gooSetting, IRID: 0.25 + 0.6 * gooSetting, PIT: Math.max(0, Math.min(1, Math.log2(Math.max(55, f.pitchHz) / 55) / 7)),
    PA: palette.cur.a, PB: palette.cur.b, PK: palette.cur.k,
  });
  const ph = f.phase;
  u.BT = f.bpm ? f.beatNo + ph * ph * (3 - 2 * ph) : u.BT + dt * 2;
  u.Z += dt * (0.35 + L.b * 1.6);
  if (auto && now - sceneStart > 90) setScene(u.scene + 1);   // keep moving through quiet passages
  renderer.adapt(dt, now);
  ecg.update(now, dt, L.m);
  renderer.render(audio, u, ecg);
  songId.update(now);
  npRender(now);
  // how sure we are the album on screen is the song playing: 1 known, 0.4 while a change is suspected, 0 otherwise
  const artc = song && songId.state === 'known' ? 1 : song && (songId.state === 'suspect' || songId.state === 'identifying') ? 0.4 : 0;
  u.ARTC += (artc - u.ARTC) * Math.min(1, dt * 1.5);
  if (SCENES[u.scene].monitor) {
    const bpm = f.locked && f.bpm ? Math.round(f.bpm) : ecg.bpm && now - ecg.beatT < 3 ? ecg.bpm : '--';
    $('bpm').textContent = bpm;
  }
  if (!dock.classList.contains('hidden')) {
    const v = [L.b, L.m, (L.m + L.h) / 2, L.h];
    bars.forEach((b, i) => { b.style.height = (18 + Math.min(1, v[i]) * 82) + '%'; });
  }
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
const qScene = parseInt(params.get('scene'), 10);
setScene(qScene >= 1 && qScene <= SCENES.length ? qScene - 1 : 0, { quiet: true });
setAuto(auto);
updateNow();
if (params.get('ui') === '0') { body.classList.add('clean'); hiddenByUser = true; dock.classList.add('hidden'); }
else if (params.has('demo') || params.has('scene')) enter();
else body.classList.add('welcome');
requestAnimationFrame(frame);
