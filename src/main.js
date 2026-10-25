import { SCENES } from './shaders.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';

const $ = id => document.getElementById(id);
const body = document.body;
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches;

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
addEventListener('resize', () => renderer.resize());

const state = { t: 0, b: 0, m: 0, h: 0, beat: 0, k: 8, z: 0, c: 0, trails: 0.78, scene: 0 };
state.c = params.has('colors') ? +params.get('colors') || 0 : Math.random();   // fresh palette per visit
let auto = params.get('auto') !== '0', beatsInScene = 0, sceneStart = 0, trailsSetting = 0.4;
let last = performance.now() / 1000;

// ---------- Toast ----------
let toastTimer;
function toast(title, sub = '') {
  $('toastTitle').textContent = title; $('toastSub').textContent = sub;
  $('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}

// ---------- Scenes ----------
const num = i => String(i + 1).padStart(2, '0');
const dots = $('dots');
SCENES.forEach((s, i) => {
  const d = document.createElement('button');
  d.title = s.name; d.onclick = () => setScene(i);
  dots.appendChild(d);
});
function setScene(i, { quiet = false } = {}) {
  state.scene = (i + SCENES.length) % SCENES.length;
  beatsInScene = 0; sceneStart = last;
  $('sceneName').textContent = SCENES[state.scene].name;
  $('sceneNum').textContent = num(state.scene);
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === state.scene));
  if (!quiet) toast(num(state.scene) + '   ' + SCENES[state.scene].name, SCENES[state.scene].blurb);
}
function setAuto(on) {
  auto = on;
  $('autoBtn').classList.toggle('on', on);
  $('autoSwitch').classList.toggle('on', on);
  $('autoSwitch').setAttribute('aria-checked', on);
}
function setSymmetry(k) { state.k = Math.max(2, Math.min(16, k)); $('symVal').textContent = state.k; }
function shiftColors() { state.c += 0.17; }

audio.onBeat = now => {
  beatsInScene++;
  if (Math.random() < 0.12) state.c += 0.15 + Math.random() * 0.3;
  if (auto && (beatsInScene >= 48 || now - sceneStart > 45)) {
    setScene(state.scene + 1);
    setSymmetry([4, 6, 8, 10, 12][Math.random() * 5 | 0]);
    state.c = Math.random();
  }
};

// ---------- Sources ----------
const SOURCE_TEXT = {
  demo: ['Demo beat', 'Built-in and silent'],
  tab:  ['Browser tab', 'Live, straight from the source'],
  mic:  ['Microphone', 'Listening out loud'],
};
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
    enter();
  } catch (e) {
    toast(kind === 'tab' ? 'Sharing cancelled' : 'Could not start the microphone', e.message.slice(0, 90));
  }
}
async function startFile(file) {
  try { await audio.useFile(file); body.classList.remove('paused'); enter(); }
  catch (e) { toast('Could not play that file', e.message.slice(0, 90)); }
}
audio.onEnded = () => { updateNow(); toast('Audio sharing stopped', 'Back to the demo beat'); };

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

// ---------- Dock and settings ----------
$('nowBtn').onclick = showWelcome;
$('changeSource').onclick = showWelcome;
$('prevBtn').onclick = () => setScene(state.scene - 1);
$('nextBtn').onclick = () => setScene(state.scene + 1);
$('autoBtn').onclick = () => { setAuto(!auto); toast(auto ? 'Auto-cycle on' : 'Auto-cycle off'); };
$('autoSwitch').onclick = () => setAuto(!auto);
$('colorBtn').onclick = shiftColors;
$('symDown').onclick = () => setSymmetry(state.k - 2);
$('symUp').onclick = () => setSymmetry(state.k + 2);
$('sens').oninput = e => { audio.sensitivity = +e.target.value; };
$('trails').oninput = e => { trailsSetting = +e.target.value; };
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
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { setScene(state.scene + (dx < 0 ? 1 : -1)); return; }
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
  if (k >= '1' && k <= String(SCENES.length)) setScene(+k - 1);
  else if (k === ' ' || k === 'arrowright') { e.preventDefault(); setScene(state.scene + 1); }
  else if (k === 'arrowleft') setScene(state.scene - 1);
  else if (k === 'a') { setAuto(!auto); toast(auto ? 'Auto-cycle on' : 'Auto-cycle off'); }
  else if (k === ']') { setSymmetry(state.k + 2); toast('Symmetry ' + state.k); }
  else if (k === '[') { setSymmetry(state.k - 2); toast('Symmetry ' + state.k); }
  else if (k === 'c') shiftColors();
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
  const L = audio.level;
  Object.assign(state, { t: now, b: L.b, m: L.m, h: L.h, beat: L.beat, trails: 0.62 + 0.4 * trailsSetting });
  state.z += dt * (0.35 + L.b * 1.6);
  if (auto && now - sceneStart > 60) setScene(state.scene + 1);   // keep moving through quiet passages
  renderer.adapt(dt, now);
  renderer.render(audio.freq, state);
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
