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
  sudometro: { name: 'Sudometro', header: ['Data', 'Ora', 'Nome', 'Punteggio', 'Titolo', 'Dettagli', 'Debug', 'Foto', 'Riferimento'] },
  iscrizioni: { name: 'Iscrizioni', header: ['Nome', 'Endpoint', 'Sottoscrizione', 'Aggiornata'] },
  // Tipo: msg (messaggio), poll (domanda "chi va in palestra oggi?"), answer (risposta: Testo = si/forse/no, Rif = ID della domanda)
  chat: { name: 'Chat', header: ['ID', 'Data', 'Ora', 'Nome', 'Tipo', 'Testo', 'Rif', 'Orario'] },
  // Chi va in palestra, oggi e nei 6 giorni dopo: una riga per persona e giorno (Risposta = si/forse/no)
  piani: { name: 'Piani', header: ['Giorno', 'Nome', 'Risposta', 'Orario', 'Aggiornato'] },
  // Storico dei cambi di risposta, per le penalità (cambio all'ultimo, check-in senza avviso)
  cambi: { name: 'Cambi', header: ['Quando', 'Giorno', 'Nome', 'Da', 'A', 'Orario prima', 'Orario dopo'] },
  // Azioni annullate dall'admin: le righe tolte restano qui (Dati, JSON) e si possono ripristinare
  annullati: { name: 'Annullati', header: ['ID', 'Quando', 'Tipo', 'Descrizione', 'Dati', 'Ripristinato'] },
  // Sfide tra chi è in palestra (novità di novembre 2026); Dati = JSON con partecipanti, risultati e conferme
  sfide: { name: 'Sfide', header: ['ID', 'Giorno', 'Aperta', 'Tipo', 'Stato', 'Dati'] },
  // Registro di diagnostica degli account in TRACE_USERS (richieste al server e cosa succede sul telefono)
  debug: { name: 'Debug', header: ['Quando', 'Nome', 'Da', 'Evento', 'Dettagli'] },
};
const DEFAULT_GOAL = 3;
// Utenti con il pulsante di debug, oltre a quelli con "sì" nella colonna D di Utenti.
const DEBUG_USERS = ['Francesco'];
// Admin: può annullare e ripristinare le azioni di tutti (registro admin nelle Impostazioni).
const ADMIN_USERS = ['Francesco'];
// Diagnostica per capire un problema sul telefono di qualcuno: le sue richieste e gli eventi dell'app
// finiscono nel foglio Debug. Solo lui vede nell'app il badge "DIAGNOSTICA". Togliere il nome a problema risolto.
const TRACE_USERS = []; // es. ['Michy']: diagnostica accesa per quell'account
// Modalità prova anche per chi non è admin (senza registro admin, "Agisci come" e simulazioni), per provare insieme
// le novità, per esempio la chat su Firebase. Usa i dati di prova come l'admin.
const PROVA_USERS = ['Michy'];
const TZ = Session.getScriptTimeZone();
const realProps = PropertiesService.getScriptProperties();

// ---------- Modalità prova (solo admin) ----------
// Le richieste con { test: true } fanno girare tutto il server, ma su fogli "Prova · …" (copiati da quelli veri
// al primo uso) e con le proprietà copiate alla prima scrittura (prova_…). Le notifiche arrivano solo a chi prova.
let TEST = false;
let TESTER = '';
const TEST_SHEETS = ['presenze', 'sudometro', 'chat', 'piani', 'cambi', 'annullati', 'sfide'];
const TEST_PREFIX = 'prova_';
const TEST_DELETED = '__eliminata__';
const props = {
  getProperty(k) {
    if (TEST) {
      const v = realProps.getProperty(TEST_PREFIX + k);
      if (v !== null && v !== undefined) return v === TEST_DELETED ? null : v;
    }
    return realProps.getProperty(k);
  },
  setProperty(k, v) {
    return realProps.setProperty(TEST ? TEST_PREFIX + k : k, v);
  },
  deleteProperty(k) {
    if (TEST) realProps.setProperty(TEST_PREFIX + k, TEST_DELETED);
    else realProps.deleteProperty(k);
  },
  getProperties() {
    const all = realProps.getProperties();
    const out = {};
    Object.keys(all).forEach((k) => {
      if (k.indexOf(TEST_PREFIX) !== 0) out[k] = all[k];
    });
    if (TEST) {
      Object.keys(all).forEach((k) => {
        if (k.indexOf(TEST_PREFIX) !== 0) return;
        const key = k.slice(TEST_PREFIX.length);
        if (all[k] === TEST_DELETED) delete out[key];
        else out[key] = all[k];
      });
    }
    return out;
  },
};

function sheetName(key) {
  return (TEST && TEST_SHEETS.includes(key) ? 'Prova · ' : '') + SHEETS[key].name;
}

/** Riallinea la prova ai dati veri: cancella fogli e proprietà di prova (si ricreano copiando i veri). */
function testReset() {
  const ss = SpreadsheetApp.getActive();
  TEST_SHEETS.forEach((key) => {
    const sh = ss.getSheetByName('Prova · ' + SHEETS[key].name);
    if (sh) ss.deleteSheet(sh);
  });
  Object.keys(realProps.getProperties())
    .filter((k) => k.indexOf(TEST_PREFIX) === 0)
    .forEach((k) => realProps.deleteProperty(k));
  MEMO = {};
  return { ok: true };
}

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

const TRIGGERS_VERSION = '7';

/**
 * Recap ogni domenica alle 19 e premiazioni del mese l'ultimo giorno del mese alle 21 (fuso orario dello script).
 * Chiamata anche dalla web app: dopo un aggiornamento i trigger nuovi si creano da soli.
 */
function ensureTriggers(force) {
  if (!force && props.getProperty('TRIGGERS_VERSION') === TRIGGERS_VERSION) return;
  // Due richieste insieme dopo un aggiornamento creerebbero i trigger due volte (premiazioni doppie)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    if (!force && props.getProperty('TRIGGERS_VERSION') === TRIGGERS_VERSION) return;
    createTriggers();
  } finally {
    lock.releaseLock();
  }
}

function createTriggers() {
  const handlers = ['sendWeeklyRecap', 'sendMonthlyRecap', 'eveningCheck', 'sfideTick', 'releaseDueNews'];
  ScriptApp.getProjectTriggers()
    .filter((t) => handlers.includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendWeeklyRecap').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();
  // Apps Script non ha "ultimo giorno del mese": controllo ogni sera alle 21
  ScriptApp.newTrigger('eveningCheck').timeBased().everyDays(1).atHour(21).nearMinute(5).create();
  // Sfide: promemoria delle conferme e chiusura di quelle di ieri
  ScriptApp.newTrigger('sfideTick').timeBased().everyHours(1).create();
  // Novità con un orario preciso (`at`): un trigger una tantum per ognuna ancora da rilasciare
  NEWS.forEach((n) => {
    const at = n.at && newsAt(n);
    if (at && at > new Date() && !releasedNews().includes(n.id)) ScriptApp.newTrigger('releaseDueNews').timeBased().at(at).create();
  });
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
  try {
    releaseDueNews();
    const today = dayString(new Date());
    if (addDays(today, 1).slice(8) !== '01') return;
    sendMonthlyRecap();
    releaseNews(today.slice(0, 7)); // le novità si sbloccano subito dopo l'incoronazione del Re
  } finally {
    pushChatIfChanged(); // eventi nuovi in chat: subito anche su Firebase
  }
}

// ---------- Novità dormienti ----------
// Una novità resta invisibile finché non viene rilasciata: l'ultimo giorno di `month`, subito dopo le premiazioni
// del mese (eveningCheck, verso le 21:05), con le slide in chat (public/news/<id>.html) e una notifica a tutti.
// I punti nuovi contano dal giorno `from`. In modalità prova si rilascia in anticipo e contano da subito.
// Una novità con `at` (data e ora con il fuso) invece esce a quell'ora precisa, senza aspettare la fine del mese.
const NEWS = [
  {
    id: 'sudometro-2',
    at: '2026-10-18T21:00:00+02:00',
    features: [],
    title: 'Novità dal laboratorio',
    body: 'È appena arrivata una cosa nuova. Tocca per scoprirla.',
  },
  {
    id: '2026-11',
    month: '2026-10',
    from: '2026-11-01',
    features: ['apripista', 'oltre', 'sfide'],
    title: 'Novità di novembre',
    body: 'Apripista, Oltre l\'obiettivo… e una sorpresa. Tocca per vedere.',
  },
];

function releasedNews() {
  return memo('news', () => {
    const list = safeJson(props.getProperty('NEWS_RELEASED') || '[]');
    return Array.isArray(list) ? list : [];
  });
}

function featureOn(feature) {
  return NEWS.some((n) => n.features.includes(feature) && releasedNews().includes(n.id));
}

/** Da che giorno contano i punti di una funzione (in prova da subito). */
function featureFrom(feature) {
  const n = NEWS.find((x) => x.features.includes(feature));
  return TEST || !n ? '' : n.from;
}

/** Rilascia le novità di un mese (tutte quelle in attesa se month è vuoto, solo `id` se indicato): evento in chat e notifica. */
function releaseNews(month, id) {
  NEWS.filter((n) => (!month || n.month === month) && (!id || n.id === id) && !releasedNews().includes(n.id)).forEach((n) => {
    props.setProperty('NEWS_RELEASED', JSON.stringify(releasedNews().concat(n.id)));
    forget('news');
    addChatEvent('', { kind: 'news', id: n.id, title: n.title, body: n.body });
    dispatch('news', n.id);
  });
}

/** Data di uscita di una novità con orario. */
function newsAt(n) {
  return new Date(n.at);
}

/** Rilascia le novità con orario già passato (trigger una tantum, controllo serale e richieste). */
function releaseDueNews() {
  NEWS.filter((n) => n.at && !releasedNews().includes(n.id) && newsAt(n) <= new Date()).forEach((n) => releaseNews('', n.id));
  pushChatIfChanged();
}

/** Paracadute se il trigger delle 21 non è partito: rilascia dopo le premiazioni, o comunque dalle 23 o dal mese dopo. */
function ensureNews() {
  const today = dayString(new Date());
  const lastDay = addDays(today, 1).slice(8) === '01';
  const hour = Number(Utilities.formatDate(new Date(), TZ, 'HH'));
  const monthly = safeJson(props.getProperty('LAST_MONTHLY') || '{}') || {};
  releaseDueNews();
  NEWS.forEach((n) => {
    if (!n.month || releasedNews().includes(n.id)) return;
    const late = today.slice(0, 7) > n.month;
    const due = today.slice(0, 7) === n.month && lastDay && (monthly.key === n.month || hour >= 23);
    if (late || due) releaseNews(n.month);
  });
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
  const week = weekKey(dayString(new Date()));
  if (props.getProperty('LAST_WEEKLY') === week) return; // già fatte questa settimana
  props.setProperty('LAST_WEEKLY', week);
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
  const t0 = Date.now();
  MEMO = {};
  TEST = false;
  TESTER = '';
  CHAT_DIRTY = false;
  LATER = [];
  try {
    const req = JSON.parse(e.postData.contents);
    try {
      ensureTriggers(false);
    } catch (err) {
      console.error('Trigger non aggiornati', err);
    }
    ensureReset();
    try {
      ensureNews();
    } catch (err) {
      console.error('Novità non rilasciate', err);
    }
    let user = findUserByCode(req.code);
    if (!user) return json({ error: 'Codice non valido' });
    if (req.test === true && (user.admin || PROVA_USERS.includes(user.name))) {
      TEST = true;
      TESTER = user.name;
      MEMO = {};
      // "Agisci come" (solo in prova): l'admin fa le azioni a nome di un altro, sui dati di prova.
      // Le notifiche restano dirette a chi prova (TESTER); i poteri da admin restano.
      if (req.actAs && req.actAs !== user.name && user.admin) {
        const other = allUsers().find((u) => u.name === String(req.actAs));
        if (!other) return json({ error: 'Utente non trovato' });
        user = { ...other, admin: true, debug: user.debug, actingAs: true };
      }
    }
    try {
      closeOldSfide();
    } catch (err) {
      console.error('Sfide non chiuse', err);
    }
    if (!TRACE_USERS.includes(user.name) || TEST) {
      const res = handle(req, user);
      finishRequest();
      return res;
    }
    let out;
    let failed = '';
    try {
      out = handle(req, user);
    } catch (err) {
      failed = String(err.message || err);
      out = json({ error: failed });
    }
    finishRequest();
    traceServer(user, req, out, Date.now() - t0, failed);
    return out;
  } catch (err) {
    finishRequest();
    return json({ error: String(err.message || err) });
  }
}

// Chiamate esterne di fine richiesta (stato su Firebase, notifiche): partono tutte insieme alla fine, non una per volta.
// Fuori da doPost (trigger, editor) LATER è null e partono subito.
let LATER = null;

function fetchLater(request) {
  if (LATER) LATER.push(request);
  else UrlFetchApp.fetch(request.url, request);
}

/** Fine richiesta: prima lo stato della chat su Firebase, insieme alle notifiche. */
function finishRequest() {
  const list = [];
  const st = chatStateRequest();
  if (st) list.push(st);
  if (LATER) list.push(...LATER);
  LATER = null;
  if (!list.length) return;
  try {
    UrlFetchApp.fetchAll(list.map((r) => ({ muteHttpExceptions: true, ...r })));
  } catch (err) {
    console.error('Chiamate di fine richiesta non riuscite', err);
  }
}

function handle(req, user) {
  {
    switch (req.action) {
      case 'login':
        return json({ name: user.name, display: user.display, goal: user.goal, debug: user.debug, trace: isTraced(user) });
      case 'state':
        return json({ ...buildState(user), trace: isTraced(user) });
      case 'trace':
        return json(saveTrace(user, req.events));
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
        fbSyncSoon(); // messaggi scritti su Firebase anche per chi legge da qui (Firebase bloccato, versioni vecchie)
        return json(chatState(user, req.v));
      case 'chatSend':
        return json(chatSend(user, req.text, req.id));
      case 'pollAsk':
        return json(pollAsk(user, req.day));
      case 'pollAnswer':
        return json(pollAnswer(user, req.choice, req.time));
      case 'planSet':
        return json(planSet(user, req.day, req.choice, req.time));
      case 'sfida':
        return json(sfidaAction(user, req));
      case 'chatDelete':
        if (fbChatOn() && user.debug) {
          // Via da Firebase (da tutti i telefoni) e dal foglio, dove arriva la copia
          firestoreDelete(fbColl(), String(req.id || ''));
          const r = chatDelete(user, req.id);
          return json(req.fb && r.error === 'Messaggio non trovato' ? { ok: true } : r);
        }
        return json(chatDelete(user, req.id));
      case 'chatNotify':
        // Messaggio appena scritto su Firebase: la copia nel foglio e la notifica le fa il server
        if (!fbChatOn()) return json({ error: 'Non disponibile' });
        fbSync();
        notifyChat(user);
        return json({ ok: true });
      case 'chatMute':
        if (req.muted) props.setProperty('mute_' + user.name, '1');
        else props.deleteProperty('mute_' + user.name);
        return json({ ok: true, muted: !!req.muted });
      case 'setAlias':
        if (TEST) return json({ error: 'In modalità prova l\'alias non si cambia (è un dato vero)' });
        return json(setAlias(user, req.alias));
      case 'testReset':
      case 'testRecap':
        if (!TEST || !user.admin) return json({ error: 'Solo in modalità prova' });
        if (req.action === 'testReset') return json(testReset());
        if (req.kind === 'monthly') {
          props.deleteProperty('LAST_MONTHLY'); // nella prova le premiazioni del mese si possono rifare
          sendMonthlyRecap();
        } else if (req.kind === 'news') {
          props.deleteProperty('NEWS_RELEASED'); // nella prova il rilascio si può ripetere
          forget('news');
          releaseNews('');
        } else {
          props.deleteProperty('LAST_WEEKLY');
          sendWeeklyRecap();
        }
        return json({ ok: true });
      case 'fbToken':
        if (!fbChatOn()) return json({ error: 'Non disponibile' });
        return json(firebaseToken(user));
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
      case 'adminLog':
      case 'adminUndo':
      case 'adminRestore':
      case 'adminAddCheckin':
        if (!user.admin) return json({ error: 'Solo per l\'admin' });
        if (req.action === 'adminLog') return json(adminLog());
        if (req.action === 'adminUndo') return json(adminUndo(user, req.kind, req.key));
        if (req.action === 'adminRestore') return json(adminRestore(req.id));
        return json(adminAddCheckin(req.name, req.day, req.time));
      default:
        return json({ error: 'Azione sconosciuta' });
    }
  }
}

// ---------- Diagnostica (TRACE_USERS, avvisati nell'app) ----------

function isTraced(user) {
  return TRACE_USERS.includes(user.name) && !TEST;
}

function traceRow(user, from, event, details) {
  const when = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  sheet('debug').appendRow([when, user.name, from, String(event).slice(0, 80), String(details).slice(0, 1000)]);
}

/** Una riga per ogni richiesta dell'account seguito: azione, durata, esito. */
function traceServer(user, req, out, ms, failed) {
  if (req.action === 'trace') return;
  try {
    let body = '';
    try {
      body = out.getContent();
    } catch (e) {
      body = out.body || '';
    }
    let err = failed;
    if (!err && body.indexOf('"error"') >= 0) {
      try {
        err = JSON.parse(body).error || '';
      } catch (e) { /* risposta non JSON */ }
    }
    const extra = req.action === 'chat' ? ` v=${req.v}` : '';
    traceRow(user, 'server', req.action, `${err ? 'ERRORE ' + err : 'ok'} · ${ms} ms · ${body.length} byte · app ${req.ver || '?'}${extra}`);
  } catch (e) {
    console.error('Registro non scritto', e);
  }
}

/** Eventi mandati dall'app dell'account seguito (errori, caricamenti, cosa vede a schermo). */
function saveTrace(user, events) {
  if (!isTraced(user)) return { ok: true };
  const list = Array.isArray(events) ? events.slice(0, 60) : [];
  if (!list.length) return { ok: true };
  const when = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
  const rows = list.map((e) => [when, user.name, 'app ' + String(e.t || ''), String(e.ev || '').slice(0, 80), String(e.d || '').slice(0, 1000)]);
  const sh = sheet('debug');
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  return { ok: true };
}

// ---------- API GET: check-in automatico (Comandi iOS) e GitHub Action ----------

function doGet(e) {
  MEMO = {};
  TEST = false;
  TESTER = '';
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
  if (p.action === 'pushJob') {
    if (p.test === '1' && p.tester) {
      TEST = true;
      TESTER = p.tester;
      return json({ notifications: testNotifications(buildNotifications(p.event, p.name), p.event) });
    }
    return json({ notifications: buildNotifications(p.event, p.name) });
  }
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
  try {
    maybeOpenSfida(user);
  } catch (err) {
    console.error('Sfida non aperta', err);
  }
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
  const refId = getReference(user).photoId || ''; // il riferimento di oggi: domani se ne farà un altro
  const now = new Date();
  sheet('sudometro').appendRow([
    dayString(now),
    Utilities.formatDate(now, TZ, 'HH:mm'),
    user.name,
    score,
    String(req.title || '').slice(0, 60),
    JSON.stringify(req.details || {}).slice(0, 3000),
    debug ? 'sì' : '',
    saved.id || '',
    refId,
  ]);
  if (!debug) {
    addChatEvent(user.name, { kind: 'sudometro', score, title: String(req.title || '').slice(0, 60), photoId: saved.id || '', ref: refId });
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
    const refId = (getReference(user) || {}).photoId || '';
    sh.getRange(row + 1, 2, 1, 8).setValues([[
      Utilities.formatDate(new Date(), TZ, 'HH:mm'),
      user.name,
      score,
      title,
      JSON.stringify(req.details || {}).slice(0, 3000),
      '',
      saved.id || '',
      refId,
    ]]);
    const chat = sheet('chat');
    chat.getDataRange().getValues().forEach((r, i) => {
      if (i === 0 || String(r[4]) !== 'event' || String(r[3]) !== user.name || toDay(r[1]) !== today) return;
      const data = safeJson(r[5]);
      if (data && data.kind === 'sudometro') {
        Object.assign(data, { score, title, photoId: saved.id || '', ref: refId });
        chat.getRange(i + 1, 6).setValue(JSON.stringify(data));
      }
    });
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  if (oldPhoto && !TEST) {
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
      admin: user.admin,
      tester: user.admin || PROVA_USERS.includes(user.name),
      actingAs: !!user.actingAs,
      checkedInToday: presenze.some((r) => r.day === today && r.name === user.name),
      sudometroToday: mySudoToday ? { score: mySudoToday.score, title: mySudoToday.title, photoId: mySudoToday.photoId, refId: mySudoToday.refId } : null,
      reference: getReference(user),
      timerSeconds: Number(props.getProperty('timer_' + user.name)) || null,
      chatMuted: !!props.getProperty('mute_' + user.name),
    },
    poll: pollSummary(today, presenze, dn),
    plans: plansSummary(presenze),
    refPhotos: refPhotoIds(),
    features: { apripista: featureOn('apripista'), oltre: featureOn('oltre'), sfide: featureOn('sfide') && sfide().length > 0, sudometro2: featureOn('sudometro2'), firebase: !TEST && fbChatOn() }, // la prova usa Firebase a parte // sfide: sorpresa, si vedono dalla prima
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
        .map((r) => ({ name: r.name, display: dn(r.name), day: r.day, score: r.score, title: r.title, photoId: r.photoId, refId: r.refId })),
    },
  };
}

/** Prova: ogni notifica diversa arriva solo a chi prova, con scritto a chi sarebbe andata. */
function testNotifications(list, event) {
  const dn = displayNames();
  const subs = rows('iscrizioni').filter((s) => s.name === TESTER);
  const byText = {};
  list.forEach((n) => {
    const k = n.title + '\n' + n.body;
    const who = rows('iscrizioni').find((s) => s.sub.endpoint === n.subscription.endpoint);
    (byText[k] = byText[k] || { n, to: [] }).to.push(who ? dn(who.name) : '?');
  });
  const out = [];
  Object.keys(byText).forEach((k) => {
    const { n, to } = byText[k];
    const names = to.filter((x, i) => to.indexOf(x) === i).join(', ');
    subs.forEach((s) => out.push({ subscription: s.sub, title: '[PROVA] ' + n.title, body: `${n.body}\n→ a: ${names}`, tab: n.tab || '' }));
  });
  if (!list.length) subs.forEach((s) => out.push({ subscription: s.sub, title: '[PROVA] ' + event, body: 'Nessuno riceverebbe questa notifica.' }));
  return out;
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

  if (event === 'sfida') {
    const [id, what, actor] = String(name).split('|');
    const s = sfide().find((x) => x.id === id);
    if (!s) return [];
    const def = SFIDE[s.type];
    const to = (names, title, body) => subs.filter((x) => names.includes(x.name)).map((x) => ({ subscription: x.sub, title, body, tab: 'chat' }));
    const parts = sfidaParts(s);
    const first = sfide()[0] && sfide()[0].id === id;
    const between = s.data.invited.map(dn).join(', ').replace(/, ([^,]*)$/, ' e $1');
    if (what === 'reveal') return subs.filter((x) => !s.data.invited.includes(x.name)).map((x) => ({ subscription: x.sub, title: 'Sorpresa svelata: le sfide!', body: `Prima sfida, ${def.label}, tra ${between}. Tocca per scoprire come funziona.`, tab: 'chat' }));
    if (what === 'open' && first) return to(s.data.invited, `Sorpresa! Prima sfida: ${def.label}`, 'Ecco la funzione speciale: le sfide. Tocca per scoprire come funziona e partecipare.');
    if (what === 'open') return to(s.data.invited, `Sfida! ${def.label}`, `${def.desc}. Tocca per partecipare.`);
    if (what === 'invite') return to([actor], `Sfida in corso: ${def.label}`, `${def.desc}. Tocca per partecipare.`);
    if (what === 'remind') return to(sfidaPending(s), `Sfida ${def.label}: mancano conferme`, 'Conferma i risultati entro mezzanotte, o valgono solo come partecipazione.');
    if (what === 'end') {
      const r = s.data.result || { winners: [] };
      return to(parts, `Sfida conclusa: ${def.label}`, r.winners.length ? `Vince ${r.winners.map(dn).join(', ')} (+${POINTS.sfidaVinta}). Partecipare vale +${POINTS.sfida}.` : `Nessun vincitore. Partecipare vale +${POINTS.sfida}.`);
    }
    if (what === 'result') {
      const others = parts.filter((n) => n !== actor);
      if (def.kind === 'durata') {
        const w = s.data.winner;
        return w ? to(others, `${dn(actor)}: ha vinto ${dn(w.name)}`, `Sfida ${def.label}. Confermi? Tocca per rispondere.`) : [];
      }
      const p = s.data.people[actor];
      return p && p.value !== null ? to(others, `${dn(actor)}: ${p.value} ${def.label.toLowerCase()}`, 'Confermi? Tocca per rispondere.') : [];
    }
    return [];
  }

  if (event === 'news') {
    const n = NEWS.find((x) => x.id === name);
    if (!n) return [];
    return subs.map((s) => ({ subscription: s.sub, title: n.title, body: n.body, tab: 'chat' }));
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
  CHAT_DIRTY = true;
  return v;
}

// La chat è cambiata in questa richiesta: a fine richiesta lo stato va anche su Firebase
let CHAT_DIRTY = false;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Giorno a cui si riferisce una domanda: Rif (domande per i giorni dopo) o il giorno in cui è stata fatta. */
function pollDay(r) {
  return /^\d{4}-\d\d-\d\d$/.test(r.ref) ? r.ref : r.day;
}

/** Tutte le domande "chi va in palestra?" (non solo quelle degli ultimi giorni): la prima per ogni giorno. */
function allPolls() {
  return memo('chat:polls', () => {
    const out = {};
    sheetRaw('chat').getDataRange().getValues().slice(1).forEach((r) => {
      if (String(r[4]) !== 'poll') return;
      const day = pollDay({ ref: r[6] instanceof Date ? dayString(r[6]) : String(r[6]), day: toDay(r[1]) });
      if (!out[day]) out[day] = { day, name: String(r[3]) };
    });
    return Object.keys(out).map((k) => out[k]);
  });
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
  const key = `${TEST ? 'prova_' : ''}chat_${version}_${today}`;
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
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) // le copie da Firebase arrivano nel foglio dopo
      .map((r) => ({
        id: r.id,
        day: r.day,
        time: r.clock,
        name: r.name,
        display: r.name ? dn(r.name) : '',
        type: r.type,
        text: r.type === 'msg' ? r.text : '',
        target: r.type === 'poll' ? pollDay(r) : '',
        data: r.type === 'event' ? withRef(safeJson(r.text)) : null,
      })),
    poll: pollSummary(today, presenze, dn),
    plans: plansSummary(presenze),
    names: Object.fromEntries(allUsers().map((u) => [u.name, u.display])),
    refPhotos: refPhotoIds(),
    sfide: sfideForChat(today),
  };
}

/** Sudometro in chat: il riferimento usato quel giorno (per gli eventi salvati prima che lo avessero, dal foglio). */
function withRef(data) {
  if (!data || data.kind !== 'sudometro' || data.ref || !data.photoId) return data;
  const row = rows('sudometro').find((r) => r.photoId === data.photoId);
  return row && row.refId ? { ...data, ref: row.refId } : data;
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

function appendChat(user, type, text, ref, at, id0) {
  const now = new Date();
  const id = id0 || newId();
  sheet('chat').appendRow([id, dayString(now), Utilities.formatDate(now, TZ, 'HH:mm'), user.name, type, text || '', ref || '', at || '']);
  return id;
}

/** `id` dal telefono (facoltativo): un messaggio rimasto in attesa su Firebase e mandato da qui non si doppia. */
function chatSend(user, text, id) {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return { error: 'Messaggio vuoto' };
  const cid = /^[a-z0-9]{8,20}$/.test(String(id || '')) ? String(id) : '';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!cid || !chatRows().some((r) => r.id === cid)) {
      const mid = appendChat(user, 'msg', t, '', '', cid);
      bumpChat();
      fbMirror(mid, user.name, t, new Date());
    }
  } finally {
    lock.releaseLock();
  }
  notifyChat(user);
  return chatState(user, -1);
}

/** Notifica "nuovo messaggio in chat", al massimo una ogni CHAT_NOTIFY_EVERY_MIN minuti per chi scrive. */
function notifyChat(user) {
  const last = Number(props.getProperty('chatNotify_' + user.name) || 0);
  if (Date.now() - last > CHAT_NOTIFY_EVERY_MIN * 60000) {
    props.setProperty('chatNotify_' + user.name, String(Date.now()));
    dispatch('chat', user.name);
  }
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
  let notify = true;
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
      if (!logChange(now, d, user.name, before, c, at)) notify = false; // ripensamento annullato: niente da dire
      bumpChat();
    }
  } finally {
    lock.releaseLock();
  }
  // Avvisa chi ha fatto la domanda per quel giorno, al massimo una volta ogni pochi minuti per persona e giorno
  const key = `answerNotify_${user.name}_${d}`;
  if (changed && c && notify && Date.now() - Number(props.getProperty(key) || 0) > ANSWER_NOTIFY_MS) {
    props.setProperty(key, String(Date.now()));
    dispatch('answer', user.name);
  }
  return chatState(user, -1);
}

const CHANGE_MERGE_MIN = 3; // cambi della stessa persona per lo stesso giorno così ravvicinati diventano uno solo
const ANSWER_NOTIFY_MS = 3 * 60000;

/**
 * Storico dei cambi (per le penalità). Se l'ultimo cambio della stessa persona per lo stesso giorno è di pochi
 * minuti fa, lo aggiorna invece di aggiungerne uno (tocchi sbagliati, rotella dell'orario); se alla fine non è
 * cambiato niente lo toglie. Restituisce false se il cambio si è annullato.
 */
function logChange(now, day, name, before, choice, time) {
  const sh = sheet('cambi');
  const values = sh.getDataRange().getDisplayValues();
  let i = values.length - 1;
  while (i > 0 && !(values[i][2] === name && values[i][1] === day)) i--;
  const minutesAgo = i > 0 ? (parseStamp(now) - parseStamp(values[i][0])) / 60000 : Infinity;
  if (i > 0 && minutesAgo >= 0 && minutesAgo <= CHANGE_MERGE_MIN && values[i][4] === before.choice) {
    const from = values[i][3];
    const timeFrom = values[i][5];
    if (from === choice && timeFrom === time) {
      sh.deleteRow(i + 1);
      return false;
    }
    sh.getRange(i + 1, 1, 1, 7).setValues([[now, day, name, from, choice, timeFrom, time]]);
    return true;
  }
  sh.appendRow([now, day, name, before.choice, choice, before.time, time]);
  return true;
}

/** "yyyy-MM-dd HH:mm" → millisecondi (solo per differenze). */
function parseStamp(t) {
  const m = String(t).match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
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

// ---------- Sfide (novità di novembre 2026) ----------
// Quando almeno due persone fanno check-in a meno di un'ora l'una dall'altra si apre una sfida a caso.
// Chi ha fatto check-in può dire "Ci sto" o "Passo" entro un'ora dall'apertura.
// - Plank e Barchetta (a durata): un partecipante dichiara chi ha vinto, un altro conferma.
// - Addominali, Squat, Affondi (a ripetizioni): ognuno scrive le sue, un altro conferma; vince chi supera di più
//   il proprio record degli ultimi 60 giorni (la prima volta è calibrazione: solo partecipazione).
// Basta una conferma; un risultato contestato si corregge una volta, alla seconda contestazione vale solo la
// partecipazione. Si chiude quando tutto è confermato o a mezzanotte (il non confermato vale come partecipazione).
// Punti: +5 a chi vince, +2 agli altri partecipanti.
const SFIDE = {
  plank: { label: 'Plank', kind: 'durata', desc: 'Fino allo sfinimento: vince chi resiste di più' },
  barchetta: { label: 'Barchetta', kind: 'durata', desc: 'Seduti, solo il sedere a terra, gambe e braccia sollevate: vince chi resiste di più' },
  addominali: { label: 'Addominali', kind: 'ripetizioni', desc: 'Fino allo sfinimento: vince chi supera di più il proprio record' },
  squat: { label: 'Squat', kind: 'ripetizioni', desc: 'Fino allo sfinimento: vince chi supera di più il proprio record' },
  affondi: { label: 'Affondi', kind: 'ripetizioni', desc: 'Fino allo sfinimento, gambe alternate (conta ogni gamba): vince chi supera di più il proprio record' },
};
const SFIDA_WINDOW_MIN = 60; // per unirsi, e distanza minima tra due sfide
const SFIDA_RECORD_DAYS = 60;
const SFIDA_REMIND_MIN = 120;

const hhmmToMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
const nowHHmm = () => Utilities.formatDate(new Date(), TZ, 'HH:mm');

function sfide() {
  return memo('sfide:list', () =>
    sheetRaw('sfide')
      .getDataRange()
      .getDisplayValues()
      .slice(1)
      .filter((r) => r[0])
      .map((r) => ({ id: r[0], day: r[1], at: r[2], type: r[3], state: r[4], data: safeJson(r[5]) || {} }))
  );
}

function saveSfida(s) {
  const found = findRows('sfide', (r) => r[0] === s.id);
  if (!found.length) return;
  sheet('sfide').getRange(found[0].row, 5, 1, 2).setValues([[s.state, JSON.stringify(s.data)]]);
  forget('sfide');
}

const sfidaParts = (s) => Object.keys(s.data.people || {}).filter((n) => s.data.people[n].in);
const sfidaJoinOpen = (s) => s.state === 'aperta' && s.day === dayString(new Date()) && hhmmToMin(nowHHmm()) - hhmmToMin(s.at) <= SFIDA_WINDOW_MIN;

/** Dopo un check-in: apre una sfida, o invita chi arriva mentre ce n'è una aperta. */
function maybeOpenSfida(user) {
  if (!featureOn('sfide')) return;
  const today = dayString(new Date());
  if (today < featureFrom('sfide')) return;
  const now = nowHHmm();
  let event = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const list = sfide().filter((s) => s.day === today);
    const open = list.find((s) => sfidaJoinOpen(s));
    if (open) {
      if (!open.data.invited.includes(user.name)) {
        open.data.invited.push(user.name);
        saveSfida(open);
        bumpChat();
        event = { id: open.id, what: 'invite' };
      }
    } else {
      const last = list[list.length - 1];
      if (last && hhmmToMin(now) - hhmmToMin(last.at) < SFIDA_WINDOW_MIN) return;
      const others = rows('presenze')
        .filter((r) => r.day === today && r.name !== user.name && Math.abs(hhmmToMin(r.time) - hhmmToMin(now)) <= SFIDA_WINDOW_MIN)
        .map((r) => r.name)
        .filter((n, i, a) => a.indexOf(n) === i);
      if (!others.length) return;
      const prev = sfide().slice(-1)[0];
      const types = Object.keys(SFIDE).filter((t) => !prev || t !== prev.type);
      // La prima sfida in assoluto è la rivelazione della sorpresa: sempre Plank, facile per capire il meccanismo
      const type = prev ? types[Math.floor(Math.random() * types.length)] : 'plank';
      const id = newId();
      sheet('sfide').appendRow([id, today, now, type, 'aperta', JSON.stringify({ invited: others.concat(user.name), people: {}, winner: null, winnerContests: 0, noWinner: false, reminded: false })]);
      forget('sfide');
      event = { id, what: 'open', type, first: !prev };
    }
  } finally {
    lock.releaseLock();
  }
  if (event && event.first) {
    addChatEvent('', { kind: 'news', id: 'sfide', title: 'Sorpresa svelata: le sfide!', body: 'Quando siete in palestra insieme si apre una sfida. Tocca per scoprire come funziona.' });
    dispatch('sfida', `${event.id}|reveal|`);
  }
  if (event && event.what === 'open') addChatEvent('', { kind: 'sfida', id: event.id, type: event.type });
  if (event) dispatch('sfida', `${event.id}|${event.what}|${user.name}`);
}

/** Azioni sulla card della sfida: join, value, winner, confirm, contest. */
function sfidaAction(user, req) {
  if (!featureOn('sfide')) return { error: 'Sfide non ancora attive' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let notify = null;
  let ended = null;
  try {
    const s = sfide().find((x) => x.id === String(req.id || ''));
    if (!s) return { error: 'Sfida non trovata' };
    if (s.state !== 'aperta') return { error: 'La sfida è già conclusa' };
    const def = SFIDE[s.type];
    const d = s.data;
    const me = d.people[user.name];
    const isPart = !!(me && me.in);
    const op = String(req.op || '');
    if (op === 'join') {
      if (!d.invited.includes(user.name)) return { error: 'Puoi unirti solo se hai fatto check-in' };
      if (!sfidaJoinOpen(s)) return { error: 'Troppo tardi per unirsi' };
      if (me && (me.entered || (d.winner && d.winner.by === user.name))) return { error: 'Hai già partecipato' };
      d.people[user.name] = { in: req.value === true, value: null, by: null, contested: 0, annulled: false, entered: false };
    } else if (op === 'value') {
      if (def.kind !== 'ripetizioni' || !isPart) return { error: 'Non puoi scrivere un risultato qui' };
      const v = Math.round(Number(req.value));
      if (!(v >= 0 && v <= 2000)) return { error: 'Numero non valido' };
      if (me.by) return { error: 'Il tuo risultato è già confermato' };
      if (me.annulled) return { error: 'Il tuo risultato è stato contestato due volte: vale la partecipazione' };
      Object.assign(me, { value: v, entered: true });
      notify = 'result';
    } else if (op === 'winner') {
      if (def.kind !== 'durata' || !isPart) return { error: 'Non puoi dichiarare il vincitore' };
      const w = String(req.target || '');
      if (!(d.people[w] && d.people[w].in)) return { error: 'Il vincitore deve essere un partecipante' };
      if (d.noWinner) return { error: 'Vincitore contestato due volte: vale la partecipazione' };
      if (d.winner) return { error: 'Il vincitore è già stato dichiarato' };
      d.winner = { name: w, by: user.name, conf: null };
      notify = 'result';
    } else if (op === 'confirm' || op === 'contest') {
      if (!isPart) return { error: 'Solo chi partecipa può confermare' };
      const target = String(req.target || '');
      if (target === '__winner') {
        if (!d.winner || d.winner.conf) return { error: 'Niente da confermare' };
        if (d.winner.by === user.name) return { error: 'Non puoi confermare la tua dichiarazione' };
        if (op === 'confirm') d.winner.conf = user.name;
        else {
          d.winnerContests = (d.winnerContests || 0) + 1;
          d.winner = null;
          if (d.winnerContests >= 2) d.noWinner = true;
        }
      } else {
        const p = d.people[target];
        if (!p || !p.in || p.value === null || p.by || p.annulled) return { error: 'Niente da confermare' };
        if (target === user.name) return { error: 'Il tuo risultato lo conferma un altro' };
        if (op === 'confirm') p.by = user.name;
        else {
          p.contested++;
          if (p.contested >= 2) p.annulled = true;
          else p.value = null;
        }
      }
    } else {
      return { error: 'Azione non valida' };
    }
    if (sfidaComplete(s)) {
      concludeSfida(s);
      ended = s.id;
    } else saveSfida(s);
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  if (ended) {
    addChatEvent('', { kind: 'sfidaFine', id: ended });
    dispatch('sfida', `${ended}|end|${user.name}`);
    return chatState(user, -1); // c'è un evento nuovo in chat: serve tutto
  }
  if (notify) dispatch('sfida', `${req.id}|${notify}|${user.name}`);
  // Risposta leggera: solo le sfide (la chat la ricarica il prossimo aggiornamento, se serve)
  return { sfideOnly: true, sfide: sfideForChat(dayString(new Date())) };
}

function sfidaComplete(s) {
  const parts = sfidaParts(s);
  if (parts.length < 2) return false;
  if (SFIDE[s.type].kind === 'durata') return s.data.noWinner || !!(s.data.winner && s.data.winner.conf);
  return parts.every((n) => {
    const p = s.data.people[n];
    return p.annulled || (p.value !== null && p.by);
  });
}

/** Record di una persona in una sfida a ripetizioni: miglior risultato confermato degli ultimi 60 giorni (null = calibrazione). */
function sfidaRecord(name, type, day, excludeId) {
  const from = addDays(day, -SFIDA_RECORD_DAYS);
  let best = null;
  sfide().forEach((s) => {
    if (s.id === excludeId || s.type !== type || s.state !== 'conclusa' || s.day < from || s.day > day) return;
    const p = (s.data.people || {})[name];
    if (p && p.in && !p.annulled && p.by && p.value !== null && (best === null || p.value > best)) best = p.value;
  });
  return best;
}

function sfidaResult(s) {
  const d = s.data;
  const parts = sfidaParts(s);
  const out = { points: {}, winners: [], records: [], calib: [], pct: {} };
  if (SFIDE[s.type].kind === 'durata') {
    if (!d.noWinner && d.winner && d.winner.conf && parts.includes(d.winner.name)) out.winners = [d.winner.name];
    parts.forEach((n) => (out.points[n] = out.winners.includes(n) ? POINTS.sfidaVinta : POINTS.sfida));
    return out;
  }
  const eligible = [];
  parts.forEach((n) => {
    const p = d.people[n];
    if (p.annulled || p.value === null || !p.by) return;
    const rec = sfidaRecord(n, s.type, s.day, s.id);
    if (rec === null || rec === 0) {
      out.calib.push(n);
      out.records.push({ name: n, value: p.value, first: true });
      return;
    }
    const pct = p.value / rec;
    out.pct[n] = Math.round(pct * 100);
    eligible.push({ n, pct });
    if (p.value > rec) out.records.push({ name: n, value: p.value });
  });
  if (eligible.length === 1 && eligible[0].pct >= 1) out.winners = [eligible[0].n];
  if (eligible.length > 1) {
    const max = Math.max(...eligible.map((e) => e.pct));
    out.winners = eligible.filter((e) => e.pct === max).map((e) => e.n);
  }
  parts.forEach((n) => {
    if (d.people[n].entered) out.points[n] = out.winners.includes(n) ? POINTS.sfidaVinta : POINTS.sfida;
  });
  return out;
}

function concludeSfida(s) {
  s.state = 'conclusa';
  s.data.result = sfidaResult(s);
  saveSfida(s);
}

/** A mezzanotte (o alla prima richiesta dopo): chiude le sfide dei giorni passati. */
function closeOldSfide() {
  if (!featureOn('sfide')) return;
  const today = dayString(new Date());
  const old = sfide().filter((s) => s.state === 'aperta' && s.day < today);
  if (!old.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    old.forEach((s) => concludeSfida(s));
    bumpChat();
  } finally {
    lock.releaseLock();
  }
  old.forEach((s) => sfidaParts(s).length && addChatEvent('', { kind: 'sfidaFine', id: s.id }));
}

/** Ogni ora: chiude le sfide di ieri e, 2 ore dopo l'apertura, ricorda le conferme mancanti. */
function sfideTick() {
  MEMO = {};
  try {
    fbSync(); // paracadute: messaggi Firebase rimasti fuori dal foglio
    sfideTickInner();
  } finally {
    pushChatIfChanged();
  }
}

function sfideTickInner() {
  closeOldSfide();
  if (!featureOn('sfide')) return;
  const today = dayString(new Date());
  sfide()
    .filter((s) => s.state === 'aperta' && s.day === today && !s.data.reminded && hhmmToMin(nowHHmm()) - hhmmToMin(s.at) >= SFIDA_REMIND_MIN)
    .forEach((s) => {
      s.data.reminded = true;
      saveSfida(s);
      if (sfidaPending(s).length) dispatch('sfida', `${s.id}|remind|`);
    });
}

/** Chi deve ancora confermare qualcosa (partecipanti diversi dall'autore). */
function sfidaPending(s) {
  const d = s.data;
  const parts = sfidaParts(s);
  if (SFIDE[s.type].kind === 'durata') return d.winner && !d.winner.conf ? parts.filter((n) => n !== d.winner.by) : [];
  const open = parts.filter((n) => d.people[n].value !== null && !d.people[n].by && !d.people[n].annulled);
  return parts.filter((n) => open.some((o) => o !== n));
}

/** Le sfide recenti per la chat, con record e percentuali già calcolati. */
function sfideForChat(today) {
  if (!featureOn('sfide')) return [];
  const dn = displayNames();
  const from = addDays(today, -2);
  return sfide()
    .filter((s) => s.day >= from)
    .map((s) => {
      const def = SFIDE[s.type];
      const people = Object.keys(s.data.people || {}).map((n) => {
        const p = s.data.people[n];
        const rec = def.kind === 'ripetizioni' ? sfidaRecord(n, s.type, s.day, s.id) : null;
        return { name: n, display: dn(n), in: p.in, value: p.value, by: p.by ? dn(p.by) : '', contested: p.contested, annulled: p.annulled, record: rec };
      });
      const w = s.data.winner;
      const r = s.data.result;
      return {
        id: s.id,
        day: s.day,
        at: s.at,
        type: s.type,
        label: def.label,
        kind: def.kind,
        desc: def.desc,
        state: s.state,
        joinOpen: sfidaJoinOpen(s),
        invited: s.data.invited.map((n) => ({ name: n, display: dn(n) })),
        people,
        winner: w ? { name: w.name, display: dn(w.name), by: w.by, byDisplay: dn(w.by), conf: w.conf ? dn(w.conf) : '' } : null,
        winnerContests: s.data.winnerContests || 0,
        noWinner: !!s.data.noWinner,
        result: r
          ? { winners: r.winners.map(dn), points: Object.keys(r.points).map((n) => ({ display: dn(n), pts: r.points[n] })), records: r.records.map((x) => ({ display: dn(x.name), value: x.value, first: !!x.first })), pct: Object.keys(r.pct || {}).map((n) => ({ display: dn(n), pct: r.pct[n] })) }
          : null,
      };
    });
}

// ---------- Admin: annullare e ripristinare le azioni di tutti ----------

const ADMIN_DAYS = 31;
const shortDay = (d) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`;
// Fogli che si possono riordinare dopo un ripristino (colonne di data e ora)
const SORT_COLUMNS = { presenze: [1, 2], sudometro: [1, 2], chat: [2, 3], cambi: [1], sfide: [2, 3] };

/** Penalità condonate dall'admin: "tipo|nome|giorno" → true. */
function condoni() {
  return memo('condoni', () => {
    const list = safeJson(props.getProperty('CONDONI') || '[]');
    const out = {};
    (Array.isArray(list) ? list : []).forEach((k) => (out[k] = true));
    return out;
  });
}

function setCondono(key, on) {
  const list = Object.keys(condoni()).filter((k) => k !== key);
  if (on) list.push(key);
  props.setProperty('CONDONI', JSON.stringify(list));
  forget('condoni');
}

/** Tutto quello che l'admin può annullare negli ultimi 31 giorni, più le azioni già annullate. */
function adminLog() {
  const from = addDays(dayString(new Date()), -(ADMIN_DAYS - 1));
  const dn = displayNames();
  const items = [];
  const push = (it) => items.push({ ...it, display: it.name ? dn(it.name) : 'Palestrina' });
  rows('presenze').filter((r) => r.day >= from).forEach((r) => push({ kind: 'presenza', key: `${r.day}|${r.time}|${r.name}`, day: r.day, time: r.time, name: r.name, text: 'Check-in' }));
  sheetRaw('sudometro').getDataRange().getDisplayValues().slice(1).forEach((r) => {
    if (r[6] || r[0] < from) return; // prove di debug escluse
    push({ kind: 'sudometro', key: `${r[0]}|${r[1]}|${r[2]}`, day: r[0], time: r[1], name: r[2], text: `Sudometro ${r[3]} · ${r[4]}`, photoId: r[7] || '' });
  });
  sheetRaw('chat').getDataRange().getDisplayValues().slice(1).forEach((r) => {
    if (r[1] < from) return;
    const type = r[4];
    if (type === 'msg') push({ kind: 'chat', key: r[0], day: r[1], time: r[2], name: r[3], text: `Messaggio: ${r[5]}` });
    if (type === 'poll') push({ kind: 'chat', key: r[0], day: r[1], time: r[2], name: r[3], text: `Domanda: ${r[5]} (con le risposte)` });
    if (type === 'event') {
      const data = safeJson(r[5]) || {};
      if (data.kind === 'checkin' || data.kind === 'sudometro') return; // si annullano con il check-in o il Sudometro
      push({ kind: 'chat', key: r[0], day: r[1], time: r[2], name: r[3] || 'Palestrina', text: `Evento in chat: ${data.kind || '?'}` });
    }
  });
  rows('piani').filter((r) => r.day >= from).forEach((r) => push({ kind: 'piano', key: `${r.day}|${r.name}`, day: r.day, time: r.time || '', name: r.name, text: `Risposta per il ${shortDay(r.day)}: ${CHOICE_LABELS[r.choice] || r.choice}${r.time ? ' alle ' + r.time : ''}` }));
  sfide().filter((x) => x.day >= from).forEach((x) => {
    const def = SFIDE[x.type];
    const parts = sfidaParts(x);
    const w = x.data.result && x.data.result.winners.length ? ` · vince ${x.data.result.winners.map(dn).join(', ')}` : '';
    push({ kind: 'sfida', key: x.id, day: x.day, time: x.at, name: '', text: `Sfida ${def.label} (${x.state}): ${parts.map(dn).join(', ') || 'nessun partecipante'}${w}` });
    parts.forEach((n) => {
      const p = x.data.people[n];
      if (def.kind === 'ripetizioni' && p.entered && !p.annulled) push({ kind: 'sfidaRisultato', key: `${x.id}|${n}`, day: x.day, time: x.at, name: n, text: `Risultato sfida ${def.label}: ${p.value === null ? 'da riscrivere' : p.value}${p.by ? ' (confermato)' : ''}` });
    });
  });
  const months = [from.slice(0, 7), dayString(new Date()).slice(0, 7)].filter((m, i, a) => a.indexOf(m) === i);
  months.forEach((m) => computePoints(m).forEach((t) => (t.penalties || []).forEach((p) => {
    if (p.day >= from) push({ kind: 'penalita', key: `${p.key}|${t.name}|${p.day}`, day: p.day, time: '', name: t.name, text: `Penalità: ${p.label} (${p.pts})` });
  })));
  const undone = sheetRaw('annullati').getDataRange().getDisplayValues().slice(1)
    .filter((r) => !r[5])
    .map((r) => ({ id: r[0], at: r[1], kind: r[2], text: r[3] }))
    .reverse();
  items.sort((a, b) => (a.day + a.time < b.day + b.time ? 1 : -1));
  return { items, undone, users: allUsers().map((u) => ({ name: u.name, display: u.display })) };
}

/** Righe (1-based, con valori mostrati) di un foglio che soddisfano `match`. */
function findRows(key, match) {
  const out = [];
  sheetRaw(key).getDataRange().getDisplayValues().forEach((r, i) => {
    if (i > 0 && match(r)) out.push({ row: i + 1, values: r });
  });
  return out;
}

/** Annulla un'azione: le righe coinvolte passano nel foglio Annullati. Nessuna notifica. */
function adminUndo(admin, kind, key) {
  const k = String(key || '');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const take = []; // { sheet, row, values }
    const photos = [];
    let text = '';
    let condono = '';
    let sfidaPatch = null;
    const add = (sheetKey, list) => list.forEach((x) => take.push({ sheet: sheetKey, ...x }));
    const chatEvents = (day, name, eventKind) => findRows('chat', (r) => r[4] === 'event' && r[1] === day && r[3] === name && (safeJson(r[5]) || {}).kind === eventKind);
    if (kind === 'presenza') {
      const [day, time, name] = k.split('|');
      const found = findRows('presenze', (r) => r[0] === day && r[1] === time && r[2] === name);
      if (!found.length) return { error: 'Check-in non trovato' };
      add('presenze', found);
      // l'evento in chat va via solo se non resta un altro check-in di quel giorno
      const others = findRows('presenze', (r) => r[0] === day && r[2] === name).length - found.length;
      if (!others) add('chat', chatEvents(day, name, 'checkin'));
      text = `Check-in di ${name}, ${shortDay(day)} ${time}`;
    } else if (kind === 'sudometro') {
      const [day, time, name] = k.split('|');
      const found = findRows('sudometro', (r) => !r[6] && r[0] === day && r[1] === time && r[2] === name);
      if (!found.length) return { error: 'Sudometro non trovato' };
      add('sudometro', found);
      add('chat', chatEvents(day, name, 'sudometro'));
      found.forEach((f) => f.values[7] && photos.push(f.values[7]));
      text = `Sudometro di ${name}, ${shortDay(day)} ${time} (${found[0].values[3]})`;
    } else if (kind === 'chat') {
      const found = findRows('chat', (r) => r[0] === k);
      if (!found.length) return { error: 'Messaggio non trovato' };
      const r = found[0].values;
      add('chat', found);
      if (r[4] === 'poll') {
        add('chat', findRows('chat', (x) => x[4] === 'answer' && x[6] === k));
        const day = pollDay({ ref: r[6], day: r[1] });
        add('piani', findRows('piani', (x) => x[0] === day));
      }
      text = `${r[4] === 'poll' ? 'Domanda' : r[4] === 'event' ? 'Evento' : 'Messaggio'} di ${r[3] || 'Palestrina'}, ${shortDay(r[1])} ${r[2]}: ${String(r[5]).slice(0, 60)}`;
    } else if (kind === 'piano') {
      const [day, name] = k.split('|');
      const found = findRows('piani', (r) => r[0] === day && r[1] === name);
      if (!found.length) return { error: 'Risposta non trovata' };
      add('piani', found);
      text = `Risposta di ${name} per il ${shortDay(day)}: ${CHOICE_LABELS[found[0].values[2]] || found[0].values[2]}`;
    } else if (kind === 'sfida') {
      const found = findRows('sfide', (r) => r[0] === k);
      if (!found.length) return { error: 'Sfida non trovata' };
      add('sfide', found);
      add('chat', findRows('chat', (r) => r[4] === 'event' && ['sfida', 'sfidaFine'].includes((safeJson(r[5]) || {}).kind) && (safeJson(r[5]) || {}).id === k));
      text = `Sfida ${SFIDE[found[0].values[3]] ? SFIDE[found[0].values[3]].label : ''} del ${shortDay(found[0].values[1])} ${found[0].values[2]}`;
    } else if (kind === 'sfidaRisultato') {
      const [sid, name] = k.split('|');
      const x = sfide().find((y) => y.id === sid);
      const p = x && x.data.people[name];
      if (!p || p.annulled) return { error: 'Risultato non trovato' };
      sfidaPatch = { id: sid, name, prev: JSON.parse(JSON.stringify(p)) };
      Object.assign(p, { annulled: true });
      if (x.state === 'conclusa') x.data.result = sfidaResult(x);
      saveSfida(x);
      bumpChat();
      text = `Risultato di ${name} nella sfida ${SFIDE[x.type].label} del ${shortDay(x.day)}: ${p.value}`;
    } else if (kind === 'penalita') {
      const [pk, name, day] = k.split('|');
      if (condoni()[k]) return { error: 'Già condonata' };
      setCondono(k, true);
      condono = k;
      text = `Penalità condonata a ${name}: ${pk}, ${shortDay(day)}`;
    } else {
      return { error: 'Tipo non valido' };
    }
    // Dal fondo di ogni foglio, così gli indici restano validi
    take.slice().sort((a, b) => b.row - a.row).forEach((t) => sheet(t.sheet).deleteRow(t.row));
    // In prova le righe copiate puntano alle foto vere: niente cestino
    if (!TEST) photos.forEach((id) => {
      try {
        DriveApp.getFileById(id).setTrashed(true);
      } catch (err) {
        console.error('Foto non spostata nel cestino', err);
      }
    });
    const data = { rows: take.map((t) => ({ sheet: t.sheet, values: t.values })), photos, condono, sfidaPatch };
    const id = newId();
    sheet('annullati').appendRow([id, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + ' ' + admin.name, kind, text, JSON.stringify(data), '']);
    if (take.some((t) => t.sheet === 'chat' || t.sheet === 'piani')) bumpChat();
    return { ok: true, id, text };
  } finally {
    lock.releaseLock();
  }
}

/** Rimette al loro posto le righe di un'azione annullata. */
function adminRestore(id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findRows('annullati', (r) => r[0] === String(id || ''));
    if (!found.length) return { error: 'Azione non trovata' };
    if (found[0].values[5]) return { error: 'Già ripristinata' };
    const data = safeJson(found[0].values[4]) || {};
    const touched = {};
    (data.rows || []).forEach((r) => {
      const sh = sheet(r.sheet);
      sh.appendRow(r.values.slice(0, SHEETS[r.sheet].header.length));
      touched[r.sheet] = true;
    });
    Object.keys(touched).forEach((key) => {
      const cols = SORT_COLUMNS[key];
      const sh = sheet(key);
      if (cols && sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, SHEETS[key].header.length).sort(cols.map((c) => ({ column: c, ascending: true })));
    });
    if (!TEST) (data.photos || []).forEach((pid) => {
      try {
        DriveApp.getFileById(pid).setTrashed(false);
      } catch (err) {
        console.error('Foto non ripristinata', err);
      }
    });
    if (data.condono) setCondono(data.condono, false);
    if (data.sfidaPatch) {
      const x = sfide().find((y) => y.id === data.sfidaPatch.id);
      if (x) {
        x.data.people[data.sfidaPatch.name] = data.sfidaPatch.prev;
        if (x.state === 'conclusa') x.data.result = sfidaResult(x);
        saveSfida(x);
        bumpChat();
      }
    }
    sheet('annullati').getRange(found[0].row, 6).setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
    if (touched.chat || touched.piani) bumpChat();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Check-in aggiunto a mano (anche per giorni passati): senza notifiche e senza evento in chat. */
function adminAddCheckin(name, day, time) {
  const user = allUsers().find((u) => u.name === name);
  if (!user) return { error: 'Utente non trovato' };
  if (!/^\d{4}-\d\d-\d\d$/.test(String(day)) || String(day) > dayString(new Date())) return { error: 'Giorno non valido' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return { error: 'Orario non valido' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (rows('presenze').some((r) => r.day === day && r.name === name)) return { error: 'Quel giorno ha già un check-in' };
    const sh = sheet('presenze');
    sh.appendRow([day, time, name, 'admin']);
    if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, SHEETS.presenze.header.length).sort([{ column: 1, ascending: true }, { column: 2, ascending: true }]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Foto su Drive ----------

/** Salva un JPEG (base64) nella cartella dell'utente. Un errore non blocca il resto. */
function savePhoto(user, base64, label) {
  if (!base64) return {};
  if (base64.length > 3e6) return { error: 'Foto troppo grande' };
  try {
    const name = `${Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm')} ${user.name} ${TEST ? 'prova ' : ''}${label}.jpg`;
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
  const allowed = new Set(rows('sudometro').flatMap((r) => [r.photoId, r.refId]).filter(Boolean).concat(Object.values(refPhotoIds())));
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
  const allowed = id && (rows('sudometro').some((r) => r.photoId === id || r.refId === id) || Object.values(refPhotoIds()).includes(id));
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
  apripista: 3, // novità di novembre 2026: primo a chiedere "chi va in palestra?" per un giorno e poi check-in
  oltre: 3, // novità di novembre 2026: ogni ingresso della settimana oltre l'obiettivo
  sfidaVinta: 5, // novità di novembre 2026: sfida vinta
  sfida: 2, // novità di novembre 2026: partecipazione a una sfida
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
  const condoned = condoni();
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
    if (featureOn('apripista')) {
      const from = featureFrom('apripista');
      allPolls().forEach((q) => {
        if (q.name === u.name && inMonth(q.day) && q.day >= from && first[u.name + '|' + q.day]) add('apripista', 'Apripista', P.apripista);
      });
    }
    // Settimane di fila: il bonus arriva nel giorno in cui si raggiunge l'obiettivo
    for (let w = weekKey(monthStart); w <= addDays(monthStart, 31); w = addDays(w, 7)) {
      const days = mine.filter((r) => weekKey(r.day) === w).map((r) => r.day);
      if (days.length < u.goal || !inMonth(days[u.goal - 1])) continue;
      let n = 1;
      while (countInWeek(pres, u.name, addDays(w, -7 * n)) >= u.goal) n++;
      if (n > 1) add('serie', 'Settimane di fila', Math.min(P.seriePerSettimana * (n - 1), P.serieMax));
    }
    // Sfide: +5 a chi vince, +2 agli altri partecipanti
    if (featureOn('sfide')) {
      const from = featureFrom('sfide');
      sfide().forEach((x) => {
        const pts = x.state === 'conclusa' && inMonth(x.day) && x.day >= from && x.data.result ? x.data.result.points[u.name] : 0;
        if (pts === P.sfidaVinta) add('sfidaVinta', 'Sfide vinte', pts);
        else if (pts) add('sfida', 'Sfide', pts);
      });
    }
    // Oltre l'obiettivo: ogni ingresso della settimana dopo quelli dell'obiettivo
    if (featureOn('oltre')) {
      const from = featureFrom('oltre');
      for (let w = weekKey(monthStart); w <= addDays(monthStart, 31); w = addDays(w, 7)) {
        mine.filter((r) => weekKey(r.day) === w).map((r) => r.day).slice(u.goal).forEach((day) => {
          if (inMonth(day) && day >= from) add('oltre', 'Oltre l\'obiettivo', P.oltre);
        });
      }
    }
    // Penalità (da quando esistono)
    const today = dayString(new Date());
    const penFrom = penaltiesFrom();
    const penalties = [];
    const pen = (key, label, pts, day) => {
      if (condoned[`${key}|${u.name}|${day}`]) return;
      add(key, label, pts);
      penalties.push({ key, label, pts, day });
    };
    const myCambi = cambi.filter((c) => c.name === u.name);
    for (let day = monthStart; inMonth(day) && day <= today; day = addDays(day, 1)) {
      if (day < penFrom) continue;
      const plan = piani[day + '|' + u.name];
      const came = first[u.name + '|' + day];
      if (!came) {
        if (day < today && plan && plan.choice === 'si') pen('bidone', 'Bidone', P.bidone, day);
        else {
          // Cambio all'ultimo: da "ci sono" ad altro a meno di 4 ore dall'orario (senza orario: dalle 14 di quel giorno).
          // Conta solo se la risposta finale non è più "ci sono": un ripensamento subito annullato non vale.
          const late = !(plan && plan.choice === 'si') && myCambi.some((c) => c.day === day && c.from === 'si' && c.to !== 'si' && c.at >= `${day} ${c.timeBefore ? hhmmMinus(c.timeBefore, P.cambioOre * 60) : P.cambioSenzaOrario}`);
          if (late) pen('cambio', 'Cambio all\'ultimo', P.cambioUltimo, day);
        }
        continue;
      }
      if (plan && plan.choice === 'si' && plan.time && minutes(came.time) > minutes(plan.time) + P.ritardoMinuti) pen('ritardo', 'Ritardo', P.ritardo, day);
      const limit = `${day} ${hhmmMinus(came.time, P.avvisoMinuti)}`;
      const told = myCambi.filter((c) => c.day === day && (c.to === 'si' || c.to === 'forse')).map((c) => c.at).sort()[0];
      if (!told || told > limit) pen('avviso', 'Check-in senza avvisare', P.senzaAvviso, day);
    }
    // Settimana a vuoto: settimane finite (domenica nel mese) senza presenze, per chi c'era già
    const firstEver = mine.length ? mine[0].day : null;
    for (let w = weekKey(monthStart); w <= addDays(monthStart, 31); w = addDays(w, 7)) {
      const sunday = addDays(w, 6);
      if (!inMonth(sunday) || sunday >= today || w < penFrom || !firstEver || firstEver >= w) continue;
      if (countInWeek(pres, u.name, w) === 0) pen('vuota', 'Settimana a vuoto', P.settimanaVuota, w);
    }
    if (early >= P.mattinieroVolte) add('mattiniero', 'Mattiniero', P.mattiniero, true);
    if (friends >= P.brancoVolte) add('branco', 'Branco', P.branco, true);
    if (mondays.length && mondays.every((w) => countInWeek(pres, u.name, w) >= u.goal)) add('maiSaltato', 'Mai saltato', P.maiSaltato, true);
    return { name: u.name, display: u.display, items, penalties };
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
      return { name: t.name, display: t.display, total: detail.reduce((a, g) => a + g.pts, 0), detail, penalties: t.penalties };
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
  let sh = ss.getSheetByName(sheetName(key));
  if (!sh && TEST && TEST_SHEETS.includes(key)) {
    // Primo uso della prova: copia del foglio vero, tutto come testo
    const real = ss.getSheetByName(SHEETS[key].name);
    const values = real ? real.getDataRange().getDisplayValues() : [SHEETS[key].header];
    sh = ss.insertSheet(sheetName(key));
    const width = Math.max(SHEETS[key].header.length, values[0].length);
    sh.getRange(1, 1, Math.max(values.length, 1000), width).setNumberFormat('@');
    sh.getRange(1, 1, values.length, values[0].length).setValues(values);
    sh.setFrozenRows(1);
    return sh;
  }
  if (!sh) {
    // Fogli aggiunti dopo il primo setup (es. Chat): li crea al primo uso.
    if (key === 'utenti') throw new Error('Esegui prima setup() dall\'editor di Apps Script');
    sh = ss.insertSheet(sheetName(key));
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
  if (key === 'sfide' && !props.getProperty('SFIDE_TEXT_FORMAT')) {
    sh.getRange('A:F').setNumberFormat('@'); // giorni, orari e JSON come testo
    props.setProperty('SFIDE_TEXT_FORMAT', '1');
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
    return values.filter((r) => !r[6]).map((r) => ({ day: toDay(r[0]), name: r[2], score: Number(r[3]), title: r[4], photoId: r[7] || '', refId: r[8] || '' }));
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
      admin: ADMIN_USERS.includes(String(r[0]).trim()),
    }))
    .map((u) => ({ ...u, display: u.alias || u.name }));
}

function findUserByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  return c ? allUsers().find((u) => u.code.toUpperCase() === c) : null;
}

// ---------- Utilità ----------

// ---------- Firebase (chat in tempo reale) ----------

/** Lo stesso calcolo è in public/fbchat.js. */
function fbUid(name) {
  return String(name).replace(/[^A-Za-z0-9_-]/g, '_') || 'utente';
}

const FIREBASE_PROJECT = 'palestrina-cb43c';

/** JWT firmato con la chiave dell'account di servizio (proprietà FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY). */
function signServiceJwt(claims) {
  const email = realProps.getProperty('FIREBASE_CLIENT_EMAIL');
  const key = String(realProps.getProperty('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n').trim();
  if (!email || !key) throw new Error('Firebase non configurato');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (x) => Utilities.base64EncodeWebSafe(x).replace(/=+$/, '');
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: email, iat: now, exp: now + 3600, ...claims(email) }));
  const sig = b64(Utilities.computeRsaSha256Signature(`${head}.${body}`, key + '\n'));
  return `${head}.${body}.${sig}`;
}

/**
 * Permesso per Firebase (custom token). Le regole di Firestore fanno leggere chi ha pal=true
 * e scrivere solo a nome proprio (name).
 */
function firebaseToken(user) {
  try {
    const token = signServiceJwt((email) => ({
      sub: email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      uid: fbUid(user.name),
      claims: { pal: true, name: user.name },
    }));
    return { token, uid: fbUid(user.name) };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// ---------- Firestore dal server (REST) ----------
// Il server scrive lo stato della chat (sondaggio, piani, eventi, sfide) su Firestore appena cambia:
// i telefoni collegati lo ricevono subito invece di chiederlo ogni 5 secondi.

function firestoreBase() {
  const emu = realProps.getProperty('FIRESTORE_EMULATOR'); // solo per le prove in locale
  return `${emu ? 'http://' + emu : 'https://firestore.googleapis.com'}/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
}

/** Accesso a Firestore come account di servizio, tenuto in cache per 50 minuti. */
function firestoreToken() {
  if (realProps.getProperty('FIRESTORE_EMULATOR')) return 'owner';
  const cache = CacheService.getScriptCache();
  const hit = cache.get('firestore_token');
  if (hit) return hit;
  const assertion = signServiceJwt(() => ({ scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token' }));
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion },
    muteHttpExceptions: true,
  });
  const token = (safeJson(r.getContentText()) || {}).access_token;
  if (!token) throw new Error(`Accesso a Firestore negato (${r.getResponseCode()})`);
  cache.put('firestore_token', token, 3000);
  return token;
}

/** `path` è un documento (`chat/abc`) o un metodo della radice (`:commit`, `:runQuery`). */
function firestoreCall(method, path, body) {
  const opts = { method, headers: { Authorization: 'Bearer ' + firestoreToken() }, muteHttpExceptions: true };
  if (body) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(body);
  }
  const r = UrlFetchApp.fetch(`${firestoreBase()}${path[0] === ':' ? '' : '/'}${path}`, opts);
  const code = r.getResponseCode();
  if (code >= 300 && !(method === 'delete' && code === 404)) throw new Error(`Firestore ${code}: ${r.getContentText().slice(0, 200)}`);
  return safeJson(r.getContentText());
}

/**
 * Chat su Firebase: sempre in prova; per tutti con la novità "firebase" o con la proprietà FIREBASE_CHAT = "tutti".
 * FIREBASE_CHAT = "spento" la toglie a tutti (fuori dalla prova) in un attimo: si torna al foglio.
 */
function fbChatOn() {
  if (TEST) return true;
  const p = realProps.getProperty('FIREBASE_CHAT');
  return p !== 'spento' && (p === 'tutti' || featureOn('firebase'));
}

const fbColl = () => (TEST ? 'prova_chat' : 'chat');

/** Documento di un messaggio come lo scrive il telefono. */
function fbMsgDoc(name, text, at) {
  return { fields: { name: { stringValue: name }, text: { stringValue: text }, at: { timestampValue: at.toISOString() } } };
}

/** Messaggio scritto da qui (versioni vecchie dell'app, Firebase bloccato): copia su Firebase con lo stesso id. */
function fbMirror(id, name, text, at) {
  if (!fbChatOn()) return;
  try {
    firestoreCall('patch', `${fbColl()}/${id}`, fbMsgDoc(name, text, at));
  } catch (err) {
    console.error('Messaggio non copiato su Firebase', err);
  }
}

const FB_SYNC_DAYS = 2;

/**
 * Messaggi scritti su Firebase negli ultimi giorni che mancano nel foglio: li aggiunge con lo stesso id.
 * Così il foglio resta lo storico completo e chi non riesce a usare Firebase li vede lo stesso.
 */
function fbSync() {
  if (!fbChatOn()) return 0;
  try {
    const from = new Date(Date.now() - FB_SYNC_DAYS * 86400000).toISOString();
    const res = firestoreCall('post', ':runQuery', {
      structuredQuery: {
        from: [{ collectionId: fbColl() }],
        where: { fieldFilter: { field: { fieldPath: 'at' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: from } } },
      },
    });
    const docs = (Array.isArray(res) ? res : []).map((x) => x.document).filter(Boolean);
    if (!docs.length) return 0;
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      MEMO = {};
      const have = new Set(chatRows().map((r) => r.id));
      const add = docs
        .map((d) => ({ id: d.name.split('/').pop(), name: d.fields.name.stringValue, text: d.fields.text.stringValue, at: new Date(d.fields.at.timestampValue) }))
        .filter((m) => !have.has(m.id))
        .sort((a, b) => a.at - b.at);
      if (!add.length) return 0;
      const sh = sheet('chat');
      add.forEach((m) => sh.appendRow([m.id, dayString(m.at), Utilities.formatDate(m.at, TZ, 'HH:mm'), m.name, 'msg', m.text, '', '']));
      bumpChat();
      return add.length;
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error('Chat Firebase non copiata nel foglio', err);
    return 0;
  }
}

/** fbSync al massimo ogni 30 secondi (la chiamano tutti i telefoni che chiedono la chat). */
function fbSyncSoon() {
  if (!fbChatOn()) return;
  const cache = CacheService.getScriptCache();
  const key = (TEST ? 'prova_' : '') + 'fbSync';
  if (cache.get(key)) return;
  cache.put(key, '1', 30);
  fbSync();
}

/**
 * Da lanciare dall'editor (una tantum, ripetibile): copia su Firebase tutti i messaggi del foglio della chat.
 * L'id del documento è quello del messaggio, quindi rifarla non crea doppioni.
 */
function copiaChatSuFirebase() {
  TEST = false;
  MEMO = {};
  const msgs = sheetRaw('chat').getDataRange().getValues().slice(1)
    .filter((r) => String(r[4]) === 'msg' && /^[A-Za-z0-9_-]+$/.test(String(r[0])))
    .map((r) => ({ id: String(r[0]), name: String(r[3]), text: String(r[5]), at: Utilities.parseDate(`${toDay(r[1])} ${toTime(r[2])}`, TZ, 'yyyy-MM-dd HH:mm') }));
  const root = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  for (let i = 0; i < msgs.length; i += 400) {
    firestoreCall('post', ':commit', {
      writes: msgs.slice(i, i + 400).map((m) => ({ update: { name: `${root}/chat/${m.id}`, ...fbMsgDoc(m.name, m.text, m.at) } })),
    });
  }
  Logger.log(`Copiati su Firebase ${msgs.length} messaggi`);
  return msgs.length;
}

function firestoreDelete(coll, id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Messaggio non indicato');
  firestoreCall('delete', `${coll}/${id}`);
}

/** Stato della chat su Firestore (documento state/chat o prova_state/chat), se in questa richiesta è cambiato. */
function pushChatIfChanged() {
  const r = chatStateRequest();
  if (!r) return;
  try {
    const res = UrlFetchApp.fetch(r.url, { ...r, muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) throw new Error(`Firestore ${res.getResponseCode()}`);
  } catch (err) {
    console.error('Chat non aggiornata su Firebase', err);
  }
}

/** La scrittura dello stato della chat su Firestore, da fare se in questa richiesta è cambiato (altrimenti null). */
function chatStateRequest() {
  if (!CHAT_DIRTY || !fbChatOn()) return null;
  CHAT_DIRTY = false;
  try {
    MEMO = {}; // dopo le scritture si rilegge tutto
    const st = chatState(null, -1);
    return {
      url: `${firestoreBase()}/${TEST ? 'prova_' : ''}state/chat`,
      method: 'patch',
      headers: { Authorization: 'Bearer ' + firestoreToken() },
      contentType: 'application/json',
      payload: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(st) }, v: { integerValue: String(st.v) }, at: { timestampValue: new Date().toISOString() } } }),
    };
  } catch (err) {
    console.error('Chat non aggiornata su Firebase', err);
    return null;
  }
}

/** Chiede a GitHub di avviare la Action che invia le notifiche. */
function dispatch(event, name) {
  const token = props.getProperty('GITHUB_TOKEN');
  const repo = props.getProperty('GITHUB_REPO');
  if (!token || !repo) return; // notifiche non ancora configurate
  try {
    fetchLater({
      url: `https://api.github.com/repos/${repo}/dispatches`,
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ event_type: event, client_payload: TEST ? { name, test: '1', tester: TESTER } : { name } }),
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
