// Tutto su Firebase: lo stato dell'app arriva da Firestore (lo scrive il server quando cambia), le azioni si mettono
// in una coda su Firestore e il server le esegue; le foto del Sudometro stanno su Firestore.
// Il telefono non aspetta mai Apps Script: gli manda solo un avviso ("coda") dopo aver messo qualcosa in coda.
import { fbSignIn, fbUid } from './fbchat.js';

/** Id ordinabile nel tempo, come newId() del server. */
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const ESITO_MS = 60000; // oltre questo tempo un'azione in coda si considera persa

export function createFbData({ getToken, ping, onState, onPending, onError }) {
  let x = null; // { fs, db } dopo l'accesso
  let pfx = '';
  let me = null;
  let unsubState = null;
  let unsubPending = null;
  let gen = 0;
  const waiting = new Map(); // id azione → { resolve, reject, timer, unsub }

  async function start(user, test) {
    stop();
    const my = ++gen;
    const sdkx = await fbSignIn(user, getToken);
    if (my !== gen) return;
    x = sdkx;
    me = user;
    pfx = test ? 'prova_' : '';
    const { fs, db } = x;
    unsubState = fs.onSnapshot(
      fs.doc(db, `${pfx}stato`, fbUid(user.name)),
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        if (d && d.json) onState(JSON.parse(d.json), { fromCache: snap.metadata.fromCache, day: d.day });
      },
      (err) => onError(err),
    );
    // Mie azioni non ancora eseguite (anche quelle salvate sul telefono senza rete, prima di chiudere l'app)
    let pinged = 0;
    unsubPending = fs.onSnapshot(
      fs.query(fs.collection(db, `${pfx}azioni`), fs.where('name', '==', user.name), fs.where('stato', '==', 'nuova')),
      { includeMetadataChanges: true },
      (snap) => {
        onPending(snap.docs.map((d) => ({ id: d.id, action: d.data().action, data: JSON.parse(d.data().data || '{}') })));
        // Azioni arrivate su Firebase e non ancora eseguite (per esempio salvate senza rete prima di chiudere
        // l'app): si avvisa il server, al massimo ogni 15 secondi
        if (snap.docs.some((d) => !d.metadata.hasPendingWrites) && Date.now() - pinged > 15000) {
          pinged = Date.now();
          ping();
        }
      },
      () => onPending([]),
    );
  }

  function stop() {
    gen++;
    if (unsubState) unsubState();
    if (unsubPending) unsubPending();
    unsubState = null;
    unsubPending = null;
    waiting.forEach((w) => {
      clearTimeout(w.timer);
      if (w.unsub) w.unsub();
      w.reject(new Error('Firebase scollegato'));
    });
    waiting.clear();
    x = null;
  }

  const ready = () => !!x;

  /**
   * Mette un'azione in coda e aspetta l'esito scritto dal server (stessa risposta della richiesta diretta).
   * Senza rete l'azione parte appena torna.
   */
  function call(action, data = {}) {
    if (!x) return Promise.reject(new Error('Firebase non collegato'));
    const { fs, db } = x;
    const id = newId();
    const ref = fs.doc(db, `${pfx}azioni`, id);
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, unsub: null, timer: null };
      waiting.set(id, w);
      const done = (fn, v) => {
        clearTimeout(w.timer);
        if (w.unsub) w.unsub();
        waiting.delete(id);
        fn(v);
      };
      w.timer = setTimeout(() => done(reject, new Error(navigator.onLine ? 'il server non risponde, riprova' : 'sei offline: partirà appena torna la rete')), ESITO_MS);
      fs.setDoc(ref, { name: me.name, action, data: JSON.stringify(data), stato: 'nuova', at: fs.serverTimestamp() })
        .then(() => {
          ping();
          w.unsub = fs.onSnapshot(
            ref,
            (snap) => {
              const d = snap.exists() ? snap.data() : null;
              if (!d || d.stato !== 'fatta') return;
              const out = JSON.parse(d.esito || '{}');
              if (out.error) done(reject, new Error(out.error));
              else done(resolve, out);
            },
            (err) => done(reject, err),
          );
        })
        .catch((err) => done(reject, err));
    });
  }

  /** Foto da Firestore: { mime, data } in base64, come la risposta di Apps Script. */
  async function photo(id) {
    if (!x) throw new Error('Firebase non collegato');
    const { fs, db } = x;
    const snap = await fs.getDoc(fs.doc(db, 'foto', String(id)));
    if (!snap.exists()) throw new Error('Foto non trovata');
    const d = snap.data();
    return { mime: d.mime, data: d.data.toBase64() };
  }

  /**
   * Carica una mia foto (JPEG in base64) e restituisce subito l'id da mandare con l'azione: anche senza rete,
   * Firebase la invia prima dell'azione messa in coda dopo (le scritture partono in ordine).
   */
  function putPhoto(base64, label) {
    if (!x) throw new Error('Firebase non collegato');
    const { fs, db } = x;
    const id = newId();
    fs.setDoc(fs.doc(db, 'foto', id), { name: me.name, label: String(label || ''), mime: 'image/jpeg', data: fs.Bytes.fromBase64String(base64), at: fs.serverTimestamp() }).catch((err) => onError(err));
    return id;
  }

  return { start, stop, ready, call, photo, putPhoto };
}
