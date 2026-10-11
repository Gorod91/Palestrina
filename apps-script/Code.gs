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
 */

const SHEETS = {
  utenti: { name: 'Utenti', header: ['Nome', 'Codice', 'Obiettivo settimanale', 'Debug'] },
  presenze: { name: 'Presenze', header: ['Data', 'Ora', 'Nome', 'Fonte'] },
  sudometro: { name: 'Sudometro', header: ['Data', 'Ora', 'Nome', 'Punteggio', 'Titolo', 'Dettagli', 'Debug'] },
  iscrizioni: { name: 'Iscrizioni', header: ['Nome', 'Endpoint', 'Sottoscrizione', 'Aggiornata'] },
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

  // Recap ogni domenica alle 19 (fuso orario dello script).
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendWeeklyRecap')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendWeeklyRecap').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();

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

function sendWeeklyRecap() {
  dispatch('recap', '');
}

// ---------- API per la web app (POST con Content-Type text/plain) ----------

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const user = findUserByCode(req.code);
    if (!user) return json({ error: 'Codice non valido' });

    switch (req.action) {
      case 'login':
        return json({ name: user.name, goal: user.goal, debug: user.debug });
      case 'state':
        return json(buildState(user));
      case 'checkin':
        return json(checkin(user, 'app'));
      case 'setReference':
        return json(saveReference(user, req.features));
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
    return json({ ...r, message: r.alreadyToday ? 'Check-in già fatto oggi' : `Check-in fatto, ${user.name} 💪` });
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
  dispatch('checkin', user.name);
  return { ok: true, alreadyToday: false };
}

/** Foto di riferimento ("riposato"): solo i valori calcolati, mai la foto. Si fa una volta. */
function saveReference(user, features) {
  if (!features || typeof features.redness !== 'number') return { error: 'Foto di riferimento non valida' };
  props.setProperty('ref_' + user.name, JSON.stringify({ features, at: Date.now() }));
  return { ok: true };
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
  if (!debug && rows('sudometro').some((r) => r.day === today && r.name === user.name)) {
    return { error: 'Il Sudometro di oggi è già fatto' };
  }
  const score = Math.max(0, Math.min(100, Math.round(Number(req.score) || 0)));
  const now = new Date();
  sheet('sudometro').appendRow([
    dayString(now),
    Utilities.formatDate(now, TZ, 'HH:mm'),
    user.name,
    score,
    String(req.title || '').slice(0, 60),
    JSON.stringify(req.details || {}).slice(0, 500),
    debug ? 'sì' : '',
  ]);
  if (!debug) dispatch('sudometro', user.name);
  return { ok: true, score, debug };
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

  const ranking = users
    .map((u) => ({
      name: u.name,
      goal: u.goal,
      count: countInWeek(presenze, u.name, week),
      streak: streak(presenze, u, week),
    }))
    .sort((a, b) => b.count - a.count || b.streak - a.streak || a.name.localeCompare(b.name));

  const sudo = rows('sudometro').filter((r) => weekKey(r.day) === week);
  const pomodoro = sudo.reduce((best, r) => (!best || r.score > best.score ? r : best), null);
  const mySudoToday = sudo.filter((r) => r.name === user.name && r.day === today).pop();

  return {
    me: {
      name: user.name,
      goal: user.goal,
      debug: user.debug,
      checkedInToday: presenze.some((r) => r.day === today && r.name === user.name),
      sudometroToday: mySudoToday ? { score: mySudoToday.score, title: mySudoToday.title } : null,
      reference: getReference(user),
    },
    week: { start: week, ranking, pomodoro: pomodoro ? { name: pomodoro.name, score: pomodoro.score } : null },
  };
}

/** Testi delle notifiche, con destinatari. Chiamato dalla GitHub Action. */
function buildNotifications(event, name) {
  const subs = rows('iscrizioni');
  const users = allUsers();
  const presenze = rows('presenze');
  const week = weekKey(dayString(new Date()));
  const toAllBut = (n, title, body) => subs.filter((s) => s.name !== n).map((s) => ({ subscription: s.sub, title, body }));

  if (event === 'test') {
    return subs.filter((s) => s.name === name).map((s) => ({
      subscription: s.sub,
      title: 'Notifiche attive ✅',
      body: `Ciao ${name}! Da ora saprai quando gli altri sono in palestra.`,
    }));
  }

  if (event === 'checkin') {
    const u = users.find((x) => x.name === name);
    const n = countInWeek(presenze, name, week);
    const teases = ['E tu dove sei? 👀', 'Il divano può aspettare.', 'Qualcuno lo segua!', 'La classifica trema.'];
    const extra = u && n === u.goal ? `Obiettivo settimanale raggiunto (${n}/${u.goal}) 🎯` : `Presenza n. ${n} della settimana. ${pick(teases)}`;
    return toAllBut(name, `💪 ${name} è in palestra`, extra);
  }

  if (event === 'sudometro') {
    const r = rows('sudometro').filter((x) => x.name === name).pop();
    if (!r) return [];
    return toAllBut(name, `🍅 Sudometro di ${name}: ${r.score}`, `"${r.title}"`);
  }

  if (event === 'recap') {
    const counts = users.map((u) => ({ name: u.name, count: countInWeek(presenze, u.name, week) }));
    const max = Math.max(...counts.map((c) => c.count));
    const min = Math.min(...counts.map((c) => c.count));
    const names = (v) => counts.filter((c) => c.count === v).map((c) => c.name).join(', ');
    const parts = [];
    if (max > 0) parts.push(`🏆 MVP: ${names(max)} (${max})`);
    if (min < max) parts.push(`🛋️ Divano d'oro: ${names(min)} (${min})`);
    const sudo = rows('sudometro').filter((r) => weekKey(r.day) === week);
    if (sudo.length) {
      const top = sudo.reduce((a, b) => (b.score > a.score ? b : a));
      parts.push(`🍅 Pomodoro della settimana: ${top.name} (${top.score})`);
    }
    if (!parts.length) parts.push('Settimana tranquilla... troppo tranquilla 😴');
    return subs.map((s) => ({ subscription: s.sub, title: 'Recap della settimana', body: parts.join('\n') }));
  }

  return [];
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
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEETS[key].name);
  if (!sh) throw new Error('Esegui prima setup() dall\'editor di Apps Script');
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
    return values.filter((r) => !r[6]).map((r) => ({ day: toDay(r[0]), name: r[2], score: Number(r[3]), title: r[4] }));
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
    }));
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

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
