import * as sudometro from './sudometro.js';
import { initTimer, setTimerAccount, shakeEnabled, setShakeEnabled } from './timer.js';
import { createChat, answersList, bicep } from './chat.js';
import { fakeState, fakeChat, fakePhoto } from './fake.js';
import { createFbData } from './fbdata.js';
import { makeZip } from './zip.js';
import { createWorkout } from './allenamento.js';
import { alF, kingTitle } from './genere.js';
import { initSheetDrag } from './sheetdrag.js';
import { showSudoReveal } from './sudoreveal.js';
import { releaseNotesHtml } from './note.js';

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

// ---------- Diagnostica (accesa dal server per un singolo account) ----------
// Quando il server risponde trace:true, l'app registra cosa succede (richieste, errori, caricamenti, rete)
// e lo manda ogni tanto al foglio Debug. Chi usa l'app lo vede: badge "DIAGNOSTICA" sul titolo e un avviso
// all'accensione. Serve per capire un problema su un telefono a cui non abbiamo accesso.
const trace = (() => {
  let on = false;
  let buf = [];
  let flushing = false;
  let timer = null;
  const now = () => new Date().toTimeString().slice(0, 8);
  function schedule() {
    if (timer || !on) return;
    timer = setTimeout(flush, 4000);
  }
  function log(ev, d) {
    if (!on) return;
    buf.push({ t: now(), ev: String(ev), d: d == null ? '' : String(d) });
    if (buf.length > 80) buf = buf.slice(-80);
    schedule();
  }
  async function flush() {
    timer = null;
    if (flushing || !on || !buf.length || !session) return;
    flushing = true;
    const batch = buf;
    buf = [];
    try {
      await realApi('trace', { events: batch });
    } catch {
      buf = batch.concat(buf).slice(-80); // non è partito: riprova la prossima volta
    } finally {
      flushing = false;
      if (buf.length) schedule();
    }
  }
  return {
    set(v) {
      const was = on;
      on = !!v;
      document.body.classList.toggle('diag', on);
      if (on && !was) {
        log('acceso', `app ${APP_VERSION} · ${navigator.standalone ? 'home' : 'browser'} · ${navigator.onLine ? 'online' : 'offline'}`);
        if (!store.get('diagSeen')) {
          store.set('diagSeen', true);
          toast('🔧 Francesco ha attivato la diagnostica sulla tua app per sistemare la chat: registra solo errori e caricamenti, non i messaggi.', 8000);
        }
      }
      if (on) schedule();
    },
    isOn: () => on,
    log,
    flush,
  };
})();
let registration = null;
let lastDebug = null; // ultimo risultato di prova (solo utenti debug)

// ---------- Backend ----------

/** Dati fittizi (solo utenti debug): letture finte, scritture bloccate. */
function fakeOn() {
  return store.get('fakeData') === true && !!(state && state.me && state.me.debug);
}

// ---------- Tutto su Firebase ----------
// Con la novità attiva (o in modalità prova, quando il server lo prevede) lo stato arriva da Firestore e le azioni
// vanno in coda su Firestore: il telefono non aspetta Apps Script. Se Firebase non va, tutto torna come prima.
const QUEUE_ACTIONS = new Set(['checkin', 'checkinUndo', 'sudometro', 'setReference', 'setAlias', 'setTimer', 'chatMute', 'subscribe', 'sfida']);
let fbStarted = ''; // '', 'prova' o 'tutti': per chi è collegato
let fbLiveState = false; // stato arrivato da Firebase (dal server, non solo dalla copia sul telefono)
let fbRetryAt = 0;
// Stato arrivato da Firebase mentre un'azione era in corso: è più vecchio dell'azione, quindi si scarta
// (quello che la contiene arriva subito dopo l'esito)
let pendingState = null;
// Ultimo check-in (true) o annullamento (false) chiesto e salvato su Firebase: si vede sullo schermo finché il
// server non ha eseguito quell'azione e non è arrivato lo stato dopo. Gli stati arrivati nel frattempo (per
// esempio quello di un annullamento precedente, eseguito in ritardo) non lo cancellano.
let wantCheckin = null; // { value, done }
// Avviso al server dopo un'azione in coda; con il giro dopo gli dice quanto ha aspettato (misura dei tempi, in prova)
let lastPingMs = 0;
function pingCoda() {
  const t = Date.now();
  return realApi('coda', lastPingMs ? { last: lastPingMs } : {})
    .then(() => (lastPingMs = Date.now() - t))
    .catch(() => {});
}
const fbdata = createFbData({
  getToken: () => realApi('fbToken'),
  ping: pingCoda,
  onState(st, meta) {
    if (!meta.fromCache) fbLiveState = true;
    trace.log('firebase', `stato${meta.fromCache ? ' (dal telefono)' : ''}`);
    if (optimistic) {
      pendingState = st;
      return;
    }
    if (wantCheckin && wantCheckin.done) wantCheckin = null; // eseguito dal server: questo stato lo contiene
    applyState(st);
  },
  onError(err) {
    trace.log('firebase', `ERRORE ${err.code || ''} ${err.message}`);
    fbDataStop();
    fbRetryAt = Date.now() + 5 * 60000;
    if (debugOn()) toast(`Firebase non disponibile: ${err.message}`);
  },
});
/** Chi deve usare Firebase per tutto: '', 'prova' o 'tutti' (deciso dal server nello stato). */
function fbMode() {
  const f = (state && state.features) || {};
  // "Agisci come": stato e azioni di un altro, che su Firebase non ci sono per chi prova: si passa dal server
  if (testOn()) return f.provaTutto && !store.get('actAs') ? 'prova' : '';
  return f.firebaseTutto ? 'tutti' : '';
}
const fbOk = () => !!fbStarted && fbdata.ready() && fbLiveState;
function fbDataCheck() {
  const want = session && state && state.me ? fbMode() : '';
  if (want === fbStarted) return;
  fbDataStop();
  if (!want || Date.now() < fbRetryAt) return;
  fbStarted = want;
  fbdata.start({ name: state.me.name }, want === 'prova').catch(fbdataFail);
  realApi('coda').catch(() => {}); // stato del nuovo giorno e azioni rimaste in coda
}
function fbdataFail(err) {
  trace.log('firebase', `non disponibile: ${err.message}`);
  fbDataStop();
  fbRetryAt = Date.now() + 5 * 60000;
}
function fbDataStop() {
  wantCheckin = null;
  if (!fbStarted) return;
  fbdata.stop();
  fbStarted = '';
  fbLiveState = false;
}
/** Lo stato con sopra il check-in (o l'annullamento) appena fatto e non ancora arrivato dal server. */
function withLocal(st) {
  if (!st || !st.me || !wantCheckin || !!st.me.checkedInToday === wantCheckin.value) return st;
  const delta = wantCheckin.value ? 1 : -1;
  return {
    ...st,
    me: { ...st.me, checkedInToday: delta > 0 },
    week: { ...st.week, ranking: st.week.ranking.map((r) => (r.name === st.me.name ? { ...r, count: Math.max(0, r.count + delta) } : r)) },
    presenzeMese: withMyDay(st.presenzeMese, st.me.name, delta),
  };
}
/** Presenze del mese con il check-in di oggi aggiunto (delta 1) o tolto (delta -1). */
function withMyDay(pm, name, delta) {
  if (!pm) return pm;
  return {
    ...pm,
    people: pm.people.map((p) => {
      if (p.name !== name) return p;
      const days = p.days.filter((d) => d !== pm.today);
      return { ...p, days: delta > 0 ? days.concat(pm.today) : days };
    }),
  };
}
let serverState = null; // ultimo stato arrivato dal server, senza le azioni appena fatte sul telefono
function applyState(st) {
  serverState = st;
  state = withLocal(st);
  store.set('state', { day: new Date().toDateString(), test: testOn(), data: state });
  if (!state.me.admin && !state.me.tester && testOn()) store.set('testMode', null);
  setTimerAccount(state.me.name, state.me.timerSeconds, (s) => api('setTimer', { seconds: s }).catch(() => {}));
  render();
}
/**
 * Azione in coda su Firebase; le foto si caricano prima direttamente su Firebase. Senza rete non parte niente:
 * errore subito (e il server scarta le azioni arrivate più di 5 minuti dopo il tocco, se la rete era instabile).
 */
function fbCall(action, data) {
  if (!navigator.onLine) return Promise.reject(new Error('sei offline: riprova quando c\'è rete'));
  const d = { ...data, tapAt: Date.now(), ...(testOn() && store.get('actAs') ? { actAs: store.get('actAs') } : {}) };
  if (d.photo && (action === 'sudometro' || action === 'setReference')) {
    d.photoId = fbdata.putPhoto(d.photo, action === 'setReference' ? 'riferimento' : 'sudato');
    photoCache.set(d.photoId, Promise.resolve(`data:image/jpeg;base64,${d.photo}`)); // già sul telefono: non si riscarica
    delete d.photo;
  }
  if (!FAST_ACTIONS.has(action)) return fbdata.call(action, d);
  // Fatta quando Firebase conferma di averla salvata; se poi il server la rifiuta o non risponde, errore e si torna
  // all'ultimo stato del server
  const isCheckin = action === 'checkin' || action === 'checkinUndo';
  const want = isCheckin ? { value: action === 'checkin', done: false } : null;
  if (want) wantCheckin = want;
  const mine = () => wantCheckin === want; // nel frattempo può essere arrivata un'altra richiesta
  return fbdata
    .call(action, d, {
      onResult(r) {
        if (want && mine()) want.done = true; // il prossimo stato dal server lo contiene
        if (action === 'checkin' && r.alreadyToday) toast('Avevi già fatto check-in oggi');
      },
      onError(err) {
        if (want && mine()) wantCheckin = null;
        toast(`Errore: ${err.message}`);
        if (serverState) applyState(serverState);
      },
    })
    .then(
      (r) => {
        if (want && serverState) applyState(serverState); // check-in o annullamento visibili subito sullo schermo
        return r;
      },
      (err) => {
        if (want && mine()) wantCheckin = null; // non è nemmeno arrivata a Firebase
        throw err;
      },
    );
}
// Azioni date per fatte appena salvate su Firebase (le altre aspettano la risposta del server: punteggio, sfide…)
const FAST_ACTIONS = new Set(['checkin', 'checkinUndo', 'setTimer', 'chatMute', 'setAlias', 'subscribe']);
/** Foto da Firebase; quelle non ancora copiate da Drive le dà Apps Script. */
async function fbPhotos(ids) {
  const photos = {};
  const missing = [];
  await Promise.all(ids.map((id) => fbdata.photo(id).then((p) => (photos[id] = p)).catch(() => missing.push(id))));
  if (missing.length) Object.assign(photos, (await realApi('photos', { ids: missing })).photos || {});
  return { photos };
}

async function api(action, data = {}) {
  if (!fakeOn() && fbOk()) {
    if (action === 'state') return state;
    if (action === 'photos') return fbPhotos(data.ids || []);
    if (QUEUE_ACTIONS.has(action)) return fbCall(action, data);
  }
  if (store.get('fakeData') === true && action !== 'login') {
    if (action === 'state') {
      const real = await realApi('state');
      return real.me.debug ? fakeState(real) : real;
    }
    if (fakeOn()) {
      if (action === 'chat') return data.v === 1 ? { v: 1, same: true } : fakeChat(state.me);
      if (action === 'photo' && String(data.id).startsWith('fake-')) return fakePhoto(String(data.id));
      if (action !== 'photo' && action !== 'photos') throw new Error('Dati fittizi attivi: spegnili in Altro per usare l\'app davvero');
    }
  }
  return realApi(action, data);
}

/** Modalità prova (solo admin): il server lavora su fogli di prova e manda le notifiche solo a chi prova. */
const ADMIN_FOOT = (document.getElementById('admin-foot') || {}).innerHTML || '';

function testOn() {
  return store.get('testMode') === true && !!session;
}

// Letture con un tempo massimo: su iPhone una richiesta interrotta (app in background a metà caricamento)
// può restare appesa per sempre, e chi la aspetta (es. la chat) non riproverebbe più.
const READ_TIMEOUT = { chat: 20000, state: 20000, photos: 30000 };

async function realApi(action, data = {}) {
  const ms = READ_TIMEOUT[action];
  const ctrl = ms && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl && setTimeout(() => ctrl.abort(), ms);
  const traced = trace.isOn() && action !== 'trace';
  const t0 = Date.now();
  let out;
  try {
    // text/plain evita la richiesta preflight CORS, che Apps Script non gestisce.
    const res = await fetch(cfg.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, code: session && session.code, ver: APP_VERSION, ...(testOn() ? { test: true, actAs: store.get('actAs') || undefined } : {}), ...data }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    out = await res.json();
  } catch (err) {
    if (traced) trace.log('richiesta ' + action, (ctrl && ctrl.signal.aborted ? 'TIMEOUT' : (err instanceof TypeError ? 'RETE ' + err.message : 'ERRORE ' + (err.message || err))) + ` · ${Date.now() - t0} ms`);
    if (ctrl && ctrl.signal.aborted) throw new Error('il server non risponde, riprova');
    if (err instanceof TypeError) throw new Error('connessione non riuscita');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (traced) trace.log('richiesta ' + action, `${out.error ? 'risposta errore ' + out.error : 'ok'} · ${Date.now() - t0} ms${action === 'chat' ? ' v=' + (data.v) : ''}`);
  if (out.error) throw new Error(out.error);
  return out;
}

// ---------- Interfaccia ----------

let toastTimer;
/** Bicipite dentro un pulsante finché `work` non finisce. */
async function withBusy(btn, label, work) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('with-bicep');
  btn.innerHTML = `${bicep()}${label}`;
  try {
    return await work();
  } finally {
    btn.innerHTML = html;
    btn.classList.remove('with-bicep');
    btn.disabled = false;
  }
}

/** Bicipite al posto del contenuto del Sudometro (analisi del selfie, invio della foto). */
function sudoBusy(text) {
  $('sudo-body').innerHTML = `<div class="loading">${bicep()}<p></p></div>`;
  $('sudo-body').querySelector('p').textContent = text;
}

// Errori (connessione, server, azioni non riuscite): in rosso e un po' più a lungo, per non confonderli
const TOAST_ERROR = /^errore|offline|connessione|non risponde|non ha risposto|non disponibile|non inviat|non salvat|non caricat|non riesco|troppo tardi/i;

function toast(msg, ms = 3500) {
  const error = TOAST_ERROR.test(msg);
  $('toast').textContent = msg;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), error ? Math.max(ms, 6000) : ms);
}

const TAB_TITLES = { oggi: 'Home', classifica: 'Classifica', chat: 'Chat', timer: 'Timer', allenamento: 'Allenamento', altro: 'Impostazioni' };

function show(screen) {
  ['install', 'config', 'login', 'home'].forEach((s) => ($(`screen-${s}`).hidden = s !== screen));
  $('tabbar').hidden = screen !== 'home';
  document.body.classList.toggle('has-tabbar', screen === 'home');
  if (screen !== 'home') $('page-title').textContent = 'Palestrina';
  $('avatar').hidden = !(screen === 'home' && session && session.name);
  if (!$('avatar').hidden) {
    const shown = session.display || session.name;
    $('avatar').textContent = shown.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
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

/** Gli utenti debug possono spegnere la modalità dalle impostazioni e vedere l'app come gli altri. */
function debugOn() {
  return !!(state && state.me && state.me.debug) && store.get('debugOff') !== true;
}

function render() {
  if (!state) return;
  const { me, week } = state;
  showcase();
  askGoal();

  const btn = $('btn-checkin');
  btn.disabled = me.checkedInToday;
  btn.classList.toggle('done', me.checkedInToday);
  btn.innerHTML = me.checkedInToday ? `${savingCheckin ? bicep() : '<svg><use href="#i-check"/></svg>'}Check-in fatto oggi` : 'Sono in palestra';
  btn.classList.toggle('with-bicep', savingCheckin);
  $('btn-checkin-undo').hidden = !me.checkedInToday || savingCheckin;

  const mine = week.ranking.find((r) => r.name === me.name) || { count: 0, goal: me.goal, streak: 0 };
  $('week-ring').innerHTML = ring(mine.count / mine.goal, ...COLORS.move, { size: 132, width: 20 });
  $('week-count').textContent = mine.count;
  $('week-goal').textContent = `/${mine.goal}`;
  $('week-streak').textContent = mine.streak;

  renderPresence();
  renderPoints();
  workoutTab();
  renderAlbo();
  if (document.activeElement !== $('in-name')) $('in-name').value = me.alias || '';
  $('in-name').placeholder = me.name;
  $('name-hint').textContent = `È il nome che vedono gli altri in classifica e nelle notifiche. Lascia vuoto per usare il nome originale (${me.name}).`;
  if (!me.actingAs && session.display !== me.display) {
    session.display = me.display;
    store.set('session', session);
    show('home');
  }
  $('pomodoro').textContent = week.pomodoro ? `Sudometro più alto: ${week.pomodoro.display || week.pomodoro.name}, ${week.pomodoro.score}` : '';

  renderSudometro();
  renderGallery();
  renderRefCard(me.reference);
  $('debug-mode-card').hidden = !me.debug;
  $('icon-card').hidden = testOn(); // per tutti, con i dati veri
  $('workout-card').hidden = !workoutOn();
  // Admin: tutto. Chi è solo tester (PROVA_USERS nel server): solo l'interruttore della modalità prova.
  $('admin-card').hidden = !(me.admin || me.tester);
  $('admin-card-title').textContent = me.admin ? 'Admin' : 'Prova';
  $('btn-admin').hidden = !me.admin;
  $('btn-photos-zip').hidden = !me.admin;
  $('reinstall-g').textContent = isF(me.name) ? 'collegata' : 'collegato';
  $('admin-foot').innerHTML = me.admin ? ADMIN_FOOT : 'Modalità prova: tutto funziona davvero ma su una copia dei dati, e la chat usa Firebase (i messaggi li vede solo chi è in prova). Le notifiche arrivano solo a te.';
  $('debug-mode').checked = debugOn();
  $('fake-mode').checked = fakeOn();
  document.body.classList.toggle('fake-data', fakeOn());
  document.body.classList.toggle('test-mode', testOn());
  $('page-title').dataset.test = me.actingAs ? `PROVA · ${me.display}` : 'PROVA';
  $('test-mode').checked = testOn();
  $('test-tools').hidden = !testOn() || !me.admin;
  // "Agisci come": tutti tranne me (l'admin vero è quello della sessione)
  const others = week.ranking.filter((r) => r.name !== session.name);
  const opts = [['', `${session.display || session.name} (io)`]].concat(others.map((r) => [r.name, r.display]));
  const sel = $('act-as');
  const want = opts.map(([v, l]) => `${v}|${l}`).join(';');
  if (sel.dataset.opts !== want) {
    sel.innerHTML = opts.map(([v, l]) => `<option value="${escHtml(v)}">${escHtml(l)}</option>`).join('');
    sel.dataset.opts = want;
  }
  sel.value = store.get('actAs') || '';
  $('rule-apripista').hidden = !(state.features && state.features.apripista);
  $('rule-sfide').hidden = !(state.features && state.features.sfide);
  $('viewport-card').hidden = !debugOn();
  if (debugOn()) renderViewportDebug();
  $('chat-notify').checked = !me.chatMuted;
  chat.setUser({ name: me.name, display: me.display });
  chat.checkFirebase();
  fbDataCheck();
  chat.updateBadge(state.chatMeta);
  chat.updatePending(state.plans);
}

/** Misure dello schermo per capire eventuali fasce vuote su iPhone (solo utenti debug). */
function renderViewportDebug() {
  const probe = (h) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;visibility:hidden;height:${h}`;
    document.body.append(d);
    const v = d.getBoundingClientRect().height;
    d.remove();
    return Math.round(v);
  };
  const safe = (side) => probe(`env(safe-area-inset-${side})`);
  $('viewport-debug').textContent = [
    `schermo ${screen.width}×${screen.height}`,
    `innerHeight ${innerHeight} · visualViewport ${window.visualViewport ? Math.round(visualViewport.height) : '-'}`,
    `100vh ${probe('100vh')} · 100lvh ${probe('100lvh')} · 100dvh ${probe('100dvh')} · 100svh ${probe('100svh')}`,
    `app (body) ${Math.round(document.body.getBoundingClientRect().height)} · standalone ${document.documentElement.classList.contains('standalone')}`,
    `safe area alto ${safe('top')} · basso ${safe('bottom')}`,
  ].join('\n');
}

/** Re in carica: l'ultimo dell'albo d'oro, con la corona accanto al nome fino al prossimo. */
function isKing(name) {
  const albo = (state && state.albo) || [];
  return albo.length > 0 && albo[albo.length - 1].names.includes(name);
}

/** Chi ha "f" nella colonna Sesso di Utenti: i testi che parlano di lei sono al femminile. */
const isF = (name) => !!(state && state.fem && state.fem.includes(name));
const crownFor = (name) => `<svg class="crown" aria-label="${isF(name) ? 'Regina' : 'Re'} del mese"><use href="#i-crown"/></svg>`;
/** Testi del Sudometro rivolti a me: "da sudato" o "da sudata". */
const sudato = () => (state && state.me && isF(state.me.name) ? 'sudata' : 'sudato');
const riposato = () => (state && state.me && isF(state.me.name) ? 'riposata' : 'riposato');

const openPoints = new Set(); // dettagli aperti nella classifica a punti
const openPointGroups = new Set(); // voci aperte nel dettaglio: "nome|voce"
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
/** "2026-10-27" → "mar 27" */
function shortDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return `${GIORNI_BREVI[new Date(y, m - 1, d).getDay()]} ${d}`;
}

function renderPoints() {
  const pts = state.points;
  if (!pts) return;
  $('points-title').textContent = `Punti di ${pts.month}`;
  $('points').innerHTML = '';
  pts.ranking.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = `${r.name === state.me.name ? 'me ' : ''}${openPoints.has(r.name) ? 'open' : ''}`;
    const ach = r.detail.filter((g) => g.achievement);
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <div><div class="name"></div><div class="sub"></div></div>
      <span class="total">${r.total}<small> pt</small></span>
      <div class="detail"></div>`;
    li.querySelector('.name').textContent = r.display || r.name;
    if (isKing(r.name)) li.querySelector('.name').insertAdjacentHTML('beforeend', crownFor(r.name));
    li.querySelector('.sub').textContent = ach.length ? ach.map((g) => g.label).join(' · ') : 'Nessuna medaglia';
    const detail = li.querySelector('.detail');
    if (!r.detail.length) detail.textContent = 'Ancora nessun punto questo mese.';
    const sign = (n) => (n < 0 ? `${n}` : `+${n}`);
    r.detail.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'detail-row';
      row.innerHTML = '<span></span><b></b>';
      row.querySelector('span').textContent = g.achievement ? `Medaglia: ${g.label}` : g.count > 1 ? `${g.label} × ${g.count}` : g.label;
      row.querySelector('b').textContent = sign(g.pts);
      if (g.pts < 0) row.classList.add('minus');
      detail.append(row);
      // Tocco sulla voce: i giorni in cui sono arrivati i punti, con il motivo
      const items = (g.items || []).filter((it) => it.day || it.note);
      if (!items.length) return;
      const key = `${r.name}|${g.key}`;
      row.classList.add('tap');
      row.classList.toggle('open', openPointGroups.has(key));
      const list = document.createElement('div');
      list.className = 'entries';
      list.hidden = !openPointGroups.has(key);
      items
        .slice()
        .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
        .forEach((it) => {
          const e = document.createElement('div');
          e.className = `entry${it.pts < 0 ? ' minus' : g.achievement ? ' ach' : ''}`;
          e.innerHTML = '<span class="d"></span><span class="n"></span><span class="p"></span>';
          e.querySelector('.d').textContent = it.day ? shortDay(it.day) : 'mese';
          e.querySelector('.n').textContent = it.note;
          e.querySelector('.p').textContent = sign(it.pts);
          list.append(e);
        });
      row.onclick = (ev) => {
        ev.stopPropagation();
        if (openPointGroups.has(key)) openPointGroups.delete(key);
        else openPointGroups.add(key);
        row.classList.toggle('open');
        list.hidden = !list.hidden;
      };
      list.onclick = (ev) => ev.stopPropagation();
      detail.append(list);
    });
    li.onclick = () => {
      if (openPoints.has(r.name)) openPoints.delete(r.name);
      else openPoints.add(r.name);
      li.classList.toggle('open');
    };
    $('points').append(li);
  });
}

function renderAlbo() {
  const list = $('albo');
  list.innerHTML = '';
  const albo = (state.albo || []).slice().reverse();
  if (!albo.length) {
    list.innerHTML = '<li><span>Ancora nessun Re: il primo sarà incoronato l\'ultimo giorno del mese alle 21.</span></li>';
    return;
  }
  albo.forEach((a) => {
    const li = document.createElement('li');
    li.innerHTML = '<div><b></b><span></span></div><em></em>';
    li.querySelector('b').textContent = a.displays.join(', ');
    li.querySelector('span').textContent = a.label.charAt(0).toUpperCase() + a.label.slice(1);
    li.querySelector('em').textContent = `${a.total} pt`;
    list.append(li);
  });
}


const photoCache = new Map(); // id → Promise<url>
const PHOTO_STORE = 'palestrina-foto'; // le foto non cambiano mai: restano sul telefono dopo il primo caricamento
const photoWaiting = new Map(); // id → { resolve, reject } in attesa della prossima richiesta a gruppi
let photoTimer = null;

function loadPhoto(id) {
  if (!photoCache.has(id)) {
    const p = (String(id).startsWith('fake-') ? Promise.resolve(fakePhoto(String(id))).then((r) => `data:${r.mime};base64,${r.data}`) : fromStore(id)).catch((err) => {
      photoCache.delete(id);
      throw err;
    });
    photoCache.set(id, p);
  }
  return photoCache.get(id);
}

/** Prima dal telefono (Cache Storage), altrimenti da Apps Script insieme alle altre foto richieste in quel momento. */
async function fromStore(id) {
  const key = `./foto/${encodeURIComponent(id)}`;
  try {
    const hit = await caches.match(key, { cacheName: PHOTO_STORE });
    if (hit) return URL.createObjectURL(await hit.blob());
  } catch { /* Cache Storage non disponibile */ }
  const r = await new Promise((resolve, reject) => {
    photoWaiting.set(id, { resolve, reject });
    clearTimeout(photoTimer);
    photoTimer = setTimeout(fetchPhotos, 30);
  });
  const blob = await (await fetch(`data:${r.mime};base64,${r.data}`)).blob();
  try {
    await (await caches.open(PHOTO_STORE)).put(key, new Response(blob, { headers: { 'Content-Type': r.mime } }));
  } catch { /* pazienza: la rivedremo dalla rete */ }
  return URL.createObjectURL(blob);
}

async function fetchPhotos() {
  const batch = [...photoWaiting.entries()];
  photoWaiting.clear();
  for (let i = 0; i < batch.length; i += 12) {
    const group = batch.slice(i, i + 12);
    try {
      const { photos } = await api('photos', { ids: group.map(([id]) => id) });
      group.forEach(([id, w]) => (photos && photos[id] ? w.resolve(photos[id]) : w.reject(new Error('Foto non trovata'))));
    } catch (err) {
      group.forEach(([, w]) => w.reject(err));
    }
  }
}

// Presenze: "Settimana" con gli anelli, "Mese" con i giorni in palestra di tutto il mese (si riparte sempre dalla settimana)
let presenceMode = 'week';
$('presence-mode').querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    presenceMode = b.dataset.mode;
    renderPresence();
  };
});

function renderPresence() {
  const { me, week } = state;
  const pm = state.presenzeMese;
  const month = presenceMode === 'month' && !!pm;
  $('presence-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === (month ? 'month' : 'week')));
  $('presence-head').hidden = !month;
  $('presence-key').hidden = !month;
  $('pomodoro').hidden = month;
  $('ranking').innerHTML = '';
  if (month) return renderPresenceMonth(pm, me);
  week.ranking.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.name === me.name) li.className = 'me';
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <span class="ring">${ring(r.count / r.goal, ...COLORS.move, { size: 44, width: 7 })}</span>
      <div><div class="name"></div><div class="sub">${r.streak ? `${r.streak} ${r.streak === 1 ? 'settimana' : 'settimane'} di fila` : 'Obiettivo ' + r.goal}</div></div>
      <span class="count">${r.count}<small>/${r.goal}</small></span>`;
    li.querySelector('.name').textContent = r.display || r.name;
    if (isKing(r.name)) li.querySelector('.name').insertAdjacentHTML('beforeend', crownFor(r.name));
    $('ranking').append(li);
  });
}

/** Settimane (da lunedì) dei giorni del mese: [[primo giorno, ultimo giorno], …] come 'AAAA-MM-GG'. */
function monthWeeks(month) {
  const pad = (n) => String(n).padStart(2, '0');
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const weeks = [];
  for (let d = 1; d <= last; ) {
    const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 0 = lunedì
    const end = Math.min(last, d + 6 - dow);
    weeks.push([`${month}-${pad(d)}`, `${month}-${pad(end)}`]);
    d = end + 1;
  }
  return weeks;
}

function renderPresenceMonth(pm, me) {
  const weeks = monthWeeks(pm.month);
  const inMonth = (d) => d.slice(0, 7) === pm.month;
  $('presence-head').innerHTML = `<span></span><div class="strip">${weeks
    .map(([a, b]) => `<div class="wk${pm.today >= a && pm.today <= b ? ' now' : ''}" style="--n:${Number(b.slice(8)) - Number(a.slice(8)) + 1}"><span>${a.endsWith('-01') ? `1 ${MONTH_SHORT[Number(pm.month.slice(5)) - 1]}` : Number(a.slice(8))}</span></div>`)
    .join('')}</div>`;
  const people = pm.people
    .map((p) => ({ ...p, total: p.days.filter(inMonth).length }))
    .sort((a, b) => b.total - a.total || (a.display || a.name).localeCompare(b.display || b.name));
  people.forEach((p, i) => {
    const days = new Set(p.days);
    const strip = weeks
      .map(([a, b], w) => {
        let cells = '';
        for (let d = a; d <= b; d = nextDay(d)) cells += `<span class="d${days.has(d) ? ' in' : ''}${d > pm.today ? ' fut' : ''}${d === pm.today ? ' today' : ''}"></span>`;
        // obiettivo della settimana intera: per la prima contano anche i giorni del mese prima
        const n = p.days.filter((d) => d <= b && (w === 0 ? !inMonth(d) || d >= a : d >= a)).length;
        const bar = a > pm.today ? ' fut' : n >= ((p.goals && p.goals[w]) || p.goal) ? ' ok' : '';
        return `<div class="wk" style="--n:${Number(b.slice(8)) - Number(a.slice(8)) + 1}"><div class="days">${cells}</div><div class="bar${bar}"></div></div>`;
      })
      .join('');
    const li = document.createElement('li');
    li.className = 'month' + (p.name === me.name ? ' me' : '');
    li.innerHTML = `<span class="pos">${i + 1}</span><div class="name"></div><span class="count">${p.total}</span><div class="strip">${strip}</div>`;
    li.querySelector('.name').textContent = p.display || p.name;
    if (isKing(p.name)) li.querySelector('.name').insertAdjacentHTML('beforeend', crownFor(p.name));
    $('ranking').append(li);
  });
}

const MONTH_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function nextDay(d) {
  const t = new Date(d + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

// Galleria del Sudometro: parte sempre dalla settimana in corso; "Mese" mostra tutto il mese finché si resta lì
let galleryMode = 'week';
$('gallery-mode').querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    galleryMode = b.dataset.mode;
    renderGallery();
  };
});

function renderGallery() {
  const month = galleryMode === 'month';
  const list = (month ? state.sudometroMonth || state.week.sudometro : state.week.sudometro) || [];
  // la sezione c'è se c'è almeno un Sudometro nel mese (la settimana può essere vuota)
  $('card-gallery').hidden = !((state.sudometroMonth || state.week.sudometro || []).length);
  $('gallery-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === galleryMode));
  const el = $('gallery');
  el.innerHTML = list.length ? '' : `<li class="empty">Nessun Sudometro ${month ? 'questo mese' : 'questa settimana'}</li>`;
  list.forEach((r, i) => {
    const li = document.createElement('li');
    const day = new Date(r.day + 'T12:00:00').toLocaleDateString('it-IT', month ? { weekday: 'short', day: 'numeric' } : { weekday: 'long' });
    const title = alF(clean(r.title), isF(r.name));
    li.innerHTML = `
      <span class="pos">${i + 1}</span>
      <div class="photo"></div>
      <div><div class="name"></div><div class="sub"></div></div>
      <div class="pts">${r.score}</div>`;
    const who = r.display || r.name;
    li.querySelector('.name').textContent = who;
    li.querySelector('.sub').textContent = `${title} · ${day}`;
    el.append(li);
    li.querySelector('.photo').replaceWith(photoPair(r.photoId, r.refId || (state.refPhotos || {})[r.name], `${who} · ${r.score} · ${title}`, false, isF(r.name)));
  });
}

/** Impostazioni → Sudometro: la foto di riferimento sempre in vista (o l'invito a farla). */
let refShown;
function renderRefCard(ref) {
  const id = (ref && ref.photoId) || '';
  $('btn-reref').textContent = ref ? 'Rifai la foto di riferimento' : 'Fai la foto di riferimento';
  $('ref-when').textContent = !ref
    ? 'Non l\'hai ancora fatta: serve per il Sudometro.'
    : ref.at ? `Da ${riposato()}, fatta il ${new Date(ref.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.` : `Da ${riposato()}.`;
  if (id === refShown) return; // non ricaricare la foto a ogni aggiornamento
  refShown = id;
  const box = $('ref-photo');
  box.onclick = null;
  if (!id) {
    box.innerHTML = '<svg><use href="#i-camera"/></svg>';
    return;
  }
  box.innerHTML = bicep();
  loadPhoto(id)
    .then((src) => {
      if (refShown !== id) return;
      const img = new Image();
      img.alt = 'Foto di riferimento';
      img.src = src;
      box.replaceChildren(img);
      box.onclick = () => openPhoto(id, null, 'Foto di riferimento');
    })
    .catch(() => (box.innerHTML = '<svg><use href="#i-camera"/></svg>'));
}

/** Foto da fresco e da sudato una accanto all'altra; un tocco le apre in grande. f: le foto sono di una ragazza. */
function photoPair(sweatyId, freshId, caption, big = false, f = false) {
  const box = document.createElement('div');
  box.className = `pair${big ? ' big' : ''}`;
  const slot = (id, kind, label) => {
    const d = document.createElement('div');
    d.className = `ph ${kind}`;
    d.dataset.label = label;
    d.innerHTML = id ? bicep() : '<svg><use href="#i-camera"/></svg>';
    if (id) {
      loadPhoto(id)
        .then((src) => {
          const img = new Image();
          img.alt = label;
          img.src = src;
          d.replaceChildren(img);
        })
        .catch(() => (d.innerHTML = '<svg><use href="#i-camera"/></svg>'));
    }
    return d;
  };
  if (freshId) box.append(slot(freshId, 'fresh', f ? 'Fresca' : 'Fresco'));
  box.append(slot(sweatyId, 'sweaty', f ? 'Sudata' : 'Sudato'));
  if (sweatyId) box.onclick = () => openPhoto(sweatyId, freshId, caption, f);
  return box;
}

function openPhoto(sweatyId, freshId, caption, f = false) {
  document.querySelector('#viewer-fresh-fig figcaption').textContent = f ? 'Fresca' : 'Fresco';
  $('viewer-img').nextElementSibling.textContent = f ? 'Sudata' : 'Sudato';
  $('viewer-img').removeAttribute('src');
  $('viewer-fresh').removeAttribute('src');
  document.querySelectorAll('.viewer-pair figure').forEach((f) => {
    if (!f.querySelector('.ph-loading')) f.insertAdjacentHTML('afterbegin', `<div class="ph-loading">${bicep()}</div>`);
  });
  $('viewer-fresh-fig').hidden = !freshId;
  $('viewer-caption').textContent = caption;
  $('viewer').hidden = false;
  loadPhoto(sweatyId).then((src) => ($('viewer-img').src = src)).catch(() => {});
  if (freshId) loadPhoto(freshId).then((src) => ($('viewer-fresh').src = src)).catch(() => {});
}

function renderSudometro() {
  const el = $('sudo-body');
  const { me } = state;
  el.innerHTML = '';

  // 1) Prima volta: foto di riferimento
  if (!me.reference) {
    el.innerHTML = `
      <p>Il Sudometro confronta un selfie da ${sudato()} con una <b>foto di riferimento</b> da ${riposato()}, che si fa <b>una volta sola</b>.</p>
      <p class="muted">Meglio farla in palestra prima di allenarti, nel punto e con la luce dove farai i selfie da ${sudato()}. Le foto vengono salvate nell'archivio di Palestrina; i selfie da sudato li vede tutto il gruppo nella classifica della settimana.</p>
      <button id="btn-ref" class="primary">Foto di riferimento</button>`;
    el.querySelector('#btn-ref').onclick = takeReference;
    return;
  }

  // 2) Sudometro di oggi già fatto (o in attesa di rete sul telefono)
  const waiting = !me.sudometroToday && sudoWaiting();
  const sameDay = waiting && new Date(waiting.takenAt).toDateString() === new Date().toDateString();
  const sudoToday = me.sudometroToday || (sameDay && { score: waiting.data.score, title: waiting.data.title, photoId: '' });
  if (sudoToday) {
    el.innerHTML = `
      <div class="sudo-result">
        <div class="ring">${ring(sudoToday.score / 100, ...COLORS.stand, { size: 112, width: 16 })}</div>
        <div>
          <p class="metric stand">${sudoToday.score}<small>/100</small></p>
          <p class="sudo-title"></p>
          <p class="sudo-text">Il Sudometro di oggi è fatto. Domani si replica.</p>
        </div>
      </div>`;
    el.querySelector('.sudo-title').textContent = alF(clean(sudoToday.title), isF(me.name));
    if (sameDay) el.insertAdjacentHTML('beforeend', `<p class="saving-line">${bicep()}<span>Senza rete: la foto parte appena torna la connessione</span></p>`);
    if (sudoToday.saving) el.insertAdjacentHTML('beforeend', `<p class="saving-line">${bicep()}<span>Pubblico la foto…</span></p>`);
    if (sudoToday.photoId) {
      const t = sudoToday;
      el.append(photoPair(t.photoId, t.refId || (me.reference && me.reference.photoId), `${me.display} · ${t.score} · ${alF(clean(t.title), isF(me.name))}`, true, isF(me.name)));
    }
    if (debugOn() && !sameDay) {
      el.insertAdjacentHTML('beforeend', '<button id="btn-redo" class="secondary" style="margin-top:14px">Rifai e sovrascrivi (debug)</button>');
      el.querySelector('#btn-redo').onclick = () => takeSweat(false, true);
    }
  } else {
    // 3) Selfie da sudato: uno al giorno
    el.innerHTML = `
      <p class="muted">Al momento peggiore dell'allenamento fatti un selfie da ${sudato()}, nello stesso punto della foto di riferimento. Uno al giorno: scegli bene il momento. Lo vedrà tutto il gruppo.</p>
      <button id="btn-sweat" class="primary">Selfie da ${sudato()}</button>`;
    el.querySelector('#btn-sweat').onclick = () => takeSweat(false);
  }

  if (debugOn()) {
    el.insertAdjacentHTML('beforeend', `
      <div class="debug">
        <button id="btn-debug" class="secondary">Prova subito (debug)</button>
        <p class="muted" style="margin-top:8px;font-size:13px">Il risultato finisce nel foglio segnato come debug: non conta in classifica e non avvisa nessuno. Puoi ripeterla quante volte vuoi.</p>
        <pre id="debug-out"></pre>
      </div>`);
    el.querySelector('#btn-debug').onclick = () => takeSweat(true);
    if (lastDebug) el.querySelector('#debug-out').textContent = lastDebug;
  }

}

// ---------- Azioni ----------

async function login(code) {
  session = { code: code.trim().toUpperCase() };
  try {
    const r = await api('login');
    trace.set(r.trace);
    session.name = r.name;
    session.display = r.display;
    store.set('session', session);
    await home();
  } catch (err) {
    session = null;
    toast(err.message === 'Codice non valido' ? 'Codice non valido, controlla e riprova' : `Errore: ${err.message}`);
  }
}

// Azioni in corso mostrate subito sullo schermo: finché il server non risponde, i dati vecchi non le cancellano
let optimistic = 0;

async function refresh() {
  if (fbOk()) {
    // Lo stato arriva da Firebase da solo; quello arrivato durante un'azione è vecchio e si scarta
    pendingState = null;
    return;
  }
  try {
    const fresh = await api('state');
    trace.set(fresh.trace);
    if (optimistic) return;
    state = fresh;
    store.set('state', { day: new Date().toDateString(), test: testOn(), data: state });
    if (!state.me.admin && !state.me.tester && testOn()) store.set('testMode', null); // non più admin né tester: niente prova
    setTimerAccount(state.me.name, state.me.timerSeconds, (s) => api('setTimer', { seconds: s }).catch(() => {}));
    render();
  } catch (err) {
    if (err.message === 'Codice non valido') return logout();
    toast(`Non riesco a caricare i dati: ${err.message}`);
  }
}

let savingCheckin = false;

async function checkin() {
  if (!confirm('Confermi il check-in? Sei in palestra adesso?')) return;
  // Subito "Check-in fatto": il bicipite al posto della spunta finché il server conferma
  const before = state;
  state = {
    ...state,
    me: { ...state.me, checkedInToday: true },
    week: { ...state.week, ranking: state.week.ranking.map((r) => (r.name === state.me.name ? { ...r, count: r.count + 1 } : r)) },
    presenzeMese: withMyDay(state.presenzeMese, state.me.name, 1),
  };
  savingCheckin = true;
  optimistic++;
  render();
  try {
    const r = await api('checkin');
    toast(r.alreadyToday ? 'Avevi già fatto check-in oggi' : testOn() ? 'Check-in di prova fatto: la notifica arriva solo a te' : 'Check-in fatto. Gli altri lo sapranno.');
  } catch (err) {
    state = before; // non è andato: torna com'era
    toast(`Errore: ${err.message}`);
  }
  savingCheckin = false;
  optimistic--;
  render();
  refresh();
}

async function checkinUndo() {
  if (!confirm('Annullare il check-in di oggi?')) return;
  await withBusy($('btn-checkin-undo'), 'Annullo…', async () => {
    try {
      await api('checkinUndo');
      toast('Check-in annullato');
      chat.reload();
    } catch (err) {
      toast(`Errore: ${err.message}`);
    }
    await refresh();
  });
  render();
}

async function takeReference() {
  try {
    const canvas = await sudometro.takeSelfie(`Foto di riferimento: viso al centro, da ${riposato()}, buona luce`, {
      live: debugOn(),
    });
    if (!canvas) return;
    sudoBusy('Analizzo la foto…');
    const features = await sudometro.analyze(canvas);
    sudoBusy('Salvo la foto di riferimento…');
    const r = await api('setReference', { features, photo: sudometro.toJpegBase64(canvas) });
    toast(photoWarning(r) || `Foto di riferimento salvata. Da ora basta il selfie da ${sudato()}.`, 5000);
    await refresh();
  } catch (err) {
    toast(cameraError(err));
  }
  renderSudometro();
}

async function takeSweat(debug, overwrite = false) {
  try {
    const reference = state.me.reference.features;
    // Sudometro 2 ufficiale solo quando la novità è rilasciata; prima si calcola in silenzio (solo nel foglio).
    const v2live = !debug && !!(state.features && state.features.sudometro2);
    let canvas = await sudometro.takeSelfie(`Selfie da ${sudato()}: stesso punto della foto di riferimento`, {
      live: debugOn(),
      reference,
    });
    if (!canvas) return;
    sudoBusy('Analizzo il selfie…');
    let result = sudometro.score(reference, await sudometro.analyze(canvas));
    let photo = sudometro.toJpegBase64(canvas);
    let v2 = null;
    if (v2live) {
      v2 = await sudometroV2(photo);
      // Scatto da rifare (luce molto diversa o foto mossa): si chiede una volta sola, dicendo come.
      // Se anche il secondo non va, si tiene il meno peggio dei due con il punteggio ridotto.
      if (v2.res && v2.res.retake) {
        const hint = sudometro.RETAKE_HINT[v2.res.retake];
        toast(hint, 6000);
        const again = await sudometro.takeSelfie(hint, { live: debugOn(), reference });
        let keep = v2;
        let reduced = true;
        if (again) {
          sudoBusy('Analizzo il selfie…');
          const result2 = sudometro.score(reference, await sudometro.analyze(again));
          const photo2 = sudometro.toJpegBase64(again);
          const second = await sudometroV2(photo2, v2.rest);
          if (second.res && (!second.res.retake || sudometro.lessBadV2(v2.rest, v2.sweat, second.sweat) === 'b')) {
            keep = second;
            canvas = again;
            result = result2;
            photo = photo2;
          }
          reduced = !second.res || !!second.res.retake;
        }
        v2 = keep;
        if (reduced && v2.res) v2.res = sudometro.scoreV2(v2.rest, v2.sweat, { reduced: true });
        v2.retaken = true;
      }
    }
    // Dal 22/10 il punteggio ufficiale è il Sudometro 4 (senza annunci; dal 19/10 era il 3): si calcola prima di
    // mostrare il risultato. Se non riesce (riferimento non scaricabile, viso non trovato) resta la versione 1.
    if (!v2) v2 = await sudometroV2(photo);
    const shown = v2.res4
      ? { score: v2.res4.score, title: v2.res4.title, warnings: [] }
      : v2live && v2.res ? { score: v2.res.score, title: v2.res.title, warnings: [] } : result;
    let before = null;
    if (!debug) {
      // Il risultato si vede subito; la foto si pubblica intanto (bicipite finché non è caricata)
      before = state;
      state = { ...state, me: { ...state.me, sudometroToday: { score: shown.score, title: shown.title, photoId: '', saving: true } } };
      optimistic++;
      renderSudometro();
      // Il punteggio si rivela con il termometro, mentre la foto si pubblica
      const f = isF(state.me.name);
      showSudoReveal({
        score: shown.score,
        title: alF(clean(shown.title), f),
        titleAt: (v) => alF(clean((sudometro.TITLES.find(([min]) => v >= min) || sudometro.TITLES[sudometro.TITLES.length - 1])[1]), f),
        photo: `data:image/jpeg;base64,${photo}`,
      });
    } else sudoBusy('Pubblico la foto…');
    const r = await api('sudometro', {
      score: shown.score,
      title: shown.title,
      details: { ...result.details, v2: compactV2(v2), v3: compactV3(v2), v4: v2.res4 ? { score: v2.res4.score, ...v2.res4.details } : { err: v2.error || 'non calcolato' } },
      debug,
      overwrite,
      photo,
    }).catch((err) => {
      if (before) {
        state = before; // non è andato: torna com'era
        optimistic--;
        before = null;
        // Senza rete la foto resta sul telefono e parte da sola appena torna la connessione (entro un'ora)
        if (netError(err) && keepSudo({ score: shown.score, title: shown.title, details: { ...result.details, v2: compactV2(v2), v3: compactV3(v2), v4: v2.res4 ? { score: v2.res4.score, ...v2.res4.details } : { err: v2.error || 'non calcolato' } }, photo })) return null;
      }
      throw err;
    });
    if (!r) {
      toast('Niente rete: la foto resta sul telefono e parte da sola appena torna la connessione (entro un\'ora)', 6000);
      renderSudometro();
      return;
    }
    if (before) {
      optimistic--;
      // Con Firebase la foto si vede appena il server la accetta, senza aspettare il nuovo stato
      if (r.photoId && state.me.sudometroToday && state.me.sudometroToday.saving) {
        state = { ...state, me: { ...state.me, sudometroToday: { score: shown.score, title: shown.title, photoId: r.photoId, refId: r.refId || '' } } };
      }
    }
    if (debug) {
      lastDebug = [
        `${result.score}: ${alF(result.title, isF(state.me.name))}`,
        `rossore +${result.details.red} · lucidità +${result.details.shine} · luce ${result.details.light}`,
        v2.res4 ? `Sudometro 4: ${v2.res4.score} (riflessi ${v2.res4.details.shine} · luce ${v2.res4.details.light})` : '',
        v2.res3 ? `Sudometro 3: ${v2.res3.score} (riflessi ${v2.res3.details.shine} · bordo ${v2.res3.details.edge} · tinta ${v2.res3.details.red} · luce ×${v2.res3.details.lf})` : '',
        v2.res ? `Sudometro 2: ${v2.res.score} (tinta ${v2.res.details.red} · riflessi ${v2.res.details.shine} · luce ${v2.res.details.light} · nitidezza ×${v2.res.details.sharp}${v2.res.retake ? ` · da rifare: ${v2.res.retake}` : ''})` : `Sudometro 2: ${v2.error}`,
        ...result.warnings,
        photoWarning(r),
      ].filter(Boolean).join('\n');
      toast('Prova di debug salvata');
    } else {
      if (shown.warnings.length) toast(shown.warnings.join(' '), 6000); // il punteggio l'ha già mostrato il termometro
    }
    await refresh();
  } catch (err) {
    toast(cameraError(err));
  }
  renderSudometro(); // anche se l'aggiornamento non è riuscito, toglie il bicipite
}

// ---------- Sudometro senza rete ----------
// Se il selfie non parte per mancanza di rete, punteggio e foto restano sul telefono e si reinviano da soli
// (al ritorno della rete, riaprendo l'app o ogni 30 secondi) fino a un'ora dallo scatto; poi si scartano.
// Il server lo conta nel giorno dello scatto.
const SUDO_WAIT_MS = 60 * 60000;
const NET_ERRORS = /offline|connessione|non risponde|non ha risposto|firebase|troppo tardi|unavailable|fetch|load failed|network/i;
const netError = (err) => !navigator.onLine || NET_ERRORS.test(String((err && err.message) || err));
let sudoSending = false;

/** Salva sul telefono il Sudometro non partito; false se non c'è spazio (resta l'errore di prima). */
function keepSudo(data) {
  store.set('sudoWaiting', { name: state.me.name, test: testOn(), takenAt: Date.now(), data });
  return !!store.get('sudoWaiting');
}

/** Il mio Sudometro in attesa di rete (scartato dopo un'ora). */
function sudoWaiting() {
  const w = store.get('sudoWaiting');
  if (!w) return null;
  if (Date.now() - w.takenAt > SUDO_WAIT_MS) {
    store.set('sudoWaiting', null);
    toast('La foto del Sudometro non è partita entro un\'ora dallo scatto: scartata', 6000);
    return null;
  }
  return state && state.me && w.name === state.me.name && w.test === testOn() ? w : null;
}

async function sendWaitingSudo() {
  if (sudoSending || !session || !state || !state.me) return;
  const idle = () => !$('sudo-body').querySelector('.loading'); // non durante un altro selfie
  const had = store.get('sudoWaiting');
  const w = sudoWaiting();
  if (!w) {
    if (had && !store.get('sudoWaiting') && idle()) renderSudometro(); // appena scartato
    return;
  }
  if (!navigator.onLine) return;
  sudoSending = true;
  let changed = true;
  try {
    const r = await api('sudometro', { ...w.data, takenAt: w.takenAt });
    store.set('sudoWaiting', null);
    if (new Date(w.takenAt).toDateString() === new Date().toDateString()) {
      state = { ...state, me: { ...state.me, sudometroToday: { score: w.data.score, title: w.data.title, photoId: r.photoId || '', refId: r.refId || '' } } };
    }
    toast('Foto del Sudometro inviata');
    refresh();
  } catch (err) {
    if (netError(err)) {
      changed = false; // si riprova
      return;
    }
    store.set('sudoWaiting', null); // rifiutata dal server: inutile riprovare
    if (!/già fatto/.test(err.message)) toast(`Foto del Sudometro non inviata: ${err.message}`, 6000);
    refresh();
  } finally {
    sudoSending = false;
    if (changed && idle()) renderSudometro();
  }
}
setInterval(sendWaitingSudo, 30000);
window.addEventListener('online', () => setTimeout(sendWaitingSudo, 2000));

// ---------- Sudometro 2 ----------
// Si analizzano le foto così come vengono salvate (ritaglio del viso, 480 px): il riferimento si rilegge dalla sua
// foto su Drive, quindi nessuno deve rifare la foto di riferimento.
const refV2Cache = new Map();
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tempo scaduto')), ms))]);

async function imageFrom(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function refV2() {
  const id = state.me.reference && state.me.reference.photoId;
  if (!id) return Promise.reject(new Error('foto di riferimento non salvata'));
  if (!refV2Cache.has(id)) {
    refV2Cache.set(id, loadPhoto(id).then(imageFrom).then((img) => sudometro.analyzeV2(img)).catch((err) => {
      refV2Cache.delete(id);
      throw err;
    }));
  }
  return refV2Cache.get(id);
}

/** Punteggio del Sudometro 2 per una foto (JPEG base64): { rest, sweat, res } oppure { error }. Non blocca mai il selfie. */
async function sudometroV2(photo, rest = null) {
  try {
    rest = rest || (await within(refV2(), 20000));
    const sweat = await within(imageFrom(`data:image/jpeg;base64,${photo}`).then((img) => sudometro.analyzeV2(img)), 15000);
    return { rest, sweat, res: sudometro.scoreV2(rest, sweat), res3: rest.zones3 && sweat.zones3 ? sudometro.scoreV3(rest, sweat) : null, res4: rest.zones3 && sweat.zones3 ? sudometro.scoreV4(rest, sweat) : null };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

/** Cosa finisce nel foglio (colonna Dettagli): punteggio 2 e valori grezzi delle due foto, per tarare i pesi. */
function compactV2(v2) {
  if (!v2 || v2.error) return { err: v2 ? v2.error : 'non calcolato' };
  const raw = (f) => ({ L: f.L, h: f.hue, hl: f.zones, sh: f.sharp, g: f.gains });
  return { score: v2.res.score, retake: v2.res.retake || '', again: !!v2.retaken, ...v2.res.details, rif: raw(v2.rest), sud: raw(v2.sweat) };
}

/** Sudometro 3 (stesse foto del 2): punteggio, parti e riflessi per zona delle due foto. */
function compactV3(v2) {
  if (!v2 || !v2.res3) return { err: (v2 && v2.error) || 'non calcolato' };
  return { score: v2.res3.score, retake: v2.res3.retake || '', ...v2.res3.details, rif: v2.rest.zones3, sud: v2.sweat.zones3, glr: v2.rest.gloss3, gls: v2.sweat.gloss3 };
}

/** Avviso per gli utenti debug se la foto non è finita su Drive (es. Drive non ancora autorizzato). */
function photoWarning(r) {
  return debugOn() && r && r.photoError ? `Attenzione: ${r.photoError}` : '';
}

function cameraError(err) {
  if (err && err.name === 'NotAllowedError') return 'Serve il permesso per la fotocamera: Impostazioni → Safari → Fotocamera';
  return err && err.message ? err.message : 'Qualcosa è andato storto';
}

// ---------- Chat ----------

initSheetDrag(); // fogli dal basso: si chiudono trascinandoli giù
const chat = createChat({ api, toast, photoPair, clean, isDebug: () => debugOn(), isKing, crown: crownFor, isF, openNews, trace: (ev, d) => trace.log(ev, d), useFirebase: () => (testOn() ? 'prova' : state && state.features && state.features.firebase ? 'tutti' : ''), fbOnly: () => fbOk() });

// ---------- Allenamento (fase 1, solo in prova) ----------

const workout = createWorkout({
  root: $('workout'),
  getToken: () => realApi('fbToken'),
  toast,
  openTimer: (go) => {
    selectTab('timer');
    if (go && !$('timer-start').hidden) $('timer-start').click(); // ▶ dalla pagina Allenamento: parte subito
  },
  timerSeconds: () => (state && state.me && state.me.timerSeconds) || 30,
});
$('timer-back').addEventListener('click', () => selectTab('allenamento'));
// Indietro trascinando dal bordo sinistro, come nelle pagine di Allenamento: il timer segue il dito
// e sotto compare Allenamento; oltre metà schermo o con uno scatto si torna lì.
(() => {
  const edgeEl = $('timer-edge'), panel = edgeEl.parentElement;
  const under = document.querySelector('.tab-panel[data-tab="allenamento"]');
  let e = null;
  const move = (dx, anim) => {
    const f = Math.min(1, dx / panel.clientWidth), t = anim ? 'transform .22s ease-out' : '';
    panel.style.transition = t;
    panel.style.transform = `translateX(${dx}px)`;
    under.style.transition = anim ? t + ', opacity .22s ease-out' : '';
    under.style.transform = `translateX(${(f - 1) * 30}%)`;
    under.style.opacity = String(0.4 + 0.6 * f);
  };
  edgeEl.addEventListener('pointerdown', (ev) => {
    edgeEl.setPointerCapture(ev.pointerId);
    e = { x: ev.clientX, t: ev.timeStamp, dx: 0, v: 0, on: false };
  });
  edgeEl.addEventListener('pointermove', (ev) => {
    if (!e) return;
    const dx = Math.max(0, ev.clientX - e.x);
    if (!e.on && dx > 6) {
      e.on = true;
      $('scroller').classList.add('tm-swiping'); // prima di misurare: il pannello sotto si posiziona rispetto a #scroller
      Object.assign(under.style, { position: 'absolute', zIndex: '0', pointerEvents: 'none', top: panel.offsetTop + 'px', left: panel.offsetLeft + 'px', width: panel.offsetWidth + 'px' });
      under.hidden = false;
      panel.insertAdjacentHTML('afterbegin', '<div class="wo-cover"></div>');
    }
    if (!e.on) return;
    e.v = (dx - e.dx) / Math.max(1, ev.timeStamp - e.t);
    e.dx = dx;
    e.t = ev.timeStamp;
    move(dx, false);
  });
  const end = () => {
    const s = e;
    e = null;
    if (!s || !s.on) return;
    const go = s.dx > panel.clientWidth / 2 || s.v > 0.5;
    move(go ? panel.clientWidth : 0, true);
    setTimeout(() => {
      panel.querySelector('.wo-cover')?.remove();
      $('scroller').classList.remove('tm-swiping');
      [panel, under].forEach((el) => el.removeAttribute('style'));
      if (go) selectTab('allenamento');
      else under.hidden = true;
    }, 230);
  };
  edgeEl.addEventListener('pointerup', end);
  edgeEl.addEventListener('pointercancel', end);
})();
$('btn-workout-reset').addEventListener('click', async () => {
  if (!confirm("Segnare l'allenamento di oggi come non fatto? Le serie salvate oggi vengono cancellate.")) return;
  try {
    const n = await workout.resetToday();
    toast(n ? `Allenamento di oggi segnato come non fatto (${n} ${n === 1 ? 'esercizio' : 'esercizi'})` : 'Oggi non c\'erano esercizi segnati');
  } catch (err) {
    toast(`Errore: ${err.message}`);
  }
});

/** Il tab Timer diventa Allenamento (con il timer dentro) per chi ha l'allenamento attivo; per gli altri resta com'era. */
let workoutProva = null;
function workoutOn() {
  return !!(state && state.me && state.me.allenamento); // per ora solo chi è in WORKOUT_USERS (server), in prova o no
}
function workoutTab() {
  // solo per chi ha l'allenamento attivo: in prova con i dati di prova, fuori con quelli veri
  const prova = workoutOn() && !!(state && state.me);
  if (prova) workout.start({ name: state.me.name }, testOn());
  if (prova === workoutProva) return;
  workoutProva = prova;
  const btn = $('tab-timer');
  btn.dataset.tab = prova ? 'allenamento' : 'timer';
  btn.querySelector('use').setAttribute('href', prova ? '#i-dumbbell' : '#i-timer');
  btn.querySelector('span').textContent = prova ? 'Allenamento' : 'Timer';
  $('timer-back').hidden = !prova;
  $('timer-edge').hidden = !prova;
  if (!prova) workout.stop();
  const cur = store.get('tab');
  if (!prova && cur === 'allenamento') selectTab('timer');
  else if (cur === 'allenamento' || cur === 'timer') selectTab(cur);
}

// ---------- Tab ----------

const TABS = ['oggi', 'classifica', 'chat', 'timer', 'allenamento', 'altro'];

function selectTab(name) {
  if (!TABS.includes(name)) name = 'oggi';
  if (name === 'allenamento' && !workoutOn()) name = 'timer';
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.tab !== name));
  // in prova il timer sta dentro Allenamento: resta acceso il tasto di Allenamento
  const on = name === 'timer' && workoutOn() ? 'allenamento' : name;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === on));
  store.set('tab', name);
  $('page-title').textContent = TAB_TITLES[name];
  $('scroller').scrollTop = 0;
  document.body.classList.toggle('chat-mode', name === 'chat');
  chat.setActive(name === 'chat' && !!session);
  if (name === 'classifica' && galleryMode !== 'week' && state) {
    galleryMode = 'week'; // ogni volta che si apre la Classifica si riparte dalla settimana
    renderGallery();
  }
  if (name === 'classifica' && presenceMode !== 'week' && state) {
    presenceMode = 'week';
    renderPresence();
  }
}

async function saveAlias(value) {
  const alias = value.replace(/\s+/g, ' ').trim();
  if (alias === (state.me.alias || '')) return;
  const btn = $('btn-name');
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('with-bicep');
  btn.innerHTML = `${bicep()}Salvo…`;
  try {
    const r = await api('setAlias', { alias });
    session.display = r.display;
    store.set('session', session);
    show('home');
    toast(alias ? `Ora gli altri ti vedono come ${r.display}` : `Torni a chiamarti ${r.display}`);
    await refresh();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.innerHTML = label;
    btn.classList.remove('with-bicep');
    btn.disabled = false;
  }
}

function logout() {
  fbDataStop();
  setTimerAccount('', null, null);
  chat.reset();
  session = null;
  state = null;
  store.set('session', null);
  store.set('state', null);
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

// ---------- Novità (slide a tutto schermo) ----------

function openNews(id) {
  if (!/^[\w-]+$/.test(String(id))) return;
  // Novità di fine mese: davanti alle slide, l'incoronazione del Re di quel mese
  const n = ((state && state.news) || []).find((x) => x.id === id);
  const re = n && ((state && state.albo) || []).find((a) => a.key === n.month);
  const p = re && { re: (re.displays || re.names).join(' e '), titolo: kingTitle(re.names, isF), mese: re.label.split(' ')[0], punti: re.total, m: re.key };
  // Classifica completa del mese (slide prima dell'incoronazione): [nome, punti, 1 se sono io]
  if (re && re.ranking && re.ranking.length) p.classifica = JSON.stringify(re.ranking.map((r) => [r.display || r.name, r.total, r.name === state.me.name ? 1 : 0]));
  // Premiazioni del mese (slide prima della classifica): medaglie {chiave: [nomi]} e Divano d'oro [[nomi], presenze]
  if (re && re.ranking && re.ranking.length) {
    p.medaglie = JSON.stringify(re.medaglie || {});
    if (re.divano) p.divano = JSON.stringify([re.divano.displays || re.divano.names, re.divano.count]);
    if (re.pomodoro) p.sudo = re.pomodoro.score;
  }
  const q = re ? `?${new URLSearchParams(p)}` : '';
  $('news-frame').src = `news/${id}.html${q}`;
  $('news').hidden = false;
}
/** Appena si apre l'app dopo il rilascio di fine mese: Re e novità a tutto schermo, una volta sola (poi dalla chat). */
function showcase() {
  const id = state && state.showcase;
  if (!id || store.get('showcaseSeen') === id || !$('news').hidden) return;
  store.set('showcaseSeen', id);
  openNews(id);
}
function closeNews() {
  $('news').hidden = true;
  $('news-frame').src = 'about:blank';
  askGoal();
}

// ---------- Obiettivo del mese ----------
// Dopo le slide di fine mese (novità 'obiettivo' sul server) l'app chiede quante volte a settimana si verrà nel
// mese nuovo: foglio senza ×, che non si chiude finché non si sceglie e conferma.
const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GOAL_LABELS = ['', 'Il minimo sindacale', 'Costanza', 'Si fa sul serio', 'Modalità atleta', 'Vivi in palestra'];
const GOAL_MAX = 5;
let goalPick = 0;
let goalSaving = false;
const goalKey = (month) => `${state.me.name}|${testOn() ? 'prova' : ''}|${month}`;

function askGoal() {
  const month = state && state.me && state.me.goalAsk;
  if (!month || fakeOn() || store.get('goalSent') === goalKey(month) || !$('news').hidden || !$('goal-sheet').hidden) return;
  const name = MONTHS_IT[Number(month.slice(5, 7)) - 1];
  const cur = state.me.goal;
  const curName = MONTHS_IT[new Date().getMonth()];
  goalPick = 0;
  $('goal-eyebrow').textContent = name;
  $('goal-sub').textContent = `Quante volte a settimana vieni in palestra? Vale per tutto ${name}, dal primo lunedì.`;
  $('goal-chips').innerHTML = Array.from({ length: GOAL_MAX }, (_, k) => `<button type="button" data-n="${k + 1}">${k + 1}${k + 1 === cur ? `<small>${curName}</small>` : ''}</button>`).join('');
  renderGoal();
  $('goal-sheet').hidden = false;
}

function renderGoal() {
  const g = goalPick;
  $('goal-ring').innerHTML = ring(g / GOAL_MAX, ...COLORS.move, { size: 150, width: 18 });
  $('goal-n').textContent = g || '?';
  $('goal-lab').textContent = g ? GOAL_LABELS[g] : 'Scegli un numero';
  $('goal-chips').querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === g));
  const name = MONTHS_IT[Number(state.me.goalAsk.slice(5, 7)) - 1];
  $('goal-info').innerHTML = `${g ? `Circa <b>${Math.round((g * 30) / 7)} presenze</b> a ${name}. ` : ''}Su questo numero si contano anche <b>Settimane di fila</b> e <b>Mai saltato</b>. Non si cambia fino a fine mese.`;
  $('goal-go').disabled = !g || goalSaving;
  if (!goalSaving) $('goal-go').textContent = g ? `Conferma: ${g} a settimana` : 'Scegli un numero';
}

$('goal-chips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || goalSaving) return;
  goalPick = Number(b.dataset.n);
  renderGoal();
  $('goal-n').classList.remove('goal-pop');
  void $('goal-n').offsetWidth;
  $('goal-n').classList.add('goal-pop');
});
$('goal-sheet').addEventListener('click', (e) => {
  if (e.target !== $('goal-sheet')) return; // fuori dal foglio: non si chiude
  const card = $('goal-sheet').querySelector('.sheet-card');
  card.classList.remove('goal-shake');
  void card.offsetWidth;
  card.classList.add('goal-shake');
});
$('goal-go').addEventListener('click', async () => {
  const month = state.me.goalAsk;
  const goal = goalPick;
  if (!month || !goal || goalSaving) return;
  goalSaving = true;
  $('goal-go').disabled = true;
  $('goal-go').innerHTML = `${bicep()}Salvo…`;
  $('goal-go').classList.add('with-bicep');
  try {
    const r = await api('setGoal', { month, goal });
    if (r && r.error) throw new Error(r.error);
    store.set('goalSent', goalKey(month));
    $('goal-sheet').hidden = true;
    state.me.goalAsk = '';
    toast(`Obiettivo di ${MONTHS_IT[Number(month.slice(5, 7)) - 1]}: ${(r && r.goal) || goal} a settimana`);
    refresh();
  } catch (err) {
    toast(`Obiettivo non salvato: ${err.message}`);
  } finally {
    goalSaving = false;
    $('goal-go').classList.remove('with-bicep');
    renderGoal();
  }
});
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data && e.data.palestrinaNews === 'close') closeNews();
});

// ---------- Registro admin ----------

const ADMIN_FILTERS = [
  ['tutto', 'Tutto'], ['presenza', 'Check-in'], ['sudometro', 'Sudometro'], ['chat', 'Chat'],
  ['piano', 'Risposte'], ['sfida', 'Sfide'], ['penalita', 'Penalità'], ['annullati', 'Annullati'], ['aggiungi', 'Aggiungi check-in'],
];
let adminData = null;
let adminFilter = 'tutto';

const escHtml = (t) => String(t ?? '').replace(/[<&>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** "2026-10-14 06:29 Francesco" → "Annullato il 14/10 alle 06:29 da Francesco" */
const undoneWhen = (at) => {
  const [d, t, ...who] = String(at).split(' ');
  return `Annullato il ${d.slice(8, 10)}/${d.slice(5, 7)} alle ${t}${who.length ? ' da ' + who.join(' ') : ''}`;
};
const dayTitle = (d) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

async function openAdmin() {
  $('admin-sheet').hidden = false;
  $('admin-list').innerHTML = `<div class="loading">${bicep()}<p>Carico il registro…</p></div>`;
  renderAdminFilters();
  await loadAdmin();
}

async function loadAdmin() {
  try {
    adminData = await realApi('adminLog');
    renderAdmin();
  } catch (err) {
    $('admin-list').innerHTML = `<p class="muted">Errore: ${escHtml(err.message)}</p>`;
  }
}

function renderAdminFilters() {
  $('admin-filters').innerHTML = ADMIN_FILTERS.map(([k, label]) => `<button data-f="${k}" class="${k === adminFilter ? 'on' : ''}">${label}</button>`).join('');
}

function renderAdmin() {
  if (!adminData) return;
  const add = adminFilter === 'aggiungi';
  $('admin-add').hidden = !add;
  if (add) {
    $('admin-add-name').innerHTML = adminData.users.map((u) => `<option value="${escHtml(u.name)}">${escHtml(u.display)}</option>`).join('');
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    $('admin-add-day').max = iso;
    if (!$('admin-add-day').value) $('admin-add-day').value = iso;
    $('admin-list').innerHTML = '<p class="muted">Il check-in aggiunto non manda notifiche e non compare in chat, ma conta per punti e classifiche.</p>';
    return;
  }
  if (adminFilter === 'annullati') {
    $('admin-list').innerHTML = adminData.undone.length
      ? adminData.undone.map((u) => `<div class="admin-item"><div><b>${escHtml(u.text)}</b><span>${escHtml(undoneWhen(u.at))}</span></div><button class="restore" data-restore="${escHtml(u.id)}">Ripristina</button></div>`).join('')
      : '<p class="muted">Nessuna azione annullata.</p>';
    return;
  }
  const items = adminData.items.filter((i) => adminFilter === 'tutto' || i.kind === adminFilter || (adminFilter === 'sfida' && i.kind === 'sfidaRisultato'));
  let lastDay = '';
  $('admin-list').innerHTML = items.length
    ? items.map((i, n) => {
        const head = i.day !== lastDay ? `<h4 class="admin-day">${escHtml(dayTitle(i.day))}</h4>` : '';
        lastDay = i.day;
        const label = i.kind === 'penalita' ? 'Condona' : 'Annulla';
        return `${head}<div class="admin-item"><div><b>${escHtml(i.display)}${i.time ? ' · ' + escHtml(i.time) : ''}</b><span>${escHtml(i.text)}</span></div><button data-undo="${n}">${label}</button></div>`;
      }).join('')
    : '<p class="muted">Niente negli ultimi 31 giorni.</p>';
  adminData.shown = items;
}

$('btn-admin').addEventListener('click', openAdmin);
$('btn-photos-zip').addEventListener('click', photosZip);

// ---------- Admin: tutte le foto del Sudometro in uno zip ----------
// Primo tocco: prepara lo zip (foto da sudato, riferimenti e dati.json con punteggi e misure).
// Secondo tocco: lo condivide o lo salva (iPhone vuole un tocco "fresco" per aprire la condivisione).
let zipReady = null; // { blob, name, count }
const ZIP_LABEL = $('btn-photos-zip').textContent;

async function photosZip() {
  const btn = $('btn-photos-zip');
  if (zipReady) return shareZip();
  btn.disabled = true;
  const label = (t) => (btn.innerHTML = `${bicep()}${t}`);
  try {
    label('Preparo l\'elenco…');
    const { rows, refs } = await realApi('adminPhotos');
    const safe = (t) => String(t).normalize('NFD').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'x';
    const names = new Map(); // id foto → nome nel file zip
    rows.forEach((r) => {
      if (r.photoId) names.set(r.photoId, `sudato/${r.day}_${String(r.time).replace(':', '')}_${safe(r.name)}_${r.score}${r.debug ? '_debug' : ''}.jpg`);
    });
    rows.forEach((r) => {
      if (r.refId && !names.has(r.refId)) names.set(r.refId, `riferimenti/${safe(r.name)}_${r.day}_${r.refId.slice(-6)}.jpg`);
    });
    refs.forEach((r) => {
      if (!names.has(r.photoId)) names.set(r.photoId, `riferimenti/${safe(r.name)}_attuale.jpg`);
    });
    const ids = [...names.keys()];
    const files = [];
    for (let i = 0; i < ids.length; i += 8) {
      label(`Scarico le foto… ${i}/${ids.length}`);
      const { photos } = await realApi('adminPhotos', { ids: ids.slice(i, i + 8) });
      Object.entries(photos || {}).forEach(([id, p]) => files.push({ name: names.get(id), data: Uint8Array.from(atob(p.data), (c) => c.charCodeAt(0)) }));
    }
    const data = {
      esportato: new Date().toISOString(),
      sudometro: rows.map((r) => ({ ...r, file: names.get(r.photoId) || '', fileRiferimento: names.get(r.refId) || '' })),
      riferimentiAttuali: refs.map((r) => ({ name: r.name, features: r.features, file: names.get(r.photoId) || '' })),
    };
    files.push({ name: 'dati.json', data: new TextEncoder().encode(JSON.stringify(data, null, 2)) });
    const day = new Date().toLocaleDateString('en-CA');
    zipReady = { blob: makeZip(files), name: `sudometro-${day}${testOn() ? '-prova' : ''}.zip`, count: files.length - 1 };
    const missing = ids.length - zipReady.count;
    btn.textContent = `Zip pronto (${zipReady.count} foto): tocca per salvarlo o inviarlo`;
    if (missing) toast(`${missing} foto non trovate: sono nello zip le altre`);
  } catch (err) {
    btn.textContent = ZIP_LABEL;
    toast(`Errore: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function shareZip() {
  const { blob, name } = zipReady;
  zipReady = null;
  $('btn-photos-zip').textContent = ZIP_LABEL;
  const file = new File([blob], name, { type: 'application/zip' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title: name });
  } catch (err) {
    if (err.name === 'AbortError') return; // condivisione chiusa
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Margini in alto su iPhone (debug): per trovare dove iOS smette di sfocare. Salvati solo su questo telefono.
const IOS_MARGINS = { 'ios-top': 0, 'ios-chat': 22 };
function applyIosMargins() {
  Object.keys(IOS_MARGINS).forEach((k) => {
    const v = store.get(k);
    const val = typeof v === 'number' ? v : IOS_MARGINS[k];
    if (typeof v === 'number') document.documentElement.style.setProperty(`--${k}`, `${v}px`);
    else document.documentElement.style.removeProperty(`--${k}`);
    $(k).value = val;
    $(`${k}-val`).textContent = `${val} pt`;
  });
}
Object.keys(IOS_MARGINS).forEach((k) => $(k).addEventListener('input', (e) => {
  store.set(k, Number(e.target.value));
  applyIosMargins();
}));
$('ios-reset').addEventListener('click', () => {
  Object.keys(IOS_MARGINS).forEach((k) => store.set(k, null));
  applyIosMargins();
});
applyIosMargins();
$('act-as').addEventListener('change', async (e) => {
  store.set('actAs', e.target.value || null);
  store.set('state', null);
  toast(e.target.value ? `Ora agisci come ${e.target.selectedOptions[0].textContent} (solo in prova)` : 'Di nuovo te stesso');
  fbDataStop(); // agendo come un altro si passa dal server; tornando se stessi Firebase si ricollega
  await refresh();
  chat.reload();
});
$('test-mode').addEventListener('change', async (e) => {
  store.set('testMode', e.target.checked ? true : null);
  if (!e.target.checked) store.set('actAs', null); // fuori dalla prova si è sempre se stessi
  store.set('state', null);
  toast(e.target.checked ? 'Modalità prova attiva: niente arriva agli altri' : 'Modalità prova spenta: dati veri');
  fbDataStop(); // lo stato della modalità nuova lo si chiede al server, poi Firebase si ricollega a quella giusta
  fbRetryAt = 0;
  render();
  await refresh();
  chat.reload();
});
const testAction = (btn, label, data, done) => withBusy(btn, label, async () => {
  try {
    await realApi(...data);
    toast(done);
  } catch (err) {
    toast(`Errore: ${err.message}`);
  }
  await refresh();
  chat.reload();
});
$('btn-test-reset').addEventListener('click', () => {
  if (confirm('Riallineare la prova ai dati veri? Tutto quello fatto in prova viene cancellato.')) testAction($('btn-test-reset'), 'Riallineo…', ['testReset'], 'Prova riallineata ai dati veri');
});
$('btn-test-weekly').addEventListener('click', () => testAction($('btn-test-weekly'), 'Invio…', ['testRecap', { kind: 'weekly' }], 'Recap della settimana simulato'));
$('btn-test-news').addEventListener('click', () => testAction($('btn-test-news'), 'Rilascio…', ['testRecap', { kind: 'news' }], 'Novità rilasciate nella prova: guarda la chat'));
$('btn-test-monthly').addEventListener('click', () => testAction($('btn-test-monthly'), 'Invio…', ['testRecap', { kind: 'monthly' }], 'Premiazioni del mese simulate'));
$('admin-sheet').addEventListener('click', async (e) => {
  if (e.target === $('admin-sheet') || e.target.closest('.sheet-close')) {
    $('admin-sheet').hidden = true;
    return;
  }
  const f = e.target.closest('[data-f]');
  if (f) {
    adminFilter = f.dataset.f;
    renderAdminFilters();
    renderAdmin();
    return;
  }
  const undo = e.target.closest('[data-undo]');
  if (undo) {
    const it = adminData.shown[Number(undo.dataset.undo)];
    const what = it.kind === 'penalita' ? 'Condonare' : 'Annullare';
    if (!confirm(`${what}?\n${it.display}: ${it.text}\n\nSi può ripristinare dal filtro "Annullati". Nessuna notifica.`)) return;
    await withBusy(undo, '', async () => {
      try {
        const r = await realApi('adminUndo', { kind: it.kind, key: it.key });
        toast(r.text ? `Annullato: ${r.text}` : 'Annullato');
      } catch (err) {
        toast(`Errore: ${err.message}`);
      }
      await loadAdmin();
    });
    refresh().then(() => chat.reload());
    return;
  }
  const restore = e.target.closest('[data-restore]');
  if (restore) {
    if (!confirm('Ripristinare questa azione?')) return;
    await withBusy(restore, '', async () => {
      try {
        await realApi('adminRestore', { id: restore.dataset.restore });
        toast('Ripristinato');
      } catch (err) {
        toast(`Errore: ${err.message}`);
      }
      await loadAdmin();
    });
    refresh().then(() => chat.reload());
  }
});
$('admin-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('admin-add-name').value;
  const day = $('admin-add-day').value;
  const time = $('admin-add-time').value;
  if (!confirm(`Aggiungere un check-in a ${name}, ${day} alle ${time}?`)) return;
  await withBusy($('admin-add').querySelector('button'), 'Aggiungo…', async () => {
    try {
      await realApi('adminAddCheckin', { name, day, time });
      toast('Check-in aggiunto');
      adminFilter = 'presenza';
      renderAdminFilters();
    } catch (err) {
      toast(`Errore: ${err.message}`);
    }
    await loadAdmin();
  });
  refresh();
});

// ---------- Aggiornamento automatico ----------

// A ogni pubblicazione GitHub scrive la versione qui sotto e in version.json: se non coincidono l'app si ricarica.
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || 'dev';

/** Mai ricaricare mentre qualcuno scrive, fa una foto, aspetta un'azione o ha il timer in corso. */
function busyNow() {
  const input = $('chat-input');
  return !!document.querySelector('.with-bicep') || !$('camera').hidden || !!(input && (input.value.trim() || document.activeElement === input)) || !!(document.activeElement && document.activeElement.classList.contains('sfida-num')) || !$('timer-running').hidden;
}

async function checkUpdate() {
  if (APP_VERSION === 'dev') return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { v } = await res.json();
    if (!v || v === APP_VERSION || busyNow()) return;
    // Se dopo la ricarica la pagina è ancora vecchia (CDN non ancora aggiornata) non si riprova subito
    const last = store.get('reloadFor');
    if (last && last.v === v && Date.now() - last.at < 120000) return;
    store.set('reloadFor', { v, at: Date.now() });
    toast('Aggiornamento…', 2000);
    setTimeout(() => location.reload(), 400);
  } catch { /* offline: si riprova alla prossima apertura */ }
}

// ---------- Cambio di giorno ----------

/** Stato di un altro giorno: classifiche e punti vanno bene come anteprima, il resto di oggi no. */
function withoutToday(s) {
  return { ...s, poll: null, plans: null, me: { ...s.me, checkedInToday: false, sudometroToday: null } };
}

// Data in alto e dati di oggi seguono il giorno vero anche se l'app resta aperta oltre la mezzanotte.
let shownDay = '';
let midnightTimer = 0;
function syncDay() {
  const now = new Date();
  const day = now.toDateString();
  clearTimeout(midnightTimer);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  midnightTimer = setTimeout(() => {
    syncDay();
    if (session && state && document.visibilityState === 'visible') refresh().then(() => chat.preload());
  }, midnight - now);
  if (day === shownDay) return;
  const changed = !!shownDay;
  shownDay = day;
  $('today-date').textContent = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  if (changed && state) {
    state = withoutToday(state);
    render();
  }
}

// ---------- Avvio ----------

async function home() {
  show('home');
  // Da una notifica della chat l'app si apre con ?tab=chat
  const fromUrl = new URLSearchParams(location.search).get('tab');
  if (fromUrl) history.replaceState(null, '', location.pathname);
  // Mostra subito l'ultimo stato salvato sul telefono, poi lo aggiorna da Apps Script.
  const cached = store.get('state');
  if (!state && cached && cached.data && cached.data.me && cached.data.me.name === session.name && !!cached.test === testOn()) {
    state = cached.data;
    // Stato di un altro giorno: classifiche e punti vanno bene come anteprima, il resto di oggi no
    if (cached.day !== new Date().toDateString()) state = withoutToday(state);
  }
  if (!state) {
    // Primo avvio senza dati salvati: anello vuoto e "Caricamento" invece di card vuote.
    $('week-ring').innerHTML = ring(0, ...COLORS.move, { size: 132, width: 20 });
    sudoBusy('Carico i dati…');
  }
  render();
  selectTab(fromUrl || store.get('tab'));
  if (state) chat.preload(); // la chat si aggiorna di nascosto mentre arrivano i dati, non dopo
  await refresh();
  sendWaitingSudo(); // selfie rimasto sul telefono senza rete
  chat.preload(); // primo avvio: la chat si carica di nascosto, così il tab si apre già pieno
  updateNotifyCard();
  sudometro.preload();
}

$('form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  withBusy($('form-login').querySelector('button'), 'Accedo…', () => login($('in-code').value));
});
$('btn-checkin').addEventListener('click', checkin);
$('btn-checkin-undo').addEventListener('click', checkinUndo);
$('btn-notify').addEventListener('click', () => withBusy($('btn-notify'), 'Attivo…', enableNotifications));
$('btn-logout').addEventListener('click', logout);
// "Aggiorna l'icona": codice d'accesso di 15 minuti e Safari aperto sul link (x-safari-https apre proprio Safari, iOS 17+)
$('btn-icon').addEventListener('click', () => withBusy($('btn-icon'), 'Preparo…', async () => {
  try {
    const { token } = await api('linkToken');
    const url = new URL(`${location.pathname}?accesso=${token}`, location.origin).href;
    $('icon-link').hidden = false;
    $('icon-link').textContent = `Se Safari non si apre, copia questo link in Safari entro 15 minuti: ${url}`;
    location.href = 'x-safari-' + url;
  } catch (err) {
    toast(`Errore: ${err.message}`);
  }
}));
$('form-name').addEventListener('submit', (e) => {
  e.preventDefault();
  saveAlias($('in-name').value);
});
$('viewer').addEventListener('click', () => ($('viewer').hidden = true));
$('btn-points-info').addEventListener('click', () => ($('points-info').hidden = false));
$('points-info').addEventListener('click', (e) => {
  if (e.target === $('points-info') || e.target.closest('.sheet-close')) $('points-info').hidden = true;
});
$('btn-notes').addEventListener('click', () => {
  $('release-notes-list').innerHTML = releaseNotesHtml(state);
  $('release-notes').hidden = false;
});
$('release-notes').addEventListener('click', (e) => {
  if (e.target === $('release-notes') || e.target.closest('.sheet-close')) $('release-notes').hidden = true;
});
$('btn-reref').addEventListener('click', () => {
  if (state.me.reference && !confirm('Rifare la foto di riferimento? Quella vecchia verrà sostituita.')) return;
  selectTab('oggi'); // il risultato si vede nel Sudometro della Home
  takeReference();
});
$('fake-mode').addEventListener('change', async (e) => {
  store.set('fakeData', e.target.checked);
  toast(e.target.checked ? 'Dati fittizi attivi: niente viene salvato' : 'Dati veri');
  await refresh();
  chat.reload();
});

$('debug-mode').addEventListener('change', (e) => {
  store.set('debugOff', !e.target.checked);
  render();
  chat.redraw();
});

$('shake-stop').checked = shakeEnabled();
$('shake-stop').addEventListener('change', (e) => setShakeEnabled(e.target.checked));

$('chat-notify').addEventListener('change', async (e) => {
  try {
    await api('chatMute', { muted: !e.target.checked });
    toast(e.target.checked ? 'Notifiche della chat attive' : 'Notifiche della chat silenziate');
  } catch (err) {
    e.target.checked = !e.target.checked;
    toast(err.message);
  }
});
// Notifica toccata con l'app già aperta: il service worker chiede di aprire un tab.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.tab && session) selectTab(e.data.tab);
  });
}
$('avatar').addEventListener('click', () => selectTab('altro'));
syncDay();
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
  trace.log('schermo', document.visibilityState);
  if (document.visibilityState !== 'visible') return trace.flush();
  checkUpdate();
  syncDay();
  if (session && state) refresh().then(() => chat.preload()).then(sendWaitingSudo);
});

// Diagnostica: errori e stato della rete (registrati solo se il server la accende per questo account).
window.addEventListener('error', (e) => trace.log('errore js', `${e.message || ''} @ ${(e.filename || '').split('/').pop()}:${e.lineno || ''}`));
window.addEventListener('unhandledrejection', (e) => trace.log('promise rifiutata', String((e.reason && e.reason.message) || e.reason || '')));
window.addEventListener('online', () => trace.log('rete', 'online'));
window.addEventListener('offline', () => trace.log('rete', 'offline'));

// Tastiera aperta: l'app si restringe all'area visibile, così la casella dei messaggi
// resta sopra la tastiera (i tab spariscono mentre scrivi, come in WhatsApp).
// Tastiera aperta: su iOS 26 con la tastiera si accorcia anche la finestra, quindi non basta confrontare
// l'area visibile con innerHeight. Vale anche "c'è un campo di testo attivo" e il confronto con l'altezza
// massima vista; la barra dei tab resta nascosta dietro la tastiera invece di salire sopra.
// L'altezza massima vale per la larghezza attuale: girando il telefono si riparte, se no in orizzontale
// l'app crede che la tastiera sia aperta e torna in verticale spostata (i tocchi finiscono più in basso).
let fullHeight = 0;
let fullWidth = 0;
const TEXT_TYPES = ['text', 'search', 'number', 'email', 'tel', 'url', 'password'];
function typingNow() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && TEXT_TYPES.includes(a.type)));
}
function fitViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  if (window.innerWidth !== fullWidth) { fullWidth = window.innerWidth; fullHeight = 0; }
  if (!typingNow()) fullHeight = Math.max(fullHeight, window.innerHeight, Math.round(vv.height));
  const keyboard = typingNow() || vv.height < Math.max(window.innerHeight, fullHeight) - 120;
  document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
  document.body.classList.toggle('keyboard', keyboard);
  // Scrivendo un messaggio il sondaggio sopra la chat si nasconde, per lasciare più spazio ai messaggi
  // (non mentre si sceglie l'orario del sondaggio: lì serve vederlo).
  document.body.classList.toggle('composing', keyboard && !!document.activeElement && document.activeElement.id === 'chat-input');
  if (keyboard) window.scrollTo(0, 0);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitViewport);
  window.visualViewport.addEventListener('scroll', fitViewport);
  document.addEventListener('focusin', fitViewport);
  document.addEventListener('focusout', () => setTimeout(fitViewport, 60));
}
// Dopo una rotazione iPhone può lasciare la pagina scorsa di qualche pixel: si vede giusta ma i tocchi
// arrivano spostati. Finita la rotazione si rimette la pagina a posto (lo scorrimento dei contenuti resta).
function afterRotate() {
  if (typingNow()) return;
  fitViewport();
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = document.body.scrollTop = 0;
}
window.addEventListener('orientationchange', () => [100, 400, 800].forEach((t) => setTimeout(afterRotate, t)));
if (screen.orientation) screen.orientation.addEventListener('change', () => setTimeout(afterRotate, 400));
$('chat-input').addEventListener('focus', () => {
  setTimeout(() => ($('scroller').scrollTop = $('scroller').scrollHeight), 350);
});

/**
 * Link "Aggiorna l'icona" (?accesso=…): entra con il codice d'accesso di 15 minuti. In Safari si toglie il manifest,
 * così l'icona aggiunta alla Home si apre su questo indirizzo e la nuova app entra da sola, senza codice.
 */
async function accessFromLink() {
  const token = new URLSearchParams(location.search).get('accesso');
  if (!token) return;
  if (!isStandalone) {
    const m = document.querySelector('link[rel="manifest"]');
    if (m) m.remove();
    $('install-reinstall').hidden = false;
  }
  if (session) return;
  try {
    const r = await realApi('tokenLogin', { token });
    session = { code: r.code, name: r.name, display: r.display };
    store.set('session', session);
  } catch (err) {
    toast(err.message);
  }
}

async function start() {
  window.__palestrinaStarted = true;
  await accessFromLink();
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
  checkUpdate();
})();
