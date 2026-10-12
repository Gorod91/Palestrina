import * as sudometro from './sudometro.js';
import { initTimer, setTimerAccount } from './timer.js';

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
let lastDebug = null; // ultimo risultato di prova (solo utenti debug)

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

const TAB_TITLES = { oggi: 'Riepilogo', classifica: 'Classifica', timer: 'Timer', altro: 'Altro' };

function show(screen) {
  ['install', 'config', 'login', 'home'].forEach((s) => ($(`screen-${s}`).hidden = s !== screen));
  $('tabbar').hidden = screen !== 'home';
  document.body.classList.toggle('has-tabbar', screen === 'home');
  if (screen !== 'home') $('page-title').textContent = 'Palestrina';
  $('avatar').hidden = !(screen === 'home' && session && session.name);
  if (!$('avatar').hidden) {
    $('avatar').textContent = session.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
}

/** Titoli salvati prima di questa versione potevano contenere emoji: le togliamo. */
const clean = (t) => String(t || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim();

/** Anello in stile Fitness: `value` da 0 a 1 (oltre 1 resta pieno). */
function ring(value, color, color2, { size = 120, width = 16 } = {}) {
  const r = (size - width) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  return `<svg viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color2}"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-opacity=".22" stroke-width="${width}"/>
    ${v > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${width}" stroke-linecap="round"
      stroke-dasharray="${c * v} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
  </svg>`;
}

const COLORS = {
  move: ['#fa114f', '#ff4f7b'],
  exercise: ['#a6ff00', '#d4ff4f'],
  stand: ['#00d9ff', '#64ecff'],
};

function render() {
  if (!state) return;
  const { me, week } = state;

  const btn = $('btn-checkin');
  btn.disabled = me.checkedInToday;
  btn.classList.toggle('done', me.checkedInToday);
  btn.innerHTML = me.checkedInToday ? '<svg><use href="#i-check"/></svg>Check-in fatto oggi' : 'Sono in palestra';

  const mine = week.ranking.find((r) => r.name === me.name) || { count: 0, goal: me.goal, streak: 0 };
  $('week-ring').innerHTML = ring(mine.count / mine.goal, ...COLORS.move, { size: 132, width: 20 });
  $('week-count').textContent = mine.count;
  $('week-goal').textContent = `/${mine.goal}`;
  $('week-streak').textContent = mine.streak;

  $('ranking').innerHTML = '';
  week.ranking.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.name === me.name) li.className = 'me';
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <span class="ring">${ring(r.count / r.goal, ...COLORS.move, { size: 44, width: 7 })}</span>
      <div><div class="name"></div><div class="sub">${r.streak ? `${r.streak} ${r.streak === 1 ? 'settimana' : 'settimane'} di fila` : 'Obiettivo ' + r.goal}</div></div>
      <span class="count">${r.count}<small>/${r.goal}</small></span>`;
    li.querySelector('.name').textContent = r.name;
    $('ranking').append(li);
  });
  $('pomodoro').textContent = week.pomodoro ? `Sudometro più alto: ${week.pomodoro.name}, ${week.pomodoro.score}` : '';

  renderSudometro();
  renderGallery();
}

const photoCache = new Map(); // id → Promise<dataURL>

function loadPhoto(id) {
  if (!photoCache.has(id)) {
    photoCache.set(
      id,
      api('photo', { id })
        .then((r) => `data:${r.mime};base64,${r.data}`)
        .catch((err) => {
          photoCache.delete(id);
          throw err;
        })
    );
  }
  return photoCache.get(id);
}

function renderGallery() {
  const list = state.week.sudometro || [];
  $('card-gallery').hidden = !list.length;
  const el = $('gallery');
  el.innerHTML = '';
  list.forEach((r, i) => {
    const li = document.createElement('li');
    const day = new Date(r.day + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long' });
    const title = clean(r.title);
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <div class="photo"><svg><use href="#i-camera"/></svg></div>
      <div><div class="name"></div><div class="sub"></div></div>
      <div class="pts">${r.score}</div>`;
    li.querySelector('.name').textContent = r.name;
    li.querySelector('.sub').textContent = `${title} · ${day}`;
    el.append(li);
    if (r.photoId) {
      loadPhoto(r.photoId)
        .then((src) => {
          const img = new Image();
          img.alt = `Selfie di ${r.name}`;
          img.src = src;
          img.onclick = () => openPhoto(src, `${r.name} · ${r.score} · ${title}`);
          li.querySelector('.photo').replaceChildren(img);
        })
        .catch(() => {});
    }
  });
}

function openPhoto(src, caption) {
  $('viewer-img').src = src;
  $('viewer-caption').textContent = caption;
  $('viewer').hidden = false;
}

function renderSudometro() {
  const el = $('sudo-body');
  const { me } = state;
  el.innerHTML = '';

  // 1) Prima volta: foto di riferimento
  if (!me.reference) {
    el.innerHTML = `
      <p>Il Sudometro confronta un selfie da sudato con una <b>foto di riferimento</b> da riposato, che si fa <b>una volta sola</b>.</p>
      <p class="muted">Meglio farla in palestra prima di allenarti, nel punto e con la luce dove farai i selfie da sudato. Le foto vengono salvate nel Google Drive di Palestrina; i selfie da sudato li vede tutto il gruppo nella classifica della settimana.</p>
      <button id="btn-ref" class="primary">Foto di riferimento</button>`;
    el.querySelector('#btn-ref').onclick = takeReference;
    return;
  }

  // 2) Sudometro di oggi già fatto
  if (me.sudometroToday) {
    el.innerHTML = `
      <div class="sudo-result">
        <div class="ring">${ring(me.sudometroToday.score / 100, ...COLORS.stand, { size: 112, width: 16 })}</div>
        <div>
          <p class="metric stand">${me.sudometroToday.score}<small>/100</small></p>
          <p class="sudo-title"></p>
          <p class="sudo-text">Il Sudometro di oggi è fatto. Domani si replica.</p>
        </div>
      </div>`;
    el.querySelector('.sudo-title').textContent = clean(me.sudometroToday.title);
  } else {
    // 3) Selfie da sudato: uno al giorno
    el.innerHTML = `
      <p class="muted">Al momento peggiore dell'allenamento fatti un selfie da sudato, nello stesso punto della foto di riferimento. Uno al giorno: scegli bene il momento. Lo vedrà tutto il gruppo.</p>
      <button id="btn-sweat" class="primary">Selfie da sudato</button>`;
    el.querySelector('#btn-sweat').onclick = () => takeSweat(false);
  }

  if (me.debug) {
    el.insertAdjacentHTML('beforeend', `
      <div class="debug">
        <button id="btn-debug" class="secondary">Prova subito (debug)</button>
        <p class="muted" style="margin-top:8px;font-size:13px">Il risultato finisce nel foglio segnato come debug: non conta in classifica e non avvisa nessuno. Puoi ripeterla quante volte vuoi.</p>
        <pre id="debug-out"></pre>
      </div>`);
    el.querySelector('#btn-debug').onclick = () => takeSweat(true);
    if (lastDebug) el.querySelector('#debug-out').textContent = lastDebug;
  }

  el.insertAdjacentHTML('beforeend', '<button id="btn-reref" class="link">Rifai la foto di riferimento</button>');
  el.querySelector('#btn-reref').onclick = () => {
    if (confirm('Rifare la foto di riferimento? Quella vecchia verrà sostituita.')) takeReference();
  };
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
    setTimerAccount(state.me.name, state.me.timerSeconds, (s) => api('setTimer', { seconds: s }).catch(() => {}));
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
    toast(r.alreadyToday ? 'Avevi già fatto check-in oggi' : 'Check-in fatto. Gli altri lo sapranno.');
  } catch (err) {
    btn.disabled = false;
    toast(`Errore: ${err.message}`);
  }
  refresh();
}

async function takeReference() {
  try {
    const canvas = await sudometro.takeSelfie('Foto di riferimento: viso al centro, da riposato, buona luce', {
      live: state.me.debug,
    });
    if (!canvas) return;
    toast('Analizzo…', 10000);
    const features = await sudometro.analyze(canvas);
    const r = await api('setReference', { features, photo: sudometro.toJpegBase64(canvas) });
    toast(photoWarning(r) || 'Foto di riferimento salvata. Da ora basta il selfie da sudato.', 5000);
    refresh();
  } catch (err) {
    toast(cameraError(err));
  }
}

async function takeSweat(debug) {
  try {
    const reference = state.me.reference.features;
    const canvas = await sudometro.takeSelfie('Selfie da sudato: stesso punto della foto di riferimento', {
      live: state.me.debug,
      reference,
    });
    if (!canvas) return;
    toast('Analizzo…', 10000);
    const features = await sudometro.analyze(canvas);
    const result = sudometro.score(reference, features);
    const r = await api('sudometro', {
      score: result.score,
      title: result.title,
      details: result.details,
      debug,
      photo: sudometro.toJpegBase64(canvas),
    });
    if (debug) {
      lastDebug = [
        `${result.score}: ${result.title}`,
        `rossore +${result.details.red} · lucidità +${result.details.shine} · luce ${result.details.light}`,
        ...result.warnings,
        photoWarning(r),
      ].filter(Boolean).join('\n');
      toast('Prova di debug salvata');
    } else {
      toast(result.warnings.length ? result.warnings.join(' ') : `${result.score}: ${result.title}`, 6000);
    }
    refresh();
  } catch (err) {
    toast(cameraError(err));
  }
}

/** Avviso per gli utenti debug se la foto non è finita su Drive (es. Drive non ancora autorizzato). */
function photoWarning(r) {
  return state.me.debug && r && r.photoError ? `Attenzione: ${r.photoError}` : '';
}

function cameraError(err) {
  if (err && err.name === 'NotAllowedError') return 'Serve il permesso per la fotocamera: Impostazioni → Safari → Fotocamera';
  return err && err.message ? err.message : 'Qualcosa è andato storto';
}

// ---------- Tab ----------

const TABS = ['oggi', 'classifica', 'timer', 'altro'];

function selectTab(name) {
  if (!TABS.includes(name)) name = 'oggi';
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.tab !== name));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  store.set('tab', name);
  $('page-title').textContent = TAB_TITLES[name];
  $('scroller').scrollTop = 0;
}

function logout() {
  setTimerAccount('', null, null);
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
  selectTab(store.get('tab'));
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
$('viewer').addEventListener('click', () => ($('viewer').hidden = true));
$('avatar').addEventListener('click', () => selectTab('altro'));
$('today-date').textContent = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
try {
  initTimer();
} catch (err) {
  console.error('Timer non disponibile', err); // il resto dell'app deve funzionare comunque
}
$('btn-copy-link').addEventListener('click', async () => {
  const link = `${cfg.appsScriptUrl}?action=checkin&code=${encodeURIComponent(session.code)}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Link copiato. Ora incollalo in Comandi.');
  } catch {
    prompt('Copia questo link:', link);
  }
});
$('btn-browser').addEventListener('click', () => {
  sessionStorage.setItem('palestrina.browser', '1');
  start();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session && state) refresh();
});

async function start() {
  window.__palestrinaStarted = true;
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
