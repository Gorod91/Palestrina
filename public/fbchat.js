// Chat su Firebase (Firestore): il telefono resta collegato e i messaggi arrivano appena qualcuno scrive,
// invece di chiedere al server ogni 5 secondi. Raccolta "chat" (in modalità prova "prova_chat").
// L'accesso lo dà il nostro server dopo il codice personale (azione "fbToken"): niente account Google.

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const CONFIG = {
  apiKey: 'AIzaSyCfoTvOZuRhi5QFHhqp7cjc5xNVmO8711I',
  authDomain: 'palestrina-cb43c.firebaseapp.com',
  projectId: 'palestrina-cb43c',
  storageBucket: 'palestrina-cb43c.firebasestorage.app',
  messagingSenderId: '367535020607',
  appId: '1:367535020607:web:969d7bc324d20f1618f68a',
};
const TZ = 'Europe/Rome';

let ready = null; // { au, fs, auth, db } una volta caricato l'SDK

function sdk() {
  if (!ready) {
    ready = Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')])
      .then(([a, au, fs]) => {
        const app = a.initializeApp(CONFIG);
        const auth = au.initializeAuth(app, { persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence] });
        // Copia della chat sul telefono: all'apertura si vede subito e si scrive anche senza campo
        let db;
        try {
          db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
        } catch {
          db = fs.initializeFirestore(app, {});
        }
        const emu = window.PALESTRINA_FB_EMU; // solo per le prove in locale
        if (emu) {
          au.connectAuthEmulator(auth, emu.auth, { disableWarnings: true });
          fs.connectFirestoreEmulator(db, emu.host, emu.port);
        }
        return { au, fs, auth, db };
      })
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

/** Stesso calcolo del server (fbUid in Code.gs). */
export const fbUid = (name) => String(name).replace(/[^A-Za-z0-9_-]/g, '_') || 'utente';

const fmt = (opts) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', ...opts });
const dayFmt = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit' });

/** Id ordinabile nel tempo, come newId() del server: così messaggi ed eventi si mettono in fila per id. */
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * onChange(messaggi) a ogni novità, nel formato della chat di Apps Script ({ id, day, time, name, type, text })
 * più `pending` finché il messaggio non è arrivato a Firebase.
 */
export function createFbChat({ getToken, onChange, onState, onPlans, onError, onPlansError, days = 7 }) {
  let unsub = null;
  let unsubState = null;
  let unsubAsks = null;
  let unsubPlans = null;
  let coll = '';
  let asksColl = '';
  let plansColl = '';
  let uid = '';
  let name = '';
  let gen = 0;

  async function start(me, test) {
    stop();
    const my = ++gen;
    const { au, fs, auth, db } = await sdk();
    await auth.authStateReady();
    let ok = auth.currentUser && auth.currentUser.uid === fbUid(me.name);
    if (ok) {
      const t = await auth.currentUser.getIdTokenResult();
      ok = t.claims.pal === true && t.claims.name === me.name;
    }
    if (!ok) {
      const r = await getToken();
      await au.signInWithCustomToken(auth, r.token);
    }
    if (my !== gen) return; // nel frattempo si è chiusa o cambiata la chat
    coll = test ? 'prova_chat' : 'chat';
    asksColl = test ? 'prova_domande' : 'domande';
    plansColl = test ? 'prova_piani' : 'piani';
    name = me.name;
    uid = fbUid(me.name);
    const from = fs.Timestamp.fromMillis(Date.now() - days * 86400000);
    const q = fs.query(fs.collection(db, coll), fs.where('at', '>=', from), fs.orderBy('at'));
    unsub = fs.onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        onChange(
          snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: 'estimate' });
            const at = x.at && x.at.toDate ? x.at.toDate() : new Date();
            return {
              id: d.id,
              day: dayFmt.format(at),
              time: timeFmt.format(at),
              name: String(x.name || ''),
              type: 'msg',
              text: String(x.text || ''),
              pending: d.metadata.hasPendingWrites,
              fb: true,
            };
          }),
          snap.metadata.fromCache,
        );
      },
      (err) => onError(err),
    );
    // Stato della chat (sondaggio, piani, eventi, sfide) scritto dal server appena cambia
    unsubState = fs.onSnapshot(
      fs.doc(db, test ? 'prova_state' : 'state', 'chat'),
      (snap) => {
        const x = snap.exists() ? snap.data() : null;
        if (x && x.json) onState(JSON.parse(x.json), snap.metadata.fromCache);
      },
      (err) => onError(err),
    );
    // Sondaggio: domande ("Chiedi a tutti") e risposte da oggi in poi, scritte dai telefoni.
    // Un errore qui (per esempio regole non ancora pubblicate) non spegne la chat: il sondaggio torna al server.
    const today = dayFmt.format(new Date());
    let asks = null;
    let plans = null;
    const emit = (fromCache) => asks && plans && onPlans(asks, plans, fromCache);
    unsubAsks = fs.onSnapshot(
      fs.query(fs.collection(db, asksColl), fs.where('day', '>=', today)),
      { includeMetadataChanges: true },
      (snap) => {
        asks = new Map(
          snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: 'estimate' });
            const at = x.at && x.at.toDate ? x.at.toDate() : new Date();
            return [x.day, { id: String(x.id || ''), day: x.day, name: String(x.name || ''), atDay: dayFmt.format(at), clock: timeFmt.format(at), pending: d.metadata.hasPendingWrites }];
          }),
        );
        emit(snap.metadata.fromCache);
      },
      (err) => onPlansError(err),
    );
    unsubPlans = fs.onSnapshot(
      fs.query(fs.collection(db, plansColl), fs.where('day', '>=', today)),
      { includeMetadataChanges: true },
      (snap) => {
        plans = new Map(
          snap.docs.map((d) => {
            const x = d.data();
            return [`${x.day}|${x.name}`, { choice: String(x.choice || ''), time: String(x.time || ''), pending: d.metadata.hasPendingWrites }];
          }),
        );
        emit(snap.metadata.fromCache);
      },
      (err) => onPlansError(err),
    );
  }

  function stop() {
    gen++;
    [unsub, unsubState, unsubAsks, unsubPlans].forEach((u) => u && u());
    unsub = null;
    unsubState = null;
    unsubAsks = null;
    unsubPlans = null;
  }

  /** La mia risposta per un giorno ('' la toglie): si vede subito; `saved` finisce quando è salvata. */
  async function setPlan(day, choice, time) {
    const { fs, db } = await sdk();
    if (!plansColl) throw new Error('Chat non collegata');
    return { saved: fs.setDoc(fs.doc(db, plansColl, `${day}_${uid}`), { day, name, choice, time, at: fs.serverTimestamp() }) };
  }

  /** "Chiedi a tutti" per un giorno. Se qualcuno ha già chiesto, `saved` fallisce (una domanda per giorno). */
  async function ask(day) {
    const { fs, db } = await sdk();
    if (!asksColl) throw new Error('Chat non collegata');
    const id = newId();
    return { id, saved: fs.setDoc(fs.doc(db, asksColl, day), { day, name, id, at: fs.serverTimestamp() }) };
  }

  /**
   * Il messaggio parte appena c'è rete. Restituisce `msg` (da mostrare subito, in attesa: senza rete la query per
   * data non lo include finché il server non gli dà l'orario) e `saved`, la promessa che finisce quando è salvato.
   */
  async function send(text) {
    const { fs, db } = await sdk();
    if (!coll) throw new Error('Chat non collegata');
    const id = newId();
    const now = new Date();
    const msg = { id, day: dayFmt.format(now), time: timeFmt.format(now), name, type: 'msg', text, pending: true, fb: true };
    return { msg, saved: fs.setDoc(fs.doc(db, coll, id), { name, text, at: fs.serverTimestamp() }) };
  }

  return { start, stop, send, setPlan, ask };
}
