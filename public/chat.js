// Chat del gruppo: messaggi, domanda "chi va in palestra oggi?" ed eventi automatici
// (check-in, Sudometro, premiazioni). Si aggiorna ogni 5 secondi solo mentre è aperta.

const $ = (id) => document.getElementById(id);
const POLL_EVERY = 5000;
const CHOICES = [
  ['si', 'Ci sono'],
  ['forse', 'Forse'],
  ['no', 'No'],
];

export function createChat({ api, toast, loadPhoto, clean }) {
  let me = null; // { name, display }
  let v = 0; // versione dei dati in Apps Script
  let data = null; // { messages, poll, names }
  let active = false;
  let timer = null;
  let loading = false;

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
    try {
      apply(await api('chatSend', { text: t }));
    } catch (err) {
      $('chat-input').value = t;
      toast(err.message);
    }
  }

  async function ask() {
    try {
      apply(await api('pollAsk'));
    } catch (err) {
      toast(err.message);
    }
  }

  async function answer(choice) {
    try {
      apply(await api('pollAnswer', { choice, time: $('poll-time') ? $('poll-time').value : '' }));
    } catch (err) {
      toast(err.message);
    }
  }

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

  function renderPoll() {
    const card = $('poll-card');
    if (document.activeElement && document.activeElement.id === 'poll-time') return; // non disturbare chi sta scrivendo l'orario
    const poll = data.poll;
    if (!poll) {
      card.innerHTML = `
        <p class="label">Oggi</p>
        <h3>Chi va in palestra oggi?</h3>
        <p class="muted">Nessuno l'ha ancora chiesto. Con un tap lo chiedi a tutti.</p>
        <button id="poll-ask" class="primary">Chiedi a tutti</button>`;
      card.querySelector('#poll-ask').onclick = ask;
      return;
    }
    const mine = poll.people.find((p) => p.name === me.name) || {};
    card.innerHTML = `
      <p class="label">Chiesto da <span class="by"></span> alle ${poll.clock}</p>
      <h3>Chi va in palestra oggi?</h3>
      <div class="choices">
        ${CHOICES.map(([k, label]) => `<button data-choice="${k}" class="choice ${k}${mine.choice === k ? ' selected' : ''}">${label}</button>`).join('')}
      </div>
      <label class="time-row">
        <span>Orario <span class="muted">(facoltativo)</span></span>
        <input id="poll-time" type="time" value="${mine.time || ''}">
      </label>
      <div class="answers"></div>`;
    card.querySelector('.by').textContent = poll.byDisplay;
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
        row.append(bubble);
        list.append(row);
        lastSender = m.name;
        return;
      }
      lastSender = '';
      list.append(eventRow(m));
    });
    if (!data.messages.length) list.append(el('p', 'empty', 'Ancora nessun messaggio. Scrivi tu il primo.'));
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
