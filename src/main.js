import { SCENES } from './shaders.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { ECG } from './ecg.js';
import { SongID } from './songid.js';
import { paletteFromImage, loadArt, DEFAULT_PALETTE, PALETTES, clonePalette } from './palette.js';

const $ = id => document.getElementById(id);
const body = document.body;
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches;
// As a desktop wallpaper (the Mac app loads this page with ?wallpaper) a native host
// pushes the audio in and drives everything through window.phospheneHost.
const wallpaper = params.has('wallpaper');
function post(msg) { try { window.webkit.messageHandlers.phosphene.postMessage(msg); } catch {} }
if (wallpaper) {                                              // the host has no console: send it the engine's errors
  addEventListener('error', e => post({ type: 'error', message: String(e.message) + ' @ ' + String(e.filename).split('/').pop() + ':' + e.lineno }));
  addEventListener('unhandledrejection', e => post({ type: 'error', message: 'promise: ' + String(e.reason && e.reason.message || e.reason) }));
}
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('phosphene.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('phosphene.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- Core ----------
let renderer;
try {
  renderer = new Renderer($('gl'), { mobile, transparent: wallpaper });
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
  MEL: 0.5, NOTE: 0, MELV: 0, MELH: 0, TONE: 0, SP: 0, ARM: 0,
  GOO: 0.5, IRID: 0.4, ARTC: 0, BGA: 0, PA: [0.5, 0.5, 0.5], PB: [0.5, 0.5, 0.5], PF: [1, 1, 1], PD: [0, 0.33, 0.67],
  hist: new Float32Array(8), scene: 0,
};
// The palette offset the scenes see is this base plus a lean from the melody.
const base = { C: params.has('colors') ? +params.get('colors') || 0 : Math.random() };
let auto = params.get('auto') !== '0', beatsInScene = 0, sceneStart = 0, trailsSetting = 0.4;
let gooSetting = params.has('goo') ? Math.max(0, Math.min(1, +params.get('goo'))) : store.get('goo', 0.5);
let keyColors = store.get('keycolors', true), cTarget = null;
let melodySetting = params.has('melody') ? Math.max(0, Math.min(2, +params.get('melody'))) : store.get('melody', 1);
let last = performance.now() / 1000;
// The palette eases toward `to`: a preset, or the album's colours once the song is named.
let presetIx = Math.max(0, PALETTES.findIndex(p => p.name.toLowerCase() === (params.get('palette') || '').toLowerCase()));
const palette = { cur: clonePalette(PALETTES[presetIx]), to: PALETTES[presetIx], album: null };
let pinned = false;                                         // the wallpaper's menu chose this palette: neither an album nor a scene change replaces it
// With several displays one engine leads and the others follow its look, so every screen shows the same colours.
let follower = false, lead = null, artUrl = null, followArt = null, lookT = 0;
let rawBT = 0, btOff = 0;                                   // this engine's own beat count, and a follower's offset onto the leader's
let rotating = false, paletteT = 0, paletteEvery = 45;                         // the wallpaper's "change every so often": a new palette about every 45 seconds
function setPreset(i, announce) {
  presetIx = (i + PALETTES.length) % PALETTES.length;
  if (!palette.album || pinned) palette.to = PALETTES[presetIx];
  if (wallpaper && !follower) post({ type: 'palette', index: presetIx });
  if (announce) toast('Palette ' + PALETTES[presetIx].name, palette.album ? 'after this album' : '');
}

// ---------- Toast ----------
let toastTimer;
function toast(title, sub = '', ms = 2200) {
  $('toastTitle').textContent = title; $('toastSub').textContent = sub;
  $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), ms);
}

// ---------- Now playing pill (top right) ----------
// Rendered from Song ID's state every frame, so it never claims more than it knows:
// Searching (listening / identifying), the song for a few seconds when it is named or
// changes (never on a timer), the song dimmed while a doubt is checked, "Checking"
// after a skip, "Unknown song" when a check comes back empty.
const NP_FOR = 6;
let npShownAt = -1e9, npKey = '';
if (params.get('np') === '1') body.classList.add('np-on');
const np = $('np');
function npRender(now) {
  const st = songId.state;
  let show = false, title = '', sub = '', cls = '';
  if (st === 'listening') {
    show = true; cls = 'searching'; title = 'Searching';
    sub = songId.stage === 0 ? 'listening' : 'no match yet, listening longer';
  } else if (st === 'identifying' || st === 'suspect') {
    // a skip hid the song: a clean "Checking". A softer doubt is checked silently; the
    // card only comes back if the answer is a different song.
    if (song) { show = false; }
    else { show = true; title = 'Checking'; sub = 'Song ID'; cls = 'searching'; }
  } else if (st === 'unknown') {
    cls = 'searching'; title = 'Unknown song';
    const wait = songId.nextTry - now;
    sub = wait > 3 ? 'resting, will try again' : 'listening';
    show = now - songId.stateSince < NP_FOR || wait <= 3;
  } else if (st === 'known' && song) {
    title = song.title; const line = musicLine(); sub = song.artist + (line ? ' · ' + line : '');
    if (npKey !== song.key) { npKey = song.key; npShownAt = now; }   // a song we have not shown yet: show it, then rest
    show = now - npShownAt < NP_FOR;
  }
  if (!song) npKey = '';                                             // cleared (skip, silence, unknown): the next song is news again
  if (show) {
    if ($('npTitle').textContent !== title) $('npTitle').textContent = title;
    if ($('npSub').textContent !== sub) $('npSub').textContent = sub;
  }
  np.classList.toggle('show', show);
  np.classList.toggle('searching', cls === 'searching');
  np.classList.toggle('suspect', cls === 'suspect');
  np.classList.toggle('busy', st === 'listening' || st === 'identifying' || st === 'suspect');
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
  if (wallpaper) post({ type: 'scene', index: u.scene });
}
function nextLook() { lookAt(u.scene + 1); }
function lookAt(i) {                                        // a scene with a fresh symmetry, hue and (unless one is pinned) palette
  setScene(i);
  setSymmetry([4, 6, 8, 10, 12][Math.random() * 5 | 0]);
  base.C = cTarget !== null ? cTarget + (Math.random() - 0.5) * 0.2 : Math.random();
  if (!params.has('palette') && !pinned) setPreset(Math.random() < 0.4 ? 0 : 1 + (Math.random() * (PALETTES.length - 1) | 0));   // rainbow often, the others in turn
}
function setAuto(on) {
  auto = on;
  $('autoBtn').classList.toggle('on', on);
  $('autoSwitch').classList.toggle('on', on);
  $('autoSwitch').setAttribute('aria-checked', on);
}
function setSymmetry(k) { u.K = Math.max(2, Math.min(16, k)); $('symVal').textContent = u.K; }
function shiftColors() { base.C += 0.17; if (cTarget !== null) cTarget += 0.17; }

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
  if (!follower && Math.random() < 0.1) { base.C += 0.15 + Math.random() * 0.3; if (cTarget !== null) cTarget = base.C; }
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
  if (!follower) { base.C += 0.33; if (cTarget !== null) cTarget = base.C; }
};
audio.features.onKey = (name, hueV) => {
  songId.clue('key');
  if (!keyColors || follower) return;
  cTarget = Math.floor(base.C) + hueV;
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
  native: ['This Mac', 'Whatever is playing'],
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
    const fresh = changed || !song || song.key !== m.key;
    song = m;
    if (!fresh) return;
    body.classList.remove('has-art'); $('npArt').style.backgroundImage = ''; renderer.setArt(null);
    if (m.genre) body.dataset.genre = m.genre.toLowerCase();
    try {
      const img = await loadArt(m.art || m.bg);
      if (song !== m) return;
      $('npArt').style.backgroundImage = `url("${img.src}")`;
      body.classList.add('has-art');
      renderer.setArt(img);
      const p = paletteFromImage(img);
      artUrl = m.art || m.bg;
      if (p) { palette.album = p; if (!pinned) palette.to = p; cTarget = Math.floor(base.C) + hueOf(p.c1); }
    } catch {}
  },
});
songId.enabled = store.get('songid', true);
if (songId.debug) window.phosphene = {                               // ?debug exposes the internals
  audio, songId, renderer, u, base, palette, setScene: i => setScene(i, { quiet: true }), scenes: SCENES,
  // GPU milliseconds per frame for every scene (or one), at the current resolution
  bench: (only) => { const q = renderer.quality; renderer.setQuality('high'); const out = {};
    SCENES.forEach((s, i) => { if (only === undefined || only === i) out[num(i) + ' ' + s.name] = +renderer.bench(i, audio, u, ecg).toFixed(2); });
    renderer.setQuality(q); return out; },
};
function hueOf([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-4) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) + 1) % 1;
}
function clearSongDisplay() {
  song = null; body.classList.remove('has-art'); delete body.dataset.genre;
  $('npArt').style.backgroundImage = ''; renderer.setArt(null); artUrl = null;
  palette.album = null; palette.to = PALETTES[presetIx];
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
$('melody').oninput = e => { melodySetting = +e.target.value; store.set('melody', melodySetting); };
$('melody').value = melodySetting;
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
  else if (k === 'p') setPreset(presetIx + 1, true);
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
let monT = 0;
// The loop. It can be paused (the wallpaper sleeps while nothing plays) and capped
// to a frame rate; the scenes' clock can run slow (the wallpaper idles when asked
// to stay on through silence).
let paused = false, loopOn = false, frameGap = 0, lastDraw = 0, fpsCap = 60, fpsNow = 60;
let vt = performance.now() / 1000, calm = 1;
let veil = wallpaper ? 1 : 0, veilTo = veil, veilDur = 3.5, hasBackdrop = false;   // how much of the desktop wallpaper shows
function tick() {
  if (paused) { loopOn = false; return; }
  requestAnimationFrame(tick);
  const now = performance.now() / 1000;
  if (now - lastDraw < frameGap - 0.003) return;
  lastDraw = now;
  frame(now);
}
function startLoop() { if (!loopOn) { loopOn = true; last = performance.now() / 1000; requestAnimationFrame(tick); } }
function frame(now) {
  const dt = Math.min(0.1, now - last); last = now;
  audio.update(now, dt);
  const L = audio.level, f = F();
  let rate = 1;
  if (wallpaper) {
    const playing = !(f.quiet && f.quietFor > 2.5);
    calm += ((playing ? 1 : 0) - calm) * Math.min(1, dt * (playing ? 3 : 0.5));
    rate = 0.12 + 0.88 * calm;                                // nothing playing: the scene drifts at an eighth of its pace
    frameGap = calm > 0.03 ? 1 / fpsCap : 1 / 20;
    fpsNow += (1 / Math.max(dt, 1e-3) - fpsNow) * 0.05;
    if (veil !== veilTo) {
      const step = dt / veilDur; veil = veilTo > veil ? Math.min(veilTo, veil + step) : Math.max(veilTo, veil - step);
      if (veil === 1) post({ type: 'asleep' });               // fully back to the wallpaper: the host hides the window
    }
    u.BGA = veil * veil * (3 - 2 * veil);
  }
  vt += dt * rate;
  if (follower && lead) {                                     // stay on the leader's clock and hue
    const want = lead.T + (now - lead.at) * rate, d = want - vt;
    vt = Math.abs(d) > 1 ? want : vt + d * Math.min(1, dt * 2);
    const dc = lead.C - base.C;
    base.C = Math.abs(dc) > 2 ? lead.C : base.C + dc * Math.min(1, dt * 6);
  }
  // palette eases toward the album's colours, hue toward the key
  const k = Math.min(1, dt * 1.5);
  for (const part of 'abfd') for (let i = 0; i < 3; i++) palette.cur[part][i] += (palette.to[part][i] - palette.cur[part][i]) * k;
  if (cTarget !== null) { let d = (cTarget - base.C) % 1; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; base.C += d * Math.min(1, dt * 0.4); }

  Object.assign(u, {
    T: vt, B: L.b, M: L.m, H: L.h, BEAT: Math.max(L.beat, f.kick), TR: 0.62 + 0.4 * trailsSetting,
    KICK: f.kick, SNARE: f.snare, HAT: f.hat, PH: f.phase, BAR: f.bar, BPM: f.bpm, EN: f.energy, DROP: f.drop, BP: f.beatPulse,
    GOO: gooSetting, IRID: 0.25 + 0.6 * gooSetting,
    PA: palette.cur.a, PB: palette.cur.b, PF: palette.cur.f, PD: palette.cur.d,
  });
  // the melody: pitch height (exaggerated or flattened by the Melody setting), note pulses, colour
  const m = audio.tones.m, lean = (m.mel - 0.5) * melodySetting;
  u.MEL = Math.max(0, Math.min(1, 0.5 + lean)); u.NOTE = Math.min(1.5, m.note * melodySetting);
  u.MELV = Math.min(1, m.conf * Math.min(1, melodySetting * 2)); u.MELH = m.hue; u.TONE = m.tone;
  u.C = base.C + 0.4 * lean * m.conf;                        // a rising tune slides the palette one way, a falling one the other
  const hh = u.hist; hh[0] = m.mel; hh[1] = m.conf; hh[2] = f.energy; hh[3] = f.locked ? (Math.exp(-f.phase * 3.5) + 0.25 * Math.exp(-(((f.phase - 0.42) / 0.12) ** 2))) * (0.35 + 0.65 * Math.min(1, L.b)) : L.b / 1.5; hh[4] = f.kick / 1.5; hh[5] = m.note; hh[6] = L.m / 1.5; hh[7] = L.h / 1.5;
  const ph = f.phase;
  rawBT = f.bpm ? f.beatNo + ph * ph * (3 - 2 * ph) : rawBT + dt * 2 * rate;
  if (follower && lead && lead.BT != null) {                  // count beats from where the leader does, so beat-timed changes land together
    const d = lead.BT + (now - lead.at) * (f.bpm ? f.bpm / 60 : 2 * rate) - (rawBT + btOff);
    if (!f.bpm) btOff += d; else if (Math.abs(d) > 0.6) btOff += Math.round(d);
  } else if (!follower) btOff = 0;
  u.BT = rawBT + btOff;
  u.Z += dt * rate * (0.35 + L.b * 1.6);
  u.SP = (u.SP + dt * rate * 3.49 * (1 - 2.4 * f.drop)) % 6283.1853;       // 33 1/3 rpm; a drop spins the record back
  if (auto && now - sceneStart > (calm < 0.5 ? 600 : 90)) setScene(u.scene + 1);   // keep moving through quiet passages
  renderer.adapt(dt, now);
  ecg.update(now, dt, L.m);
  renderer.render(audio, u, ecg);
  songId.update(now);
  npRender(now);
  // how sure we are the album on screen is the song playing: 1 known, 0.4 while a change is suspected, 0 otherwise
  let artc = song && songId.state === 'known' ? 1 : song && (songId.state === 'suspect' || songId.state === 'identifying') ? 0.4 : 0;
  if (follower && lead) artc = lead.artc;
  u.ARTC += (artc - u.ARTC) * Math.min(1, dt * 1.5);
  // the tonearm: down while music plays, lifted in silence and while a skip is being checked
  const checking = !song && (songId.state === 'suspect' || songId.state === 'identifying');
  let arm = audio.source !== 'demo' && ((f.quiet && f.quietFor > 1) || checking) ? 0 : 1;
  if (follower && lead) arm = lead.arm;
  if (rotating && !follower && calm > 0.5 && now - paletteT > paletteEvery) {   // a different palette every so often; the colours ease across
    paletteT = now;
    setPreset(presetIx + 1 + (Math.random() * (PALETTES.length - 1) | 0), false);
  }
  if (wallpaper && !follower && now - lookT > 0.2) {          // five times a second, tell the host how this screen looks
    lookT = now;
    const t = palette.to;
    post({ type: 'look', look: { scene: u.scene, K: u.K, C: base.C, T: vt, BT: u.BT, to: { a: [...t.a], b: [...t.b], f: [...t.f], d: [...t.d] }, art: artUrl, artc, arm } });
  }
  u.ARM += (arm - u.ARM) * Math.min(1, dt * 2);
  if (SCENES[u.scene].monitor && now - monT > 0.08) {       // the monitor's readouts, a dozen times a second
    monT = now;
    $('bpm').textContent = f.locked && f.bpm ? Math.round(f.bpm) : ecg.bpm && now - ecg.beatT < 3 ? ecg.bpm : '--';
    $('monNote').textContent = m.conf > 0.3 && m.name ? m.name : '--';
    $('monKey').textContent = 'KEY ' + (f.key >= 0 && f.keyConf > 0.2 ? f.keyName : '--');
    $('monEn').textContent = f.quiet ? '--' : Math.round(f.energy * 100);
    $('monBar').textContent = f.locked ? Math.floor(f.bar * 4) % 4 + 1 : '-';
  }
  if (!dock.classList.contains('hidden')) {
    const v = [L.b, L.m, (L.m + L.h) / 2, L.h];
    bars.forEach((b, i) => { b.style.height = (18 + Math.min(1, v[i]) * 82) + '%'; });
  }
}

// ---------- Wallpaper host ----------
if (wallpaper) {
  const setting = {
    goo: v => { gooSetting = +v; }, melody: v => { melodySetting = +v; }, trails: v => { trailsSetting = +v; },
    sensitivity: v => { audio.sensitivity = +v; }, fps: v => { fpsCap = +v || 60; }, quality: v => renderer.setQuality(String(v)),
    opacity: v => { $('gl').style.opacity = +v; },             // below 1 the desktop shows through the picture
    songid: v => { if (!!v !== songId.enabled) setSongId(!!v); },
    card: v => body.classList.toggle('np-on', !!v),
    stayOn: v => { if (v) { veil = veilTo = 0; } },
    paletteEvery: v => { paletteEvery = Math.max(2, +v || 45); },
    follower: v => {
      if (!!v === follower) return;
      follower = !!v;
      if (follower) { cTarget = null; clearSongDisplay(); }
      else { if (followArt) renderer.setArt(null); lead = null; followArt = null; }   // this screen leads now: its own Song ID takes over
    },           // keep drawing through silence instead of handing back to the wallpaper
  };
  window.phospheneHost = {
    info: () => ({ scenes: SCENES.map(s => s.name), palettes: PALETTES.map(p => p.name) }),
    // 16-bit mono samples, base64: the audio the Mac is playing
    pcm(b64, rate) {
      if (rate !== audio.tapRate || audio.source !== 'native') audio.useNative(rate);
      const bin = atob(b64), n = bin.length >> 1, out = new Float32Array(n);
      for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v & 0x8000) v -= 0x10000; out[i] = v / 32768; }
      audio.pushPCM(out);
    },
    set(key, value) { if (setting[key]) setting[key](value); },
    setScene: i => setScene(i, { quiet: true }),
    next: () => nextLook(),
    go: i => lookAt(i),                                        // the skip button and the menu's stepper
    // a caption that fades in at the bottom left of the desktop and out again (the scene's name after a skip)
    label(text) {
      let el = $('wpLabel');
      if (!el) { el = document.createElement('div'); el.id = 'wpLabel'; el.className = 'wp-label'; body.appendChild(el); }
      el.textContent = text;
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    },
    setAuto: on => setAuto(!!on),
    // a palette from the menu stays until another is picked; -1 hands the choice back to the scenes and the album
    // -2 changes palette every so often on its own clock.
    setPalette: i => {
      rotating = i === -2; pinned = i >= 0 || rotating;
      if (i >= 0) setPreset(i, false); else if (rotating) paletteT = performance.now() / 1000; else if (palette.album) palette.to = palette.album;
    },
    // show this palette now without changing the mode: the menu's stepper, and the random start
    showPreset: i => { presetIx = (i + PALETTES.length) % PALETTES.length; palette.to = PALETTES[presetIx]; paletteT = performance.now() / 1000; post({ type: 'palette', index: presetIx }); },
    // another display's engine leads: take its scene, symmetry, palette, hue, clock and album art
    follow(s) {
      if (!follower || !s) return;
      const first = !lead;
      lead = { ...s, at: performance.now() / 1000 };
      if (s.scene !== u.scene) setScene(s.scene, { quiet: true });
      if (s.K !== u.K) setSymmetry(s.K);
      palette.to = s.to;
      if (first) { base.C = s.C; vt = s.T; }
      if (s.art !== followArt) {
        followArt = s.art;
        if (!s.art) renderer.setArt(null);
        else loadArt(s.art).then(img => { if (followArt === s.art) renderer.setArt(img); }).catch(() => {});
      }
    },
    // how much of each screen edge the menu bar and Dock take up, so the song card can sit clear of them
    insets(top, right, bottom, left) {
      const st = document.documentElement.style;
      st.setProperty('--inset-t', top + 'px'); st.setProperty('--inset-r', right + 'px'); st.setProperty('--inset-b', bottom + 'px'); st.setProperty('--inset-l', left + 'px');
    },
    // optional: a copy of the user's wallpaper image for this screen, to liquefy it instead of dissolving through it
    backdrop(url) {
      if (!url) { hasBackdrop = false; renderer.setBackdrop(null); return; }
      const img = new Image();
      img.onload = () => { renderer.setBackdrop(img); hasBackdrop = true; };
      img.onerror = () => { hasBackdrop = false; };
      img.src = url;
    },
    // music started: wake up and melt in.  music stopped: melt back, then report asleep.
    wake(seconds = 3.5) { paused = false; veilTo = 0; veilDur = seconds; startLoop(); },
    sleep(seconds = 3) { veilTo = 1; veilDur = seconds; if (paused || veil === 1) { veil = 1; post({ type: 'asleep' }); } },
    setPaused(p) { paused = !!p; if (!paused) startLoop(); },
    state: () => ({
      scene: u.scene, auto, palette: presetIx, paused, veil: +veil.toFixed(2), calm: +calm.toFixed(2), quiet: F().quiet,
      rms: +(audio.rms || 0).toFixed(4), bpm: Math.round(F().bpm), note: audio.tones.m.name, songState: songId.state,
      song: song ? song.title + ' / ' + song.artist : null, fps: Math.round(fpsNow), size: [renderer.W, renderer.H],
      canvas: [renderer.CW, renderer.CH], backdrop: hasBackdrop, err: renderer.lastError || null,
      label: $('wpLabel') ? $('wpLabel').textContent : null,
      follower, pinned, rotating, BT: +u.BT.toFixed(2), K: u.K, hue: +base.C.toFixed(3), clock: +vt.toFixed(2), to: palette.to.a.concat(palette.to.d).map(v => +v.toFixed(3)),
      cur: palette.cur.a.concat(palette.cur.d).map(v => +v.toFixed(3)), art: follower ? followArt : artUrl,
    }),
    // the centre pixel as it is composited, alpha included (self-test: 0 alpha means the desktop shows through)
    pixel() {
      if (paused) return null;
      const gl = renderer.gl, px = new Uint8Array(4);
      renderer.render(audio, u, ecg); gl.readPixels(renderer.CW >> 1, renderer.CH >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [...px];
    },
    // one frame as a JPEG data URL (the host's self-test)
    grab() { renderer.render(audio, u, ecg); return $('gl').toDataURL('image/jpeg', 0.85); },
  };
}

// ---------- Boot ----------
const qScene = parseInt(params.get('scene'), 10);
setScene(qScene >= 1 && qScene <= SCENES.length ? qScene - 1 : 0, { quiet: true });
setAuto(auto);
updateNow();
if (wallpaper) {
  body.classList.add('clean', 'wallpaper'); hiddenByUser = true; dock.classList.add('hidden');
  document.documentElement.style.background = body.style.background = 'transparent';
  audio.useNative(48000); onSourceChanged();
  paused = true;                                             // asleep until the host hears music
  frame(performance.now() / 1000);                           // one frame now, so the first scene is compiled before it is needed
  post({ type: 'ready', ...window.phospheneHost.info() });
}
else if (params.get('ui') === '0') { body.classList.add('clean'); hiddenByUser = true; dock.classList.add('hidden'); }
else if (params.has('demo') || params.has('scene')) enter();
else body.classList.add('welcome');
// Development host (dev.html): reuse the tab audio the outer page is already capturing.
try {
  const shared = parent !== window && parent.__phospheneStream;
  if (shared) audio.useStream(shared, 'tab').then(() => { onSourceChanged(); enter(); });
} catch {}
startLoop();
