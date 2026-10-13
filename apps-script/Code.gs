/**
 * Palestrina — backend su Google Apps Script.
 *
 * Gira con l'account Google di chi lo pubblica: gli amici non fanno login Google,
 * si identificano con il codice personale scritto nel foglio "Utenti".
 *
 * Proprietà dello script (Impostazioni progetto → Proprietà script):
 *   ADMIN_SECRET   generato da setup(): da copiare nel secret APPS_SCRIPT_SECRET su GitHub
 *   GITHUB_TOKEN   token GitHub (fine-grained, permesso "Contents: Read and write" sul repo)
 *   GITHUB_REPO    es. "gorod91/Palestrina"
 *   PHOTOS_FOLDER_ID  creato da autorizzaDrive(): cartella Drive con le foto del Sudometro
 */

const SHEETS = {
  utenti: { name: 'Utenti', header: ['Nome', 'Codice', 'Obiettivo settimanale', 'Debug', 'Alias'] },
  presenze: { name: 'Presenze', header: ['Data', 'Ora', 'Nome', 'Fonte'] },
  sudometro: { name: 'Sudometro', header: ['Data', 'Ora', 'Nome', 'Punteggio', 'Titolo', 'Dettagli', 'Debug', 'Foto'] },
  iscrizioni: { name: 'Iscrizioni', header: ['Nome', 'Endpoint', 'Sottoscrizione', 'Aggiornata'] },
  // Tipo: msg (messaggio), poll (domanda "chi va in palestra oggi?"), answer (risposta: Testo = si/forse/no, Rif = ID della domanda)
  chat: { name: 'Chat', header: ['ID', 'Data', 'Ora', 'Nome', 'Tipo', 'Testo', 'Rif', 'Orario'] },
  // Chi va in palestra, oggi e nei 6 giorni dopo: una riga per persona e giorno (Risposta = si/forse/no)
  piani: { name: 'Piani', header: ['Giorno', 'Nome', 'Risposta', 'Orario', 'Aggiornato'] },
  // Storico dei cambi di risposta, per le penalità (cambio all'ultimo, check-in senza avviso)
  cambi: { name: 'Cambi', header: ['Quando', 'Giorno', 'Nome', 'Da', 'A', 'Orario prima', 'Orario dopo'] },
};
const DEFAULT_GOAL = 3;
// Utenti con il pulsante di debug, oltre a quelli con "sì" nella colonna D di Utenti.
const DEBUG_USERS = ['Francesco'];
const TZ = Session.getScriptTimeZone();
const props = PropertiesService.getScriptProperties();

// Letture del foglio ricordate per la durata di una richiesta: lo stato legge molte volte gli stessi fogli.
// Chi prende un foglio con sheet() per scriverci cancella il ricordo di quel foglio.
let MEMO = {};
function memo(key, fn) {
  if (!(key in MEMO)) MEMO[key] = fn();
  return MEMO[key];
}
function forget(key) {
  Object.keys(MEMO).forEach((k) => {
    if (k === key || k.indexOf(key + ':') === 0) delete MEMO[k];
  });
}

// ---------- Setup (da eseguire una volta dall'editor) ----------

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.values(SHEETS).forEach(({ name, header }) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]); // aggiorna anche intestazioni vecchie
    sh.getRange('A:B').setNumberFormat('@'); // date e codici come testo
    sh.setFrozenRows(1);
  });
  const utenti = ss.getSheetByName(SHEETS.utenti.name);
  if (utenti.getLastRow() === 1) {
    utenti.appendRow(['Francesco', randomCode('FRANCESCO'), DEFAULT_GOAL]);
  }
  if (!props.getProperty('ADMIN_SECRET')) props.setProperty('ADMIN_SECRET', Utilities.getUuid());

  ensureTriggers(true);

  Logger.log('Fatto. ADMIN_SECRET (da mettere su GitHub come APPS_SCRIPT_SECRET): ' + props.getProperty('ADMIN_SECRET'));
}

/** Genera un codice per ogni riga di "Utenti" che non ce l'ha. */
function generaCodiciMancanti() {
  const sh = sheet('utenti');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && !values[i][1]) sh.getRange(i + 1, 2).setValue(randomCode(values[i][0]));
    if (values[i][0] && !values[i][2]) sh.getRange(i + 1, 3).setValue(DEFAULT_GOAL);
  }
}

/** Da eseguire una volta dall'editor: concede l'accesso a Drive e crea la cartella delle foto. */
function autorizzaDrive() {
  Logger.log('Cartella foto: ' + photosRoot().getUrl());
}

const TRIGGERS_VERSION = '3';

/**
 * Recap ogni domenica alle 19 e premiazioni del mese l'ultimo giorno del mese alle 21 (fuso orario dello script).
 * Chiamata anche dalla web app: dopo un aggiornamento i trigger nuovi si creano da soli.
 */
function ensureTriggers(force) {
  if (!force && props.getProperty('TRIGGERS_VERSION') === TRIGGERS_VERSION) return;
  const handlers = ['sendWeeklyRecap', 'sendMonthlyRecap', 'eveningCheck'];
  ScriptApp.getProjectTriggers()
    .filter((t) => handlers.includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendWeeklyRecap').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();
  // Apps Script non ha "ultimo giorno del mese": controllo ogni sera alle 21
  ScriptApp.newTrigger('eveningCheck').timeBased().everyDays(1).atHour(21).create();
  props.setProperty('TRIGGERS_VERSION', TRIGGERS_VERSION);
}

// Azzeramento una tantum: cambiando RESET_ID, la prima richiesta dopo la pubblicazione riparte da zero.
const RESET_ID = '2026-10-13';

function ensureReset() {
  if (props.getProperty('RESET_ID') === RESET_ID) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (props.getProperty('RESET_ID') === RESET_ID) return;
    azzeraDati();
    props.setProperty('RESET_ID', RESET_ID);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cancella presenze, Sudometro, chat, piani, cambi, albo d'oro e selfie da sudato (nel cestino di Drive).
 * Restano utenti, codici, alias, obiettivi, iscrizioni alle notifiche e foto di riferimento.
 */
function azzeraDati() {
  ['presenze', 'sudometro', 'chat', 'piani', 'cambi'].forEach((key) => {
    const sh = sheet(key);
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getMaxColumns()).clearContent();
  });
  const keep = new Set(Object.values(readRefPhotoIds()));
  const folders = photosRoot().getFolders();
  while (folders.hasNext()) {
    const files = folders.next().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (!keep.has(f.getId())) f.setTrashed(true);
    }
  }
  ['ALBO', 'LAST_MONTHLY'].forEach((k) => props.deleteProperty(k));
  Object.keys(props.getProperties())
    .filter((k) => k.indexOf('chatNotify_') === 0)
    .forEach((k) => props.deleteProperty(k));
  props.setProperty('PENALTIES_FROM', dayString(new Date()));
  bumpChat(); // i telefoni ricaricano la chat vuota
  MEMO = {};
}

/** Premiazioni di un periodo (giorni "yyyy-MM-dd", estremi inclusi). */
function computeRecap(from, to) {
  const presenze = rows('presenze').filter((r) => r.day >= from && r.day <= to);
  const counts = allUsers().map((u) => ({ name: u.name, count: new Set(presenze.filter((r) => r.name === u.name).map((r) => r.day)).size }));
  const max = counts.length ? Math.max(...counts.map((c) => c.count)) : 0;
  const min = counts.length ? Math.min(...counts.map((c) => c.count)) : 0;
  const sudo = rows('sudometro').filter((r) => r.day >= from && r.day <= to);
  const top = sudo.length ? sudo.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  return {
    mvp: max > 0 ? { names: counts.filter((c) => c.count === max).map((c) => c.name), count: max } : null,
    divano: min < max ? { names: counts.filter((c) => c.count === min).map((c) => c.name), count: min } : null,
    pomodoro: top ? { name: top.name, score: top.score } : null,
  };
}

/** Ogni sera alle 21: se domani è il primo del mese, premiazioni del mese e Re del mese. */
function eveningCheck() {
  const today = dayString(new Date());
  if (addDays(today, 1).slice(8) === '01') sendMonthlyRecap();
}

function weekRecap() {
  const week = weekKey(dayString(new Date()));
  return computeRecap(week, addDays(week, 6));
}

/** Mese in corso: { key: "yyyy-MM", from, to, label } */
function currentMonth() {
  const today = dayString(new Date());
  const key = today.slice(0, 7);
  let to = today;
  while (addDays(to, 1).slice(0, 7) === key) to = addDays(to, 1);
  return { key, from: key + '-01', to, label: `${MONTHS_IT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` };
}

const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Testo delle premiazioni, per le notifiche. */
function recapText(recap, period) {
  const dn = displayNames();
  const names = (list) => list.map(dn).join(', ');
  const parts = [];
  if (recap.mvp) parts.push(`MVP: ${names(recap.mvp.names)} (${recap.mvp.count})`);
  if (recap.divano) parts.push(`Divano d'oro: ${names(recap.divano.names)} (${recap.divano.count})`);
  if (recap.pomodoro) parts.push(`Pomodoro ${period}: ${dn(recap.pomodoro.name)} (${recap.pomodoro.score})`);
  if (!parts.length) parts.push('Periodo tranquillo... troppo tranquillo.');
  return parts.join('\n');
}

function sendWeeklyRecap() {
  addChatEvent('', { kind: 'weekly', ...weekRecap() });
  dispatch('recap', '');
}

/** Premiazioni del mese in corso (l'ultimo giorno alle 21): Re del mese nell'albo d'oro, evento in chat e notifica. */
function sendMonthlyRecap() {
  const m = currentMonth();
  const last = safeJson(props.getProperty('LAST_MONTHLY') || '{}');
  if (last && last.key === m.key) return; // già fatto questo mese
  const points = computePoints(m.key).filter((t) => t.total > 0);
  const best = points.length ? points[0].total : 0;
  const king = best ? { names: points.filter((t) => t.total === best).map((t) => t.name), total: best } : null;
  if (king) {
    const albo = getAlbo();
    albo.push({ key: m.key, label: m.label, names: king.names, total: king.total });
    props.setProperty('ALBO', JSON.stringify(albo));
  }
  props.setProperty('LAST_MONTHLY', JSON.stringify(m));
  addChatEvent('', { kind: 'monthly', month: m.label, ...computeRecap(m.from, m.to), king });
  dispatch('monthly', '');
}

/** Albo d'oro: i Re dei mesi passati, dal più vecchio. */
function getAlbo() {
  const albo = safeJson(props.getProperty('ALBO') || '[]');
  return Array.isArray(albo) ? albo : [];
}

// ---------- API per la web app (POST con Content-Type text/plain) ----------

function doPost(e) {
  MEMO = {};
  try {
    const req = JSON.parse(e.postData.contents);
    try {
      ensureTriggers(false);
    } catch (err) {
      console.error('Trigger non aggiornati', err);
    }
    ensureReset();
    const user = findUserByCode(req.code);
    if (!user) return json({ error: 'Codice non valido' });

    switch (req.action) {
      case 'login':
        return json({ name: user.name, display: user.display, goal: user.goal, debug: user.debug });
      case 'state':
        return json(buildState(user));
      case 'checkin':
        return json(checkin(user, 'app'));
      case 'checkinUndo':
        return json(checkinUndo(user));
      case 'setReference':
        return json(saveReference(user, req.features, req.photo));
      case 'photo':
        return json(getPhoto(req.id));
      case 'photos':
        return json(getPhotos(req.ids));
      case 'chat':
        return json(chatState(user, req.v));
      case 'chatSend':
        return json(chatSend(user, req.text));
      case 'pollAsk':
        return json(pollAsk(user, req.day));
      case 'pollAnswer':
        return json(pollAnswer(user, req.choice, req.time));
      case 'planSet':
        return json(planSet(user, req.day, req.choice, req.time));
      case 'chatDelete':
        return json(chatDelete(user, req.id));
      case 'chatMute':
        if (req.muted) props.setProperty('mute_' + user.name, '1');
        else props.deleteProperty('mute_' + user.name);
        return json({ ok: true, muted: !!req.muted });
      case 'setAlias':
        return json(setAlias(user, req.alias));
      case 'setTimer': {
        const s = Math.round(Number(req.seconds));
        if (!(s >= 5 && s <= 600)) return json({ error: 'Durata non valida' });
        props.setProperty('timer_' + user.name, String(s));
        return json({ ok: true });
      }
      case 'sudometro':
        return json(saveSudometro(user, req));
      case 'subscribe':
        return json(saveSubscription(user, req.subscription));
      default:
        return json({ error: 'Azione sconosciuta' });
    }
  } catch (err) {
    return json({ error: String(err.message || err) });
  }
}

// ---------- API GET: check-in automatico (Comandi iOS) e GitHub Action ----------

function doGet(e) {
  MEMO = {};
  ensureReset();
  const p = e.parameter;

  // Link personale per l'automazione "Arrivo" di Comandi: ?action=checkin&code=...
  if (p.action === 'checkin') {
    const user = findUserByCode(p.code);
    if (!user) return json({ error: 'Codice non valido' });
    const r = checkin(user, 'automatico');
    return json({ ...r, message: r.alreadyToday ? 'Check-in già fatto oggi' : `Check-in fatto, ${user.display}` });
  }

  if (!p.secret || p.secret !== props.getProperty('ADMIN_SECRET')) return json({ error: 'Non autorizzato' });
  if (p.action === 'pushJob') return json({ notifications: buildNotifications(p.event, p.name) });
  if (p.action === 'removeSubscription') {
    removeSubscription(p.endpoint);
    return json({ ok: true });
  }
  return json({ error: 'Azione sconosciuta' });
}

// ---------- Logica ----------

function checkin(user, source) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const today = dayString(new Date());
    const already = rows('presenze').some((r) => r.day === today && r.name === user.name);
    if (already) return { ok: true, alreadyToday: true };
    sheet('presenze').appendRow([today, Utilities.formatDate(new Date(), TZ, 'HH:mm'), user.name, source]);
  } finally {
    lock.releaseLock();
  }
  const count = countInWeek(rows('presenze'), user.name, weekKey(dayString(new Date())));
  addChatEvent(user.name, { kind: 'checkin', count, goal: user.goal, auto: source === 'automatico' });
  announceAchievements(user);
  dispatch('checkin', user.name);
  return { ok: true, alreadyToday: false };
}

/** Annulla il check-in di oggi: lo toglie dalle presenze e dalla chat, senza notifiche. */
function checkinUndo(user) {
  const today = dayString(new Date());
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet('presenze');
    const remove = [];
    sh.getDataRange().getValues().forEach((r, i) => {
      if (i > 0 && toDay(r[0]) === today && String(r[2]) === user.name) remove.push(i + 1);
    });
    if (!remove.length) return { ok: true, nothing: true };
    remove.reverse().forEach((row) => sh.deleteRow(row));
    const chat = sheet('chat');
    const events = [];
    chat.getDataRange().getValues().forEach((r, i) => {
      if (i === 0 || String(r[4]) !== 'event' || String(r[3]) !== user.name || toDay(r[1]) !== today) return;
      const data = safeJson(r[5]);
      if (data && data.kind === 'checkin') events.push(i + 1);
    });
    events.reverse().forEach((row) => chat.deleteRow(row));
    if (events.length) bumpChat();
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** Foto di riferimento ("riposato"): solo i valori calcolati, mai la foto. Si fa una volta. */
function saveReference(user, features, photo) {
  if (!features || typeof features.redness !== 'number') return { error: 'Foto di riferimento non valida' };
  const saved = savePhoto(user, photo, 'riferimento');
  props.setProperty('ref_' + user.name, JSON.stringify({ features, at: Date.now(), photoId: saved.id || '' }));
  forget('refs');
  bumpChat(); // la foto da fresco compare anche in chat
  return { ok: true, photoError: saved.error };
}

/** Foto di riferimento ("da fresco") di ciascuno, da mostrare accanto ai selfie da sudato: nome → id del file. */
function refPhotoIds() {
  return memo('refs', readRefPhotoIds);
}

function readRefPhotoIds() {
  const all = props.getProperties();
  const out = {};
  Object.keys(all).forEach((k) => {
    if (k.indexOf('ref_') !== 0) return;
    const ref = safeJson(all[k]);
    if (ref && ref.photoId) out[k.slice(4)] = ref.photoId;
  });
  return out;
}

function getReference(user) {
  const raw = props.getProperty('ref_' + user.name);
  return raw ? JSON.parse(raw) : null;
}

function saveSudometro(user, req) {
  if (!getReference(user)) return { error: 'Prima fai la foto di riferimento' };
  // Un Sudometro al giorno. Le prove degli utenti debug non contano, non avvisano nessuno e si possono ripetere.
  const debug = user.debug && req.debug === true;
  const today = dayString(new Date());
  const done = !debug && rows('sudometro').some((r) => r.day === today && r.name === user.name);
  if (done && user.debug && req.overwrite === true) return overwriteSudometro(user, req, today);
  if (done) return { error: 'Il Sudometro di oggi è già fatto' };
  const score = Math.max(0, Math.min(100, Math.round(Number(req.score) || 0)));
  const saved = savePhoto(user, req.photo, `sudato ${score}${debug ? ' debug' : ''}`);
  const now = new Date();
  sheet('sudometro').appendRow([
    dayString(now),
    Utilities.formatDate(now, TZ, 'HH:mm'),
    user.name,
    score,
    String(req.title || '').slice(0, 60),
    JSON.stringify(req.details || {}).slice(0, 500),
    debug ? 'sì' : '',
    saved.id || '',
  ]);
  if (!debug) {
    addChatEvent(user.name, { kind: 'sudometro', score, title: String(req.title || '').slice(0, 60), photoId: saved.id || '' });
    dispatch('sudometro', user.name);
  }
  return { ok: true, score, debug, photoError: saved.error };
}

/**
 * Solo utenti debug: rifà il Sudometro di oggi sostituendo punteggio, titolo e foto (la vecchia va nel cestino).
 * Aggiorna anche l'evento in chat; non manda una nuova notifica.
 */
function overwriteSudometro(user, req, today) {
  const score = Math.max(0, Math.min(100, Math.round(Number(req.score) || 0)));
  const title = String(req.title || '').slice(0, 60);
  const saved = savePhoto(user, req.photo, `sudato ${score}`);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let oldPhoto = '';
  try {
    const sh = sheet('sudometro');
    const values = sh.getDataRange().getValues();
    const row = values.findIndex((r, i) => i > 0 && !r[6] && toDay(r[0]) === today && String(r[2]) === user.name);
    if (row < 1) return { error: 'Sudometro di oggi non trovato' };
    oldPhoto = String(values[row][7] || '');
    sh.getRange(row + 1, 2, 1, 7).setValues([[
      Utilities.formatDate(new Date(), TZ, 'HH:mm'),
      user.name,
      score,
      title,
      JSON.stringify(req.details || {}).slice(0, 500),
      '',
      saved.id || '',
    ]]);
    const chat = sheet('chat');
    chat.getDataRange().getValues().forEach((r, i) => {
      if (i === 0 || String(r[4]) !== 'event' || String(r[3]) !== user.name || toDay(r[1]) !== today) return;
      const data = safeJson(r[5]);
      if (data && data.kind === 'sudometro') {
        Object.assign(data, { score, title, photoId: saved.id || '' });
        chat.getRange(i + 1, 6).setValue(JSON.stringify(data));
      }
    });
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  if (oldPhoto) {
    try {
      DriveApp.getFileById(oldPhoto).setTrashed(true);
    } catch (err) {
      console.error('Vecchia foto non spostata nel cestino', err);
    }
  }
  return { ok: true, score, debug: false, overwritten: true, photoError: saved.error };
}

function saveSubscription(user, sub) {
  if (!sub || !sub.endpoint) return { error: 'Sottoscrizione non valida' };
  const sh = sheet('iscrizioni');
  const values = sh.getDataRange().getValues();
  const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  const row = values.findIndex((r, i) => i > 0 && r[1] === sub.endpoint);
  if (row > 0) sh.getRange(row + 1, 1, 1, 4).setValues([[user.name, sub.endpoint, JSON.stringify(sub), now]]);
  else sh.appendRow([user.name, sub.endpoint, JSON.stringify(sub), now]);
  dispatch('test', user.name);
  return { ok: true };
}

function removeSubscription(endpoint) {
  const sh = sheet('iscrizioni');
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i][1] === endpoint) sh.deleteRow(i + 1);
  }
}

/** Stato per la schermata principale: classifica della settimana, streak, Sudometro. */
function buildState(user) {
  const users = allUsers();
  const presenze = rows('presenze');
  const today = dayString(new Date());
  const week = weekKey(today);

  const dn = displayNames();
  const ranking = users
    .map((u) => ({
      name: u.name,
      display: u.display,
      goal: u.goal,
      count: countInWeek(presenze, u.name, week),
      streak: streak(presenze, u, week),
    }))
    .sort((a, b) => b.count - a.count || b.streak - a.streak || a.display.localeCompare(b.display));

  const sudo = rows('sudometro').filter((r) => weekKey(r.day) === week);
  const pomodoro = sudo.reduce((best, r) => (!best || r.score > best.score ? r : best), null);
  const mySudoToday = sudo.filter((r) => r.name === user.name && r.day === today).pop();

  return {
    me: {
      name: user.name,
      display: user.display,
      alias: user.alias,
      goal: user.goal,
      debug: user.debug,
      checkedInToday: presenze.some((r) => r.day === today && r.name === user.name),
      sudometroToday: mySudoToday ? { score: mySudoToday.score, title: mySudoToday.title, photoId: mySudoToday.photoId } : null,
      reference: getReference(user),
      timerSeconds: Number(props.getProperty('timer_' + user.name)) || null,
      chatMuted: !!props.getProperty('mute_' + user.name),
    },
    poll: pollSummary(today, presenze, dn),
    plans: plansSummary(presenze),
    refPhotos: refPhotoIds(),
    points: { month: MONTHS_IT[Number(today.slice(5, 7)) - 1], ranking: computePoints(today.slice(0, 7)) },
    // Albo d'oro: il più recente è il Re in carica (corona accanto al nome fino al prossimo)
    albo: getAlbo().map((a) => ({ ...a, displays: a.names.map(dn) })),
    // Per il pallino dei messaggi non letti: orario e autore dei messaggi recenti.
    chatMeta: chatRows()
      .filter((r) => r.type === 'msg' || r.type === 'poll' || r.type === 'event')
      .map((r) => ({ id: r.id, name: r.name })),
    week: {
      start: week,
      ranking,
      pomodoro: pomodoro ? { name: pomodoro.name, display: dn(pomodoro.name), score: pomodoro.score } : null,
      // Classifica del Sudometro della settimana, con le foto (caricate a parte con l'azione "photo").
      sudometro: sudo
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((r) => ({ name: r.name, display: dn(r.name), day: r.day, score: r.score, title: r.title, photoId: r.photoId })),
    },
  };
}

/** Testi delle notifiche, con destinatari. Chiamato dalla GitHub Action. */
function buildNotifications(event, name) {
  const subs = rows('iscrizioni');
  const users = allUsers();
  const presenze = rows('presenze');
  const week = weekKey(dayString(new Date()));
  const toAllBut = (n, title, body) => subs.filter((s) => s.name !== n).map((s) => ({ subscription: s.sub, title, body }));
  const dn = displayNames(); // nei testi si usa l'alias, se c'è

  if (event === 'test') {
    return subs.filter((s) => s.name === name).map((s) => ({
      subscription: s.sub,
      title: 'Notifiche attive',
      body: `Ciao ${dn(name)}! Da ora saprai quando gli altri sono in palestra.`,
    }));
  }

  if (event === 'checkin') {
    const u = users.find((x) => x.name === name);
    const n = countInWeek(presenze, name, week);
    const teases = ['E tu dove sei?', 'Il divano può aspettare.', 'Qualcuno lo segua.', 'La classifica trema.'];
    const extra = u && n === u.goal ? `Obiettivo settimanale raggiunto (${n}/${u.goal})` : `Presenza n. ${n} della settimana. ${pick(teases)}`;
    return toAllBut(name, `${dn(name)} è in palestra`, extra);
  }

  if (event === 'sudometro') {
    const r = rows('sudometro').filter((x) => x.name === name).pop();
    if (!r) return [];
    return toAllBut(name, `Sudometro di ${dn(name)}: ${r.score}`, `"${clean(r.title)}"`);
  }

  if (event === 'chat') {
    const r = chatRows().filter((x) => x.type === 'msg' && x.name === name).pop();
    if (!r) return [];
    return subs
      .filter((s) => s.name !== name && !props.getProperty('mute_' + s.name))
      .map((s) => ({ subscription: s.sub, title: dn(name), body: r.text.slice(0, 140), tab: 'chat' }));
  }

  if (event === 'poll') {
    // La domanda arriva a tutti, anche a chi ha silenziato la chat.
    const asked = chatRows().filter((r) => r.type === 'poll' && r.name === name).pop();
    const label = asked ? dayLabel(pollDay(asked)) : 'oggi';
    return toAllBut(name, `${dn(name)} chiede: chi va in palestra ${label}?`, 'Rispondi con un tap: ci sono, forse o no.').map((n) => ({ ...n, tab: 'chat' }));
  }

  if (event === 'answer') {
    // L'ultima risposta cambiata da questa persona
    const last = rows('piani').filter((r) => r.name === name && r.choice).sort((a, b) => (a.updated < b.updated ? -1 : 1)).pop();
    if (!last) return [];
    const poll = pollFor(last.day);
    if (!poll || poll.name === name) return [];
    const title = `${dn(name)}: ${CHOICE_LABELS[last.choice] || last.choice}${last.time ? ' alle ' + last.time : ''}`;
    return subs.filter((s) => s.name === poll.name).map((s) => ({ subscription: s.sub, title, body: `Chi va in palestra ${dayLabel(last.day)}?`, tab: 'chat' }));
  }

  if (event === 'recap') {
    const body = recapText(weekRecap(), 'della settimana');
    return subs.map((s) => ({ subscription: s.sub, title: 'Premiazioni della settimana', body, tab: 'chat' }));
  }

  if (event === 'monthly') {
    const m = safeJson(props.getProperty('LAST_MONTHLY') || '{}');
    if (!m.key) return [];
    let body = recapText(computeRecap(m.from, m.to), 'del mese');
    const points = computePoints(m.key).filter((t) => t.total > 0);
    if (points.length) {
      const dn = displayNames();
      const kings = points.filter((t) => t.total === points[0].total).map((t) => dn(t.name)).join(', ');
      body = `Re del mese: ${kings} (${points[0].total} punti)\n${body}`;
    }
    return subs.map((s) => ({ subscription: s.sub, title: `Premiazioni di ${m.label}`, body, tab: 'chat' }));
  }

  return [];
}

// ---------- Chat ----------

const CHAT_DAYS = 7; // messaggi mostrati
const CHAT_NOTIFY_EVERY_MIN = 5; // al massimo una notifica di chat ogni 5 minuti per persona
const CHOICE_LABELS = { si: 'ci sono', forse: 'forse', no: 'oggi no' };

function chatRows() {
  return memo('chat:rows', readChatRows);
}

function readChatRows() {
  const from = addDays(dayString(new Date()), -(CHAT_DAYS - 1));
  return sheetRaw('chat')
    .getDataRange()
    .getValues()
    .slice(1)
    .map((r) => ({
      id: String(r[0]),
      day: toDay(r[1]),
      time: toTime(r[2]),
      name: String(r[3]),
      type: String(r[4]),
      text: String(r[5]),
      ref: r[6] instanceof Date ? dayString(r[6]) : String(r[6]), // il giorno della domanda può arrivare come data
      at: toTime(r[7]),
    }))
    .filter((r) => r.day >= from)
    .map((r) => ({ ...r, time: r.type === 'answer' ? r.at : r.time, clock: r.time }));
}

function bumpChat() {
  const v = Number(props.getProperty('CHAT_VERSION') || 0) + 1;
  props.setProperty('CHAT_VERSION', String(v));
  return v;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Giorno a cui si riferisce una domanda: Rif (domande per i giorni dopo) o il giorno in cui è stata fatta. */
function pollDay(r) {
  return /^\d{4}-\d\d-\d\d$/.test(r.ref) ? r.ref : r.day;
}

function pollFor(day) {
  return chatRows().find((r) => r.type === 'poll' && pollDay(r) === day) || null;
}

function todayPoll() {
  return pollFor(dayString(new Date()));
}

/** "oggi", "domani" o "giovedì 15" */
function dayLabel(day) {
  const today = dayString(new Date());
  if (day === today) return 'oggi';
  if (day === addDays(today, 1)) return 'domani';
  const d = parseDay(day);
  return `${['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** I 7 giorni pianificabili: oggi e i 6 successivi. */
function planDays() {
  const today = dayString(new Date());
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(today, n));
}

/** Chi va in palestra nei prossimi 7 giorni: per ogni giorno tutte le persone con risposta e orario. */
function plansSummary(presenze) {
  const days = planDays();
  const today = days[0];
  const answers = {};
  // Risposte di oggi date prima dei piani (righe "answer" della chat)
  const poll = todayPoll();
  if (poll) chatRows().filter((r) => r.type === 'answer' && r.ref === poll.id).forEach((r) => (answers[today + '|' + r.name] = { choice: r.text, time: r.time }));
  rows('piani').forEach((r) => {
    if (days.indexOf(r.day) >= 0) answers[r.day + '|' + r.name] = { choice: r.choice, time: r.time };
  });
  const arrived = new Set(presenze.filter((p) => p.day === today).map((p) => p.name));
  const users = allUsers();
  const dn = displayNames();
  return days.map((day) => ({
    day,
    // Un giorno è "aperto" solo se qualcuno ha chiesto a tutti
    poll: (() => {
      const p = pollFor(day);
      return p ? { id: p.id, by: p.name, byDisplay: dn(p.name), clock: p.clock } : null;
    })(),
    people: users.map((u) => {
      const a = answers[day + '|' + u.name];
      return { name: u.name, display: u.display, choice: a ? a.choice : null, time: a ? a.time : '', arrived: day === today && arrived.has(u.name) };
    }),
  }));
}

/** Riepilogo della domanda di oggi, per la chat e per il tab Oggi. */
function pollSummary(today, presenze, dn) {
  const poll = todayPoll();
  if (!poll) return null;
  return { id: poll.id, by: poll.name, byDisplay: dn(poll.name), clock: poll.clock, people: plansSummary(presenze)[0].people };
}

/** Messaggi degli ultimi giorni. Se la versione `v` del client è aggiornata risponde solo { same: true }. */
function chatState(user, v) {
  const version = Number(props.getProperty('CHAT_VERSION') || 0);
  if (Number(v) === version && version > 0) return { v: version, same: true };
  // Uguale per tutti: si calcola una volta per versione e giorno e si tiene in cache qualche minuto
  const today = dayString(new Date());
  const cache = CacheService.getScriptCache();
  const key = `chat_${version}_${today}`;
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const out = buildChatState(version, today);
  try {
    const text = JSON.stringify(out);
    if (text.length < 95000) cache.put(key, text, 300);
  } catch (err) {
    console.error('Cache chat non salvata', err);
  }
  return out;
}

function buildChatState(version, today) {
  const dn = displayNames();
  const presenze = rows('presenze');
  return {
    v: version,
    messages: chatRows()
      .filter((r) => r.type === 'msg' || r.type === 'poll' || r.type === 'event')
      .map((r) => ({
        id: r.id,
        day: r.day,
        time: r.clock,
        name: r.name,
        display: r.name ? dn(r.name) : '',
        type: r.type,
        text: r.type === 'msg' ? r.text : '',
        target: r.type === 'poll' ? pollDay(r) : '',
        data: r.type === 'event' ? safeJson(r.text) : null,
      })),
    poll: pollSummary(today, presenze, dn),
    plans: plansSummary(presenze),
    names: Object.fromEntries(allUsers().map((u) => [u.name, u.display])),
    refPhotos: refPhotoIds(),
  };
}

/** Evento automatico in chat (check-in, Sudometro, premiazioni). I dati restano strutturati: il testo lo fa l'app. */
function addChatEvent(name, data) {
  try {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      appendChat({ name }, 'event', JSON.stringify(data));
      bumpChat();
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error('Evento chat non salvato', err); // non deve bloccare check-in o Sudometro
  }
}

function appendChat(user, type, text, ref, at) {
  const now = new Date();
  const id = newId();
  sheet('chat').appendRow([id, dayString(now), Utilities.formatDate(now, TZ, 'HH:mm'), user.name, type, text || '', ref || '', at || '']);
  return id;
}

function chatSend(user, text) {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return { error: 'Messaggio vuoto' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendChat(user, 'msg', t);
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  const last = Number(props.getProperty('chatNotify_' + user.name) || 0);
  if (Date.now() - last > CHAT_NOTIFY_EVERY_MIN * 60000) {
    props.setProperty('chatNotify_' + user.name, String(Date.now()));
    dispatch('chat', user.name);
  }
  return chatState(user, -1);
}

/** Crea la domanda per un giorno dei prossimi 7 (oggi se non indicato), se non c'è già. */
function pollAsk(user, day) {
  const d = day ? String(day) : dayString(new Date());
  if (planDays().indexOf(d) < 0) return { error: 'Si può chiedere solo da oggi a 6 giorni' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let created = false;
  try {
    if (!pollFor(d)) {
      appendChat(user, 'poll', `Chi va in palestra ${dayLabel(d)}?`, d);
      bumpChat();
      created = true;
    }
  } finally {
    lock.releaseLock();
  }
  if (created) dispatch('poll', user.name);
  return chatState(user, -1);
}

/** Risposta per oggi (anche senza domanda): una per persona, si può cambiare. Orario facoltativo (HH:MM). */
function pollAnswer(user, choice, time) {
  return planSet(user, dayString(new Date()), choice, time);
}

/** Chi va in palestra in un giorno dei prossimi 7. Risposta vuota = toglie la risposta. */
function planSet(user, day, choice, time) {
  const c = String(choice || '');
  if (c && !CHOICE_LABELS[c]) return { error: 'Risposta non valida' };
  const d = String(day || '');
  if (planDays().indexOf(d) < 0) return { error: 'Si può pianificare solo da oggi a 6 giorni' };
  if (c && !pollFor(d)) return { error: 'Per quel giorno nessuno ha ancora chiesto: tocca "Chiedi a tutti"' };
  const at = c && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')) ? String(time) : '';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let changed = false;
  try {
    const sh = sheet('piani');
    const values = sh.getDataRange().getValues();
    const row = values.findIndex((r, i) => i > 0 && toDay(r[0]) === d && String(r[1]) === user.name);
    const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    const before = row > 0 ? { choice: String(values[row][2]), time: values[row][3] ? toTime(values[row][3]) : '' } : { choice: '', time: '' };
    if (row > 0) {
      changed = String(values[row][2]) !== c || (values[row][3] ? toTime(values[row][3]) : '') !== at;
      if (!c) sh.deleteRow(row + 1);
      else sh.getRange(row + 1, 1, 1, 5).setValues([[d, user.name, c, at, now]]);
    } else if (c) {
      sh.appendRow([d, user.name, c, at, now]);
      changed = true;
    }
    if (changed) {
      sheet('cambi').appendRow([now, d, user.name, before.choice, c, before.time, at]);
      bumpChat();
    }
  } finally {
    lock.releaseLock();
  }
  // Avvisa chi ha fatto la domanda per quel giorno
  if (changed && c) dispatch('answer', user.name);
  return chatState(user, -1);
}

/** Solo utenti debug: cancella un messaggio o un evento. Se è la domanda di oggi, la annulla con tutte le risposte. */
function chatDelete(user, id) {
  if (!user.debug) return { error: 'Solo per gli utenti debug' };
  const target = String(id || '');
  if (!target) return { error: 'Messaggio non indicato' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet('chat');
    const values = sh.getDataRange().getValues();
    const remove = [];
    values.forEach((r, i) => {
      if (i > 0 && (String(r[0]) === target || (String(r[4]) === 'answer' && String(r[6]) === target))) remove.push(i + 1);
    });
    if (!remove.length) return { error: 'Messaggio non trovato' };
    const target0 = values.find((r, i) => i > 0 && String(r[0]) === target);
    remove.reverse().forEach((row) => sh.deleteRow(row)); // dal fondo, così gli indici restano validi
    // Annullare la domanda toglie anche le risposte di quel giorno
    if (target0 && String(target0[4]) === 'poll') {
      const day = pollDay({ ref: toDay(target0[6]), day: toDay(target0[1]) });
      const pi = sheet('piani');
      const rowsPi = [];
      pi.getDataRange().getValues().forEach((r, i) => {
        if (i > 0 && toDay(r[0]) === day) rowsPi.push(i + 1);
      });
      rowsPi.reverse().forEach((row) => pi.deleteRow(row));
    }
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  return chatState(user, -1);
}

// ---------- Foto su Drive ----------

/** Salva un JPEG (base64) nella cartella dell'utente. Un errore non blocca il resto. */
function savePhoto(user, base64, label) {
  if (!base64) return {};
  if (base64.length > 3e6) return { error: 'Foto troppo grande' };
  try {
    const name = `${Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm')} ${user.name} ${label}.jpg`;
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', name);
    return { id: userFolder(user.name).createFile(blob).getId() };
  } catch (err) {
    console.error('Salvataggio foto fallito', err);
    return { error: 'Foto non salvata su Drive: ' + (err.message || err) };
  }
}

/** Restituisce una foto del Sudometro (non di debug) a chi ha un codice valido. */
/** Più foto in una sola chiamata (al massimo 12): una richiesta invece di tante. */
function getPhotos(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 12);
  const allowed = new Set(rows('sudometro').map((r) => r.photoId).filter(Boolean).concat(Object.values(refPhotoIds())));
  const photos = {};
  list.forEach((id) => {
    if (!allowed.has(id)) return;
    try {
      const blob = DriveApp.getFileById(id).getBlob();
      photos[id] = { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
    } catch (err) {
      console.error('Foto non letta', id, err);
    }
  });
  return { photos };
}

function getPhoto(id) {
  // Solo file elencati nel foglio Sudometro: lo script non deve leggere altri file del Drive.
  const allowed = id && (rows('sudometro').some((r) => r.photoId === id) || Object.values(refPhotoIds()).includes(id));
  if (!allowed) return { error: 'Foto non trovata' };
  const blob = DriveApp.getFileById(id).getBlob();
  return { mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

function photosRoot() {
  const id = props.getProperty('PHOTOS_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // cartella cancellata: se ne crea una nuova
    }
  }
  const folder = DriveApp.createFolder('Palestrina - Foto Sudometro');
  props.setProperty('PHOTOS_FOLDER_ID', folder.getId());
  return folder;
}

/** Nome visualizzato (alias). Vuoto = torna al nome originale. Il nome originale non cambia mai. */
function setAlias(user, value) {
  const alias = String(value || '').replace(/\s+/g, ' ').trim();
  if (alias.length > 20) return { error: 'Alias troppo lungo (massimo 20 caratteri)' };
  const taken = allUsers().some(
    (u) => u.code !== user.code && [u.name, u.display].some((n) => n.toLowerCase() === alias.toLowerCase())
  );
  if (alias && taken) return { error: 'Questo nome è già usato da qualcun altro' };
  const sh = sheet('utenti');
  const values = sh.getDataRange().getValues();
  const row = values.findIndex((r, i) => i > 0 && String(r[1]).trim() === user.code);
  if (row < 1) return { error: 'Utente non trovato' };
  sh.getRange(row + 1, 5).setValue(alias);
  bumpChat(); // il nome compare anche in chat
  return { ok: true, display: alias || user.name };
}

/** Mappa nome originale → nome visualizzato. */
function displayNames() {
  const map = {};
  allUsers().forEach((u) => (map[u.name] = u.display));
  return (name) => map[name] || name;
}

function userFolder(name) {
  const root = photosRoot();
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// ---------- Calcoli ----------

// Punti del mese. Si ricalcolano sempre da presenze e Sudometro: un check-in annullato toglie anche i punti.
const POINTS = {
  presenza: 10, // una al giorno
  rientroDopoGiorni: 10, // dopo più di 10 giorni senza palestra la presenza vale doppio
  amiciMinuti: 60, // check-in a meno di un'ora da un amico
  amici: 3,
  seriePerSettimana: 5, // per ogni settimana consecutiva con l'obiettivo, oltre la prima
  serieMax: 20,
  mattinieroPrima: '09:00',
  mattinieroVolte: 4,
  brancoVolte: 5,
  maiSaltato: 20,
  mattiniero: 10,
  branco: 10,
  pomodoro: 10,
  // Penalità
  bidone: -10, // "ci sono" e poi niente check-in quel giorno
  cambioUltimo: -5, // da "ci sono" a forse/no (o tolto) a meno di 4 ore dall'orario, senza poi venire
  cambioOre: 4,
  cambioSenzaOrario: '14:00', // senza orario contano i cambi di quel giorno dalle 14 in poi
  ritardo: -2, // check-in più di mezz'ora dopo l'orario detto
  ritardoMinuti: 30,
  settimanaVuota: -5, // nessuna presenza in una settimana intera
  senzaAvviso: -3, // check-in senza aver detto "ci sono" o "forse" almeno 1 ora prima
  avvisoMinuti: 60,
};

/** Da quando valgono le penalità: il giorno in cui sono state introdotte (prima non c'era lo storico dei cambi). */
function penaltiesFrom() {
  let d = props.getProperty('PENALTIES_FROM');
  if (!d) {
    d = dayString(new Date());
    props.setProperty('PENALTIES_FROM', d);
  }
  return d;
}

function hhmmMinus(t, minutes) {
  const [h, m] = String(t).split(':').map(Number);
  const v = Math.max(0, h * 60 + (m || 0) - minutes);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Classifica a punti di un mese ("yyyy-MM"), con il dettaglio di ciascuno. */
function computePoints(month) {
  const P = POINTS;
  const users = allUsers();
  const inMonth = (day) => day.slice(0, 7) === month;
  const minutes = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  // Una presenza per persona al giorno (la prima dell'orario)
  const first = {};
  rows('presenze').forEach((r) => {
    const k = r.name + '|' + r.day;
    if (!first[k] || r.time < first[k].time) first[k] = r;
  });
  const pres = Object.keys(first).map((k) => first[k]);
  const sudo = rows('sudometro').filter((r) => inMonth(r.day));
  const piani = {};
  rows('piani').forEach((r) => (piani[r.day + '|' + r.name] = r));
  const cambi = rows('cambi');
  const monthStart = month + '-01';
  const mondays = [];
  for (let d = monthStart; inMonth(d); d = addDays(d, 1)) if (weekKey(d) === d) mondays.push(d);

  const table = users.map((u) => {
    const items = [];
    const add = (key, label, pts, achievement) => items.push({ key, label, pts, achievement: !!achievement });
    const mine = pres.filter((r) => r.name === u.name).sort((a, b) => (a.day < b.day ? -1 : 1));
    let friends = 0;
    let early = 0;
    mine.forEach((r, i) => {
      if (!inMonth(r.day)) return;
      add('presenza', 'Presenze', P.presenza);
      const prev = mine[i - 1];
      if (prev && (parseDay(r.day) - parseDay(prev.day)) / 86400000 > P.rientroDopoGiorni) add('rientro', 'Rientro (vale doppio)', P.presenza);
      if (pres.some((o) => o.name !== u.name && o.day === r.day && Math.abs(minutes(o.time) - minutes(r.time)) <= P.amiciMinuti)) {
        add('amici', 'Bonus amici', P.amici);
        friends++;
      }
      if (r.time && r.time < P.mattinieroPrima) early++;
    });
    sudo.filter((r) => r.name === u.name).forEach((r) => add('sudometro', 'Sudometro', r.score > 66 ? 3 : r.score > 33 ? 2 : 1));
    // Settimane di fila: il bonus arriva nel giorno in cui si raggiunge l'obiettivo
    for (let w = weekKey(monthStart); w <= addDays(monthStart, 31); w = addDays(w, 7)) {
      const days = mine.filter((r) => weekKey(r.day) === w).map((r) => r.day);
      if (days.length < u.goal || !inMonth(days[u.goal - 1])) continue;
      let n = 1;
      while (countInWeek(pres, u.name, addDays(w, -7 * n)) >= u.goal) n++;
      if (n > 1) add('serie', 'Settimane di fila', Math.min(P.seriePerSettimana * (n - 1), P.serieMax));
    }
    // Penalità (da quando esistono)
    const today = dayString(new Date());
    const penFrom = penaltiesFrom();
    const myCambi = cambi.filter((c) => c.name === u.name);
    for (let day = monthStart; inMonth(day) && day <= today; day = addDays(day, 1)) {
      if (day < penFrom) continue;
      const plan = piani[day + '|' + u.name];
      const came = first[u.name + '|' + day];
      if (!came) {
        if (day < today && plan && plan.choice === 'si') add('bidone', 'Bidone', P.bidone);
        else {
          // Cambio all'ultimo: da "ci sono" ad altro a meno di 4 ore dall'orario (senza orario: dalle 14 di quel giorno)
          const late = myCambi.some((c) => c.day === day && c.from === 'si' && c.to !== 'si' && c.at >= `${day} ${c.timeBefore ? hhmmMinus(c.timeBefore, P.cambioOre * 60) : P.cambioSenzaOrario}`);
          if (late) add('cambio', 'Cambio all\'ultimo', P.cambioUltimo);
        }
        continue;
      }
      if (plan && plan.choice === 'si' && plan.time && minutes(came.time) > minutes(plan.time) + P.ritardoMinuti) add('ritardo', 'Ritardo', P.ritardo);
      const told = myCambi.filter((c) => c.day === day && (c.to === 'si' || c.to === 'forse')).map((c) => c.at).sort()[0];
      if (!told || told > `${day} ${hhmmMinus(came.time, P.avvisoMinuti)}`) add('avviso', 'Check-in senza avvisare', P.senzaAvviso);
    }
    // Settimana a vuoto: settimane finite (domenica nel mese) senza presenze, per chi c'era già
    const firstEver = mine.length ? mine[0].day : null;
    for (let w = weekKey(monthStart); w <= addDays(monthStart, 31); w = addDays(w, 7)) {
      const sunday = addDays(w, 6);
      if (!inMonth(sunday) || sunday >= today || w < penFrom || !firstEver || firstEver >= w) continue;
      if (countInWeek(pres, u.name, w) === 0) add('vuota', 'Settimana a vuoto', P.settimanaVuota);
    }
    if (early >= P.mattinieroVolte) add('mattiniero', 'Mattiniero', P.mattiniero, true);
    if (friends >= P.brancoVolte) add('branco', 'Branco', P.branco, true);
    if (mondays.length && mondays.every((w) => countInWeek(pres, u.name, w) >= u.goal)) add('maiSaltato', 'Mai saltato', P.maiSaltato, true);
    return { name: u.name, display: u.display, items };
  });

  const top = sudo.reduce((m, r) => Math.max(m, r.score), -1);
  if (top >= 0) {
    table.forEach((t) => {
      if (sudo.some((r) => r.name === t.name && r.score === top)) t.items.push({ key: 'pomodoro', label: 'Pomodoro del mese', pts: POINTS.pomodoro, achievement: true });
    });
  }

  return table
    .map((t) => {
      // Dettaglio raggruppato: "Presenze 8 × 10 = 80"
      const groups = {};
      t.items.forEach((it) => {
        const g = groups[it.key] || (groups[it.key] = { key: it.key, label: it.label, count: 0, pts: 0, achievement: it.achievement });
        g.count++;
        g.pts += it.pts;
      });
      const detail = Object.keys(groups).map((k) => groups[k]);
      return { name: t.name, display: t.display, total: detail.reduce((a, g) => a + g.pts, 0), detail };
    })
    .sort((a, b) => b.total - a.total || a.display.localeCompare(b.display));
}

/** Annuncia in chat gli achievement appena sbloccati (il Pomodoro del mese si festeggia nel riepilogo mensile). */
function announceAchievements(user) {
  try {
    const month = dayString(new Date()).slice(0, 7);
    const mine = computePoints(month).find((t) => t.name === user.name);
    if (!mine) return;
    const key = `ach_${month}_${user.name}`;
    const done = safeJson(props.getProperty(key) || '[]');
    const list = Array.isArray(done) ? done : [];
    mine.detail
      .filter((g) => g.achievement && g.key !== 'pomodoro' && list.indexOf(g.key) < 0)
      .forEach((g) => {
        list.push(g.key);
        addChatEvent(user.name, { kind: 'achievement', title: g.label, pts: g.pts });
      });
    props.setProperty(key, JSON.stringify(list));
  } catch (err) {
    console.error('Achievement non annunciati', err);
  }
}

function countInWeek(presenze, name, week) {
  return new Set(presenze.filter((r) => r.name === name && weekKey(r.day) === week).map((r) => r.day)).size;
}

/** Settimane consecutive con obiettivo raggiunto (la corrente conta solo se già raggiunto). */
function streak(presenze, user, currentWeek) {
  let s = countInWeek(presenze, user.name, currentWeek) >= user.goal ? 1 : 0;
  let week = addDays(currentWeek, -7);
  while (countInWeek(presenze, user.name, week) >= user.goal) {
    s++;
    week = addDays(week, -7);
  }
  return s;
}

/** Lunedì della settimana di un giorno "yyyy-MM-dd". */
function weekKey(day) {
  const d = parseDay(day);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunedì
  return addDays(day, -dow);
}

function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(day, n) {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayString(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd');
}

// ---------- Dati ----------

/** Foglio da modificare: cancella le letture ricordate di quel foglio. */
function sheet(key) {
  forget(key);
  return sheetRaw(key);
}

function sheetRaw(key) {
  return memo('sheet:' + key, () => openSheet(key));
}

function openSheet(key) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEETS[key].name);
  if (!sh) {
    // Fogli aggiunti dopo il primo setup (es. Chat): li crea al primo uso.
    if (key === 'utenti') throw new Error('Esegui prima setup() dall\'editor di Apps Script');
    sh = ss.insertSheet(SHEETS[key].name);
    sh.appendRow(SHEETS[key].header);
    sh.setFrozenRows(1);
  }
  if (key === 'cambi' && !props.getProperty('CAMBI_TEXT_FORMAT')) {
    sh.getRange('A:G').setNumberFormat('@');
    props.setProperty('CAMBI_TEXT_FORMAT', '1');
  }
  if (key === 'piani' && !props.getProperty('PIANI_TEXT_FORMAT')) {
    sh.getRange('A:E').setNumberFormat('@'); // giorni e orari restano testo, non date
    props.setProperty('PIANI_TEXT_FORMAT', '1');
  }
  if (key === 'chat' && !props.getProperty('CHAT_TEXT_FORMAT')) {
    // Tutto come testo: un messaggio che inizia con "=" non deve diventare una formula.
    sh.getRange('A:H').setNumberFormat('@');
    props.setProperty('CHAT_TEXT_FORMAT', '1');
  }
  return sh;
}

function toTime(v) {
  return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v);
}

function toDay(v) {
  return v instanceof Date ? dayString(v) : String(v);
}

function rows(key) {
  return memo(key + ':rows', () => readRows(key));
}

function readRows(key) {
  const values = sheetRaw(key).getDataRange().getValues().slice(1);
  if (key === 'presenze') return values.map((r) => ({ day: toDay(r[0]), time: toTime(r[1]), name: r[2] }));
  if (key === 'sudometro') {
    // Le prove di debug restano nel foglio ma non contano.
    return values.filter((r) => !r[6]).map((r) => ({ day: toDay(r[0]), name: r[2], score: Number(r[3]), title: r[4], photoId: r[7] || '' }));
  }
  if (key === 'iscrizioni') return values.map((r) => ({ name: r[0], sub: JSON.parse(r[2]) }));
  if (key === 'cambi') return values.map((r) => ({ at: String(r[0]), day: toDay(r[1]), name: String(r[2]), from: String(r[3]), to: String(r[4]), timeBefore: r[5] ? toTime(r[5]) : '', timeAfter: r[6] ? toTime(r[6]) : '' }));
  if (key === 'piani') return values.map((r) => ({ day: toDay(r[0]), name: String(r[1]), choice: String(r[2]), time: r[3] ? toTime(r[3]) : '', updated: String(r[4] || '') }));
  return values;
}

function allUsers() {
  return memo('utenti:users', readUsers);
}

function readUsers() {
  return rows('utenti')
    .filter((r) => r[0] && r[1])
    .map((r) => ({
      name: String(r[0]).trim(),
      code: String(r[1]).trim(),
      goal: Number(r[2]) || DEFAULT_GOAL,
      // Colonna D: "sì", "x" o casella spuntata abilitano il pulsante di debug.
      debug: DEBUG_USERS.includes(String(r[0]).trim()) || r[3] === true || /^(s[iì]|x|true|1)$/i.test(String(r[3]).trim()),
      // Colonna E: alias scelto dall'utente. Il nome in colonna A resta la chiave di tutti i dati.
      alias: String(r[4] || '').trim(),
    }))
    .map((u) => ({ ...u, display: u.alias || u.name }));
}

function findUserByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return c ? allUsers().find((u) => u.code.toUpperCase() === c) : null;
}

// ---------- Utilità ----------

/** Chiede a GitHub di avviare la Action che invia le notifiche. */
function dispatch(event, name) {
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) return; // notifiche non ancora configurate
  try {
    UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ event_type: event, client_payload: { name } }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    console.error('Dispatch fallito', err);
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function randomCode(name) {
  const base = String(name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'AMICO';
  return base + '-' + Math.floor(1000 + Math.random() * 9000);
}

/** Titoli vecchi del Sudometro potevano contenere emoji. */
function clean(t) {
  return String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').trim();
}

function safeJson(t) {
  try {
    return JSON.parse(t);
  } catch (err) {
    return {};
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
