// Chat su Firebase (Firestore): il telefono resta collegato e i messaggi arrivano appena qualcuno scrive,
// invece di chiedere al server ogni 5 secondi. Per ora solo in modalità prova (raccolta "prova_chat").
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
export function createFbChat({ getToken, onChange, onState, onError, days = 7 }) {
  let unsub = null;
  let unsubState = null;
  let coll = '';
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
    name = me.name;
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
  }

  function stop() {
    gen++;
    if (unsub) unsub();
    if (unsubState) unsubState();
    unsub = null;
    unsubState = null;
  }

  /** Il messaggio compare subito (in attesa) e parte appena c'è rete; la promessa finisce quando è salvato. */
  async function send(text) {
    const { fs, db } = await sdk();
    if (!coll) throw new Error('Chat non collegata');
    return fs.setDoc(fs.doc(db, coll, newId()), { name, text, at: fs.serverTimestamp() });
  }

  return { start, stop, send };
}
