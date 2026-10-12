// Chat del gruppo: messaggi, domanda "chi va in palestra oggi?" ed eventi automatici
// (check-in, Sudometro, premiazioni). Si aggiorna ogni 5 secondi solo mentre è aperta.

const $ = (id) => document.getElementById(id);
const POLL_EVERY = 5000;
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const CHOICES = [
  ['si', 'Ci sono'],
  ['forse', 'Forse'],
  ['no', 'No'],
];

export function createChat({ api, toast, photoPair, clean, isDebug, isKing, crown }) {
  let me = null; // { name, display }
  let v = 0; // versione dei dati in Apps Script
  let data = null; // { messages, poll, names }
  let active = false;
  let timer = null;
  let loading = false;
  const pending = []; // messaggi inviati ma non ancora salvati in Apps Script
  let pollBusy = null;
  let selDay = ''; // giorno scelto nella fila dei giorni del sondaggio
  // Risposte al sondaggio: si vedono subito e partono in ordine in sottofondo (l'ultima vince)
  const outbox = [];
  let sending = false;
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

  function apply(r) {
    if (!r || r.same) return;
    if (outbox.length || sending) return; // risposte ancora da inviare: vale quello che vede l'utente
    v = r.v;
    data = r;
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

  async function withPollBusy(what, call) {
    if (pollBusy) return;
    pollBusy = what;
    renderPoll(true);
    try {
      const r = await call();
      pollBusy = null;
      v = -1;
      apply(r);
    } catch (err) {
      pollBusy = null;
      renderPoll(true);
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

  const ask = () => withPollBusy('ask', () => api('pollAsk'));

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

  // Risposta per il giorno scelto nella fila dei giorni; ritoccare la risposta già data la toglie.
  function answer(choice, current, time) {
    const day = selectedDay();
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
    const poll = data && data.poll;
    const plans = (data && data.plans) || [];
    const day = selectedDay();
    const isToday = !plans.length || day === plans[0].day;
    const plan = plans.find((d) => d.day === day) || { people: poll ? poll.people : [] };
    const answered = plan.people.find((p) => p.name === me.name) || {};
    // Risposta in invio: il pulsante scelto si colora subito, con il bicipite accanto.
    const mine = answered;
    const askBusy = pollBusy === 'ask';
    const side = !isToday
      ? ''
      : poll
        ? `<span class="muted">da <span class="by"></span> · ${poll.clock}</span>`
        : `<button id="poll-ask" class="ask-link with-bicep"${askBusy ? ' disabled' : ''}>${askBusy ? `${bicep()}Chiedo…` : 'Chiedi a tutti'}</button>`;
    // Fila dei prossimi 7 giorni, con quanti ci vanno
    const strip = plans
      .map((d, i) => {
        const date = new Date(d.day + 'T12:00:00');
        const n = d.people.filter((p) => p.choice === 'si').length;
        const mineDay = d.people.find((p) => p.name === me.name) || {};
        return `<button class="pday${d.day === day ? ' on' : ''}${mineDay.choice ? ' ' + mineDay.choice : ''}" data-day="${d.day}">${i ? WEEKDAYS[date.getDay()] : 'Oggi'}<b>${date.getDate()}</b><i>${n || '·'}</i></button>`;
      })
      .join('');
    card.innerHTML = `
      ${strip ? `<div class="pdays">${strip}</div>` : ''}
      <div class="choices">
        ${CHOICES.map(([k, label]) => `<button data-choice="${k}" class="choice ${k}${mine.choice === k ? ' selected' : ''}">${label}</button>`).join('')}
        <label class="time-wrap${mine.time ? ' filled' : ''}"><input id="poll-time" type="time" value="${mine.time || ''}" aria-label="Orario (facoltativo)"><span>Orario</span></label>
      </div>
      <p class="poll-names"></p>`;
    card.querySelectorAll('[data-day]').forEach((b) => {
      b.onclick = () => {
        selDay = b.dataset.day;
        renderPoll(true);
      };
    });
    card.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => answer(b.dataset.choice, answered.choice, answered.time || '')));
    // Su iPhone "change" arriva a ogni giro della rotella e "blur" non sempre: si salva in silenzio poco dopo
    // l'ultima modifica, senza ridisegnare la casella mentre la rotella è aperta (si chiuderebbe).
    // Con un orario e nessuna risposta vale "Ci sono".
    const timeInput = card.querySelector('#poll-time');
    timeInput.oninput = () => timeInput.parentNode.classList.toggle('filled', !!timeInput.value);
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
      const c = answered.choice || 'si';
      setLocal(day, c, t);
      queuePlan(day, c, t);
      if (!focused()) renderPoll(true);
    };
    timeInput.onchange = () => {
      clearTimeout(timer);
      timer = setTimeout(saveTime, 600);
    };
    timeInput.onblur = () => setTimeout(() => {
      saveTime();
      renderPoll(true); // aggiorna nomi e pulsanti rimasti indietro mentre la rotella era aperta
    }, 0);
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
    // Per oggi: chi ha fatto la domanda, oppure "Chiedi a tutti"
    if (side) {
      names.insertAdjacentHTML('beforeend', `<span class="poll-side">${side}</span>`);
      if (poll) names.querySelector('.by').textContent = poll.byDisplay;
      if (names.querySelector('#poll-ask')) names.querySelector('#poll-ask').onclick = ask;
    }
    if (isDebug() && poll && isToday) {
      const cancel = el('button', 'poll-cancel', 'Annulla');
      cancel.type = 'button';
      cancel.onclick = () => remove(poll.id, 'Annullare il sondaggio di oggi con tutte le risposte?');
      names.append(cancel);
    }
  }

  function renderList() {
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
      const ev = eventRow(m);
      if (isDebug() && ev.classList.contains('event')) ev.append(delButton(m.id));
      list.append(ev);
    });
    if (!data.messages.length && !pending.length) list.append(el('p', 'empty', 'Ancora nessun messaggio. Scrivi tu il primo.'));
    showPending();
  }

  function eventRow(m) {
    const row = el('div', 'event');
    const d = m.data || {};
    const name = m.display || who(m.name);
    if (m.type === 'poll') {
      row.append(el('p', 'event-text', `${name} ha chiesto chi va in palestra oggi`));
    } else if (d.kind === 'checkin') {
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
