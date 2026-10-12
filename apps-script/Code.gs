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
};
const DEFAULT_GOAL = 3;
// Utenti con il pulsante di debug, oltre a quelli con "sì" nella colonna D di Utenti.
const DEBUG_USERS = ['Francesco'];
const TZ = Session.getScriptTimeZone();
const props = PropertiesService.getScriptProperties();

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

const TRIGGERS_VERSION = '2';

/**
 * Recap ogni domenica alle 19 e premiazioni del mese il primo del mese alle 9 (fuso orario dello script).
 * Chiamata anche dalla web app: dopo un aggiornamento i trigger nuovi si creano da soli.
 */
function ensureTriggers(force) {
  if (!force && props.getProperty('TRIGGERS_VERSION') === TRIGGERS_VERSION) return;
  const handlers = ['sendWeeklyRecap', 'sendMonthlyRecap'];
  ScriptApp.getProjectTriggers()
    .filter((t) => handlers.includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendWeeklyRecap').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();
  ScriptApp.newTrigger('sendMonthlyRecap').timeBased().onMonthDay(1).atHour(9).create();
  props.setProperty('TRIGGERS_VERSION', TRIGGERS_VERSION);
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

function weekRecap() {
  const week = weekKey(dayString(new Date()));
  return computeRecap(week, addDays(week, 6));
}

/** Mese precedente: { from, to, label } */
function previousMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
  const last = new Date(now.getFullYear(), now.getMonth(), 0, 12);
  return { from: dayString(first), to: dayString(last), label: `${MONTHS_IT[first.getMonth()]} ${first.getFullYear()}` };
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

function sendMonthlyRecap() {
  const m = previousMonth();
  addChatEvent('', { kind: 'monthly', month: m.label, ...computeRecap(m.from, m.to) });
  dispatch('monthly', '');
}

// ---------- API per la web app (POST con Content-Type text/plain) ----------

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    try {
      ensureTriggers(false);
    } catch (err) {
      console.error('Trigger non aggiornati', err);
    }
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
      case 'chat':
        return json(chatState(user, req.v));
      case 'chatSend':
        return json(chatSend(user, req.text));
      case 'pollAsk':
        return json(pollAsk(user));
      case 'pollAnswer':
        return json(pollAnswer(user, req.choice, req.time));
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
  return { ok: true, photoError: saved.error };
}

/** Foto di riferimento ("da fresco") di ciascuno, da mostrare accanto ai selfie da sudato: nome → id del file. */
function refPhotoIds() {
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
    refPhotos: refPhotoIds(),
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
    return toAllBut(name, `${dn(name)} chiede: chi va in palestra oggi?`, 'Rispondi con un tap: ci sono, forse o no.').map((n) => ({ ...n, tab: 'chat' }));
  }

  if (event === 'answer') {
    const poll = todayPoll();
    if (!poll || poll.name === name) return [];
    const a = chatRows().filter((x) => x.type === 'answer' && x.ref === poll.id && x.name === name).pop();
    if (!a) return [];
    const title = `${dn(name)}: ${CHOICE_LABELS[a.text] || a.text}${a.time ? ' alle ' + a.time : ''}`;
    return subs.filter((s) => s.name === poll.name).map((s) => ({ subscription: s.sub, title, body: 'Chi va in palestra oggi?', tab: 'chat' }));
  }

  if (event === 'recap') {
    const body = recapText(weekRecap(), 'della settimana');
    return subs.map((s) => ({ subscription: s.sub, title: 'Premiazioni della settimana', body, tab: 'chat' }));
  }

  if (event === 'monthly') {
    const m = previousMonth();
    const body = recapText(computeRecap(m.from, m.to), 'del mese');
    return subs.map((s) => ({ subscription: s.sub, title: `Premiazioni di ${m.label}`, body, tab: 'chat' }));
  }

  return [];
}

// ---------- Chat ----------

const CHAT_DAYS = 7; // messaggi mostrati
const CHAT_NOTIFY_EVERY_MIN = 5; // al massimo una notifica di chat ogni 5 minuti per persona
const CHOICE_LABELS = { si: 'ci sono', forse: 'forse', no: 'oggi no' };

function chatRows() {
  const from = addDays(dayString(new Date()), -(CHAT_DAYS - 1));
  return sheet('chat')
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
      ref: String(r[6]),
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

function todayPoll() {
  const today = dayString(new Date());
  return chatRows().find((r) => r.type === 'poll' && r.day === today) || null;
}

/** Riepilogo della domanda di oggi, per la chat e per il tab Oggi. */
function pollSummary(today, presenze, dn) {
  const rowsNow = chatRows();
  const poll = rowsNow.find((r) => r.type === 'poll' && r.day === today);
  if (!poll) return null;
  const arrived = new Set(presenze.filter((p) => p.day === today).map((p) => p.name));
  const answers = {};
  rowsNow.filter((r) => r.type === 'answer' && r.ref === poll.id).forEach((r) => (answers[r.name] = r));
  return {
    id: poll.id,
    by: poll.name,
    byDisplay: dn(poll.name),
    clock: poll.clock,
    people: allUsers().map((u) => ({
      name: u.name,
      display: u.display,
      choice: answers[u.name] ? answers[u.name].text : null,
      time: answers[u.name] ? answers[u.name].time : '',
      arrived: arrived.has(u.name),
    })),
  };
}

/** Messaggi degli ultimi giorni. Se la versione `v` del client è aggiornata risponde solo { same: true }. */
function chatState(user, v) {
  const version = Number(props.getProperty('CHAT_VERSION') || 0);
  if (Number(v) === version && version > 0) return { v: version, same: true };
  const dn = displayNames();
  const today = dayString(new Date());
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
        data: r.type === 'event' ? safeJson(r.text) : null,
      })),
    poll: pollSummary(today, presenze, dn),
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

/** Crea la domanda di oggi, se non c'è già. */
function pollAsk(user) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let created = false;
  try {
    if (!todayPoll()) {
      appendChat(user, 'poll', 'Chi va in palestra oggi?');
      bumpChat();
      created = true;
    }
  } finally {
    lock.releaseLock();
  }
  if (created) dispatch('poll', user.name);
  return chatState(user, -1);
}

/** Risposta alla domanda di oggi: una per persona, si può cambiare. Orario facoltativo (HH:MM). */
function pollAnswer(user, choice, time) {
  if (!CHOICE_LABELS[choice]) return { error: 'Risposta non valida' };
  const at = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')) ? String(time) : '';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let notify = false;
  try {
    const poll = todayPoll();
    if (!poll) return { error: 'Nessuna domanda per oggi' };
    const sh = sheet('chat');
    const values = sh.getDataRange().getValues();
    const row = values.findIndex((r, i) => i > 0 && String(r[4]) === 'answer' && String(r[6]) === poll.id && String(r[3]) === user.name);
    if (row > 0) {
      notify = String(values[row][5]) !== choice || toTime(values[row][7]) !== at;
      sh.getRange(row + 1, 6, 1, 3).setValues([[choice, poll.id, at]]);
    } else {
      appendChat(user, 'answer', choice, poll.id, at);
      notify = true;
    }
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  if (notify) dispatch('answer', user.name);
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
    remove.reverse().forEach((row) => sh.deleteRow(row)); // dal fondo, così gli indici restano validi
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

function sheet(key) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEETS[key].name);
  if (!sh) {
    // Fogli aggiunti dopo il primo setup (es. Chat): li crea al primo uso.
    if (key === 'utenti') throw new Error('Esegui prima setup() dall\'editor di Apps Script');
    sh = ss.insertSheet(SHEETS[key].name);
    sh.appendRow(SHEETS[key].header);
    sh.setFrozenRows(1);
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
  const values = sheet(key).getDataRange().getValues().slice(1);
  if (key === 'presenze') return values.map((r) => ({ day: toDay(r[0]), time: toTime(r[1]), name: r[2] }));
  if (key === 'sudometro') {
    // Le prove di debug restano nel foglio ma non contano.
    return values.filter((r) => !r[6]).map((r) => ({ day: toDay(r[0]), name: r[2], score: Number(r[3]), title: r[4], photoId: r[7] || '' }));
  }
  if (key === 'iscrizioni') return values.map((r) => ({ name: r[0], sub: JSON.parse(r[2]) }));
  return values;
}

function allUsers() {
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
