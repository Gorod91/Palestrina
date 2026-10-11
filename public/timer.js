// Timer addominali: niente suoni, a fine tempo lo schermo pulsa finché non lo tocchi.

const $ = (id) => document.getElementById(id);
const KEY = 'palestrina.timer';
const MIN = 5;
const MAX = 600;
const STEP = 5;

let seconds = load();
let deadline = null; // ms epoch di fine, null se fermo
let frame = null;
let wakeLock = null;

function load() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= MIN && v <= MAX ? v : 30;
  } catch {
    return 30;
  }
}

function save() {
  try {
    localStorage.setItem(KEY, String(seconds));
  } catch { /* storage non disponibile */ }
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function setSeconds(v) {
  seconds = Math.max(MIN, Math.min(MAX, Math.round(v)));
  save();
  render();
}

function render() {
  $('timer-display').textContent = fmt(seconds);
  document.querySelectorAll('.timer-presets button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.seconds) === seconds);
  });
  const running = deadline !== null;
  $('timer-start').hidden = running;
  $('timer-running').hidden = !running;
  document.querySelector('.timer-set').classList.toggle('dim', running);
  document.querySelector('.timer-presets').classList.toggle('dim', running);
}

// Tiene lo schermo acceso mentre il timer corre (dove Safari lo permette).
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch { /* non supportato o negato: pazienza */ }
}

function releaseAwake() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function start() {
  deadline = Date.now() + seconds * 1000;
  render();
  keepAwake();
  tick();
}

function tick() {
  const left = deadline - Date.now();
  if (left <= 0) return finish();
  const s = Math.ceil(left / 1000);
  $('timer-left').textContent = s >= 60 ? fmt(s) : String(s);
  $('timer-running').style.setProperty('--p', String(1 - left / (seconds * 1000)));
  frame = requestAnimationFrame(tick);
}

function cancel() {
  cancelAnimationFrame(frame);
  deadline = null;
  releaseAwake();
  render();
}

function finish() {
  cancelAnimationFrame(frame);
  deadline = null;
  render();
  $('timer-alarm').hidden = false;
}

function stopAlarm() {
  $('timer-alarm').hidden = true;
  releaseAwake();
}

export function initTimer() {
  $('timer-minus').onclick = () => setSeconds(seconds - STEP);
  $('timer-plus').onclick = () => setSeconds(seconds + STEP);
  $('timer-display').onclick = () => {
    const v = prompt('Durata in secondi', String(seconds));
    if (v !== null && Number(v) > 0) setSeconds(Number(v));
  };
  document.querySelectorAll('.timer-presets button').forEach((b) => {
    b.onclick = () => setSeconds(Number(b.dataset.seconds));
  });
  $('timer-start').onclick = start;
  $('timer-running').onclick = cancel;
  $('timer-alarm').onclick = stopAlarm;

  // Tornando nell'app: se il tempo è scaduto mentre era in background, parte subito il lampeggio.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (deadline !== null) {
      keepAwake();
      cancelAnimationFrame(frame);
      tick();
    } else if (!$('timer-alarm').hidden) {
      keepAwake();
    }
  });
  render();
}
