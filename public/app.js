import * as sudometro from './sudometro.js';
import { initTimer, setTimerAccount } from './timer.js';
import { createChat, answersList, bicep } from './chat.js';
import { fakeState, fakeChat, fakePhoto } from './fake.js';

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

/** Dati fittizi (solo utenti debug): letture finte, scritture bloccate. */
function fakeOn() {
  return store.get('fakeData') === true && !!(state && state.me && state.me.debug);
}

async function api(action, data = {}) {
  if (store.get('fakeData') === true && action !== 'login') {
    if (action === 'state') {
      const real = await realApi('state');
      return real.me.debug ? fakeState(real) : real;
    }
    if (fakeOn()) {
      if (action === 'chat') return data.v === 1 ? { v: 1, same: true } : fakeChat(state.me);
      if (action === 'photo' && String(data.id).startsWith('fake-')) return fakePhoto(String(data.id));
      if (action !== 'photo') throw new Error('Dati fittizi attivi: spegnili in Altro per usare l\'app davvero');
    }
  }
  return realApi(action, data);
}

async function realApi(action, data = {}) {
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

function toast(msg, ms = 3500) {
  $('toast').textContent = msg;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), ms);
}

const TAB_TITLES = { oggi: 'Oggi', classifica: 'Classifica', chat: 'Chat', timer: 'Timer', altro: 'Altro' };

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

  const btn = $('btn-checkin');
  btn.disabled = me.checkedInToday;
  btn.classList.toggle('done', me.checkedInToday);
  btn.innerHTML = me.checkedInToday ? '<svg><use href="#i-check"/></svg>Check-in fatto oggi' : 'Sono in palestra';
  $('btn-checkin-undo').hidden = !me.checkedInToday;

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
    li.querySelector('.name').textContent = r.display || r.name;
    if (isKing(r.name)) li.querySelector('.name').insertAdjacentHTML('beforeend', CROWN);
    $('ranking').append(li);
  });
  renderPoints();
  renderAlbo();
  if (document.activeElement !== $('in-name')) $('in-name').value = me.alias || '';
  $('in-name').placeholder = me.name;
  $('name-hint').textContent = `È il nome che vedono gli altri in classifica e nelle notifiche. Lascia vuoto per usare il nome originale (${me.name}).`;
  if (session.display !== me.display) {
    session.display = me.display;
    store.set('session', session);
    show('home');
  }
  $('pomodoro').textContent = week.pomodoro ? `Sudometro più alto: ${week.pomodoro.display || week.pomodoro.name}, ${week.pomodoro.score}` : '';

  renderSudometro();
  renderGallery();
  renderToday();
  $('debug-mode-card').hidden = !me.debug;
  $('debug-mode').checked = debugOn();
  $('fake-mode').checked = fakeOn();
  document.body.classList.toggle('fake-data', fakeOn());
  $('viewport-card').hidden = !debugOn();
  if (debugOn()) renderViewportDebug();
  $('chat-notify').checked = !me.chatMuted;
  chat.setUser({ name: me.name, display: me.display });
  chat.updateBadge(state.chatMeta);
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

/** Tab Oggi: chi ha detto che va in palestra oggi. */
/** Re in carica: l'ultimo dell'albo d'oro, con la corona accanto al nome fino al prossimo. */
function isKing(name) {
  const albo = (state && state.albo) || [];
  return albo.length > 0 && albo[albo.length - 1].names.includes(name);
}

const CROWN = '<svg class="crown" aria-label="Re del mese"><use href="#i-crown"/></svg>';

const openPoints = new Set(); // dettagli aperti nella classifica a punti

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
    if (isKing(r.name)) li.querySelector('.name').insertAdjacentHTML('beforeend', CROWN);
    li.querySelector('.sub').textContent = ach.length ? ach.map((g) => g.label).join(' · ') : 'Nessuna medaglia';
    const detail = li.querySelector('.detail');
    if (!r.detail.length) detail.textContent = 'Ancora nessun punto questo mese.';
    r.detail.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'detail-row';
      row.innerHTML = '<span></span><b></b>';
      row.querySelector('span').textContent = g.achievement ? `Medaglia: ${g.label}` : g.count > 1 ? `${g.label} × ${g.count}` : g.label;
      row.querySelector('b').textContent = `+${g.pts}`;
      detail.append(row);
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

const DAY_SHORT = ['Do', 'Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa'];
const NEXT_CHOICE = { '': 'si', si: 'forse', forse: 'no', no: '' };

/** Griglia persone × prossimi 7 giorni; le proprie caselle si toccano per cambiare risposta. */
function renderToday() {
  const plans = state.plans || [];
  $('today-card').hidden = !plans.length;
  if (!plans.length) return;
  const grid = $('plan-grid');
  const head = plans.map((d, i) => {
    const date = new Date(d.day + 'T12:00:00');
    return `<th>${i ? DAY_SHORT[date.getDay()] : 'Oggi'}<br>${date.getDate()}</th>`;
  });
  grid.innerHTML = `<tr><th></th>${head.join('')}</tr>`;
  // io per primo, poi gli altri
  const names = plans[0].people.map((p) => p.name).sort((a, b) => (a === state.me.name ? -1 : b === state.me.name ? 1 : 0));
  names.forEach((name) => {
    const tr = document.createElement('tr');
    const isMe = name === state.me.name;
    const person = plans[0].people.find((p) => p.name === name);
    const th = document.createElement('td');
    th.className = 'n';
    th.textContent = person.display;
    tr.append(th);
    plans.forEach((d) => {
      const p = d.people.find((x) => x.name === name) || {};
      const td = document.createElement('td');
      const cell = document.createElement(isMe ? 'button' : 'div');
      cell.className = `pcell ${p.choice || ''}${isMe ? ' me' : ''}`;
      cell.textContent = p.choice === 'si' ? p.time || '✓' : p.choice === 'forse' ? 'forse' : p.choice === 'no' ? 'no' : '';
      if (isMe) cell.onclick = () => cyclePlan(d.day, p.choice || '', p.time || '');
      td.append(cell);
      tr.append(td);
    });
    grid.append(tr);
  });
}

/** Tocco su una mia casella: cambia subito, l'invio parte in sottofondo (in ordine, per giorno conta l'ultimo). */
const planOutbox = [];
let planSending = false;
function cyclePlan(day, choice, time) {
  const next = NEXT_CHOICE[choice];
  const t = next === 'si' || next === 'forse' ? time : '';
  const plan = (state.plans || []).find((d) => d.day === day);
  const p = plan && plan.people.find((x) => x.name === state.me.name);
  if (p) Object.assign(p, { choice: next || null, time: t });
  renderToday();
  const i = planOutbox.findIndex((x) => x.day === day);
  if (i >= 0) planOutbox.splice(i, 1);
  planOutbox.push({ day, choice: next, time: t });
  flushPlans();
}

async function flushPlans() {
  if (planSending) return;
  planSending = true;
  while (planOutbox.length) {
    try {
      await api('planSet', planOutbox.shift());
    } catch (err) {
      toast(err.message);
      planOutbox.length = 0;
    }
  }
  planSending = false;
  await refresh();
  chat.reload();
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
      <div class="photo"></div>
      <div><div class="name"></div><div class="sub"></div></div>
      <div class="pts">${r.score}</div>`;
    const who = r.display || r.name;
    li.querySelector('.name').textContent = who;
    li.querySelector('.sub').textContent = `${title} · ${day}`;
    el.append(li);
    li.querySelector('.photo').replaceWith(photoPair(r.photoId, (state.refPhotos || {})[r.name], `${who} · ${r.score} · ${title}`));
  });
}

/** Foto da fresco e da sudato una accanto all'altra; un tocco le apre in grande. */
function photoPair(sweatyId, freshId, caption, big = false) {
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
  if (freshId) box.append(slot(freshId, 'fresh', 'Fresco'));
  box.append(slot(sweatyId, 'sweaty', 'Sudato'));
  if (sweatyId) box.onclick = () => openPhoto(sweatyId, freshId, caption);
  return box;
}

function openPhoto(sweatyId, freshId, caption) {
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
    if (me.sudometroToday.photoId) {
      const t = me.sudometroToday;
      el.append(photoPair(t.photoId, me.reference && me.reference.photoId, `${me.display} · ${t.score} · ${clean(t.title)}`, true));
    }
    if (debugOn()) {
      el.insertAdjacentHTML('beforeend', '<button id="btn-redo" class="secondary" style="margin-top:14px">Rifai e sovrascrivi (debug)</button>');
      el.querySelector('#btn-redo').onclick = () => takeSweat(false, true);
    }
  } else {
    // 3) Selfie da sudato: uno al giorno
    el.innerHTML = `
      <p class="muted">Al momento peggiore dell'allenamento fatti un selfie da sudato, nello stesso punto della foto di riferimento. Uno al giorno: scegli bene il momento. Lo vedrà tutto il gruppo.</p>
      <button id="btn-sweat" class="primary">Selfie da sudato</button>`;
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
    session.display = r.display;
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
    store.set('state', { day: new Date().toDateString(), data: state });
    setTimerAccount(state.me.name, state.me.timerSeconds, (s) => api('setTimer', { seconds: s }).catch(() => {}));
    render();
  } catch (err) {
    if (err.message === 'Codice non valido') return logout();
    toast(`Non riesco a caricare i dati: ${err.message}`);
  }
}

async function checkin() {
  await withBusy($('btn-checkin'), 'Check-in…', async () => {
    try {
      const r = await api('checkin');
      toast(r.alreadyToday ? 'Avevi già fatto check-in oggi' : 'Check-in fatto. Gli altri lo sapranno.');
    } catch (err) {
      toast(`Errore: ${err.message}`);
    }
    await refresh();
  });
  render();
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
    const canvas = await sudometro.takeSelfie('Foto di riferimento: viso al centro, da riposato, buona luce', {
      live: debugOn(),
    });
    if (!canvas) return;
    sudoBusy('Analizzo la foto…');
    const features = await sudometro.analyze(canvas);
    sudoBusy('Salvo la foto di riferimento…');
    const r = await api('setReference', { features, photo: sudometro.toJpegBase64(canvas) });
    toast(photoWarning(r) || 'Foto di riferimento salvata. Da ora basta il selfie da sudato.', 5000);
    await refresh();
  } catch (err) {
    toast(cameraError(err));
  }
  renderSudometro();
}

async function takeSweat(debug, overwrite = false) {
  try {
    const reference = state.me.reference.features;
    const canvas = await sudometro.takeSelfie('Selfie da sudato: stesso punto della foto di riferimento', {
      live: debugOn(),
      reference,
    });
    if (!canvas) return;
    sudoBusy('Analizzo il selfie…');
    const features = await sudometro.analyze(canvas);
    const result = sudometro.score(reference, features);
    sudoBusy('Pubblico la foto…');
    const r = await api('sudometro', {
      score: result.score,
      title: result.title,
      details: result.details,
      debug,
      overwrite,
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
    await refresh();
  } catch (err) {
    toast(cameraError(err));
  }
  renderSudometro(); // anche se l'aggiornamento non è riuscito, toglie il bicipite
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

const chat = createChat({ api, toast, photoPair, clean, isDebug: () => debugOn(), isKing, crown: CROWN });

// ---------- Tab ----------

const TABS = ['oggi', 'classifica', 'chat', 'timer', 'altro'];

function selectTab(name) {
  if (!TABS.includes(name)) name = 'oggi';
  document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.tab !== name));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  store.set('tab', name);
  $('page-title').textContent = TAB_TITLES[name];
  $('scroller').scrollTop = 0;
  document.body.classList.toggle('chat-mode', name === 'chat');
  chat.setActive(name === 'chat' && !!session);
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

// ---------- Avvio ----------

async function home() {
  show('home');
  // Da una notifica della chat l'app si apre con ?tab=chat
  const fromUrl = new URLSearchParams(location.search).get('tab');
  if (fromUrl) history.replaceState(null, '', location.pathname);
  // Mostra subito l'ultimo stato salvato sul telefono, poi lo aggiorna da Apps Script.
  const cached = store.get('state');
  if (!state && cached && cached.day === new Date().toDateString() && cached.data.me.name === session.name) state = cached.data;
  if (!state) {
    // Primo avvio senza dati salvati: anello vuoto e "Caricamento" invece di card vuote.
    $('week-ring').innerHTML = ring(0, ...COLORS.move, { size: 132, width: 20 });
    sudoBusy('Carico i dati…');
  }
  render();
  selectTab(fromUrl || store.get('tab'));
  await refresh();
  chat.preload(); // la chat si carica di nascosto, così il tab si apre già pieno
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
$('form-name').addEventListener('submit', (e) => {
  e.preventDefault();
  saveAlias($('in-name').value);
});
$('viewer').addEventListener('click', () => ($('viewer').hidden = true));
$('btn-points-info').addEventListener('click', () => ($('points-info').hidden = false));
$('points-info').addEventListener('click', (e) => {
  if (e.target === $('points-info') || e.target.closest('.sheet-close')) $('points-info').hidden = true;
});
$('today-open').addEventListener('click', () => selectTab('chat'));
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
  if (document.visibilityState === 'visible' && session && state) refresh().then(() => chat.preload());
});

// Tastiera aperta: l'app si restringe all'area visibile, così la casella dei messaggi
// resta sopra la tastiera (i tab spariscono mentre scrivi, come in WhatsApp).
function fitViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const keyboard = vv.height < window.innerHeight - 120;
  document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
  document.body.classList.toggle('keyboard', keyboard);
  if (keyboard) window.scrollTo(0, 0);
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitViewport);
  window.visualViewport.addEventListener('scroll', fitViewport);
}
$('chat-input').addEventListener('focus', () => {
  setTimeout(() => ($('scroller').scrollTop = $('scroller').scrollHeight), 350);
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
