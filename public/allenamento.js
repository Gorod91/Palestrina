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
/** Di quanto cambia il peso con − e +: le macchine e i cavi vanno a 1 kg, bilancieri e manubri a 2,5 (si può sempre scrivere). */
const kgStep = (e) => (e && /^(Macchina|Cavo|Cavi)/.test(e.m || '') ? 1 : 2.5);

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
  }

  function stop() {
    unsubs.forEach((u) => u());
    unsubs = [];
    key = '';
    ready = false;
    serie = [];
    serieSig = '';
    schede = null;
    Object.assign(ui, { view: 'list', sets: null, open: -1, editing: false });
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
    if (pressed || typing) later = true;
    else draw();
  }
  function flush() {
    if (!later || pressed) return;
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
    return `${hero}
      <h2 class="section">Le tue schede</h2>
      <section class="card wo-list">${other}</section>
      <div class="wo-btns"><button class="secondary" data-a="libero">Allenamento libero</button><button class="secondary" data-a="nuova">+ Nuova scheda</button></div>
      <section class="card wo-list">${timer}</section>`;
  }

  function ago(d) {
    const n = daysAgo(d);
    return n <= 0 ? 'oggi' : n === 1 ? 'ieri' : `${n} giorni fa`;
  }

  function exView() {
    const ex = ui.list[ui.i], e = EX[ex] || { n: ex, m: '' };
    const sch = (schede || []).find((s) => s.id === ui.scheda);
    const piano = sch && sch.piano ? sch.piano[ex] : null;
    const t = unit(e);
    const done = todayDoc(ex);
    const saved = !!done && !ui.editing;
    if (!ui.sets) ui.sets = copy(done ? done.sets : (lastTime(ex) || { sets: primaVolta(piano) }).sets);
    const sets = saved ? done.sets : ui.sets;
    const last = lastTime(ex);
    const dots = ui.list.map((id, k) => `<button class="${k === ui.i ? 'cur' : todayDoc(id) ? 'ok' : ''}" data-a="j:${k}" aria-label="${esc((EX[id] || {}).n || id)}"></button>`).join('');
    const ref = last ? last.sets : null;
    const rows = sets.map((s, k) => {
      const r = ref && (ref[k] || ref[ref.length - 1]);
      const ck = !saved && r && s.kg !== r.kg, cr = !saved && r && s.reps !== r.reps;
      const kgCell = t === 'kg' ? `<span class="v${ck ? ' ch' : ''}">${kgf(s.kg)}<small>kg</small></span>` : '<span></span>';
      const row = `<button class="wo-set${saved ? ' done' : ''}${ui.open === k ? ' open' : ''}" data-a="o:${k}"><span class="n">${k + 1}</span>${kgCell}<span class="v${cr ? ' ch' : ''}">${s.reps}<small>${t === 'sec' ? 's' : 'rip'}</small></span><span class="n">${saved ? (done.pending ? '…' : '✓') : '›'}</span></button>`;
      if (ui.open !== k || saved) return row;
      const step = kgStep(e);
      const field = (id, label, value, u, minus, plus, aria) => `<div class="wo-field"><span class="wo-lbl">${label}</span><span class="wo-pm">
          <button data-a="${minus}" aria-label="Meno ${aria}">−</button>
          <label class="wo-in"><input id="${id}" inputmode="${id === 'wo-kg' ? 'decimal' : 'numeric'}" value="${value}" aria-label="${aria}" onfocus="this.select()" autocomplete="off"><em>${u}</em><svg aria-hidden="true"><use href="#i-pencil"/></svg></label>
          <button data-a="${plus}" aria-label="Più ${aria}">+</button></span></div>`;
      const kgEdit = t === 'kg' ? field('wo-kg', `Peso · − e + di ${kgf(step)} kg`, kgf(s.kg), 'kg', `k-:${k}`, `k+:${k}`, 'chili') : '';
      const repEdit = field('wo-reps', t === 'sec' ? 'Secondi' : 'Ripetizioni', s.reps, t === 'sec' ? 's' : 'rip', `r-:${k}`, `r+:${k}`, t === 'sec' ? 'secondi' : 'ripetizioni');
      return `${row}<div class="wo-edit">${kgEdit}${repEdit}<p class="wo-hint">Tocca il numero per scrivere il valore che vuoi</p></div>`;
    }).join('');
    const nx = nextTodo();
    const btn = saved
      ? `${nx >= 0 ? `<button class="primary" data-a="j:${nx}">Prossimo: ${esc((EX[ui.list[nx]] || {}).n || '')} ›</button>` : `<button class="primary" data-a="end">${ui.list.length > 1 ? 'Fine scheda' : 'Fine'}</button>`}
         <button class="link-button" data-a="edit">Modifica</button>${done.pending ? '<p class="wo-sub wo-center">Salvato sul telefono: parte appena c\'è rete</p>' : ''}`
      : `<div class="wo-btns"><button class="secondary" data-a="add">+ Serie</button><button class="secondary" data-a="del">− Serie</button></div><button class="primary" data-a="ok">✓ Fatto</button>`;
    const title = sch ? `${esc(sch.name)} · ${ui.i + 1}/${ui.list.length}` : 'Allenamento libero';
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${title}</button>${sch ? '<button class="wo-chip" data-a="scheda">Cambia esercizio</button>' : ''}</div>
      ${ui.list.length > 1 ? `<div class="wo-dots">${dots}</div>` : ''}
      <div class="wo-ex"><div class="wo-ex-name">${esc(e.n)}</div>${e.m ? `<span class="wo-pill">${esc(e.m)}</span>` : ''}${piano ? `<span class="wo-pill wo-plan">${esc(piano.s)}</span>` : ''}${piano && piano.nota ? `<span class="wo-pill">${esc(piano.nota)}</span>` : ''}</div>
      <section class="card wo-last">${last ? `<small>Ultima volta · ${shortDay(last.day)}</small><b>${summary(last.sets, t)}</b>` : `<small>Prima volta</small><b>${t === 'kg' ? 'Scegli il peso toccando una serie' : 'Tocca una serie per cambiarla'}</b>`}</section>
      <div class="wo-sets">${rows}</div>
      ${btn}
      <div class="wo-rest" id="wo-rest">${restHtml()}</div>`;
  }

  /** Il primo esercizio non ancora fatto oggi dopo quello aperto (poi si ricomincia dall'inizio), -1 se fatti tutti. */
  function nextTodo() {
    for (let d = 1; d < ui.list.length; d++) {
      const k = (ui.i + d) % ui.list.length;
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
    const el = root.querySelector('#wo-rest');
    if (el) {
      el.innerHTML = restHtml();
      el.classList.toggle('on', !!restEnd && restEnd > Date.now());
      el.classList.toggle('end', !!restEnd && restEnd <= Date.now());
    }
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

  function openEx(i) {
    ui.i = i;
    ui.sets = null;
    ui.open = -1;
    ui.editing = false;
    ui.view = 'ex';
  }

  function setKg(k, v) {
    if (!(v >= 0) || v > 500) return;
    v = Math.round(v * 4) / 4;
    for (let j = k; j < ui.sets.length; j++) ui.sets[j].kg = v; // cambia anche le serie dopo, come succede di solito
  }

  root.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    const [cmd, arg] = a.split(/:(.*)/s);
    if (cmd === 'timer') return openTimer();
    if (cmd === 'nuova') return toast('Creare le schede arriva nella prossima fase. Per ora c\'è la tua scheda A.');
    if (cmd === 'go' || cmd === 'sch') {
      const s = schede.find((y) => y.id === arg);
      if (!s) return;
      ui.scheda = s.id;
      ui.list = s.ex.slice();
      const k = s.ex.findIndex((e) => !todayDoc(e));
      openEx(cmd === 'go' && k >= 0 ? k : 0);
    } else if (cmd === 'libero') {
      ui.view = 'pick';
    } else if (cmd === 'pick') {
      ui.scheda = '';
      ui.list = [arg];
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
      openEx(Number(arg));
    } else if (cmd === 'ok') {
      save(ui.list[ui.i], ui.sets);
      ui.editing = false;
      ui.open = -1;
      ui.sets = null;
    } else if (cmd === 'edit') {
      ui.editing = true;
      ui.sets = copy(todayDoc(ui.list[ui.i]).sets);
    } else if (cmd === 'add') {
      ui.sets.push({ ...ui.sets[ui.sets.length - 1] });
    } else if (cmd === 'del') {
      if (ui.sets.length > 1) ui.sets.pop();
      ui.open = -1;
    } else if (cmd === 'o') {
      const k = Number(arg);
      ui.open = ui.open === k ? -1 : k;
    } else if (/^[kr][+-]$/.test(cmd)) {
      const k = Number(arg), d = cmd[1] === '+' ? 1 : -1;
      if (cmd[0] === 'k') setKg(k, Math.max(0, ui.sets[k].kg + kgStep(EX[ui.list[ui.i]]) * d));
      else {
        const step = unit(EX[ui.list[ui.i]]) === 'sec' ? 5 : 1;
        ui.sets[k].reps = Math.max(step, Math.min(600, ui.sets[k].reps + step * d));
      }
    } else if (cmd === 'rest') {
      restEnd = Date.now() + REST * 1000;
      if (!restTimer) restTimer = setInterval(tickRest, 250);
    } else if (cmd === 'stop') {
      restEnd = 0;
    }
    draw();
    if (cmd === 'rest' || cmd === 'stop') tickRest();
  });

  root.addEventListener('change', (ev) => {
    if (ui.open < 0 || !ui.sets) return;
    const v = Number(ev.target.value.replace(',', '.'));
    if (ev.target.id === 'wo-kg') setKg(ui.open, v);
    else if (ev.target.id === 'wo-reps' && v >= 1 && v <= 600) ui.sets[ui.open].reps = Math.round(v);
    else return;
    draw();
  });
  // Invio sulla tastiera: conferma il numero e chiude la tastiera
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.target.id === 'wo-kg' || ev.target.id === 'wo-reps')) ev.target.blur();
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
