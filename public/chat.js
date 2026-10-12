// Chat del gruppo: messaggi, domanda "chi va in palestra oggi?" ed eventi automatici
// (check-in, Sudometro, premiazioni). Si aggiorna ogni 5 secondi solo mentre è aperta.

const $ = (id) => document.getElementById(id);
const POLL_EVERY = 5000;
const CHOICES = [
  ['si', 'Ci sono'],
  ['forse', 'Forse'],
  ['no', 'No'],
];

export function createChat({ api, toast, loadPhoto, openPhoto, clean, isDebug }) {
  let me = null; // { name, display }
  let v = 0; // versione dei dati in Apps Script
  let data = null; // { messages, poll, names }
  let active = false;
  let timer = null;
  let loading = false;
  const pending = []; // messaggi inviati ma non ancora salvati in Apps Script
  let pollBusy = null; // 'ask' oppure la risposta in invio ('si' | 'forse' | 'no')

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
  const answer = (choice) =>
    withPollBusy(choice, () => api('pollAnswer', { choice, time: $('poll-time') ? $('poll-time').value : '' }));

  // ---------- Interfaccia ----------

  function render() {
    if (!data) return;
    const sc = $('scroller');
    const nearBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140;
    const firstRender = !$('chat-list').dataset.rendered;
    renderPoll();
    renderList();
    if (active) {
      if (nearBottom || firstRender) scrollToBottom();
      markRead();
    }
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
    if (!poll) {
      const busy = pollBusy === 'ask';
      card.innerHTML = `
        <p class="label">Oggi</p>
        <h3>Chi va in palestra oggi?</h3>
        <p class="muted">Nessuno l'ha ancora chiesto. Con un tap lo chiedi a tutti.</p>
        <button id="poll-ask" class="primary with-bicep"${busy ? ' disabled' : ''}>${busy ? `${bicep()}Chiedo a tutti…` : 'Chiedi a tutti'}</button>`;
      card.querySelector('#poll-ask').onclick = ask;
      return;
    }
    const answered = (poll.people.find((p) => p.name === me.name) || {});
    // Risposta in invio: il pulsante scelto si colora subito, con il bicipite accanto.
    const mine = pollBusy && pollBusy !== 'ask' ? { ...answered, choice: pollBusy } : answered;
    card.innerHTML = `
      <p class="label">Chiesto da <span class="by"></span> alle ${poll.clock}</p>
      <h3>Chi va in palestra oggi?</h3>
      <div class="choices">
        ${CHOICES.map(([k, label]) => `<button data-choice="${k}" class="choice ${k}${mine.choice === k ? ' selected' : ''}"${pollBusy ? ' disabled' : ''}>${pollBusy === k ? bicep() : ''}${label}</button>`).join('')}
      </div>
      <label class="time-row">
        <span>Orario <span class="muted">(facoltativo)</span></span>
        <input id="poll-time" type="time" value="${mine.time || ''}">
      </label>
      <div class="answers"></div>
      ${isDebug() ? '<button id="poll-cancel" class="secondary small destructive">Annulla sondaggio</button>' : ''}`;
    card.querySelector('.by').textContent = poll.byDisplay;
    if (isDebug()) card.querySelector('#poll-cancel').onclick = () => remove(poll.id, 'Annullare il sondaggio di oggi con tutte le risposte?');
    card.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => answer(b.dataset.choice)));
    card.querySelector('#poll-time').onchange = () => {
      if (mine.choice) answer(mine.choice); // cambia solo l'orario
    };
    card.querySelector('.answers').append(answersList(poll));
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
        if (!mine && lastSender !== m.name) row.append(el('div', 'sender', m.display));
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
      row.classList.add('with-photo');
      const box = el('div', 'event-sudo');
      const text = el('div');
      text.append(el('p', 'event-text', `${name} ha fatto il Sudometro`));
      text.append(el('p', 'event-score', `${d.score} · ${clean(d.title)}`));
      const photo = el('div', 'event-photo');
      box.append(photo, text);
      row.append(box);
      if (d.photoId) {
        loadPhoto(d.photoId)
          .then((src) => {
            const img = new Image();
            img.src = src;
            img.alt = `Selfie di ${name}`;
            img.onclick = () => openPhoto(src, `${name} · ${d.score} · ${clean(d.title)}`);
            photo.replaceChildren(img);
          })
          .catch(() => {});
      }
    } else if (d.kind === 'weekly' || d.kind === 'monthly') {
      row.classList.add('award');
      row.append(el('p', 'event-title', d.kind === 'weekly' ? 'Premiazioni della settimana' : `Premiazioni di ${d.month}`));
      const period = d.kind === 'weekly' ? 'della settimana' : 'del mese';
      const lines = [];
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

  return {
    redraw() {
      if (data) render();
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
      if (!on) return;
      if (data) {
        render();
        scrollToBottom();
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
  // Animazione SMIL (funziona anche su Safari, che non anima "d" via CSS). Le parti hanno il colore di
  // sfondo (--bicep-bg) per coprire le linee che passano dietro.
  const t = 'dur="1.1s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1"';
  return `<svg class="bicep" viewBox="-4 -14 86 82" aria-label="Invio in corso" role="img">
    <path class="bicep-bg" d="M0 47 C4 47 7 44 19 44 C30 44 34 55 41 47 L46 56 V61 L0 61">
      <animate attributeName="d" values="M0 47 C4 47 7 44 19 44 C30 44 34 55 41 47 L46 56 V61 L0 61;M0 47 C4 47 9 26 21 26 C32 26 36 37 41 47 L46 56 V61 L0 61;M0 47 C4 47 7 44 19 44 C30 44 34 55 41 47 L46 56 V61 L0 61" ${t} />
    </path>
    <g>
      <animateTransform attributeName="transform" type="rotate" values="50 46 52;4 46 52;50 46 52" ${t} />
      <g transform="translate(5 0)">
        <path class="bicep-bg" d="M32 52 L35 27 L47 27 L50 52 A9 9 0 0 1 32 52" />
        <path d="M20 17H62" />
        <rect class="bicep-bg" x="16" y="8" width="7" height="18" rx="2.5" />
        <rect class="bicep-bg" x="59" y="8" width="7" height="18" rx="2.5" />
        <rect class="bicep-bg" x="31" y="8" width="20" height="20" rx="7" />
        <path class="bicep-finger" d="M38.5 13V23M43.5 13V23" />
      </g>
    </g>
  </svg>`;
}
