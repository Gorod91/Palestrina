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
let goAt = 0; // fine del conto alla rovescia iniziale
let runMs = 0; // durata del giro in corso: l'anello si calcola su questa, anche se nel frattempo cambia "seconds"
let touched = false; // tempo cambiato (o timer avviato) prima che si sapesse di chi è l'account
const COUNTDOWN = 3;

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
 * Collega il timer all'account. Vale, nell'ordine: il tempo appena scelto (se l'utente l'ha cambiato prima che
 * arrivasse la risposta del server), l'ultimo tempo usato su questo telefono, quello salvato in Apps Script
 * (per un telefono nuovo), 30 secondi. Se il server ha un valore diverso (es. salvataggio perso per la rete) lo riallinea.
 */
/** Numero del conto alla rovescia 3-2-1: il "salto" parte quando il numero cambia, non a tempo fisso
 *  (altrimenti per un attimo si ingrandisce il numero vecchio prima di cambiare). */
export function popCount(el, txt) {
  if (el.textContent === txt) return;
  el.textContent = txt;
  if (el.animate) el.animate([{ transform: 'scale(1.25)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 1000, easing: 'ease-out' });
}

// ---------- Lampeggio fermato muovendo il telefono (timer addominali e timer dell'allenamento) ----------
// Su iPhone il permesso al movimento si chiede con un tocco: lo chiediamo quando si fa partire un timer.
let motionOk = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function';
export function askMotion() {
  if (motionOk || typeof DeviceMotionEvent === 'undefined' || !DeviceMotionEvent.requestPermission) return;
  DeviceMotionEvent.requestPermission().then((r) => (motionOk = r === 'granted')).catch(() => {});
}
/** Basta muovere il telefono (sollevarlo, girarlo, scuoterlo) per fermare il lampeggio: si confronta l'accelerazione con
 *  la sua media degli ultimi istanti. Il primo secondo non conta, per la vibrazione di fine. */
export function shakeToStop(alarm) {
  if (!motionOk) return;
  const from = Date.now() + 1000;
  let avg = null;
  const off = () => {
    window.removeEventListener('devicemotion', on);
    obs.disconnect();
  };
  const on = (ev) => {
    const a = ev.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (!avg || Date.now() < from) {
      avg = { x: a.x, y: a.y, z: a.z };
      return;
    }
    if (Math.abs(a.x - avg.x) + Math.abs(a.y - avg.y) + Math.abs(a.z - avg.z) > 3.5) {
      off();
      if (!alarm.hidden) alarm.click();
      return;
    }
    avg = { x: avg.x * 0.9 + a.x * 0.1, y: avg.y * 0.9 + a.y * 0.1, z: avg.z * 0.9 + a.z * 0.1 };
  };
  const obs = new MutationObserver(() => alarm.hidden && off()); // fermato col dito: smetto di ascoltare
  obs.observe(alarm, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('devicemotion', on);
}

export function setTimerAccount(name, serverSeconds, save) {
  if (account && account.name === name) return; // già impostato: non sovrascrive le modifiche in corso
  account = { name, save };
  if (!name) {
    touched = false;
    seconds = DEFAULT;
  } else if (touched) {
    touched = false;
    saveLocal(); // il tempo scelto prima del login vale per questo account
  } else {
    const local = loadLocal();
    seconds = valid(local) ? local : valid(serverSeconds) ? serverSeconds : DEFAULT;
  }
  if (name && save && seconds !== serverSeconds) save(seconds);
  if (deadline === null) render();
}

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function setSeconds(v) {
  seconds = Math.max(MIN, Math.min(MAX, Math.round(v)));
  if (!account || !account.name) touched = true;
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
  askMotion();
  if (!account || !account.name) touched = true;
  saveLocal();
  if (account && account.save) account.save(seconds); // ultimo tempo usato, anche su altri telefoni
  // 3 secondi di conto alla rovescia prima che parta il tempo
  goAt = Date.now() + COUNTDOWN * 1000;
  runMs = seconds * 1000;
  deadline = goAt + runMs;
  render();
  keepAwake();
  tick();
}

function tick() {
  const now = Date.now();
  const counting = now < goAt;
  $('timer-running').classList.toggle('counting', counting);
  if (counting) {
    popCount($('timer-left'), String(Math.ceil((goAt - now) / 1000)));
    $('timer-running').style.setProperty('--p', '0');
    frame = requestAnimationFrame(tick);
    return;
  }
  const left = deadline - now;
  if (left <= 0) return finish();
  const s = Math.ceil(left / 1000);
  $('timer-left').textContent = s >= 60 ? fmt(s) : String(s);
  $('timer-running').style.setProperty('--p', String(Math.min(1, Math.max(0, 1 - left / runMs))));
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
  shakeToStop($('timer-alarm'));
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
