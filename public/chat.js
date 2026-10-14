// Chat del gruppo: messaggi, domanda "chi va in palestra oggi?" ed eventi automatici
// (check-in, Sudometro, premiazioni). Si aggiorna ogni 5 secondi solo mentre è aperta.

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

export function createChat({ api, toast, photoPair, clean, isDebug, isKing, crown, openNews }) {
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

  // ---------- Dati ----------

  async function load(force = false) {
    if (loading || !me) return;
    loading = true;
    try {
      apply(await api('chat', { v: force ? -1 : v }));
    } catch (err) {
      if (force) toast(`Chat non disponibile: ${err.message}`);
    } finally {
      loading = false;
    }
  }

  // Ultima chat scaricata, tenuta sul telefono: all'apertura si vede subito, poi si aggiorna
  const cacheKey = () => `palestrina.chatCache.${me ? me.name : ''}${localStorage.getItem('palestrina.testMode') === 'true' ? '.prova' : ''}`;
  function saveCache(r) {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ day: new Date().toDateString(), r }));
    } catch { /* storage pieno o non disponibile */ }
  }
  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey()));
      // di un altro giorno: i giorni della pianificazione sono cambiati, meglio non mostrarla
      return c && c.day === new Date().toDateString() ? c.r : null;
    } catch {
      return null;
    }
  }

  function apply(r) {
    if (!r || r.same) return;
    if (outbox.length || sending || asking || sfidaSending) return; // azioni ancora da inviare: vale quello che vede l'utente
    v = r.v;
    data = r;
    saveCache(r);
    render();
  }

  async function send(text) {
    const t = text.trim();
    if (!t) return;
    $('chat-input').value = '';
    autosize();
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
      toast(err.message);
    }
  }

  // Modalità debug: cancella un messaggio o annulla la domanda di oggi.
  async function remove(id, question) {
    if (!confirm(question)) return;
    try {
      const r = await api('chatDelete', { id });
      v = -1;
      apply(r);
      toast('Cancellato');
    } catch (err) {
      toast(err.message);
    }
  }

  function delButton(id) {
    const b = el('button', 'del', '×');
    b.type = 'button';
    b.setAttribute('aria-label', 'Cancella');
    b.onclick = () => remove(id, 'Cancellare questo messaggio per tutti?');
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
    asking++;
    try {
      const r = await api('pollAsk', { day });
      asking--;
      v = -1;
      apply(r);
      toast('Domanda mandata a tutti');
    } catch (err) {
      asking--;
      toast(err.message);
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
      try {
        last = await api('planSet', job);
      } catch (err) {
        toast(err.message);
        outbox.length = 0;
        sending = false;
        v = -1;
        load(true); // torna ai dati veri
        return;
      }
    }
    sending = false;
    if (last) {
      v = -1;
      apply(last);
    }
  }

  // Risposta per un giorno; ritoccare la risposta già data la toglie.
  function answer(choice, current, time, day = selectedDay()) {
    const c = choice === current ? '' : choice;
    setLocal(day, c, time);
    renderPoll(true);
    queuePlan(day, c, c ? time : '');
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
          ${CHOICES.map(([k, l]) => `<button data-choice="${k}" class="choice ${k}${mine.choice === k ? ' selected' : ''}">${l}</button>`).join('')}
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
        renderPoll(true);
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
      queuePlan(day, c, t);
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
    btns.querySelectorAll('button').forEach((b) => b.classList.toggle('selected', mine.choice === b.dataset.evChoice));
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
    listRenders++;
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
          const sender = el('div', 'sender', m.display);
          if (isKing(m.name)) sender.insertAdjacentHTML('beforeend', crown);
          row.append(sender);
        }
        const bubble = el('div', 'bubble', m.text);
        bubble.append(el('span', 'time', m.time));
        if (isDebug()) bubble.append(delButton(m.id));
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
  // Animazioni solo quando qualcosa cambia davvero (la lista si ridisegna a ogni aggiornamento):
  // ultimo stato visto di ogni card, per id.
  let listRenders = 0;
  const seen = {};
  /** Classe di animazione per una card: entra (nuova), cambiata, vinta (appena conclusa). */
  function motion(key, sig, state) {
    const prev = seen[key];
    seen[key] = { sig, state };
    if (!prev) return listRenders > 1 ? 'enter' : '';
    if (prev.state === 'aperta' && state === 'conclusa') return 'won';
    return prev.sig !== sig ? 'changed' : '';
  }
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
      toast(err.message);
    }
  }

  function sfidaCard(d) {
    const s = (data.sfide || []).find((x) => x.id === d.id);
    const row = el('div', 'event sfida');
    if (s) {
      const m = motion(`sfida:${s.id}`, JSON.stringify([s.people, s.winner, s.noWinner, s.invited.length]), s.state);
      if (m) row.classList.add(m);
    }
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
      if (s.noWinner) row.append(el('p', 'event-text', 'Vincitore contestato due volte: vale solo la partecipazione.'));
      else if (s.winner) {
        const conf = s.winner.conf ? ` · confermato da ${s.winner.conf}` : ' · da confermare';
        row.append(el('p', 'sfida-res', `Ha vinto ${s.winner.display} (dice ${s.winner.byDisplay})${conf}`));
        if (amIn && !s.winner.conf && s.winner.by !== me.name) row.append(confirmBtns('__winner'));
      } else if (amIn && ins.length >= 2) {
        row.append(el('p', 'event-text', s.winnerContests ? 'Vincitore contestato: dichiaratelo di nuovo. Chi ha vinto?' : 'Finita? Chi ha vinto?'));
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
    if (motion(`fine:${d.id}`, '', 'conclusa') === 'enter') row.classList.add('won');
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
      text.append(el('p', 'event-score', `${d.score} · ${clean(d.title)}`));
      if (d.photoId) box.append(photoPair(d.photoId, (data.refPhotos || {})[m.name], `${name} · ${d.score} · ${clean(d.title)}`));
      box.append(text);
      row.append(box);
    } else if (d.kind === 'achievement') {
      row.classList.add('award');
      row.append(el('p', 'event-title', 'Medaglia vinta'));
      row.append(el('p', 'event-text', `${name}: ${d.title} (+${d.pts} punti)`));
    } else if (d.kind === 'news') {
      // Novità sbloccate: le slide si aprono a tutto schermo
      row.classList.add('award', 'news');
      if (motion(`news:${m.id}`, '', '') === 'enter') row.classList.add('enter');
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
      if (d.king) lines.push(`Re del mese: ${d.king.names.map(who).join(', ')} (${d.king.total} punti)`);
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
    if (active && document.visibilityState === 'visible') load();
  }

  // ---------- API per app.js ----------

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    send($('chat-input').value);
  });
  $('chat-input').addEventListener('input', autosize);
  $('scroller').addEventListener('scroll', () => active && updateDown(), { passive: true });
  $('chat-down').addEventListener('click', () => {
    const sc = $('scroller');
    sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
  });

  return {
    redraw() {
      if (data) render();
    },
    reload() {
      load(true);
    },
    setUser(user) {
      if (me && me.name === user.name) return;
      me = user;
      v = 0;
      data = null;
      $('chat-list').innerHTML = '';
      delete $('chat-list').dataset.rendered;
      const cached = readCache();
      if (cached) {
        // chat dell'ultima volta subito pronta; la versione fa sì che il server mandi solo le novità
        data = cached;
        v = cached.v;
        render();
      }
    },
    /** Pallino "devi rispondere" anche prima che la chat sia caricata (dallo stato generale). */
    updatePending(plans) {
      if (!data || !data.plans) updatePending(plans);
    },
    /** Carica la chat di nascosto (all'apertura dell'app), così il tab si apre già pieno. */
    preload() {
      if (!active) load(false); // con la chat già in memoria il server risponde solo se ci sono novità
    },
    setActive(on) {
      active = on;
      clearInterval(timer);
      if (!on) {
        $('chat-down').hidden = true;
        return;
      }
      if (data) {
        render();
        scrollToBottom();
      } else {
        $('chat-list').innerHTML = `<div class="loading">${bicep()}<p>Carico la chat…</p></div>`;
      }
      load(!data);
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
      clearInterval(timer);
      me = null;
      data = null;
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
