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
    // "@addome" è un circuito: sit-up, plank e barchetta di fila, ripetuti per più giri (ogni giro salvato come una serie)
    ex: ['squat', 'lat', 'spinte-manubri', 'pulley-medio', 'chest-press-sdraiato', 'curl', '@addome'],
    circuiti: { addome: { n: 'Circuito addome', ex: ['situps', 'plank', 'barchetta'], giri: 3, rec: 60 } },
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
  /** Circuito di una scheda ("@nome"), oppure null per un esercizio normale. */
  const circIn = (sch, id) => (id[0] === '@' && sch && sch.circuiti ? sch.circuiti[id.slice(1)] || null : null);
  const curSch = () => (schede || []).find((s) => s.id === ui.scheda);
  /** Fatto oggi: per un circuito, tutti i suoi esercizi salvati. */
  function isDone(id, sch = curSch()) {
    const c = circIn(sch, id);
    return c ? c.ex.every((e) => todayDoc(e)) : !!todayDoc(id);
  }
  const nameOf = (id, sch = curSch()) => (circIn(sch, id) || EX[id] || { n: id }).n;
  const lastDone = (sch) => serie.filter((s) => s.scheda === sch.id).reduce((m, s) => (s.day > m ? s.day : m), '');
  const doneToday = (sch) => sch.ex.filter((e) => (circIn(sch, e) ? isDone(e, sch) : serie.some((s) => s.ex === e && s.day === today() && s.scheda === sch.id))).length;

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
    root.innerHTML = ui.view === 'ex' ? exView() : ui.view === 'pick' ? pickView() : listView();
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
    setupAll();
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
    // "ok" anche su quello aperto: scorrendo via, la barretta resta verde se l'esercizio è fatto ("cur" ha la precedenza)
    const dots = ui.list.map((id, k) => `<button class="${k === ui.i ? 'cur' : ''}${isDone(id) ? ' ok' : ''}" data-a="j:${k}" aria-label="${esc(nameOf(id))}"></button>`).join('');
    const title = sch ? `${esc(sch.name)} · <span id="wo-num">${ui.i + 1}</span>/${ui.list.length}` : 'Allenamento libero';
    const many = ui.list.length > 1;
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${title}</button></div>
      ${many ? `<div class="wo-dots" id="wo-dots">${dots}</div>` : ''}
      <div class="wo-pager${many ? ' multi' : ''}" id="wo-pager">${ui.list.map((_, k) => pageHtml(k, sch)).join('')}</div>
      ${many ? `<div class="wo-bar"><button class="wo-all" id="wo-all"><svg viewBox="0 0 24 24" aria-hidden="true">${[3, 10, 17].map((y) => [3, 10, 17].map((x) => `<rect x="${x}" y="${y}" width="5.5" height="5.5" rx="1.6"/>`).join('')).join('')}</svg>Tutti</button></div>
      <div class="wo-sheet" id="wo-sheet" hidden><div class="wo-sheet-box"><div class="wo-grab"></div><p class="wo-sheet-hint">Tieni premuto "Tutti" e trascina il dito su un esercizio, poi lascia</p>
        <div class="wo-grid">${ui.list.map((id, k) => {
          const c = circIn(sch, id), e = EX[id] || { n: id }, d = isDone(id), pi = sch && sch.piano ? sch.piano[id] : null;
          const sub = c ? `${c.giri} giri · ${c.ex.length} esercizi` : pi ? pi.s : e.g || '';
          return `<button class="wo-tile${k === ui.i ? ' cur' : ''}${d ? ' ok' : ''}" data-a="j:${k}" data-k="${k}"><span>${d ? '✓' : k + 1}</span><b>${esc(nameOf(id))}</b><small>${esc(sub)}</small></button>`;
        }).join('')}</div></div></div>` : ''}`;
  }

  // ---------- Circuito (es. sit-up, plank e barchetta di fila, per più giri) ----------

  /** Stato del circuito di una pagina: giro in corso, numero di giri, valori di ogni esercizio, giri già fatti. */
  function circState(id, c, sch) {
    const pg = pageOf(id);
    if (!pg.circ) {
      const vals = {}, done = {};
      c.ex.forEach((e) => {
        const l = lastTime(e);
        vals[e] = l ? l.sets[0].reps : primaVolta(sch && sch.piano ? sch.piano[e] : null)[0].reps;
        done[e] = [];
      });
      pg.circ = { cur: 0, giri: c.giri, vals, done };
    }
    return pg.circ;
  }

  function circHtml(k, sch) {
    const id = ui.list[k], c = circIn(sch, id), st = circState(id, c, sch);
    const head = `<div class="wo-ex"><div class="wo-ex-name">${esc(c.n)}</div><span class="wo-pill wo-plan">${st.giri} giri</span><span class="wo-pill">recupero ${mmss(c.rec)}</span></div>`;
    if (isDone(id, sch) && !pageOf(id).rifai) {
      const nx = nextTodo(k);
      return `<section class="wo-page" data-k="${k}">${head}
        <section class="card wo-list">${c.ex.map((e) => `<div class="wo-row"><span><b>${esc(nameOf(e))}</b><small>Fatto oggi · ${summary(todayDoc(e).sets, unit(EX[e]))}</small></span><span class="wo-chev">✓</span></div>`).join('')}</section>
        ${nx < 0 ? '<button class="primary" data-a="end">Fine scheda</button>' : ''}<button class="link-button" data-a="crifai">Rifai il circuito</button></section>`;
    }
    const rounds = Array.from({ length: st.giri }, (_, g) => `<i class="${g < st.cur ? 'ok' : g === st.cur ? 'cur' : ''}">${g < st.cur ? '✓' : `Giro ${g + 1}`}</i>`).join('');
    const rows = c.ex.map((e, j) => {
      const t = unit(EX[e]), l = lastTime(e), pi = sch && sch.piano ? sch.piano[e] : null;
      const info = [pi && pi.s, l && `ultima volta ${summary(l.sets, t)}`].filter(Boolean).join(' · ');
      return `<div class="wo-cex"><span class="wo-cn">${j + 1}</span><div class="wo-cname"><b>${esc(nameOf(e))}</b><small>${esc(info)}</small></div>
        <span class="wo-pm"><button data-a="cv-:${e}" aria-label="Meno">−</button><label class="wo-in"><input data-f="c:${e}" inputmode="numeric" value="${st.vals[e]}" aria-label="${esc(nameOf(e))}, tocca per scrivere" onfocus="this.select()" autocomplete="off"><em>${t === 'sec' ? 's' : 'rip'}</em></label><button data-a="cv+:${e}" aria-label="Più">+</button></span></div>`;
    }).join('');
    return `<section class="wo-page" data-k="${k}">${head}
      <div class="wo-rounds"><button data-a="cg-" aria-label="Un giro in meno">−</button>${rounds}<button data-a="cg+" aria-label="Un giro in più">+</button></div>
      <div class="wo-cexs">${rows}</div>
      <button class="primary" data-a="cgiro">✓ Giro ${st.cur + 1} fatto</button>
      <button class="secondary wo-crun" data-a="crun">▶ Avvia circuito guidato</button>
      ${st.cur ? `<button class="link-button" data-a="csave">Salva con ${st.cur} ${st.cur === 1 ? 'giro' : 'giri'}</button>` : ''}
      <p class="wo-sub wo-center">Ogni esercizio salva un giro come una serie</p>
    </section>`;
  }

  /** Un giro finito: i valori attuali di ogni esercizio diventano la sua serie di quel giro. */
  function circRound(id) {
    const c = circIn(curSch(), id), st = pageOf(id).circ;
    if (!c || !st) return;
    c.ex.forEach((e) => st.done[e].push(st.vals[e]));
    st.cur++;
  }

  /** Salva i giri fatti (una serie per giro) e passa al prossimo esercizio della scheda. */
  function circSave(id) {
    const c = circIn(curSch(), id), st = pageOf(id).circ;
    if (!c || !st || !st.cur) return;
    c.ex.forEach((e) => save(e, st.done[e].map((v) => ({ kg: 0, reps: v }))));
    pageOf(id).circ = null;
    pageOf(id).rifai = false;
    const k = ui.list.indexOf(id), nx = nextTodo(k);
    if (nx >= 0 && nx !== k) openEx(nx, k);
  }

  // Circuito guidato a tutto schermo: sit-up (li conti tu e tocchi), plank e barchetta col 3-2-1 e il timer grande,
  // recupero azzurro tra un giro e l'altro; alla fine salva tutto.
  const run = document.createElement('div');
  run.className = 'wo-run';
  run.hidden = true;
  document.body.append(run);
  let runId = '', runPlan = [], runAt = 0, runRaf = 0;

  function circRun(id) {
    const c = circIn(curSch(), id), st = pageOf(id).circ;
    if (!c || !st) return;
    runId = id;
    runPlan = [];
    for (let g = st.cur; g < st.giri; g++) {
      c.ex.forEach((e, j) => runPlan.push({ e, g, last: j === c.ex.length - 1 }));
      if (g < st.giri - 1) runPlan.push({ rest: true, g });
    }
    runAt = 0;
    run.hidden = false;
    runRender();
  }

  // I passaggi sono pagine affiancate con lo scorrimento nativo (come gli esercizi della scheda): si trascinano col dito;
  // "fatto", "tocca per saltare" e la fine di un timer scorrono alla pagina dopo. L'ultima pagina chiude il circuito.
  const runPager = () => run.querySelector('.wo-run-pager');

  /** Contenuto di una pagina a riposo: sit-up da toccare, "Inizia" per gli esercizi a tempo, recupero pronto a partire. */
  function runPageInner(j) {
    const c = circIn(curSch(), runId), st = pageOf(runId).circ;
    if (j >= runPlan.length) return `<div class="wo-run-done">✓</div><div class="wo-big-head"><b>Fine circuito</b><small>lascia qui per salvare</small></div>`;
    const s = runPlan[j];
    if (s.rest) return `<div class="wo-big-head wo-rest-head"><b>Recupero</b><small>poi giro ${s.g + 2}</small></div>
      <button class="timer-running wo-run-rest" data-r="next"><span>${mmss(c.rec)}</span><small>tocca per saltare</small></button>`;
    if (unit(EX[s.e]) !== 'sec') return `<div class="wo-big-head"><b>${esc(nameOf(s.e))}</b><small>contale tu, poi tocca</small></div>
      <button class="wo-run-reps" data-r="next">${st.vals[s.e]}<small>ripetizioni · fatto ✓</small></button>`;
    const total = st.vals[s.e];
    return `<div class="wo-big-head"><b>${esc(nameOf(s.e))}</b><small>${mmss(total)}${total < 60 ? '"' : ''}</small></div>
      <button class="timer-start" data-r="start">Inizia</button>`;
  }

  function runTop() {
    const st = pageOf(runId).circ, s = runPlan[Math.min(runAt, runPlan.length - 1)];
    return `<div class="wo-run-steps">${runPlan.map((x, j) => `<i class="${x.rest ? 'rest ' : ''}${j < runAt ? 'ok' : j === runAt ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="wo-run-giro">${runAt >= runPlan.length ? 'Fine' : `Giro ${s.g + 1} di ${st.giri}`}</div>`;
  }

  function runRender() {
    cancelAnimationFrame(runRaf);
    run.classList.remove('rest');
    run.innerHTML = `<div class="wo-run-top">${runTop()}</div>
      <div class="wo-run-pager">${[...runPlan, null].map((_, j) => `<section class="wo-run-page" data-j="${j}">${runPageInner(j)}</section>`).join('')}</div>
      <p class="wo-run-hint">‹ scorri per il passaggio prima o dopo ›</p><button class="wo-run-stop" data-r="stop">Interrompi circuito</button>`;
    const pager = runPager();
    pager.scrollLeft = runAt * pager.clientWidth;
    pager.addEventListener('scroll', () => {
      clearTimeout(pager._t);
      pager._t = setTimeout(() => runSettle(Math.round(pager.scrollLeft / pager.clientWidth)), 110);
    }, { passive: true });
    runActivate();
  }

  /** La pagina k è arrivata al centro: i giri si chiudono (o si riaprono tornando indietro) e parte quello che serve. */
  function runSettle(k) {
    k = Math.max(0, Math.min(runPlan.length, k));
    if (k === runAt) return;
    cancelAnimationFrame(runRaf);
    const c = circIn(curSch(), runId), st = pageOf(runId).circ;
    while (runAt < k) {
      if (runPlan[runAt].last) circRound(runId);
      runAt++;
    }
    while (runAt > k) {
      runAt--;
      if (runPlan[runAt].last && st.cur > 0) {
        c.ex.forEach((e) => st.done[e].pop());
        st.cur--;
      }
    }
    if (runAt >= runPlan.length) return runFinish(c);
    runPlan.forEach((x) => (x.started = false));
    run.querySelectorAll('.wo-run-page').forEach((pg) => (pg.innerHTML = runPageInner(Number(pg.dataset.j))));
    run.querySelector('.wo-run-top').innerHTML = runTop();
    runActivate();
  }

  /** Va alla pagina dopo con lo stesso scorrimento del dito. */
  function runGoNext() {
    const pager = runPager();
    if (pager) pager.scrollTo({ left: (runAt + 1) * pager.clientWidth, behavior: 'smooth' });
  }

  /** Il recupero parte da solo; gli esercizi a tempo dopo "Inizia" (3-2-1); i sit-up aspettano il tocco. */
  function runActivate() {
    const s = runPlan[runAt];
    if (!s || !(s.rest || s.started)) return;
    const c = circIn(curSch(), runId), st = pageOf(runId).circ;
    const page = run.querySelector(`.wo-run-page[data-j="${runAt}"]`);
    const total = s.rest ? c.rec : st.vals[s.e];
    run.classList.toggle('rest', !!s.rest);
    page.innerHTML = `<div class="wo-big-head${s.rest ? ' wo-rest-head' : ''}"><b>${s.rest ? 'Recupero' : esc(nameOf(s.e))}</b><small>${s.rest ? `poi giro ${s.g + 2}` : ''}</small></div>
      <button class="timer-running${s.rest ? ' wo-run-rest' : ''}" data-r="next"><span></span><small>tocca per saltare</small></button>`;
    const d = page.querySelector('.timer-running'), n = d.querySelector('span');
    const go = Date.now() + (s.rest ? 0 : COUNTDOWN), end = go + total * 1000;
    const tick = () => {
      const now = Date.now(), counting = now < go;
      d.classList.toggle('counting', counting);
      if (counting) {
        n.textContent = String(Math.ceil((go - now) / 1000));
        d.style.setProperty('--p', '0');
      } else {
        if (now >= end) {
          if (navigator.vibrate) navigator.vibrate(200);
          return runGoNext();
        }
        n.textContent = mmss(Math.ceil((end - now) / 1000));
        d.style.setProperty('--p', String(1 - (end - now) / (total * 1000)));
      }
      runRaf = requestAnimationFrame(tick);
    };
    runRaf = requestAnimationFrame(tick);
  }

  function runFinish(c) {
    const st = pageOf(runId).circ;
    run.classList.remove('rest');
    run.innerHTML = `<div class="wo-run-done">✓</div><div class="wo-big-head"><b>Circuito fatto</b></div>
      <div class="wo-run-sum">${c.ex.map((e) => `<div>${esc(nameOf(e))}<span>${summary(st.done[e].map((v) => ({ kg: 0, reps: v })), unit(EX[e]))}</span></div>`).join('')}</div>
      <button class="primary" data-r="close">Fine · salvato</button>`;
    circSave(runId);
  }

  run.addEventListener('click', (ev) => {
    const r = ev.target.closest('[data-r]')?.dataset.r;
    if (r === 'next') runGoNext();
    if (r === 'start' && runPlan[runAt]) {
      runPlan[runAt].started = true;
      runActivate();
    }
    if (r === 'stop' || r === 'close') {
      cancelAnimationFrame(runRaf);
      run.hidden = true;
      draw();
    }
  });

  /** "▦ Tutti": tenendo premuto si apre la griglia, il dito scorre sulle tessere e lasciando si apre quella; con un tocco resta aperta. */
  function setupAll() {
    const btn = root.querySelector('#wo-all'), sheet = root.querySelector('#wo-sheet');
    if (!btn || !sheet) return;
    let t0 = 0, over = -1;
    const under = (x, y) => {
      const t = document.elementFromPoint(x, y)?.closest('.wo-tile');
      return t && sheet.contains(t) ? Number(t.dataset.k) : -1;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      t0 = Date.now();
      over = -1;
      btn.setPointerCapture(e.pointerId);
      sheet.hidden = false;
    });
    btn.addEventListener('pointermove', (e) => {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      const k = under(e.clientX, e.clientY);
      if (k === over) return;
      over = k;
      sheet.querySelectorAll('.wo-tile').forEach((t) => t.classList.toggle('hl', Number(t.dataset.k) === over));
      if (over >= 0 && navigator.vibrate) navigator.vibrate(8);
    });
    btn.addEventListener('pointerup', () => {
      if (over >= 0) {
        openEx(over); // dalla griglia si salta direttamente, senza far scorrere le pagine
        draw();
      } else if (Date.now() - t0 > 400) sheet.hidden = true; // tenuto premuto ma lasciato fuori dalle tessere
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.stopPropagation()); // l'apertura la fa già pointerdown
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.hidden = true; });
  }

  function pageHtml(k, sch) {
    if (circIn(sch, ui.list[k])) return circHtml(k, sch);
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
      ? `${nx < 0 ? `<button class="primary" data-a="end">${ui.list.length > 1 ? 'Fine scheda' : 'Fine'}</button>` : ''}
         <button class="link-button" data-a="edit">Modifica</button>${done.pending ? '<p class="wo-sub wo-center">Salvato sul telefono: parte appena c\'è rete</p>' : ''}`
      : `<div class="wo-btns"><button class="secondary" data-a="add">+ Serie</button><button class="secondary" data-a="del">− Serie</button></div><button class="primary" data-a="ok">✓ Fatto</button>`;
    return `<section class="wo-page" data-k="${k}">
      <div class="wo-ex"><div class="wo-ex-name">${esc(e.n)}</div>${e.m ? `<span class="wo-pill">${esc(e.m)}</span>` : ''}${piano ? `<span class="wo-pill wo-plan">${esc(piano.s)}</span>` : ''}${piano && piano.nota ? `<span class="wo-pill">${esc(piano.nota)}</span>` : ''}</div>
      ${last ? `<section class="card wo-last"><small>Ultima volta · ${shortDay(last.day)}</small><b>${summary(last.sets, t)}</b></section>` : ''}
      ${t === 'sec' && !saved ? `<div class="wo-tmr" data-ex="${ex}">${tmrHtml(ex, sets)}</div>` : ''}
      <div class="wo-sets">${rows}</div>
      ${btn}
      <div class="wo-rest">${restHtml()}</div>
    </section>`;
  }

  /** Il primo esercizio non ancora fatto oggi dopo quello aperto (poi si ricomincia dall'inizio), -1 se fatti tutti. */
  function nextTodo(from = ui.i) {
    for (let d = 1; d < ui.list.length; d++) {
      const k = (from + d) % ui.list.length;
      if (!isDone(ui.list[k])) return k;
    }
    return -1;
  }

  // ---------- Timer (recupero ed esercizi a tempo): uguali al timer grande ----------
  // Stesso anello (verde che cresce col tempo passato), aggiornato a ogni fotogramma; gli esercizi a tempo partono
  // dopo 3 secondi di conto alla rovescia; alla fine lo schermo pulsa come il timer addominali finché non lo tocchi.
  const COUNTDOWN = 3000;
  let tmr = { ex: '', j: 0, go: 0, end: 0, total: 0 };
  let raf = 0;
  const tmrSets = (ex) => pageOf(ex).sets || [];
  const dial = (p, inner = '') => `<span class="wo-dial" style="--p:${p}">${inner}</span>`;
  const mmss = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s));

  function restHtml() {
    if (!restEnd) return `${dial(1)}<b>Recupero</b><button class="wo-chip" data-a="rest">1:30 ▸</button>`;
    return `${dial(0)}<span><small>Recupero</small><b class="wo-rest-left">1:30</b></span><button class="wo-chip" data-a="stop">Stop</button>`;
  }

  function tmrHtml(ex, sets) {
    const j = tmr.ex === ex ? Math.min(tmr.j, sets.length - 1) : 0;
    if (tmr.ex === ex && tmr.end) {
      return `${dial(0, '<b class="wo-dial-n"></b>')}<div class="wo-tmr-txt"><small>Serie ${j + 1} di ${sets.length}</small><span>tocca Stop per annullare</span></div><button class="wo-chip" data-a="tstop">Stop</button>`;
    }
    const s = sets[j] || sets[0];
    return `<button class="wo-tmr-go" data-a="tgo:${j}"><span>▶</span>${sets.length > 1 ? `Serie ${j + 1} · ` : ''}${s ? s.reps : 0}"</button>`;
  }

  // Timer grande a tutto schermo: compare appena parte un timer (lo stesso anello del timer addominali); un tocco lo annulla
  const big = document.createElement('div');
  big.className = 'wo-big';
  big.hidden = true;
  big.innerHTML = '<div class="wo-big-head"><b></b><small></small></div><button class="timer-running" type="button"><span>0</span><small>tocca per annullare</small></button>';
  document.body.append(big);
  big.querySelector('button').addEventListener('click', () => {
    restEnd = 0;
    tmr.end = 0;
    tickRest();
  });

  /** Ridisegna i riquadri dei timer (all'avvio, allo stop, alla fine); il conto lo aggiorna frame(). */
  function tickRest() {
    big.hidden = !(restEnd || tmr.end);
    if (!big.hidden) {
      const e = EX[tmr.ex] || {};
      big.querySelector('.wo-big-head b').textContent = tmr.end ? e.n || '' : 'Recupero';
      big.querySelector('.wo-big-head small').textContent = tmr.end ? `Serie ${tmr.j + 1} di ${tmrSets(tmr.ex).length}` : '';
      big.classList.toggle('rest', !tmr.end); // il recupero è azzurro
    }
    root.querySelectorAll('.wo-rest').forEach((el) => {
      el.innerHTML = restHtml();
      el.classList.toggle('on', !!restEnd);
    });
    root.querySelectorAll('.wo-tmr').forEach((el) => {
      el.innerHTML = tmrHtml(el.dataset.ex, tmrSets(el.dataset.ex));
      el.classList.toggle('on', tmr.ex === el.dataset.ex && !!tmr.end);
    });
    cancelAnimationFrame(raf);
    if (restEnd || tmr.end) raf = requestAnimationFrame(frame);
  }

  function frame() {
    const now = Date.now();
    const bd = big.querySelector('button'), bn = bd.querySelector('span');
    if (restEnd && !tmr.end) {
      const left = Math.max(0, restEnd - now);
      bd.classList.remove('counting');
      bd.style.setProperty('--p', String(1 - left / (REST * 1000)));
      bn.textContent = mmss(Math.ceil(left / 1000));
    }
    if (tmr.end) {
      const counting = now < tmr.go, left = Math.max(0, counting ? tmr.go - now : tmr.end - now);
      bd.classList.toggle('counting', counting);
      bd.style.setProperty('--p', counting ? '0' : String(1 - left / (tmr.total * 1000)));
      bn.textContent = mmss(Math.ceil(left / 1000));
    }
    if (restEnd) {
      if (now >= restEnd) return finish('rest');
      const left = restEnd - now;
      root.querySelectorAll('.wo-rest .wo-dial').forEach((d) => d.style.setProperty('--p', String(1 - left / (REST * 1000))));
      root.querySelectorAll('.wo-rest-left').forEach((b) => (b.textContent = mmss(Math.ceil(left / 1000))));
    }
    if (tmr.end) {
      if (now >= tmr.end) return finish('tmr');
      const counting = now < tmr.go;
      const left = counting ? tmr.go - now : tmr.end - now;
      root.querySelectorAll(`.wo-tmr[data-ex="${tmr.ex}"] .wo-dial`).forEach((d) => {
        d.classList.toggle('counting', counting);
        d.style.setProperty('--p', counting ? '0' : String(1 - left / (tmr.total * 1000)));
        const n = d.querySelector('.wo-dial-n');
        if (n) n.textContent = mmss(Math.ceil(left / 1000));
      });
    }
    raf = requestAnimationFrame(frame);
  }

  function finish(which) {
    if (which === 'rest') restEnd = 0;
    else {
      tmr.end = 0;
      tmr.j = Math.min(tmr.j + 1, Math.max(0, tmrSets(tmr.ex).length - 1)); // pronta la serie dopo
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const alarm = document.getElementById('timer-alarm'); // lo stesso lampeggio del timer addominali
    if (alarm) alarm.hidden = false;
    tickRest();
  }

  // Tornando nell'app dopo la fine di un timer: il lampeggio parte subito
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (restEnd || tmr.end)) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  });

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
    let a = ev.target.closest('[data-a]')?.dataset.a;
    // il recupero parte toccando la barra in qualsiasi punto (fermo; mentre conta c'è il tasto Stop)
    if (!a && ev.target.closest('.wo-rest') && !restEnd) a = 'rest';
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
      const k = s.ex.findIndex((e) => !isDone(e, s));
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
      ui.view = ui.view === 'ex' && !ui.scheda ? 'pick' : 'list';
    } else if (cmd === 'end' || cmd === 'home') {
      ui.view = 'list';
    } else if (cmd === 'j') {
      openEx(Number(arg), ui.view === 'ex' && !ev.target.closest('.wo-sheet') ? ui.i : null); // dalla griglia senza scorrimento
    } else if (cmd === 'ok') {
      save(ui.list[ui.i], P().sets);
      Object.assign(P(), { editing: false, open: -1, sets: null });
      const nx = nextTodo(ui.i); // un solo tocco: si passa subito al prossimo esercizio da fare
      if (nx >= 0) openEx(nx, ui.i);
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
      if (unit(EX[ui.list[ui.i]]) === 'sec' && !tmr.end) tmr = { ...tmr, ex: ui.list[ui.i], j: k };
    } else if (/^[kr][+-]$/.test(cmd)) {
      const k = Number(arg), d = cmd[1] === '+' ? 1 : -1, sets = P().sets;
      if (cmd[0] === 'k') setKg(k, nextKg(sets[k].kg, d));
      else {
        const step = unit(EX[ui.list[ui.i]]) === 'sec' ? 5 : 1;
        sets[k].reps = Math.max(step, Math.min(600, sets[k].reps + step * d));
      }
    } else if (cmd === 'cg-' || cmd === 'cg+') {
      const st = P().circ;
      if (st) st.giri = Math.max(Math.max(1, st.cur), Math.min(8, st.giri + (cmd === 'cg+' ? 1 : -1)));
    } else if (cmd === 'cv-' || cmd === 'cv+') {
      const st = P().circ, step = unit(EX[arg]) === 'sec' ? 5 : 1;
      if (st) st.vals[arg] = Math.max(step, Math.min(600, st.vals[arg] + (cmd === 'cv+' ? step : -step)));
    } else if (cmd === 'cgiro') {
      const id = ui.list[ui.i];
      circRound(id);
      const st = P().circ;
      if (st && st.cur >= st.giri) circSave(id);
    } else if (cmd === 'csave') {
      circSave(ui.list[ui.i]);
    } else if (cmd === 'crun') {
      circRun(ui.list[ui.i]);
      return;
    } else if (cmd === 'crifai') {
      Object.assign(P(), { circ: null, rifai: true }); // si rifà da capo; i giri salvati restano finché non si salvano i nuovi
    } else if (cmd === 'tgo') {
      const ex = ui.list[ui.i], sets = P().sets || [];
      const j = Math.max(0, Math.min(Number(arg) || 0, sets.length - 1));
      const sec = (sets[j] || {}).reps || 30;
      const go = Date.now() + COUNTDOWN; // 3, 2, 1 come il timer grande
      tmr = { ex, j, go, end: go + sec * 1000, total: sec };
    } else if (cmd === 'tstop') {
      tmr.end = 0;
    } else if (cmd === 'rest') {
      restEnd = Date.now() + REST * 1000;
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
    if (f.startsWith('c:')) { // valore di un esercizio del circuito
      const v = Math.round(Number(ev.target.value.replace(',', '.')));
      if (pg.circ && v >= 1 && v <= 600) pg.circ.vals[f.slice(2)] = v;
      return draw();
    }
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

  /** Impostazioni → "Segna l'allenamento di oggi come non fatto": cancella le serie salvate oggi. Restituisce quante. */
  async function resetToday() {
    if (!x || !me) throw new Error('Allenamento non collegato');
    const { fs, db } = x;
    const mine = serie.filter((s) => s.day === today());
    await Promise.all(mine.map((s) => fs.deleteDoc(fs.doc(db, pfx + 'serie', s.id))));
    pages = {};
    draw();
    return mine.length;
  }

  return { start, stop, draw, resetToday };
}
