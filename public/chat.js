// Chat del gruppo: messaggi, domanda "chi va in palestra oggi?" ed eventi automatici
// (check-in, Sudometro, premiazioni). Si aggiorna ogni 5 secondi solo mentre è aperta.

import { createFbChat } from './fbchat.js';
import { alF, kingTitle } from './genere.js';

const $ = (id) => document.getElementById(id);
const POLL_EVERY = 5000;
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
/** "oggi", "domani" o "giovedì 15" */
function planLabel(day) {
  const d = new Date(day + 'T12:00:00');
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  return `${['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'][d.getDay()]} ${d.getDate()}`;
}

const CHOICES = [
  ['si', 'Ci sono'],
  ['forse', 'Forse'],
  ['no', 'No'],
];

export function createChat({ api, toast, photoPair, clean, isDebug, isKing, crown, isF: isFApp, openNews, trace, useFirebase, fbOnly }) {
  const tlog = trace || (() => {});
  let me = null; // { name, display }
  let v = 0; // versione dei dati in Apps Script
  let data = null; // { messages, poll, names }
  let active = false;
  let timer = null;
  let loading = false;
  const pending = []; // messaggi inviati ma non ancora salvati in Apps Script
  let selDay = ''; // giorno scelto nella fila dei giorni del sondaggio
  let weekOpen = (() => {
    try {
      return localStorage.getItem('palestrina.weekOpen') === '1';
    } catch {
      return false;
    }
  })(); // "Vedi la settimana": le presenze di tutti sotto ai giorni
  // Risposte al sondaggio: si vedono subito e partono in ordine in sottofondo (l'ultima vince)
  const outbox = [];
  let sending = false;
  let asking = 0; // domande "Chiedi a tutti" in invio
  let unseen = 0; // messaggi arrivati mentre si legge più in alto
  let lastCount = 0; // 'ask' oppure la risposta in invio ('si' | 'forse' | 'no')

  const readKey = () => `palestrina.chatRead.${me ? me.name : ''}`;
  const getRead = () => {
    try {
      return localStorage.getItem(readKey()) || '';
    } catch {
      return '';
    }
  };
  const setRead = (id) => {
    try {
      localStorage.setItem(readKey(), id);
    } catch { /* storage non disponibile */ }
  };
  const who = (name) => (data && data.names && data.names[name]) || name;
  // ragazze (colonna Sesso di Utenti): dallo stato della chat, altrimenti da quello dell'app
  const isF = (name) => (data && data.fem ? data.fem.includes(name) : isFApp(name));

  // ---------- Messaggi e sondaggio su Firebase ----------
  // Messaggi, domande ("Chiedi a tutti") e risposte si scrivono su Firestore e arrivano agli altri in tempo reale;
  // eventi, sfide e il resto dello stato li scrive Apps Script, che ne mette una copia anche su Firestore.
  // Il server copia messaggi, domande e risposte tra Firebase e i fogli, nei due sensi. Se Firebase non è
  // raggiungibile (rete che lo blocca) si torna da soli ad Apps Script ogni 5 secondi.
  let fbOn = false; // chat Firebase collegata (o in collegamento)
  let fbMsgs = null; // ultimi messaggi da Firestore
  let fbOnline = false; // ultima risposta di Firestore arrivata dal server (non dalla copia sul telefono)
  let fbOfflineAt = 0; // da quando Firestore non risponde (con la rete accesa)
  let fbRetryAt = 0; // dopo un errore si riprova più tardi, intanto si usa Apps Script
  const fbOut = new Map(); // miei messaggi scritti su Firebase e non ancora salvati
  const rescued = new Set(); // messaggi rimasti in attesa su Firebase e mandati da Apps Script con lo stesso id
  let rawMsgs = []; // messaggi come arrivano da Apps Script (salvati così sul telefono, mai mescolati con Firebase)
  let rawState = null; // ultimo stato della chat da Apps Script, senza le aggiunte di Firebase
  let fbAsks = null; // domande su Firebase: giorno → { id, name, clock… }
  let fbPlans = null; // risposte su Firebase: "giorno|nome" → { choice, time }
  let fbPlansErr = false; // sondaggio su Firebase non leggibile (per esempio regole vecchie): si usa il server
  const fbPlanOut = new Map(); // mie risposte scritte su Firebase e non ancora salvate: giorno → { choice, time }
  const fbAskOut = new Map(); // mie domande scritte su Firebase e non ancora salvate: giorno → id
  const FB_RESCUE_MS = 10000;
  /** Firebase collegato e aggiornato: niente polling veloce, i messaggi si scrivono lì. */
  const fbLive = () => fbOn && !!fbMsgs && fbOnline;
  /** Tutta l'app su Firebase: con Firebase collegato non si chiede mai la chat ad Apps Script. */
  const onlyFb = () => fbLive() && !!(fbOnly && fbOnly());
  /** Anche domande e risposte si scrivono su Firebase. */
  const fbPlansLive = () => fbLive() && !!fbAsks && !!fbPlans && !fbPlansErr;
  const fb = createFbChat({
    getToken: () => api('fbToken'),
    onChange(list, fromCache) {
      if (!fbOn) return;
      const first = !fbMsgs;
      fbMsgs = list;
      if (fbOnline === fromCache) {
        fbOnline = !fromCache;
        fbOfflineAt = fromCache ? Date.now() : 0;
        tlog('firebase', fbOnline ? 'collegato' : 'non raggiungibile: uso Apps Script');
        if (!fbOnline && active) load();
      }
      tlog('firebase', `${list.length} messaggi${fromCache ? ' (dal telefono)' : ''}`);
      if (data) {
        data.messages = withFb();
        render();
        if (first && active) scrollToBottom();
      }
    },
    onState(r, fromCache) {
      if (!fbOn || !r) return;
      if (!fromCache) {
        syncedAt = Date.now();
        syncFails = 0;
      }
      if (data && (r.v === v || (v > 0 && r.v < v))) return renderSync(); // già visto (per esempio dalla risposta a un'azione)
      tlog('firebase', `stato v=${r.v}${fromCache ? ' (dal telefono)' : ''}`);
      apply(r);
      renderSync();
    },
    onPlans(asks, plans, fromCache) {
      if (!fbOn) return;
      fbAsks = asks;
      fbPlans = plans;
      tlog('firebase', `sondaggio: ${asks.size} domande, ${plans.size} risposte${fromCache ? ' (dal telefono)' : ''}`);
      recompose();
    },
    onError(err) {
      tlog('firebase', `ERRORE ${err.code || ''} ${err.message}`);
      fbFail(err);
    },
    onPlansError(err) {
      tlog('firebase', `sondaggio non disponibile, uso Apps Script: ${err.code || ''} ${err.message}`);
      fbPlansErr = true;
      fbAsks = null;
      fbPlans = null;
      recompose();
    },
  });
  /** Stato del server con sopra domande e risposte di Firebase (che sono più fresche). */
  function compose(r) {
    return { ...r, messages: withFb(), ...withFbPlans(r) };
  }
  function recompose() {
    if (!rawState || outbox.length || sending || asking || sfidaSending) return; // azioni in invio: vale lo schermo
    data = compose(rawState);
    render();
  }
  function withFbPlans(r) {
    if (!fbOn || !fbAsks || !fbPlans || !r.plans) return { plans: r.plans, poll: r.poll };
    const name = (n) => (r.names && r.names[n]) || n;
    const plans = r.plans.map((p) => {
      const a = fbAsks.get(p.day);
      return {
        ...p,
        poll: p.poll || (a ? { id: a.id, by: a.name, byDisplay: name(a.name), clock: a.clock } : null),
        people: p.people.map((x) => {
          const f = fbPlans.get(`${p.day}|${x.name}`);
          return f ? { ...x, choice: f.choice || null, time: f.choice ? f.time : '' } : x;
        }),
      };
    });
    const t = plans[0];
    return { plans, poll: t && t.poll ? { ...(r.poll || {}), ...t.poll, people: t.people } : null };
  }
  /** Dopo una domanda o risposta su Firebase il server la copia nei fogli e manda le notifiche (una richiesta sola). */
  let syncTimer = null;
  function syncSoon() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => api('fbSync').catch(() => {}), 1000);
  }
  /**
   * Messaggi di Apps Script e di Firebase insieme, senza doppioni (stesso id): il server copia i messaggi
   * da una parte all'altra. Vince la versione di Firebase, tranne quando lì è ancora in attesa.
   */
  function withFb() {
    if (!fbOn || !fbMsgs) return rawMsgs;
    const fbById = new Map(fbMsgs.map((m) => [m.id, m]));
    fbOut.forEach((m) => !fbById.has(m.id) && fbById.set(m.id, m));
    // Domande fatte su Firebase: in chat come quelle del server (stesso id quando il server le copia)
    if (fbAsks) {
      fbAsks.forEach((a) => {
        if (a.id && !fbById.has(a.id)) fbById.set(a.id, { id: a.id, day: a.atDay, time: a.clock, name: a.name, display: '', type: 'poll', text: '', target: a.day, data: null, pending: a.pending, fb: true });
      });
    }
    const rawIds = new Set(rawMsgs.map((m) => m.id));
    return rawMsgs
      .filter((m) => !fbById.has(m.id) || fbById.get(m.id).pending)
      .concat([...fbById.values()].filter((m) => !(m.pending && rawIds.has(m.id))))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  function fbStart() {
    const mode = useFirebase ? useFirebase() : ''; // 'prova', 'tutti' o '' (spenta)
    if (!mode) return fbStop();
    if (fbOn || !me || Date.now() < fbRetryAt) return;
    fbOn = true;
    fbOnline = false;
    fbOfflineAt = Date.now();
    if (mode === 'prova') $('chat-input').placeholder = 'Messaggio · Firebase';
    fb.start(me, mode === 'prova').catch(fbFail);
    try {
      if (mode === 'prova' && !localStorage.getItem('palestrina.fbIntro')) {
        localStorage.setItem('palestrina.fbIntro', '1');
        toast('Chat in prova con Firebase: i messaggi li vede solo chi è in modalità prova');
      }
    } catch { /* storage non disponibile */ }
  }
  function fbStop() {
    if (!fbOn) return;
    fb.stop();
    fbOn = false;
    fbMsgs = null;
    fbOnline = false;
    fbOut.clear();
    fbAsks = null;
    fbPlans = null;
    fbPlansErr = false;
    fbPlanOut.clear();
    fbAskOut.clear();
    $('chat-input').placeholder = 'Messaggio';
    if (rawState) data = compose(rawState);
  }
  /** Firebase non si carica (SDK bloccato, accesso negato…): si resta su Apps Script e si riprova fra 5 minuti. */
  function fbFail(err) {
    if (!fbOn) return;
    fbStop();
    fbRetryAt = Date.now() + 5 * 60000;
    tlog('firebase', `non disponibile, uso Apps Script: ${err.message}`);
    if (isDebug()) toast(`Chat Firebase non disponibile: ${err.message}`);
    load(true);
  }
  /**
   * Firestore non risponde ma la rete c'è (rete che non lo raggiunge): i miei messaggi rimasti
   * in attesa partono da Apps Script con lo stesso id. Se poi Firebase si sblocca, lo stesso id non si doppia.
   */
  function rescuePending() {
    if (!fbOn || !fbMsgs || fbOnline || !navigator.onLine || Date.now() - fbOfflineAt < FB_RESCUE_MS) return;
    [...fbOut.values()]
      .filter((m) => !rescued.has(m.id))
      .forEach((m) => {
        rescued.add(m.id);
        tlog('firebase', `messaggio ${m.id} mandato da Apps Script`);
        api('chatSend', { text: m.text, id: m.id })
          .then((r) => {
            v = -1;
            apply(r);
          })
          .catch(() => rescued.delete(m.id));
      });
    // Risposte e domande in attesa: le salva il server, che le copia anche su Firebase
    fbPlanOut.forEach((p, day) => {
      if (p.rescued) return;
      p.rescued = true;
      tlog('firebase', `risposta del ${day} mandata da Apps Script`);
      queuePlan(day, p.choice, p.time);
    });
    fbAskOut.forEach((id, day) => {
      fbAskOut.delete(day);
      tlog('firebase', `domanda del ${day} mandata da Apps Script`);
      askViaServer(day);
    });
  }

  // ---------- Dati ----------

  async function load(force = false) {
    if (loading && force) forceNext = true; // finita la richiesta in corso (magari della prova), si ricarica tutto
    if (loading || !me) return;
    loading = true;
    lastLoad = Date.now();
    renderSync();
    tlog('chat load', `inizio${force ? ' (forza)' : ''} v=${v}${data ? '' : ' · mai caricata'}`);
    try {
      const r = await api('chat', { v: force ? -1 : v });
      tlog('chat load', `ok${r && r.same ? ' (niente di nuovo)' : ''}`);
      syncedAt = Date.now();
      syncFails = 0;
      apply(r);
    } catch (err) {
      tlog('chat load', `ERRORE ${err.message}${active && !data ? ' · schermo bloccato' : ''}`);
      syncFails++;
      if (force && !retrying) toast(`Chat non disponibile: ${err.message}`);
      if (active && !data) loadError(err.message);
    } finally {
      loading = false;
      retrying = false;
      renderSync();
      if (forceNext) {
        forceNext = false;
        load(true);
      }
    }
  }

  // ---------- Chat aggiornata o no ----------
  // Pillola sotto il sondaggio, come "Connessione in corso…" di WhatsApp: compare solo quando quello che
  // si vede potrebbe essere vecchio (chat dell'ultima volta in attesa del server, server che non risponde, offline).
  const STALE_MS = 20000; // la chat si aggiorna ogni 5 s: 20 s senza risposta = 3-4 tentativi andati a vuoto
  const FB_POLL_EVERY = 60000; // con Firebase collegato
  let lastLoad = 0;
  let forceNext = false;
  let syncedAt = 0; // ultima risposta del server alla chat (anche "niente di nuovo")
  let syncFails = 0; // tentativi falliti di fila: l'avviso giallo arriva al secondo (un intoppo isolato non conta)
  let retrying = false; // "Riprova" toccato: mostra "Aggiorno…" invece dell'avviso giallo
  let cachedAt = 0; // quando è stata salvata la chat dell'ultima volta mostrata all'apertura

  function syncState() {
    if (!active || !data) return 'ok'; // senza chat ci pensa già "Carico la chat…"
    if (!navigator.onLine) return 'off';
    if (onlyFb()) return 'ok'; // Firebase collegato: quello che si vede è aggiornato
    if (syncFails >= 2) return retrying ? 'busy' : 'stale';
    if (syncedAt && Date.now() - syncedAt <= (fbLive() ? FB_POLL_EVERY + STALE_MS : STALE_MS)) return 'ok';
    return loading || syncFails ? 'busy' : 'stale'; // dopo un solo errore riprova da sola: resta "Aggiorno…"
  }

  const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);

  function renderSync() {
    const box = $('chat-sync');
    if (!box) return;
    const s = syncState();
    const last = syncedAt || cachedAt;
    box.classList.toggle('show', s !== 'ok');
    box.classList.toggle('warn', s === 'stale' || s === 'off');
    $('poll-card').classList.toggle('stale', s === 'stale' || s === 'off');
    if (s === 'ok') return;
    if (s === 'busy') box.innerHTML = `${bicep()}<span>Aggiorno…</span>`;
    else if (s === 'off') box.innerHTML = `<span>Sei offline${last ? ` · chat delle ${hhmm(last)}` : ''}</span>`;
    else {
      box.innerHTML = `<span>Non aggiornata${last ? ` · alle ${hhmm(last)}` : ''} · </span><button type="button">Riprova</button>`;
      box.querySelector('button').onclick = () => {
        retrying = true;
        renderSync();
        load(true);
      };
    }
  }
  window.addEventListener('online', () => {
    renderSync();
    if (active) load();
  });
  window.addEventListener('offline', renderSync);

  /** Chat mai caricata: al posto di "Carico la chat…" infinito, il motivo e un tasto per riprovare. */
  function loadError(msg) {
    const box = el('div', 'loading');
    box.append(el('p', '', `Chat non caricata: ${msg}`));
    const b = el('button', 'primary small', 'Riprova');
    b.type = 'button';
    b.onclick = () => {
      $('chat-list').innerHTML = `<div class="loading">${bicep()}<p>Carico la chat…</p></div>`;
      load(true);
    };
    box.append(b);
    $('chat-list').replaceChildren(box);
  }

  // Ultima chat scaricata, tenuta sul telefono: all'apertura si vede subito, poi si aggiorna
  const cacheKey = () => `palestrina.chatCache.${me ? me.name : ''}${localStorage.getItem('palestrina.testMode') === 'true' ? '.prova' : ''}`;
  function saveCache(r) {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ day: new Date().toDateString(), at: Date.now(), r }));
    } catch { /* storage pieno o non disponibile */ }
  }
  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey()));
      // di un altro giorno: i giorni della pianificazione sono cambiati, meglio non mostrarla
      if (!c || c.day !== new Date().toDateString()) return null;
      cachedAt = c.at || 0;
      return c.r;
    } catch {
      return null;
    }
  }

  function apply(r) {
    if (!r || r.same) return;
    if (outbox.length || sending || asking || sfidaSending) return; // azioni ancora da inviare: vale quello che vede l'utente
    v = r.v;
    rawMsgs = r.messages || [];
    rawState = r;
    saveCache(r);
    data = compose(r);
    render();
  }

  async function send(text) {
    const t = text.trim();
    if (!t) return;
    $('chat-input').value = '';
    autosize();
    if (fbOn && fbMsgs && (fbOnline || !navigator.onLine)) {
      // Firebase lo mostra subito (in attesa) e lo invia appena c'è rete
      const shown = () => {
        if (!data) return;
        data.messages = withFb();
        render();
      };
      fb.send(t)
        .then(({ msg, saved }) => {
          fbOut.set(msg.id, msg);
          shown();
          setTimeout(scrollToBottom, 0);
          return saved
            .then(() => api('chatNotify').catch(() => {})) // copia nel foglio e notifica agli altri: il server
            .catch((err) => !rescued.has(msg.id) && toast(`Messaggio non inviato: ${err.message}`))
            .finally(() => {
              fbOut.delete(msg.id);
              shown();
            });
        })
        .catch((err) => toast(`Messaggio non inviato: ${err.message}`));
      return;
    }
    // Il messaggio compare subito, con il bicipite che si flette finché Apps Script non lo salva.
    const item = { text: t };
    pending.push(item);
    showPending();
    scrollToBottom();
    try {
      const r = await api('chatSend', { text: t });
      pending.splice(pending.indexOf(item), 1);
      v = -1; // forza il ridisegno anche se la versione coincide
      apply(r);
    } catch (err) {
      pending.splice(pending.indexOf(item), 1);
      showPending();
      $('chat-input').value = t;
      toast(`Errore: ${err.message}`);
    }
  }

  // Modalità debug: cancella un messaggio o annulla la domanda di oggi.
  async function remove(id, question, fbMsg) {
    if (!confirm(question)) return;
    try {
      if (fbMsg) {
        await api('chatDelete', { id, fb: true }); // Firebase lo toglie da tutti i telefoni
        toast('Cancellato');
        return;
      }
      const r = await api('chatDelete', { id });
      v = -1;
      apply(r);
      toast('Cancellato');
    } catch (err) {
      toast(`Errore: ${err.message}`);
    }
  }

  function delButton(id, fbMsg) {
    const b = el('button', 'del', '×');
    b.type = 'button';
    b.setAttribute('aria-label', 'Cancella');
    b.onclick = () => remove(id, 'Cancellare questo messaggio per tutti?', fbMsg);
    return b;
  }

  const ask = () => askDay(selectedDay());

  /** Devo rispondere: c'è una domanda per quel giorno, non l'ho fatta io e non ho ancora risposto. */
  function isPending(plan) {
    if (!plan || !plan.poll || !me || plan.poll.by === me.name) return false;
    const p = plan.people.find((x) => x.name === me.name);
    return !!p && !p.choice;
  }

  /** Pallino rosso sul tab Chat finché c'è una domanda a cui non hai risposto. */
  function updatePending(plans) {
    const btn = document.querySelector('.tabbar button[data-tab=chat]');
    if (!btn) return;
    const n = (plans || []).filter(isPending).length;
    let dot = btn.querySelector('.pending-dot');
    if (!n) return dot && dot.remove();
    if (!dot) {
      dot = el('span', 'pending-dot');
      btn.append(dot);
    }
  }

  /** "Chiedi a tutti" per un giorno: il giorno si apre subito, la domanda parte in sottofondo. */
  async function askDay(day) {
    const plan = (data.plans || []).find((d) => d.day === day);
    if (!plan || plan.poll) return;
    const now = new Date();
    plan.poll = { id: '', by: me.name, byDisplay: me.display, clock: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` };
    renderPoll(true);
    if (fbPlansLive()) {
      // Su Firebase la domanda arriva subito agli altri; notifica e copia nel foglio le fa il server
      fb.ask(day)
        .then(({ id, saved }) => {
          fbAskOut.set(day, id);
          return saved
            .then(() => {
              toast('Domanda mandata a tutti');
              syncSoon();
            })
            .finally(() => fbAskOut.delete(day));
        })
        .catch((err) => {
          tlog('firebase', `domanda non salvata su Firebase (${err.code || err.message}): la mando al server`);
          askViaServer(day); // per esempio qualcuno ha chiesto un attimo prima: il server non la doppia
        });
      return;
    }
    askViaServer(day);
  }

  async function askViaServer(day) {
    asking++;
    try {
      const r = await api('pollAsk', { day });
      asking--;
      v = -1;
      apply(r);
      toast('Domanda mandata a tutti');
    } catch (err) {
      asking--;
      toast(`Errore: ${err.message}`);
      v = -1;
      load(true);
    }
  }

  /** La mia risposta per un giorno, cambiata subito sullo schermo. */
  function setLocal(day, choice, time) {
    const lists = [];
    const plan = (data.plans || []).find((d) => d.day === day);
    if (plan) lists.push(plan.people);
    if (data.poll && data.plans && data.plans[0] && data.plans[0].day === day && data.poll.people !== (plan && plan.people)) lists.push(data.poll.people);
    lists.forEach((people) => {
      const p = people.find((x) => x.name === me.name);
      if (p) Object.assign(p, { choice: choice || null, time: choice ? time : '' });
    });
  }

  /** Mette in coda l'invio; per lo stesso giorno conta solo l'ultima scelta. */
  function queuePlan(day, choice, time) {
    const i = outbox.findIndex((x) => x.day === day);
    if (i >= 0) outbox.splice(i, 1);
    outbox.push({ day, choice, time });
    flush();
  }

  async function flush() {
    if (sending) return;
    sending = true;
    let last = null;
    while (outbox.length) {
      const job = outbox.shift();
      sendingDay = job.day;
      try {
        last = await api('planSet', job);
      } catch (err) {
        toast(`Errore: ${err.message}`);
        outbox.length = 0;
        sending = false;
        sendingDay = '';
        v = -1;
        load(true); // torna ai dati veri
        return;
      }
    }
    sending = false;
    sendingDay = '';
    if (last) {
      v = -1;
      apply(last);
    }
    renderPoll(); // toglie il bicipite anche se la risposta del server non ha ridisegnato
  }

  // Risposta al sondaggio non ancora salvata: bicipite che si flette sul pulsante scelto finché il server non la salva.
  // Con Firebase la scelta si vede subito e il bicipite compare solo se il server ci mette più di SLOW_MS.
  let sendingDay = '';
  let answeredAt = 0;
  const SLOW_MS = 1500;
  const unsaved = (day) => {
    const slow = Date.now() - answeredAt >= SLOW_MS;
    return ((sendingDay === day || outbox.some((j) => j.day === day)) && (!fbLive() || slow)) || (fbPlanOut.has(day) && slow);
  };

  /** Salva una risposta: su Firebase se si può (gli altri la vedono subito), altrimenti dal server. */
  function savePlan(day, choice, time) {
    if (!fbPlansLive()) return queuePlan(day, choice, time);
    const entry = { choice, time };
    fbPlanOut.set(day, entry);
    const done = () => {
      if (fbPlanOut.get(day) === entry) fbPlanOut.delete(day);
      renderPoll();
    };
    fb.setPlan(day, choice, time)
      .then(({ saved }) => saved)
      .then(() => {
        done();
        syncSoon();
      })
      .catch((err) => {
        done();
        if (entry.rescued) return; // già mandata dal server
        tlog('firebase', `risposta non salvata su Firebase (${err.code || err.message}): la mando al server`);
        queuePlan(day, choice, time);
      });
  }

  // Risposta per un giorno; ritoccare la risposta già data la toglie.
  function answer(choice, current, time, day = selectedDay()) {
    const c = choice === current ? '' : choice;
    setLocal(day, c, time);
    answeredAt = Date.now();
    savePlan(day, c, c ? time : ''); // prima in coda, così il ridisegno mostra già l'orologio "in invio"
    renderPoll(true);
    if (fbLive()) setTimeout(() => unsaved(day) && renderPoll(), SLOW_MS + 50);
  }
  const selectedDay = () => {
    const days = (data && data.plans) || [];
    if (!days.some((d) => d.day === selDay)) selDay = days.length ? days[0].day : '';
    return selDay;
  };

  // ---------- Interfaccia ----------

  function render() {
    if (!data) return;
    const sc = $('scroller');
    const nearBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140;
    const firstRender = !$('chat-list').dataset.rendered;
    renderPoll();
    renderList();
    updatePending(data.plans);
    const n = data.messages.length;
    if (!firstRender && !nearBottom && n > lastCount) unseen += n - lastCount;
    lastCount = n;
    if (active) {
      if (nearBottom || firstRender) scrollToBottom();
      markRead();
    }
    updateDown();
  }

  /** Pulsante "vai in fondo" come WhatsApp: compare quando si è risaliti nella chat. */
  function updateDown() {
    const sc = $('scroller');
    const far = active && sc.scrollHeight - sc.scrollTop - sc.clientHeight > 300;
    if (!far) unseen = 0;
    $('chat-down').hidden = !far;
    const badge = $('chat-down').querySelector('.badge');
    badge.hidden = !unseen;
    badge.textContent = unseen > 9 ? '9+' : String(unseen);
  }

  function scrollToBottom() {
    const sc = $('scroller');
    requestAnimationFrame(() => (sc.scrollTop = sc.scrollHeight));
  }

  function renderPoll(force = false) {
    const card = $('poll-card');
    // non disturbare chi sta scrivendo l'orario
    if (!force && document.activeElement && document.activeElement.id === 'poll-time') return;
    const plans = (data && data.plans) || [];
    const day = selectedDay();
    const plan = plans.find((d) => d.day === day) || { people: [], poll: null };
    const poll = plan.poll;
    const answered = plan.people.find((p) => p.name === me.name) || {};
    const mine = answered;
    // Fila dei prossimi 7 giorni: i giorni senza domanda sono "chiusi", pallino rosso dove devi rispondere
    const strip = plans
      .map((d, i) => {
        const date = new Date(d.day + 'T12:00:00');
        const n = d.people.filter((p) => p.choice === 'si').length;
        const mineDay = d.people.find((p) => p.name === me.name) || {};
        const cls = ['pday', d.day === day && 'on', !d.poll && 'closed', mineDay.choice, isPending(d) && 'pending'].filter(Boolean).join(' ');
        return `<button class="${cls}" data-day="${d.day}">${i ? WEEKDAYS[date.getDay()] : 'Oggi'}<b>${date.getDate()}</b><i>${d.poll && n ? n : '·'}</i></button>`;
      })
      .join('');
    const label = planLabel(day);
    const days = strip ? `<div class="pdays${weekOpen ? ' wide' : ''}">${weekOpen ? '<span></span>' : ''}${strip}</div>${weekOpen ? weekGrid(plans) : ''}` : '';
    const toggle = strip ? `<button class="week-toggle" type="button">${weekOpen ? 'Nascondi la settimana' : 'Vedi la settimana'}</button>` : '';
    if (!poll) {
      // Giorno chiuso: si apre chiedendo a tutti
      card.innerHTML = `
        ${days}
        <div class="poll-closed"><span>Nessuno ha ancora chiesto chi va in palestra ${label}</span><button id="poll-ask" class="primary small">Chiedi a tutti</button></div>
        ${toggle}`;
      card.querySelector('#poll-ask').onclick = () => askDay(day);
    } else {
      card.innerHTML = `
        ${days}
        ${isPending(plan) ? `<p class="poll-askme"><b></b> ti chiede: ${label} ci sei?</p>` : ''}
        <div class="choices">
          ${CHOICES.map(([k, l]) => `<button data-choice="${k}" class="choice ${k}${mine.choice === k ? ' selected' : ''}">${mine.choice === k && unsaved(day) ? bicep() : ''}${l}</button>`).join('')}
          <label class="time-wrap${mine.time ? ' filled' : ''}"><input id="poll-time" type="time" value="${mine.time || ''}" aria-label="Orario (facoltativo)"><span>Orario</span></label>
        </div>
        <p class="poll-names"></p>
        ${toggle}`;
      if (card.querySelector('.poll-askme b')) card.querySelector('.poll-askme b').textContent = poll.byDisplay;
    }
    card.querySelectorAll('[data-day]').forEach((b) => {
      b.onclick = () => {
        selDay = b.dataset.day;
        renderPoll(true);
      };
    });
    // Le mie caselle della settimana: un tocco seleziona il giorno; risposta e orario si cambiano dai pulsanti sopra.
    // (Prima un tocco faceva girare la risposta: chi toccava "19:15" per cambiare l'orario si ritrovava su "Forse".)
    card.querySelectorAll('[data-cell]').forEach((b) => {
      b.onclick = () => {
        selDay = b.dataset.cell;
        renderPoll(true);
      };
    });
    const tg = card.querySelector('.week-toggle');
    if (tg) {
      tg.onclick = () => {
        weekOpen = !weekOpen;
        try {
          localStorage.setItem('palestrina.weekOpen', weekOpen ? '1' : '0');
        } catch { /* storage non disponibile */ }
        toggleWeek(card);
      };
    }
    refreshPollEvents();
    if (!poll) return;
    card.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => answer(b.dataset.choice, answered.choice, answered.time || '')));
    // Su iPhone "change" arriva a ogni giro della rotella e "blur" non sempre: si salva in silenzio poco dopo
    // l'ultima modifica, senza ridisegnare la casella mentre la rotella è aperta (si chiuderebbe).
    // Con un orario e nessuna risposta vale "Ci sono".
    const timeInput = card.querySelector('#poll-time');
    // Orario: si vede subito e parte poco dopo l'ultima modifica o alla chiusura della rotella.
    // Su iPhone "change" arriva a ogni giro della rotella: mentre è aperta la casella non si ridisegna (si chiuderebbe).
    // Con un orario e nessuna risposta vale "Ci sono".
    let sent = mine.time || '';
    let timer = null;
    const focused = () => document.activeElement && document.activeElement.id === 'poll-time';
    const saveTime = () => {
      clearTimeout(timer);
      const t = timeInput.value;
      if (t === sent) return;
      sent = t;
      // La risposta attuale si rilegge adesso: nel frattempo può essere cambiata (o arrivati dati nuovi dal server)
      const now = ((data.plans || []).find((d) => d.day === day) || { people: [] }).people.find((p) => p.name === me.name) || {};
      const c = now.choice || 'si';
      setLocal(day, c, t);
      answeredAt = Date.now();
      savePlan(day, c, t);
      toast(t ? `Orario: ${t}` : 'Orario tolto', 1800); // si vede subito cosa è stato salvato
      if (!focused()) renderPoll(true);
    };
    // Mentre la rotella gira non si salva: si salva alla chiusura (blur) o dopo qualche secondo fermi,
    // così i passaggi intermedi (17:28 → 19:28 → 19:15) non diventano cambi e notifiche.
    // iPhone a volte manda solo "input", a volte solo "change": si ascoltano tutti e due.
    const onWheel = () => {
      timeInput.parentNode.classList.toggle('filled', !!timeInput.value);
      clearTimeout(timer);
      timer = setTimeout(saveTime, focused() ? 4000 : 600);
    };
    timeInput.oninput = onWheel;
    timeInput.onchange = onWheel;
    // Alla chiusura si aspetta un attimo: iPhone fissa l'ultimo valore della rotella subito dopo il blur
    timeInput.onblur = () => setTimeout(() => {
      saveTime();
      renderPoll(true); // aggiorna nomi e pulsanti rimasti indietro mentre la rotella era aperta
    }, 300);
    // Chi c'è e chi no, in chiaro e in poco spazio
    const names = card.querySelector('.poll-names');
    const who = (k) => plan.people.filter((p) => p.choice === k).map((p) => p.display + (p.time ? ` ${p.time}` : '') + (p.arrived ? ' ✓' : ''));
    [['si', 'Ci sono'], ['forse', 'Forse'], ['no', 'No']].forEach(([k, label]) => {
      const list = who(k);
      if (!list.length) return;
      const part = el('span', `part ${k}`);
      part.append(el('b', '', `${label} `), document.createTextNode(list.join(', ')));
      names.append(part);
    });
    const missing = plan.people.filter((p) => !p.choice).length;
    if (missing) names.append(el('span', 'part none', `${missing} senza risposta`));
    // Chi ha fatto la domanda
    const side = el('span', 'poll-side muted', `da ${poll.byDisplay} · ${poll.clock}`);
    names.append(side);
    if (isDebug() && poll.id) {
      const cancel = el('button', 'poll-cancel', 'Annulla');
      cancel.type = 'button';
      cancel.onclick = () => remove(poll.id, `Annullare la domanda di ${label} con tutte le risposte?`);
      names.append(cancel);
    }
  }

  /** Presenze dei 7 giorni, una riga a persona (io per primo), in colonna sotto ai giorni. */
  /**
   * "Vedi la settimana" / "Nascondi la settimana" animato: il riquadro cresce (o si richiude) in altezza,
   * i giorni scivolano al loro posto e le righe delle persone scendono una dopo l'altra.
   */
  function toggleWeek(card) {
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !card.animate) return renderPoll(true);
    const ease = 'cubic-bezier(.2, .8, .2, 1)';
    const dayRects = () => [...card.querySelectorAll('.pday')].map((b) => b.getBoundingClientRect());
    // pulsanti e righe sotto la griglia: scendono (o risalgono) insieme al riquadro invece di saltare
    const BELOW = ['.poll-askme', '.choices', '.poll-names', '.poll-closed', '.week-toggle'];
    const belowTops = () => Object.fromEntries(BELOW.map((s) => [s, card.querySelector(s)]).filter(([, e]) => e).map(([s, e]) => [s, e.getBoundingClientRect().top]));
    const swap = () => {
      const h0 = card.getBoundingClientRect().height;
      const before = dayRects();
      const tops = belowTops();
      renderPoll(true);
      Object.entries(belowTops()).forEach(([s, top]) => {
        if (!(s in tops) || Math.abs(tops[s] - top) < 1) return;
        card.querySelector(s).animate([{ transform: `translateY(${tops[s] - top}px)` }, { transform: 'none' }], { duration: 340, easing: ease });
      });
      const h1 = card.getBoundingClientRect().height;
      card.style.overflow = 'hidden';
      card.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 340, easing: ease })
        .finished.then(() => (card.style.overflow = ''), () => {});
      // i giorni si spostano per fare posto alla colonna dei nomi (o tornano larghi)
      card.querySelectorAll('.pday').forEach((b, i) => {
        const a = before[i];
        if (!a) return;
        const r = b.getBoundingClientRect();
        const dx = a.left - r.left;
        const sx = a.width / r.width;
        if (Math.abs(dx) < 1 && Math.abs(sx - 1) < 0.01) return;
        b.animate([{ transform: `translateX(${dx}px) scaleX(${sx})`, transformOrigin: 'left center' }, { transform: 'none', transformOrigin: 'left center' }], { duration: 340, easing: ease });
      });
      // righe della settimana: scendono una per volta
      const cols = 8;
      card.querySelectorAll('.pweek > *').forEach((c, i) => {
        const row = Math.floor(i / cols);
        c.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 60 + row * 45, easing: ease, fill: 'backwards' });
      });
    };
    const grid = card.querySelector('.pweek');
    if (weekOpen || !grid) return swap();
    // chiusura: prima le righe svaniscono risalendo, poi il riquadro si richiude
    const cells = [...grid.children];
    const rows = Math.ceil(cells.length / 8);
    const anims = cells.map((c, i) => c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 160, delay: (rows - 1 - Math.floor(i / 8)) * 30, easing: 'ease-in', fill: 'forwards' }));
    Promise.all(anims.map((a) => a.finished)).then(swap, swap);
  }

  function weekGrid(plans) {
    const people = plans[0].people.slice().sort((a, b) => (b.name === me.name) - (a.name === me.name));
    const esc = (t) => String(t).replace(/[<&>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    const rows = people.map((person) => {
      const mine = person.name === me.name;
      const cells = plans.map((d) => {
        const p = d.people.find((x) => x.name === person.name) || {};
        const c = d.poll ? p.choice || '' : '';
        const txt = { si: p.time || '✓', forse: '?', no: '✕' }[c] || '';
        const cls = ['pcell', c, mine && 'me', mine && d.day === selDay && 'sel', !d.poll && 'closed', p.arrived && 'arrived'].filter(Boolean).join(' ');
        return mine ? `<button class="${cls}" data-cell="${d.day}" type="button">${txt}</button>` : `<span class="${cls}" data-day="${d.day}">${txt}</span>`;
      });
      return `<span class="pname${mine ? ' me' : ''}">${mine ? 'Tu' : esc(person.display)}</span>${cells.join('')}`;
    });
    return `<div class="pweek">${rows.join('')}</div>`;
  }

  /** La domanda in chat: pulsanti per rispondere subito, finché il giorno è tra i prossimi 7. */
  function pollEvent(m) {
    const row = el('div', 'event poll-ev');
    const day = m.target || m.day;
    const mineAsk = m.name === me.name;
    row.dataset.target = day;
    row.dataset.id = m.id;
    row.append(el('p', 'event-title', mineAsk ? 'Hai chiesto a tutti' : `${m.display || who(m.name)} chiede`));
    row.append(el('p', 'poll-q', `Chi va in palestra ${planLabel(day)}?`));
    const btns = el('div', 'poll-ev-choices');
    CHOICES.forEach(([k, l]) => {
      const b = el('button', `choice ${k}`, l);
      b.type = 'button';
      b.dataset.evChoice = k;
      b.onclick = () => {
        const plan = (data.plans || []).find((d) => d.day === day);
        const p = (plan && plan.people.find((x) => x.name === me.name)) || {};
        selDay = day;
        answer(k, p.choice, p.time || '', day);
      };
      btns.append(b);
    });
    row.append(btns, el('p', 'poll-ev-sum'));
    paintPollEvent(row);
    return row;
  }

  function paintPollEvent(row) {
    const plan = (data.plans || []).find((d) => d.day === row.dataset.target);
    const open = !!(plan && plan.poll);
    const btns = row.querySelector('.poll-ev-choices');
    const sum = row.querySelector('.poll-ev-sum');
    btns.hidden = !open;
    if (!open) {
      sum.textContent = '';
      return;
    }
    const mine = plan.people.find((x) => x.name === me.name) || {};
    const wait = unsaved(row.dataset.target);
    btns.querySelectorAll('button').forEach((b) => {
      const sel = mine.choice === b.dataset.evChoice;
      b.classList.toggle('selected', sel);
      // bicipite che si flette finché la risposta non è salvata
      b.innerHTML = (sel && wait ? bicep() : '') + CHOICES.find(([k]) => k === b.dataset.evChoice)[1];
    });
    const n = (k) => plan.people.filter((p) => p.choice === k).length;
    sum.textContent = [n('si') && `${n('si')} ci sono`, n('forse') && `${n('forse')} forse`, n('no') && `${n('no')} no`].filter(Boolean).join(' · ') || 'Ancora nessuna risposta';
  }

  function refreshPollEvents() {
    document.querySelectorAll('#chat-list .poll-ev').forEach(paintPollEvent);
  }

  function renderList() {
    // Mentre si scrive il numero di una sfida la lista non si ridisegna (si perderebbe la tastiera): si rifà dopo.
    if (document.activeElement && document.activeElement.classList.contains('sfida-num')) {
      listDeferred = true;
      return;
    }
    listDeferred = false;
    const list = $('chat-list');
    list.dataset.rendered = '1';
    list.innerHTML = '';
    let lastDay = '';
    let lastSender = '';
    data.messages.forEach((m) => {
      if (m.day !== lastDay) {
        list.append(el('div', 'day', dayLabel(m.day)));
        lastDay = m.day;
        lastSender = '';
      }
      if (m.type === 'msg') {
        const mine = m.name === me.name;
        const row = el('div', `msg ${mine ? 'mine' : 'theirs'}`);
        if (!mine && lastSender !== m.name) {
          const sender = el('div', 'sender', m.display || who(m.name)); // i messaggi di Firebase hanno solo il nome
          if (isKing(m.name)) sender.insertAdjacentHTML('beforeend', crown(m.name));
          row.append(sender);
        }
        const bubble = el('div', 'bubble', m.text);
        if (m.pending) {
          const s = el('span', 'sending');
          s.innerHTML = bicep();
          bubble.append(s);
        } else bubble.append(el('span', 'time', m.time));
        if (isDebug() && !m.pending) bubble.append(delButton(m.id, m.fb));
        row.append(bubble);
        list.append(row);
        lastSender = m.name;
        return;
      }
      lastSender = '';
      const ev = m.type === 'poll' ? pollEvent(m) : eventRow(m);
      if (isDebug() && ev.classList.contains('event')) ev.append(delButton(m.id));
      list.append(ev);
    });
    if (!data.messages.length && !pending.length) list.append(el('p', 'empty', 'Ancora nessun messaggio. Scrivi tu il primo.'));
    showPending();
  }

  // ---------- Sfide (card in chat) ----------

  let listDeferred = false;
  let sfidaSending = 0;
  const sfidaDrafts = {}; // numeri scritti e non ancora inviati, per sfida

  /** Cambia subito la card (senza aspettare il server): quello che il server farà con questa azione. */
  function sfidaLocal(s, body) {
    const mine = () => {
      let p = s.people.find((x) => x.name === me.name);
      if (!p) {
        p = { name: me.name, display: me.display, in: false, value: null, by: '', contested: 0, annulled: false, record: null };
        s.people.push(p);
      }
      return p;
    };
    const target = s.people.find((x) => x.name === body.target);
    if (body.op === 'join') mine().in = body.value;
    if (body.op === 'value') mine().value = body.value;
    if (body.op === 'winner' && target) s.winner = { name: target.name, display: target.display, by: me.name, byDisplay: me.display, conf: '' };
    if (body.op === 'confirm') {
      if (body.target === '__winner' && s.winner) s.winner.conf = me.display;
      else if (target) target.by = me.display;
    }
    if (body.op === 'contest') {
      if (body.target === '__winner') {
        s.winner = null;
        s.winnerContests += 1;
        if (s.winnerContests >= 2) s.noWinner = true;
      } else if (target) {
        target.contested += 1;
        if (target.contested >= 2) target.annulled = true;
        else target.value = null;
      }
    }
  }

  async function sfidaDo(body) {
    const s = (data.sfide || []).find((x) => x.id === body.id);
    if (!s) return;
    const before = JSON.stringify(data.sfide);
    sfidaLocal(s, body);
    s.saving = (s.saving || 0) + 1;
    sfidaSending++;
    renderList();
    try {
      const r = await api('sfida', body);
      sfidaSending--;
      if (r.sfideOnly) {
        data.sfide = r.sfide; // il resto della chat lo aggiorna il prossimo giro
        if (!sfidaSending) renderList();
      } else {
        v = -1;
        apply(r);
      }
    } catch (err) {
      sfidaSending--;
      data.sfide = JSON.parse(before); // torna com'era
      renderList();
      toast(`Errore: ${err.message}`);
    }
  }

  function sfidaCard(d) {
    const s = (data.sfide || []).find((x) => x.id === d.id);
    const row = el('div', 'event sfida');
    if (!s) {
      row.append(el('p', 'event-title', 'Sfida'), el('p', 'event-text', 'Sfida non più disponibile'));
      return row;
    }
    row.append(el('p', 'event-title', s.state === 'conclusa' ? `Sfida conclusa: ${s.label}` : `Sfida! ${s.label}`));
    const names = s.invited.map((x) => x.display);
    row.append(el('p', 'sfida-between', `Tra ${names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names.join('')}`));
    row.append(el('p', 'event-text', s.desc));
    if (s.saving) {
      const sv = el('p', 'sfida-saving');
      sv.innerHTML = `${bicep()}<span>Salvo…</span>`;
      row.append(sv);
    }
    const how = el('button', 'sfida-how', 'Come funziona');
    how.type = 'button';
    how.onclick = () => openNews('sfide');
    row.append(how);
    const meP = s.people.find((p) => p.name === me.name);
    const invited = s.invited.some((x) => x.name === me.name);
    const ins = s.people.filter((p) => p.in);
    const outs = s.people.filter((p) => !p.in);
    const line = [ins.length && `Ci stanno: ${ins.map((p) => p.display).join(', ')}`, outs.length && `Passano: ${outs.map((p) => p.display).join(', ')}`].filter(Boolean).join(' · ');
    if (line) row.append(el('p', 'sfida-who', line));

    if (s.state === 'conclusa') {
      const r = s.result || { winners: [], points: [], records: [], pct: [] };
      row.append(el('p', 'sfida-win', r.winners.length ? `Vince ${r.winners.join(', ')} · +5` : 'Nessun vincitore'));
      const others = r.points.filter((x) => x.pts !== 5).map((x) => x.display);
      if (others.length) row.append(el('p', 'event-text', `Partecipazione +2: ${others.join(', ')}`));
      if (r.pct.length) row.append(el('p', 'event-text', r.pct.map((x) => `${x.display} ${x.pct}%`).join(' · ')));
      r.records.forEach((x) => row.append(el('p', 'sfida-rec', x.first ? `Primo record di ${x.display}: ${x.value}` : `Nuovo record di ${x.display}: ${x.value}`)));
      return row;
    }

    // Ci sto / Passo
    if (invited && s.joinOpen && !s.winner && !(meP && meP.in && (meP.value !== null || meP.contested))) {
      const b = el('div', 'sfida-btns');
      [['in', 'Ci sto', true], ['out', 'Passo', false]].forEach(([k, l, val]) => {
        const btn = el('button', `choice ${k === 'in' ? 'si' : 'no'}${meP && meP.in === val ? ' selected' : ''}`, l);
        btn.type = 'button';
        btn.onclick = () => sfidaDo({ id: s.id, op: 'join', value: val });
        b.append(btn);
      });
      row.append(b);
    } else if (!invited && s.joinOpen) {
      row.append(el('p', 'event-text', 'Per partecipare fai check-in entro un\'ora dall\'apertura'));
    }

    const amIn = !!(meP && meP.in);
    const confirmBtns = (target) => {
      const b = el('div', 'sfida-btns small');
      [['confirm', '✓ Confermo', 'si'], ['contest', '✗ Contesto', 'no']].forEach(([op, l, cls]) => {
        const btn = el('button', `choice ${cls}`, l);
        btn.type = 'button';
        btn.onclick = () => {
          if (op === 'contest' && !confirm('Contestare questo risultato? Alla seconda contestazione vale solo la partecipazione.')) return;
          sfidaDo({ id: s.id, op, target });
        };
        b.append(btn);
      });
      return b;
    };

    if (s.kind === 'durata') {
      if (s.noWinner) row.append(el('p', 'event-text', `${isF(s.contestato) ? 'Vincitrice contestata' : 'Vincitore contestato'} due volte: vale solo la partecipazione.`));
      else if (s.winner) {
        const conf = s.winner.conf ? ` · confermato da ${s.winner.conf}` : ' · da confermare';
        row.append(el('p', 'sfida-res', `Ha vinto ${s.winner.display} (dice ${s.winner.byDisplay})${conf}`));
        if (amIn && !s.winner.conf && s.winner.by !== me.name) row.append(confirmBtns('__winner'));
      } else if (amIn && ins.length >= 2) {
        row.append(el('p', 'event-text', s.winnerContests ? `${isF(s.contestato) ? 'Vincitrice contestata' : 'Vincitore contestato'}: dichiaratelo di nuovo. Chi ha vinto?` : 'Finita? Chi ha vinto?'));
        const b = el('div', 'sfida-btns wrap');
        ins.forEach((p) => {
          const btn = el('button', 'choice', p.display);
          btn.type = 'button';
          btn.onclick = () => confirm(`Ha vinto ${p.display}?`) && sfidaDo({ id: s.id, op: 'winner', target: p.name });
          b.append(btn);
        });
        row.append(b);
      }
      return row;
    }

    // Ripetizioni: risultati di tutti, con conferme
    ins.forEach((p) => {
      const r = el('div', 'sfida-row');
      let txt;
      if (p.annulled) txt = `${p.display}: contestato due volte, vale la partecipazione`;
      else if (p.value === null) txt = `${p.display}: ${p.contested ? 'contestato, da riscrivere' : 'deve ancora scrivere'}`;
      else {
        const pct = p.record ? ` (${Math.round((p.value / p.record) * 100)}% del record ${p.record})` : ' (prima volta: calibrazione)';
        txt = `${p.display}: ${p.value}${pct}${p.by ? ` · ✓ ${p.by}` : ' · da confermare'}`;
      }
      r.append(el('p', 'sfida-res', txt));
      if (amIn && p.name !== me.name && p.value !== null && !p.by && !p.annulled) r.append(confirmBtns(p.name));
      row.append(r);
    });
    if (amIn && meP.value === null && !meP.annulled) {
      const f = el('form', 'sfida-form');
      const input = el('input', 'sfida-num');
      Object.assign(input, { type: 'number', inputMode: 'numeric', min: 0, max: 2000, placeholder: 'Quante?', value: sfidaDrafts[s.id] || '' });
      input.oninput = () => (sfidaDrafts[s.id] = input.value);
      input.onblur = () => setTimeout(() => listDeferred && render(), 0);
      const btn = el('button', 'primary small', 'Invia');
      f.append(input, btn);
      f.onsubmit = (e) => {
        e.preventDefault();
        const n = Number(input.value);
        if (!(input.value !== '' && n >= 0)) return toast('Scrivi quante ne hai fatte');
        if (!confirm(`Confermi ${n} ${s.label.toLowerCase()}?`)) return;
        delete sfidaDrafts[s.id];
        input.blur();
        sfidaDo({ id: s.id, op: 'value', value: n });
      };
      row.append(el('p', 'sfida-hint', meP.record ? `Il tuo record: ${meP.record}. Per vincere superalo più degli altri.` : 'Prima volta: questo numero sarà il tuo record (calibrazione, vale la partecipazione).'));
      row.append(f);
    }
    return row;
  }

  function sfidaEnd(d) {
    const s = (data.sfide || []).find((x) => x.id === d.id);
    const row = el('div', 'event award');
    row.append(el('p', 'event-title', s ? `Sfida conclusa: ${s.label}` : 'Sfida conclusa'));
    const r = s && s.result;
    if (r) {
      row.append(el('p', 'event-text', r.winners.length ? `Vince ${r.winners.join(', ')} (+5)` : 'Nessun vincitore'));
      const others = r.points.filter((x) => x.pts !== 5).map((x) => x.display);
      if (others.length) row.append(el('p', 'event-text', `Partecipazione +2: ${others.join(', ')}`));
      r.records.filter((x) => !x.first).forEach((x) => row.append(el('p', 'event-text', `Nuovo record di ${x.display}: ${x.value}`)));
    }
    return row;
  }

  function eventRow(m) {
    const d0 = m.data || {};
    if (d0.kind === 'sfida') {
      const card = sfidaCard(d0);
      card.append(el('span', 'time', m.time));
      return card;
    }
    if (d0.kind === 'sfidaFine') {
      const card = sfidaEnd(d0);
      card.append(el('span', 'time', m.time));
      return card;
    }
    const row = el('div', 'event');
    const d = m.data || {};
    const name = m.display || who(m.name);
    if (d.kind === 'checkin') {
      const goal = d.count >= d.goal && d.goal ? ' · obiettivo raggiunto' : '';
      row.append(el('p', 'event-text', `${name} ha fatto check-in${d.auto ? ' (automatico)' : ''} · ${d.count}/${d.goal} questa settimana${goal}`));
    } else if (d.kind === 'sudometro') {
      if (d.photoId) row.classList.add('with-photo');
      const box = el('div', 'event-sudo');
      const text = el('div');
      text.append(el('p', 'event-text', `${name} ha fatto il Sudometro`));
      const title = alF(clean(d.title), isF(m.name));
      text.append(el('p', 'event-score', `${d.score} · ${title}`));
      if (d.photoId) box.append(photoPair(d.photoId, d.ref || (data.refPhotos || {})[m.name], `${name} · ${d.score} · ${title}`, false, isF(m.name)));
      box.append(text);
      row.append(box);
    } else if (d.kind === 'achievement') {
      row.classList.add('award');
      row.append(el('p', 'event-title', 'Medaglia vinta'));
      row.append(el('p', 'event-text', `${name}: ${alF(d.title, isF(m.name))} (+${d.pts} punti)`));
    } else if (d.kind === 'news') {
      // Novità sbloccate: le slide si aprono a tutto schermo
      row.classList.add('award', 'news');
      row.append(el('p', 'event-title', d.title || 'Novità'));
      row.append(el('p', 'event-text', d.body || ''));
      const btn = el('button', 'primary small', 'Guarda le novità');
      btn.addEventListener('click', () => openNews(d.id));
      row.append(btn);
    } else if (d.kind === 'weekly' || d.kind === 'monthly') {
      row.classList.add('award');
      row.append(el('p', 'event-title', d.kind === 'weekly' ? 'Premiazioni della settimana' : `Premiazioni di ${d.month}`));
      const period = d.kind === 'weekly' ? 'della settimana' : 'del mese';
      const lines = [];
      if (d.king) lines.push(`${kingTitle(d.king.names, isF)}: ${d.king.names.map(who).join(', ')} (${d.king.total} punti)`);
      if (d.mvp) lines.push(`MVP: ${d.mvp.names.map(who).join(', ')} (${d.mvp.count})`);
      if (d.divano) lines.push(`Divano d'oro: ${d.divano.names.map(who).join(', ')} (${d.divano.count})`);
      if (d.pomodoro) lines.push(`Pomodoro ${period}: ${who(d.pomodoro.name)} (${d.pomodoro.score})`);
      if (!lines.length) lines.push('Periodo tranquillo... troppo tranquillo.');
      lines.forEach((l) => row.append(el('p', 'event-text', l)));
    } else {
      return el('div');
    }
    row.append(el('span', 'time', m.time));
    return row;
  }

  /** Bolle dei messaggi in invio, in fondo alla lista. */
  function showPending() {
    const list = $('chat-list');
    list.querySelectorAll('.msg.pending').forEach((n) => n.remove());
    if (pending.length) list.querySelectorAll('.empty').forEach((n) => n.remove());
    pending.forEach((p) => {
      const row = el('div', 'msg mine pending');
      const bubble = el('div', 'bubble', p.text);
      const s = el('span', 'sending');
      s.innerHTML = bicep();
      bubble.append(s);
      row.append(bubble);
      list.append(row);
    });
  }

  function markRead() {
    if (!data || !data.messages.length) return;
    const last = data.messages[data.messages.length - 1].id;
    if (last > getRead()) setRead(last);
    setBadge(0);
  }

  function setBadge(n) {
    const btn = document.querySelector('.tabbar button[data-tab=chat]');
    let b = btn.querySelector('.badge');
    if (!n) return b && b.remove();
    if (!b) {
      b = el('span', 'badge');
      btn.append(b);
    }
    b.textContent = n > 9 ? '9+' : String(n);
  }

  function autosize() {
    const t = $('chat-input');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 120) + 'px';
  }

  function tick() {
    // Con Firebase le novità arrivano da sole: ad Apps Script si chiede solo ogni tanto (per il cambio di giorno)
    const quiet = onlyFb() || (fbLive() && Date.now() - lastLoad < FB_POLL_EVERY);
    if (active && document.visibilityState === 'visible' && !quiet) load();
    rescuePending();
    renderSync();
  }

  // ---------- API per app.js ----------

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    send($('chat-input').value);
  });
  $('chat-input').addEventListener('input', autosize);
  // Come WhatsApp: toccando "Invia" la casella resta attiva e la tastiera non si chiude
  // (senza questo il tocco sposta l'attenzione sul pulsante e iOS chiude la tastiera).
  // Trascinando verso il basso (sui messaggi o sulla casella) la tastiera si chiude, come WhatsApp
  let dragY = null;
  const dragStart = (e) => {
    dragY = document.activeElement === $('chat-input') ? e.touches[0].clientY : null;
  };
  const dragMove = (e) => {
    if (dragY === null || e.touches[0].clientY - dragY < 40) return;
    dragY = null;
    $('chat-input').blur();
  };
  for (const id of ['scroller', 'chat-form']) {
    $(id).addEventListener('touchstart', dragStart, { passive: true });
    $(id).addEventListener('touchmove', dragMove, { passive: true });
  }
  $('chat-send').addEventListener('mousedown', (e) => e.preventDefault());
  $('chat-send').addEventListener('touchend', (e) => {
    e.preventDefault(); // niente click dopo: il messaggio parte una volta sola
    $('chat-form').requestSubmit();
  });
  $('scroller').addEventListener('scroll', () => active && updateDown(), { passive: true });
  $('chat-down').addEventListener('click', () => {
    const sc = $('scroller');
    sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
  });

  return {
    redraw() {
      if (data) render();
    },
    /** Accende o spegne la chat Firebase se è cambiato chi può usarla (stato dal server o modalità prova). */
    checkFirebase() {
      fbStart();
    },
    reload() {
      fbRetryAt = 0;
      v = 0; // prova e chat vera hanno versioni diverse che possono coincidere
      fbStop();
      fbStart();
      load(true);
    },
    setUser(user) {
      if (me && me.name === user.name) return;
      me = user;
      v = 0;
      data = null;
      rawMsgs = [];
      rawState = null;
      syncedAt = 0;
      syncFails = 0;
      cachedAt = 0;
      $('chat-list').innerHTML = '';
      delete $('chat-list').dataset.rendered;
      const cached = readCache();
      if (cached) {
        // chat dell'ultima volta subito pronta; la versione fa sì che il server mandi solo le novità
        // Copia salvata da una versione di prova che mescolava Firebase: senza i messaggi normali, va riscaricata
        const mixed = (cached.messages || []).some((m) => m.fb);
        rawMsgs = (cached.messages || []).filter((m) => !m.fb);
        rawState = cached;
        data = compose(cached);
        v = mixed ? 0 : cached.v;
        render();
      }
      fbStop();
      fbStart();
    },
    /** Pallino "devi rispondere" anche prima che la chat sia caricata (dallo stato generale). */
    updatePending(plans) {
      if (!data || !data.plans) updatePending(plans);
    },
    /** Carica la chat di nascosto (all'apertura dell'app), così il tab si apre già pieno. */
    preload() {
      if (!active && !onlyFb()) load(false); // con la chat già in memoria il server risponde solo se ci sono novità
    },
    setActive(on) {
      active = on;
      clearInterval(timer);
      if (!on) {
        $('chat-down').hidden = true;
        renderSync();
        return;
      }
      tlog('chat aperta', data ? `in cache (${data.messages ? data.messages.length : 0} messaggi)` : 'vuota, carico');
      if (data) {
        render();
        scrollToBottom();
      } else {
        $('chat-list').innerHTML = `<div class="loading">${bicep()}<p>Carico la chat…</p></div>`;
      }
      if (!onlyFb() || !data) load(!data);
      renderSync();
      timer = setInterval(tick, POLL_EVERY);
    },
    /** Pallino dei non letti, dai dati leggeri dello stato generale. */
    updateBadge(meta) {
      if (!me || active || !meta) return;
      const read = getRead();
      setBadge(meta.filter((m) => m.id > read && m.name !== me.name).length);
    },
    ask,
    reset() {
      fbStop();
      clearInterval(timer);
      me = null;
      data = null;
      rawMsgs = [];
      rawState = null;
      v = 0;
      setBadge(0);
    },
  };
}

/** Lista di chi ha risposto, per la chat e per il tab Oggi. */
export function answersList(poll) {
  const box = document.createElement('div');
  box.className = 'answers-list';
  const groups = [
    ['si', 'Ci sono'],
    ['forse', 'Forse'],
    ['no', 'No'],
    [null, 'Non hanno risposto'],
  ];
  groups.forEach(([k, label]) => {
    const people = poll.people.filter((p) => p.choice === k);
    if (!people.length) return;
    const row = el('div', `answer-group ${k || 'none'}`);
    row.append(el('span', 'answer-label', label));
    const names = el('span', 'answer-names');
    names.textContent = people
      .map((p) => p.display + (p.time ? ` ${p.time}` : '') + (p.arrived ? ' (arrivato)' : ''))
      .join(', ');
    row.append(names);
    box.append(row);
  });
  return box;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function dayLabel(day) {
  const d = new Date(day + 'T12:00:00');
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Bicipite che si flette (SVG animato via CSS): feedback mentre si aspetta Apps Script. */
export function bicep() {
  // Curl con manubrio: l'avambraccio sale ruotando sul gomito e il bicipite si gonfia.
  // Animazione SMIL (funziona anche su Safari, che non anima "d" via CSS). I riempimenti hanno il colore
  // di sfondo (--bicep-bg) e coprono le linee che passano dietro; il gomito è un disco senza bordo
  // interno, così tra braccio e avambraccio resta solo il contorno esterno.
  const t = 'dur="1.1s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"';
  return `<svg class="bicep" viewBox="-4 -14 86 82" aria-label="Invio in corso" role="img">
    <path class="fill" d="M0 47 C4 47 7 44 19 44 C30 44 34 53 40 45 L46 52 V61 L0 61 Z"><animate attributeName="d" values="M0 47 C4 47 7 44 19 44 C30 44 34 53 40 45 L46 52 V61 L0 61 Z;M0 47 C4 47 9 26 21 26 C32 26 36 37 41 47 L46 52 V61 L0 61 Z;M0 47 C4 47 7 44 19 44 C30 44 34 53 40 45 L46 52 V61 L0 61 Z" ${t} /></path>
    <circle class="fill" cx="46" cy="52" r="9" />
    <path d="M0 61 H46" />
    <path d="M46 61 A9 9 0 0 0 55 52" />
    <path d="M0 47 C4 47 7 44 19 44 C30 44 34 53 40 45 L45 51"><animate attributeName="d" values="M0 47 C4 47 7 44 19 44 C30 44 34 53 40 45 L45 51;M0 47 C4 47 9 26 21 26 C32 26 36 37 41 47 L45 51;M0 47 C4 47 7 44 19 44 C30 44 34 53 40 45 L45 51" ${t} /></path>
    <g>
      <animateTransform attributeName="transform" type="rotate" values="50 46 52;4 46 52;50 46 52" ${t} />
      <g transform="translate(5 0)">
        <path class="fill" d="M32 52 L35 27 L47 27 L50 52 H48 A7 7 0 0 1 34 52 Z" />
        <path d="M32 52 L35 27 L47 27 L50 52"><animate attributeName="d" values="M32 52 L35 27 L47 27 L50 52;M33.1 44 L35 27 L47 27 L50 52;M32 52 L35 27 L47 27 L50 52" ${t} /></path>
        <path d="M20 17H62" />
        <rect class="bicep-bg" x="16" y="8" width="7" height="18" rx="2.5" />
        <rect class="bicep-bg" x="59" y="8" width="7" height="18" rx="2.5" />
        <rect class="bicep-bg" x="31" y="8" width="20" height="20" rx="7" />
      </g>
    </g>
  </svg>`;
}
