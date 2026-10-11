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
  const medals = ['🥇', '🥈', '🥉'];
  list.forEach((r, i) => {
    const li = document.createElement('li');
    const day = new Date(r.day + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long' });
    li.innerHTML = `
      <div class="photo"><span>${r.photoId ? '…' : '📷'}</span></div>
      <div><div><b class="name"></b> <span class="muted day"></span></div><div class="title muted"></div></div>
      <div class="pts">${medals[i] || ''} ${r.score}</div>`;
    li.querySelector('.name').textContent = r.name;
    li.querySelector('.day').textContent = day;
    li.querySelector('.title').textContent = r.title;
    el.append(li);
    if (r.photoId) {
      loadPhoto(r.photoId)
        .then((src) => {
          const img = new Image();
          img.alt = `Selfie di ${r.name}`;
          img.src = src;
          img.onclick = () => openPhoto(src, `${r.name} · ${r.score} · ${r.title}`);
          li.querySelector('.photo').replaceChildren(img);
        })
        .catch(() => (li.querySelector('.photo span').textContent = '📷'));
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
      <button id="btn-ref">📸 Foto di riferimento</button>`;
    el.querySelector('#btn-ref').onclick = takeReference;
    return;
  }

  // 2) Sudometro di oggi già fatto
  if (me.sudometroToday) {
    el.innerHTML = `<p class="score"></p><p class="score-title"></p><p class="muted center">Il Sudometro di oggi è fatto. Domani si replica!</p>`;
    el.querySelector('.score').textContent = me.sudometroToday.score;
    el.querySelector('.score-title').textContent = me.sudometroToday.title;
  } else {
    // 3) Selfie da sudato: uno al giorno
    el.innerHTML = `
      <p class="muted">Al momento peggiore dell'allenamento fatti un selfie da sudato, nello stesso punto della foto di riferimento. Uno al giorno: scegli bene il momento! Lo vedrà tutto il gruppo 😏</p>
      <button id="btn-sweat">🥵 Selfie da sudato</button>`;
    el.querySelector('#btn-sweat').onclick = () => takeSweat(false);
  }

  if (me.debug) {
    el.insertAdjacentHTML('beforeend', `
      <div class="debug">
        <button id="btn-debug" class="secondary">🐞 Prova subito (debug)</button>
        <p class="muted">Il risultato finisce nel foglio segnato come debug: non conta in classifica e non avvisa nessuno. Puoi ripeterla quante volte vuoi.</p>
        <pre id="debug-out"></pre>
      </div>`);
    el.querySelector('#btn-debug').onclick = () => takeSweat(true);
    if (lastDebug) el.querySelector('#debug-out').textContent = lastDebug;
  }

  el.insertAdjacentHTML('beforeend', '<p class="center"><button id="btn-reref" class="link">Rifai la foto di riferimento</button></p>');
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

async function takeReference() {
  try {
    const canvas = await sudometro.takeSelfie('Foto di riferimento: viso al centro, da riposato, buona luce', {
      live: state.me.debug,
    });
    if (!canvas) return;
    toast('Analizzo…', 10000);
    const features = await sudometro.analyze(canvas);
    const r = await api('setReference', { features, photo: sudometro.toJpegBase64(canvas) });
    toast(photoWarning(r) || 'Foto di riferimento salvata ✅ Da ora basta il selfie da sudato.', 5000);
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
  return state.me.debug && r && r.photoError ? `⚠️ ${r.photoError}` : '';
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
$('viewer').addEventListener('click', () => ($('viewer').hidden = true));
$('btn-copy-link').addEventListener('click', async () => {
  const link = `${cfg.appsScriptUrl}?action=checkin&code=${encodeURIComponent(session.code)}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Link copiato 📋 Ora incollalo in Comandi.');
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
