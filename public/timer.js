// Timer addominali: niente suoni, a fine tempo lo schermo pulsa finché non lo tocchi.

const $ = (id) => document.getElementById(id);
const MIN = 5;
const MAX = 600;
const STEP = 5;
const DEFAULT = 30;

let seconds = DEFAULT;
let account = null; // { name, save(seconds) }: l'ultimo tempo usato è salvato per ogni account
let deadline = null; // ms epoch di fine, null se fermo
let frame = null;
let wakeLock = null;

const valid = (v) => Number.isFinite(v) && v >= MIN && v <= MAX;
const localKey = () => `palestrina.timer.${account ? account.name : ''}`;

function loadLocal() {
  try {
    return Number(localStorage.getItem(localKey()));
  } catch {
    return NaN;
  }
}

function saveLocal() {
  try {
    localStorage.setItem(localKey(), String(seconds));
  } catch { /* storage non disponibile */ }
}

/**
 * Collega il timer all'account: usa il tempo salvato in Apps Script (`serverSeconds`),
 * altrimenti quello del telefono, altrimenti 30 secondi.
 */
export function setTimerAccount(name, serverSeconds, save) {
  if (account && account.name === name) return; // già impostato: non sovrascrive le modifiche in corso
  account = { name, save };
  const local = loadLocal();
  seconds = valid(serverSeconds) ? serverSeconds : valid(local) ? local : DEFAULT;
  if (deadline === null) render();
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function setSeconds(v) {
  seconds = Math.max(MIN, Math.min(MAX, Math.round(v)));
  saveLocal();
  render();
}

function render() {
  $('timer-display').textContent = fmt(seconds);
  const running = deadline !== null;
  $('timer-start').hidden = running;
  $('timer-running').hidden = !running;
  document.querySelector('.timer-set').classList.toggle('dim', running);
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
  saveLocal();
  if (account && account.save) account.save(seconds); // ultimo tempo usato, anche su altri telefoni
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
