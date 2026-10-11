import * as sudometro from './sudometro.js';

const cfg = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const configured = cfg.appsScriptUrl && cfg.appsScriptUrl.startsWith('https://');

const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(`palestrina.${key}`)); } catch { return null; }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(`palestrina.${key}`);
      else localStorage.setItem(`palestrina.${key}`, JSON.stringify(value));
    } catch { /* storage non disponibile */ }
  },
};

let session = store.get('session'); // { code, name }
let state = null;
let registration = null;

// ---------- Backend ----------

async function api(action, data = {}) {
  // text/plain evita la richiesta preflight CORS, che Apps Script non gestisce.
  const res = await fetch(cfg.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, code: session && session.code, ...data }),
  });
  const out = await res.json();
  if (out.error) throw new Error(out.error);
  return out;
}

// ---------- Interfaccia ----------

let toastTimer;
function toast(msg, ms = 3500) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), ms);
}

function show(screen) {
  ['install', 'config', 'login', 'home'].forEach((s) => ($(`screen-${s}`).hidden = s !== screen));
  $('hello').textContent = screen === 'home' && session ? `Ciao ${session.name}` : '';
}

function render() {
  if (!state) return;
  const { me, week } = state;

  const btn = $('btn-checkin');
  btn.disabled = me.checkedInToday;
  btn.classList.toggle('done', me.checkedInToday);
  btn.textContent = me.checkedInToday ? '✅ Check-in fatto oggi' : '💪 Sono in palestra';
  const mine = week.ranking.find((r) => r.name === me.name);
  $('checkin-status').textContent = mine
    ? `Questa settimana: ${mine.count}/${mine.goal}${mine.streak ? ` · 🔥 ${mine.streak} ${mine.streak === 1 ? 'settimana' : 'settimane'}` : ''}`
    : '';

  $('ranking').innerHTML = '';
  week.ranking.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.name === me.name) li.className = 'me';
    const pct = Math.min(100, Math.round((r.count / r.goal) * 100));
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <div><span class="name"></span>${r.streak ? ` <span class="muted">🔥${r.streak}</span>` : ''}
        <div class="bar"><span class="${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></span></div></div>
      <span class="count">${r.count}/${r.goal}</span>`;
    li.querySelector('.name').textContent = r.name;
    $('ranking').append(li);
  });
  $('pomodoro').textContent = week.pomodoro ? `🍅 Pomodoro della settimana: ${week.pomodoro.name} (${week.pomodoro.score})` : '';

  renderSudometro();
}

function renderSudometro() {
  const el = $('sudo-body');
  const { me } = state;
  const rest = store.get('rest');
  const today = new Date().toDateString();
  const restToday = rest && rest.day === today && me.sudometroStartedAt ? rest : null;
  el.innerHTML = '';

  if (me.sudometroToday) {
    el.innerHTML = `<p class="score"></p><p class="score-title"></p><p class="muted center">Il Sudometro di oggi è fatto. Domani si replica!</p>`;
    el.querySelector('.score').textContent = me.sudometroToday.score;
    el.querySelector('.score-title').textContent = me.sudometroToday.title;
    return;
  }

  if (!restToday) {
    el.innerHTML = `
      <p class="muted">Un selfie a inizio allenamento e uno al momento peggiore (almeno ${cfg.sudometroMinMinutes} minuti dopo), nello stesso punto e con la stessa luce. Le foto restano sul telefono.</p>
      <button id="btn-rest">📸 Selfie "riposato"</button>`;
    const b = el.querySelector('#btn-rest');
    if (!me.checkedInToday) {
      b.disabled = true;
      el.insertAdjacentHTML('beforeend', '<p class="muted center">Prima fai check-in 💪</p>');
    }
    b.onclick = takeRest;
    return;
  }

  const elapsed = (Date.now() - restToday.at) / 60000;
  const left = Math.ceil(cfg.sudometroMinMinutes - elapsed);
  const at = new Date(restToday.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    <p class="muted">Selfie riposato scattato alle ${at}.</p>
    <button id="btn-sweat">🥵 Selfie "sudato"</button>
    <p class="muted center" id="sweat-wait"></p>
    <button id="btn-restart" class="link">Rifai il selfie riposato</button>`;
  const b = el.querySelector('#btn-sweat');
  if (left > 0) {
    b.disabled = true;
    el.querySelector('#sweat-wait').textContent = `Disponibile tra ${left} ${left === 1 ? 'minuto' : 'minuti'}`;
  }
  b.onclick = () => takeSweat(restToday);
  el.querySelector('#btn-restart').onclick = takeRest;
}

// ---------- Azioni ----------

async function login(code) {
  session = { code: code.trim().toUpperCase() };
  try {
    const r = await api('login');
    session.name = r.name;
    store.set('session', session);
    await home();
  } catch (err) {
    session = null;
    toast(err.message === 'Codice non valido' ? 'Codice non valido, controlla e riprova' : `Errore: ${err.message}`);
  }
}

async function refresh() {
  try {
    state = await api('state');
    render();
  } catch (err) {
    if (err.message === 'Codice non valido') return logout();
    toast(`Non riesco a caricare i dati: ${err.message}`);
  }
}

async function checkin() {
  const btn = $('btn-checkin');
  btn.disabled = true;
  try {
    const r = await api('checkin');
    toast(r.alreadyToday ? 'Avevi già fatto check-in oggi' : 'Check-in fatto! Gli altri lo sapranno 😏');
  } catch (err) {
    btn.disabled = false;
    toast(`Errore: ${err.message}`);
  }
  refresh();
}

async function takeRest() {
  try {
    const canvas = await sudometro.takeSelfie('Selfie "riposato": viso al centro, buona luce');
    if (!canvas) return;
    toast('Analizzo…', 10000);
    const features = await sudometro.analyze(canvas);
    await api('sudometroStart');
    store.set('rest', { at: Date.now(), day: new Date().toDateString(), features });
    toast(`Fatto! Torna tra ${cfg.sudometroMinMinutes} minuti per il selfie sudato`);
    refresh();
  } catch (err) {
    toast(cameraError(err));
  }
}

async function takeSweat(rest) {
  try {
    const canvas = await sudometro.takeSelfie('Selfie "sudato": stesso punto, stessa luce');
    if (!canvas) return;
    toast('Analizzo…', 10000);
    const features = await sudometro.analyze(canvas);
    const result = sudometro.score(rest.features, features);
    await api('sudometro', { score: result.score, title: result.title, details: result.details });
    store.set('rest', null);
    toast(result.warnings.length ? result.warnings.join(' ') : `${result.score}: ${result.title}`, 6000);
    refresh();
  } catch (err) {
    toast(cameraError(err));
  }
}

function cameraError(err) {
  if (err && err.name === 'NotAllowedError') return 'Serve il permesso per la fotocamera: Impostazioni → Safari → Fotocamera';
  return err && err.message ? err.message : 'Qualcosa è andato storto';
}

function logout() {
  session = null;
  state = null;
  store.set('session', null);
  show('login');
}

// ---------- Notifiche ----------

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function updateNotifyCard() {
  if (!isStandalone || !pushSupported || !registration) {
    $('card-notify').hidden = true;
    return;
  }
  const sub = await registration.pushManager.getSubscription();
  $('card-notify').hidden = !!sub && Notification.permission === 'granted';
  // Se l'iscrizione è cambiata (es. rinnovata da iOS) la mandiamo di nuovo al foglio.
  if (sub && store.get('endpoint') !== sub.endpoint) {
    api('subscribe', { subscription: sub.toJSON() }).then(() => store.set('endpoint', sub.endpoint)).catch(() => {});
  }
}

async function enableNotifications() {
  try {
    // Su iOS il permesso va chiesto direttamente dentro il tap.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permesso negato. Per riattivarlo: Impostazioni → Notifiche → Palestrina');
    }
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
    });
    await api('subscribe', { subscription: sub.toJSON() });
    store.set('endpoint', sub.endpoint);
    toast('Notifiche attive! Tra circa un minuto arriva una notifica di prova.', 6000);
  } catch (err) {
    toast(err.message);
  }
  updateNotifyCard();
}

// ---------- Avvio ----------

async function home() {
  show('home');
  render();
  await refresh();
  updateNotifyCard();
  sudometro.preload();
}

$('form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  login($('in-code').value);
});
$('btn-checkin').addEventListener('click', checkin);
$('btn-notify').addEventListener('click', enableNotifications);
$('btn-logout').addEventListener('click', logout);
$('btn-browser').addEventListener('click', () => {
  sessionStorage.setItem('palestrina.browser', '1');
  start();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session && state) refresh();
});
// Aggiorna il conto alla rovescia del Sudometro.
setInterval(() => state && !$('screen-home').hidden && $('camera').hidden && renderSudometro(), 30000);

async function start() {
  if (!isStandalone && !sessionStorage.getItem('palestrina.browser')) return show('install');
  if (!configured) return show('config');
  if (!session) return show('login');
  home();
}

(async () => {
  if ('serviceWorker' in navigator) {
    registration = await navigator.serviceWorker.register('sw.js').catch(() => null);
  }
  // Chiede a iOS di non cancellare i dati salvati (codice, selfie riposato).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  start();
})();
