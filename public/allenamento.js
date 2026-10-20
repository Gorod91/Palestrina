// Allenamento (fase 1, solo in modalità prova): schede, serie e "l'ultima volta" per ogni esercizio.
// Tutto su Firebase: le serie si salvano sul telefono anche senza campo e partono appena torna la rete.
// Raccolte (in prova con prefisso prova_): serie/<giorno>_<uid>_<esercizio> = { name, ex, sets: [{ kg, reps }], day, scheda, at },
// schede/<uid> = { name, list: [{ id, name, ex: [id esercizio] }], at }.
import { fbSignIn, fbUid } from './fbchat.js';

// Catalogo di esempio: quello vero delle macchine della nostra palestra arriverà più avanti.
// t: 'kg' (peso e ripetizioni, se manca), 'rip' (solo ripetizioni, a corpo libero), 'sec' (a tempo, in secondi)
export const CATALOGO = [
  { id: 'squat', n: 'Squat', g: 'Gambe', m: 'Bilanciere' },
  { id: 'spinte-manubri', n: 'Spinte in alto con manubri in piedi', g: 'Spalle', m: 'Manubri' },
  { id: 'pulley-medio', n: 'Pulley grip medio', g: 'Schiena', m: 'Cavo' },
  { id: 'chest-press-sdraiato', n: 'Chest press sdraiato', g: 'Petto', m: 'Macchina' },
  { id: 'situps', n: 'Sit-up', g: 'Addominali', m: 'Corpo libero', t: 'rip' },
  { id: 'plank', n: 'Plank sui gomiti', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  { id: 'barchetta', n: 'Barchetta', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  { id: 'panca', n: 'Panca piana', g: 'Petto', m: 'Bilanciere' },
  { id: 'chest-press', n: 'Chest press', g: 'Petto', m: 'Macchina 2' },
  { id: 'croci', n: 'Croci ai cavi', g: 'Petto', m: 'Cavi' },
  { id: 'lat', n: 'Lat machine', g: 'Schiena', m: 'Macchina' },
  { id: 'pulley', n: 'Pulley basso', g: 'Schiena', m: 'Macchina 6' },
  { id: 'rematore', n: 'Rematore con manubrio', g: 'Schiena', m: 'Manubri' },
  { id: 'leg-press', n: 'Leg press', g: 'Gambe', m: 'Macchina 7' },
  { id: 'leg-ext', n: 'Leg extension', g: 'Gambe', m: 'Macchina 4' },
  { id: 'leg-curl', n: 'Leg curl', g: 'Gambe', m: 'Macchina 5' },
  { id: 'hip-thrust', n: 'Hip thrust', g: 'Glutei', m: 'Bilanciere' },
  { id: 'calf', n: 'Calf in piedi', g: 'Polpacci', m: 'Macchina 9' },
  { id: 'shoulder', n: 'Shoulder press', g: 'Spalle', m: 'Macchina 8' },
  { id: 'alzate', n: 'Alzate laterali', g: 'Spalle', m: 'Manubri' },
  { id: 'curl', n: 'Curl con manubri', g: 'Bicipiti', m: 'Manubri' },
  { id: 'pushdown', n: 'Push down ai cavi', g: 'Tricipiti', m: 'Cavi' },
  { id: 'crunch', n: 'Crunch alla macchina', g: 'Addominali', m: 'Macchina 10' },
];
const EX = Object.fromEntries(CATALOGO.map((e) => [e.id, e]));

// Scheda per chi non ne ha ancora (la creazione delle proprie arriva con la fase 2): la scheda A di Francesco.
// piano: serie × ripetizioni indicate dall'istruttore e note; servono anche per riempire le serie la prima volta.
const SCHEDE_ESEMPIO = [
  {
    id: 'a',
    name: 'Scheda A',
    ex: ['squat', 'lat', 'spinte-manubri', 'pulley-medio', 'chest-press-sdraiato', 'curl', 'situps', 'plank', 'barchetta'],
    piano: {
      squat: { s: '4 × 6-8' },
      lat: { s: '3 × 8-10' },
      'spinte-manubri': { s: '4 × 6-8' },
      'pulley-medio': { s: '3 × 8-10', nota: '1" fermo al petto' },
      'chest-press-sdraiato': { s: '3 × 8-10', nota: '2° piano' },
      curl: { s: '3 × 6-8' },
      situps: { s: '10-12' },
      plank: { s: '30-40"' },
      barchetta: { s: '20-30"' },
    },
  },
];

const REST = 90; // secondi di recupero

/** Serie della prima volta: dal piano della scheda ("4 × 6-8" → 4 serie da 6), altrimenti 3 × 10. */
function primaVolta(piano) {
  const m = String((piano && piano.s) || '').match(/^(?:(\d+)\s*×\s*)?(\d+)/);
  const n = m ? Number(m[1] || 1) : 3, reps = m ? Number(m[2]) : 10;
  return Array.from({ length: n }, () => ({ kg: 0, reps }));
}
const unit = (e) => (e && e.t) || 'kg';
/** Peso dopo − o +: a 1 kg fino a 20, sopra a 2,5 kg (sui multipli di 2,5). Si può sempre scrivere a mano. */
function nextKg(v, d) {
  if (d > 0) return v < 20 ? Math.min(20, Math.floor(v) + 1) : Math.floor(v / 2.5 + 1e-9) * 2.5 + 2.5;
  if (v <= 20) return Math.max(0, Math.ceil(v) - 1);
  return Math.max(20, Math.ceil(v / 2.5 - 1e-9) * 2.5 - 2.5);
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());
const daysAgo = (d) => Math.round((Date.parse(today() + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 86400000);
const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
const kgf = (v) => String(v).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const copy = (sets) => sets.map((s) => ({ kg: s.kg, reps: s.reps }));

function summary(sets, t = 'kg') {
  const r = sets.map((s) => s.reps);
  const reps = r.every((x) => x === r[0]) ? `${r.length} × ${r[0]}${t === 'sec' ? '"' : ''}` : r.map((x) => (t === 'sec' ? `${x}"` : x)).join(' · ');
  if (t !== 'kg') return reps;
  const kg = sets.every((s) => s.kg === sets[0].kg) ? `${kgf(sets[0].kg)} kg` : 'kg diversi';
  return `${reps} · ${kg}`;
}

export function createWorkout({ root, getToken, toast, openTimer, timerSeconds }) {
  let x = null; // { fs, db } dopo l'accesso
  let me = null;
  let pfx = '';
  let key = '';
  let unsubs = [];
  let ready = false;
  let serie = []; // le mie serie (tutte)
  let schede = null; // le mie schede (null finché non arrivano)
  // cosa si vede: lista, esercizio, catalogo (allenamento libero)
  const ui = { view: 'list', scheda: '', list: [], i: 0, sets: null, open: -1, editing: false, q: '', g: '' };
  let restEnd = 0;
  let serieSig = '';
  let altrove = []; // le mie serie salvate dall'altra parte (prova o dati veri)
  let pressed = false; // dito sullo schermo: il ridisegno aspetta che si alzi
  let later = false;
  let restTimer = null;

  async function start(user, test) {
    const k = `${user.name}|${test}`;
    if (k === key) return;
    stop();
    key = k;
    me = user;
    pfx = test ? 'prova_' : '';
    draw();
    try {
      x = await fbSignIn(user, getToken);
    } catch (err) {
      key = '';
      root.innerHTML = `<p class="wo-empty">Allenamento non disponibile: ${esc(err.message)}</p>`;
      return;
    }
    if (k !== key) return;
    const { fs, db } = x;
    unsubs.push(
      fs.onSnapshot(fs.query(fs.collection(db, pfx + 'serie'), fs.where('name', '==', me.name)), { includeMetadataChanges: true }, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), pending: d.metadata.hasPendingWrites }));
        const sig = JSON.stringify(list.map((s) => [s.id, s.sets, s.pending]));
        serie = list;
        if (ready && sig === serieSig) return; // solo metadati cambiati: ridisegnare farebbe perdere tocchi e tastiera
        serieSig = sig;
        ready = true;
        softDraw();
      }, (err) => toast(`Allenamento: ${err.message}`)),
      fs.onSnapshot(fs.doc(db, pfx + 'schede', fbUid(me.name)), (snap) => {
        schede = snap.exists() ? snap.data().list || [] : SCHEDE_ESEMPIO;
        softDraw();
      }, (err) => toast(`Allenamento: ${err.message}`)),
    );
    // Serie salvate dall'altra parte (in prova se ora si è fuori, o viceversa): si possono copiare qui
    fs.getDocs(fs.query(fs.collection(db, (test ? '' : 'prova_') + 'serie'), fs.where('name', '==', me.name)))
      .then((snap) => {
        if (k !== key) return;
        altrove = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        softDraw();
      })
      .catch(() => {});
  }

  /** Serie dell'altra parte che qui mancano (Firebase accetta solo quelle di oggi e ieri). */
  const daCopiare = () => altrove.filter((a) => daysAgo(a.day) <= 1 && !serie.some((s) => s.id === a.id));

  function copia() {
    const { fs, db } = x;
    daCopiare().forEach((a) => {
      fs.setDoc(fs.doc(db, pfx + 'serie', a.id), { name: me.name, ex: a.ex, sets: copy(a.sets), day: a.day, scheda: a.scheda || '', at: fs.serverTimestamp() })
        .catch((err) => toast(`Serie non copiate: ${err.message}`));
    });
  }

  function stop() {
    unsubs.forEach((u) => u());
    unsubs = [];
    key = '';
    ready = false;
    serie = [];
    serieSig = '';
    altrove = [];
    schede = null;
    Object.assign(ui, { view: 'list' });
    pages = {};
  }

  // ---------- Dati ----------

  const todayDoc = (ex) => serie.find((s) => s.ex === ex && s.day === today());
  /** L'ultima volta prima di oggi. */
  function lastTime(ex) {
    return serie.filter((s) => s.ex === ex && s.day < today()).sort((a, b) => (a.day < b.day ? 1 : -1))[0] || null;
  }
  const lastDone = (sch) => serie.filter((s) => s.scheda === sch.id).reduce((m, s) => (s.day > m ? s.day : m), '');
  const doneToday = (sch) => sch.ex.filter((e) => serie.some((s) => s.ex === e && s.day === today() && s.scheda === sch.id)).length;

  /** La scheda da fare: quella iniziata oggi, se non finita; altrimenti quella non fatta da più tempo. */
  function proposta() {
    const list = schede || [];
    const started = list.find((s) => doneToday(s) > 0 && doneToday(s) < s.ex.length);
    if (started) return started;
    return list.slice().sort((a, b) => (lastDone(a) < lastDone(b) ? -1 : lastDone(a) > lastDone(b) ? 1 : 0))[0];
  }

  function save(ex, sets) {
    const { fs, db } = x;
    const day = today();
    // Non si aspetta Firebase: senza campo resta sul telefono e parte da solo appena torna la rete
    fs.setDoc(fs.doc(db, pfx + 'serie', `${day}_${fbUid(me.name)}_${ex}`), { name: me.name, ex, sets: copy(sets), day, scheda: ui.scheda, at: fs.serverTimestamp() })
      .catch((err) => toast(`Serie non salvate: ${err.message}`));
  }

  // ---------- Disegno ----------

  /** Ridisegno per i dati arrivati da Firebase: non mentre si tocca o si scrive, ma subito dopo. */
  function softDraw() {
    const typing = root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (pressed || typing || scrolling) later = true;
    else draw();
  }
  function flush() {
    if (!later || pressed || scrolling) return;
    later = false;
    setTimeout(() => {
      if (!(root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) draw();
      else later = true;
    }, 0);
  }
  root.addEventListener('pointerdown', () => (pressed = true));
  document.addEventListener('pointerup', () => { pressed = false; flush(); });
  document.addEventListener('pointercancel', () => { pressed = false; flush(); });
  root.addEventListener('focusout', () => setTimeout(flush, 0));

  function draw() {
    if (!me) return;
    if (!ready || !schede) {
      root.innerHTML = '<p class="wo-empty">Carico l\'allenamento…</p>';
      return;
    }
    root.innerHTML = ui.view === 'ex' ? exView() : ui.view === 'pick' ? pickView() : ui.view === 'scheda' ? schedaView() : listView();
    const pager = root.querySelector('#wo-pager');
    if (pager) {
      pager.scrollLeft = ui.i * pageStep(pager);
      if (glide) { // tocco su un puntino o su "Prossimo": la pagina scorre fino all'esercizio
        const to = ui.i * pageStep(pager);
        pager.scrollLeft = glide.from * pageStep(pager);
        requestAnimationFrame(() => pager.scrollTo({ left: to, behavior: 'smooth' }));
      }
      pager.addEventListener('scroll', onPagerScroll, { passive: true });
    }
    glide = null;
    tickRest();
  }

  const pageStep = (pager) => {
    const a = pager.children[0], b = pager.children[1];
    return b ? b.offsetLeft - a.offsetLeft : pager.clientWidth;
  };
  let glide = null;
  let scrolling = false, scrollTimer = 0;
  /** Durante il trascinamento si aggiornano solo numero e puntini; la pagina non si ridisegna. */
  function onPagerScroll(ev) {
    const pager = ev.currentTarget;
    scrolling = true;
    clearTimeout(scrollTimer);
    const k = Math.max(0, Math.min(ui.list.length - 1, Math.round(pager.scrollLeft / pageStep(pager))));
    if (k !== ui.i) {
      ui.i = k;
      const num = root.querySelector('#wo-num');
      if (num) num.textContent = k + 1;
      root.querySelectorAll('#wo-dots button').forEach((d, j) => d.classList.toggle('cur', j === k));
    }
    scrollTimer = setTimeout(() => { scrolling = false; flush(); }, 160);
  }


  function listView() {
    const p = proposta();
    const timer = `<button class="wo-row" data-a="timer"><span class="wo-dot"></span><span><b>Timer Addominali</b><small>${timerSeconds()} s</small></span><span class="wo-chev">›</span></button>`;
    const other = (schede || []).map((s) => {
      const d = lastDone(s);
      return `<button class="wo-row" data-a="sch:${esc(s.id)}"><span><b>${esc(s.name)}</b><small>${s.ex.length} esercizi${d ? ` · ${ago(d)}` : ''}</small></span><span class="wo-chev">›</span></button>`;
    }).join('');
    let hero = '';
    if (p) {
      const n = doneToday(p), d = lastDone(p);
      const all = n === p.ex.length;
      const sub = all ? 'Fatta oggi ✓' : n ? `${n} di ${p.ex.length} esercizi fatti` : `${p.ex.length} esercizi${d ? ` · l'hai fatta ${ago(d)}` : ' · mai fatta'}`;
      hero = `<section class="wo-hero"><div class="wo-hero-name">${esc(p.name)}</div><div class="wo-sub">${sub}</div><button class="primary" data-a="go:${esc(p.id)}">${all ? 'Rivedi' : n ? 'Continua' : 'Inizia'}</button></section>`;
    }
    const dc = daCopiare();
    const recupera = dc.length ? `<section class="card wo-copy"><b>${dc.length} ${dc.length === 1 ? 'esercizio salvato' : 'esercizi salvati'} ${pfx ? 'fuori dalla prova' : 'in modalità prova'}</b>
      <span class="wo-sub">${esc(dc.map((a) => (EX[a.ex] || { n: a.ex }).n).join(', '))}</span><button class="primary" data-a="copia">Copia qui</button></section>` : '';
    return `${recupera}${hero}
      <h2 class="section">Le tue schede</h2>
      <section class="card wo-list">${other}</section>
      <div class="wo-btns"><button class="secondary" data-a="libero">Allenamento libero</button><button class="secondary" data-a="nuova">+ Nuova scheda</button></div>
      <section class="card wo-list">${timer}</section>`;
  }

  function ago(d) {
    const n = daysAgo(d);
    return n <= 0 ? 'oggi' : n === 1 ? 'ieri' : `${n} giorni fa`;
  }

  /** Stato di ogni pagina (esercizio): serie in modifica, serie aperta, "Modifica" dopo Fatto. Resta passando da una pagina all'altra. */
  let pages = {};
  const pageOf = (ex) => (pages[ex] ||= { sets: null, open: -1, editing: false });
  const P = () => pageOf(ui.list[ui.i]);

  /** Esercizi della scheda come pagine affiancate: si trascinano col dito, come le schermate della Home di iPhone. */
  function exView() {
    const sch = (schede || []).find((s) => s.id === ui.scheda);
    const dots = ui.list.map((id, k) => `<button class="${k === ui.i ? 'cur' : todayDoc(id) ? 'ok' : ''}" data-a="j:${k}" aria-label="${esc((EX[id] || {}).n || id)}"></button>`).join('');
    const title = sch ? `${esc(sch.name)} · <span id="wo-num">${ui.i + 1}</span>/${ui.list.length}` : 'Allenamento libero';
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${title}</button>${sch ? '<button class="wo-chip" data-a="scheda">Cambia esercizio</button>' : ''}</div>
      ${ui.list.length > 1 ? `<div class="wo-dots" id="wo-dots">${dots}</div>` : ''}
      <div class="wo-pager${ui.list.length > 1 ? ' multi' : ''}" id="wo-pager">${ui.list.map((_, k) => pageHtml(k, sch)).join('')}</div>`;
  }

  function pageHtml(k, sch) {
    const ex = ui.list[k], e = EX[ex] || { n: ex, m: '' };
    const pg = pageOf(ex);
    const piano = sch && sch.piano ? sch.piano[ex] : null;
    const t = unit(e);
    const done = todayDoc(ex);
    const saved = !!done && !pg.editing;
    if (!pg.sets) pg.sets = copy(done ? done.sets : (lastTime(ex) || { sets: primaVolta(piano) }).sets);
    const sets = saved ? done.sets : pg.sets;
    const last = lastTime(ex);
    const ref = last ? last.sets : null;
    const rows = sets.map((s, j) => {
      const r = ref && (ref[j] || ref[ref.length - 1]);
      const ck = !saved && r && s.kg !== r.kg, cr = !saved && r && s.reps !== r.reps;
      const kgCell = t === 'kg' ? `<span class="v${ck ? ' ch' : ''}">${kgf(s.kg)}<small>kg</small></span>` : '<span></span>';
      const row = `<button class="wo-set${saved ? ' done' : ''}${pg.open === j ? ' open' : ''}" data-a="o:${j}"><span class="n">${j + 1}</span>${kgCell}<span class="v${cr ? ' ch' : ''}">${s.reps}<small>${t === 'sec' ? 's' : 'rip'}</small></span><span class="n">${saved ? (done.pending ? '…' : '✓') : '›'}</span></button>`;
      if (pg.open !== j || saved) return row;
      const field = (kind, value, u, aria) => `<span class="wo-pm">
          <button data-a="${kind}-:${j}" aria-label="Meno ${aria}">−</button>
          <label class="wo-in"><input data-f="${kind}" inputmode="${kind === 'k' ? 'decimal' : 'numeric'}" value="${value}" aria-label="${aria}, tocca per scrivere" onfocus="this.select()" autocomplete="off"><em>${u}</em></label>
          <button data-a="${kind}+:${j}" aria-label="Più ${aria}">+</button></span>`;
      const kgEdit = t === 'kg' ? field('k', kgf(s.kg), 'kg', 'chili') : '';
      const repEdit = field('r', s.reps, t === 'sec' ? 's' : 'rip', t === 'sec' ? 'secondi' : 'ripetizioni');
      return `${row}<div class="wo-edit"><div class="wo-pms">${kgEdit}${repEdit}</div><p class="wo-hint">Tocca il numero per scriverlo a mano</p></div>`;
    }).join('');
    const nx = nextTodo(k);
    const btn = saved
      ? `${nx >= 0 ? `<button class="primary" data-a="j:${nx}">Prossimo: ${esc((EX[ui.list[nx]] || {}).n || '')} ›</button>` : `<button class="primary" data-a="end">${ui.list.length > 1 ? 'Fine scheda' : 'Fine'}</button>`}
         <button class="link-button" data-a="edit">Modifica</button>${done.pending ? '<p class="wo-sub wo-center">Salvato sul telefono: parte appena c\'è rete</p>' : ''}`
      : `<div class="wo-btns"><button class="secondary" data-a="add">+ Serie</button><button class="secondary" data-a="del">− Serie</button></div><button class="primary" data-a="ok">✓ Fatto</button>`;
    return `<section class="wo-page" data-k="${k}">
      <div class="wo-ex"><div class="wo-ex-name">${esc(e.n)}</div>${e.m ? `<span class="wo-pill">${esc(e.m)}</span>` : ''}${piano ? `<span class="wo-pill wo-plan">${esc(piano.s)}</span>` : ''}${piano && piano.nota ? `<span class="wo-pill">${esc(piano.nota)}</span>` : ''}</div>
      ${last ? `<section class="card wo-last"><small>Ultima volta · ${shortDay(last.day)}</small><b>${summary(last.sets, t)}</b></section>` : ''}
      <div class="wo-sets">${rows}</div>
      ${btn}
      <div class="wo-rest">${restHtml()}</div>
    </section>`;
  }

  /** Il primo esercizio non ancora fatto oggi dopo quello aperto (poi si ricomincia dall'inizio), -1 se fatti tutti. */
  function nextTodo(from = ui.i) {
    for (let d = 1; d < ui.list.length; d++) {
      const k = (from + d) % ui.list.length;
      if (!todayDoc(ui.list[k])) return k;
    }
    return -1;
  }

  /** La scheda intera: si sceglie l'esercizio, in qualsiasi ordine (le macchine non sono sempre libere). */
  function schedaView() {
    const sch = (schede || []).find((s) => s.id === ui.scheda);
    if (!sch) return listView();
    const n = doneToday(sch);
    return `<button class="wo-back" data-a="home">‹ Allenamento</button>
      <div class="wo-ex"><div class="wo-ex-name">${esc(sch.name)}</div><span class="wo-pill">${n} di ${sch.ex.length} fatti</span></div>
      <p class="wo-sub wo-intro">Scegli da quale esercizio partire: l'ordine è libero.</p>
      <section class="card wo-list">${sch.ex.map((id, k) => {
        const e = EX[id] || { n: id }, d = todayDoc(id), l = lastTime(id), pi = sch.piano ? sch.piano[id] : null;
        const info = d ? `Fatto oggi · ${summary(d.sets, unit(e))}` : [pi && pi.s, l && `ultima volta ${summary(l.sets, unit(e))}`].filter(Boolean).join(' · ');
        return `<button class="wo-row${d ? ' fatto' : ''}" data-a="j:${k}"><span class="wo-mark">${d ? '✓' : k + 1}</span><span><b>${esc(e.n)}</b><small>${esc(info)}</small></span><span class="wo-chev">›</span></button>`;
      }).join('')}</section>`;
  }

  function restHtml() {
    const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
    if (!restEnd) return `<span class="wo-rest-ic">⏱</span><b>Recupero</b><button class="wo-chip" data-a="rest">1:30 ▸</button>`;
    if (!left) return `<span class="wo-rest-ic">✓</span><b>Recupero finito</b><button class="wo-chip" data-a="stop">OK</button>`;
    const off = 126 * (1 - left / REST);
    return `<svg class="wo-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="none" stroke="var(--card-2)" stroke-width="6"/><circle cx="24" cy="24" r="20" fill="none" stroke="var(--stand)" stroke-width="6" stroke-linecap="round" stroke-dasharray="126" stroke-dashoffset="${off}" transform="rotate(-90 24 24)"/></svg>
      <span><small>Recupero</small><b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b></span><button class="wo-chip" data-a="stop">Stop</button>`;
  }

  function tickRest() {
    root.querySelectorAll('.wo-rest').forEach((el) => {
      el.innerHTML = restHtml();
      el.classList.toggle('on', !!restEnd && restEnd > Date.now());
      el.classList.toggle('end', !!restEnd && restEnd <= Date.now());
    });
    if (!restEnd || restEnd <= Date.now()) {
      clearInterval(restTimer);
      restTimer = null;
      if (restEnd && navigator.vibrate) navigator.vibrate(300);
    }
  }

  function pickView() {
    const groups = [...new Set(CATALOGO.map((e) => e.g))];
    const q = ui.q.trim().toLowerCase();
    const list = CATALOGO.filter((e) => (!ui.g || e.g === ui.g) && (!q || e.n.toLowerCase().includes(q)));
    return `<button class="wo-back" data-a="back">‹ Allenamento libero</button>
      <input id="wo-q" class="plain wo-search" placeholder="Cerca un esercizio" value="${esc(ui.q)}" autocomplete="off">
      <div class="wo-groups"><button class="${ui.g ? '' : 'on'}" data-a="g:">Tutti</button>${groups.map((g) => `<button class="${ui.g === g ? 'on' : ''}" data-a="g:${esc(g)}">${esc(g)}</button>`).join('')}</div>
      <section class="card wo-list">${list.map((e) => {
        const l = lastTime(e.id);
        return `<button class="wo-row" data-a="pick:${e.id}"><span><b>${esc(e.n)}</b><small>${esc(e.g)} · ${esc(e.m)}${l ? ` · ${summary(l.sets, unit(e))}` : ''}</small></span><span class="wo-chev">›</span></button>`;
      }).join('') || '<p class="wo-empty">Nessun esercizio</p>'}</section>
      <p class="footnote">Catalogo di esempio: quello vero delle nostre macchine arriverà più avanti.</p>`;
  }

  // ---------- Tocchi ----------

  function openEx(i, slideFrom) {
    glide = ui.view === 'ex' && slideFrom != null && slideFrom !== i ? { from: slideFrom } : null;
    ui.i = i;
    ui.view = 'ex';
  }

  function setKg(k, v) {
    if (!(v >= 0) || v > 500) return;
    v = Math.round(v * 4) / 4;
    const sets = P().sets;
    for (let j = k; j < sets.length; j++) sets[j].kg = v; // cambia anche le serie dopo, come succede di solito
  }

  root.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const page = ev.target.closest('.wo-page');
    if (page) ui.i = Number(page.dataset.k); // i tasti valgono per la pagina in cui sono
    const [cmd, arg] = a.split(/:(.*)/s);
    if (cmd === 'timer') return openTimer();
    if (cmd === 'copia') {
      copia();
      return toast('Serie copiate');
    }
    if (cmd === 'nuova') return toast('Creare le schede arriva nella prossima fase. Per ora c\'è la tua scheda A.');
    if (cmd === 'go' || cmd === 'sch') {
      const s = schede.find((y) => y.id === arg);
      if (!s) return;
      ui.scheda = s.id;
      ui.list = s.ex.slice();
      pages = {};
      const k = s.ex.findIndex((e) => !todayDoc(e));
      openEx(cmd === 'go' && k >= 0 ? k : 0);
    } else if (cmd === 'libero') {
      ui.view = 'pick';
    } else if (cmd === 'pick') {
      ui.scheda = '';
      ui.list = [arg];
      pages = {};
      openEx(0);
    } else if (cmd === 'g') {
      ui.g = arg;
    } else if (cmd === 'back') {
      ui.view = ui.view === 'ex' ? (ui.scheda ? 'scheda' : 'pick') : 'list';
    } else if (cmd === 'end' || cmd === 'home') {
      ui.view = 'list';
    } else if (cmd === 'scheda') {
      ui.view = 'scheda';
    } else if (cmd === 'j') {
      openEx(Number(arg), ui.view === 'ex' ? ui.i : null);
    } else if (cmd === 'ok') {
      save(ui.list[ui.i], P().sets);
      Object.assign(P(), { editing: false, open: -1, sets: null });
    } else if (cmd === 'edit') {
      Object.assign(P(), { editing: true, sets: copy(todayDoc(ui.list[ui.i]).sets) });
    } else if (cmd === 'add') {
      const sets = P().sets;
      sets.push({ ...sets[sets.length - 1] });
    } else if (cmd === 'del') {
      if (P().sets.length > 1) P().sets.pop();
      P().open = -1;
    } else if (cmd === 'o') {
      const k = Number(arg);
      P().open = P().open === k ? -1 : k;
    } else if (/^[kr][+-]$/.test(cmd)) {
      const k = Number(arg), d = cmd[1] === '+' ? 1 : -1, sets = P().sets;
      if (cmd[0] === 'k') setKg(k, nextKg(sets[k].kg, d));
      else {
        const step = unit(EX[ui.list[ui.i]]) === 'sec' ? 5 : 1;
        sets[k].reps = Math.max(step, Math.min(600, sets[k].reps + step * d));
      }
    } else if (cmd === 'rest') {
      restEnd = Date.now() + REST * 1000;
      if (!restTimer) restTimer = setInterval(tickRest, 250);
    } else if (cmd === 'stop') {
      restEnd = 0;
    }
    draw();
  });

  root.addEventListener('change', (ev) => {
    const f = ev.target.dataset.f, page = ev.target.closest('.wo-page');
    if (!f || !page) return;
    ui.i = Number(page.dataset.k);
    const pg = P();
    if (pg.open < 0 || !pg.sets) return;
    const v = Number(ev.target.value.replace(',', '.'));
    if (f === 'k') setKg(pg.open, v);
    else if (v >= 1 && v <= 600) pg.sets[pg.open].reps = Math.round(v);
    else return;
    draw();
  });
  // Invio sulla tastiera: conferma il numero e chiude la tastiera
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.dataset.f) ev.target.blur();
  });
  root.addEventListener('input', (ev) => {
    if (ev.target.id !== 'wo-q') return;
    ui.q = ev.target.value;
    const pos = ev.target.selectionStart;
    draw();
    const el = root.querySelector('#wo-q');
    el.focus();
    el.setSelectionRange(pos, pos);
  });

  return { start, stop, draw };
}
