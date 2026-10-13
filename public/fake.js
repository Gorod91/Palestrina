// Dati fittizi per gli utenti debug: riempiono classifiche, chat e foto per vedere l'app "piena"
// senza toccare il foglio. Si attivano da Altro → Sviluppatore.

const FRIENDS = [
  { name: 'Giulia', goal: 3, color: '#ff9f0a' },
  { name: 'Luca', goal: 2, color: '#30d158' },
  { name: 'Sara', goal: 3, color: '#bf5af2' },
  { name: 'Paolo', goal: 2, color: '#64d2ff' },
  { name: 'Marta', goal: 4, color: '#ff375f' },
];

const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayStr(d);
};
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Stato fittizio costruito attorno all'utente vero (nome, impostazioni e permessi restano i suoi). */
export function fakeState(real) {
  const me = real.me;
  const people = [{ name: me.name, display: me.display, goal: me.goal || 3, color: '#a6ff00' }, ...FRIENDS.map((f) => ({ ...f, display: f.name }))];
  const counts = [2, 3, 1, 2, 0, 4];
  const streaks = [2, 5, 0, 1, 0, 3];
  const now = new Date();
  const month = MONTHS[now.getMonth()];
  const prev = (k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
  };
  const refPhotos = Object.fromEntries(people.map((p) => [p.name, `fake-fresh-${p.name}`]));
  const scores = [72, 88, 45, 61, 0, 93];
  const titles = ['Pomodoro maturo', 'Fontana di Trevi', 'Lievemente umido', 'Doccia necessaria', '', 'Sauna finlandese'];

  const detail = (i) => {
    const pres = [9, 12, 5, 8, 2, 14][i];
    const d = [{ key: 'presenza', label: 'Presenze', count: pres, pts: pres * 10 }];
    if (i !== 4) d.push({ key: 'amici', label: 'Bonus amici', count: [3, 5, 1, 2, 0, 6][i], pts: [3, 5, 1, 2, 0, 6][i] * 3 });
    if (scores[i]) d.push({ key: 'sudometro', label: 'Sudometro', count: [3, 4, 1, 2, 0, 5][i], pts: [7, 11, 2, 5, 0, 14][i] });
    if (streaks[i] > 1) d.push({ key: 'serie', label: 'Settimane di fila', count: 2, pts: Math.min(5 * streaks[i], 20) });
    if (i === 2) d.push({ key: 'rientro', label: 'Rientro (vale doppio)', count: 1, pts: 10 });
    if (i === 3) d.push({ key: 'bidone', label: 'Bidone', count: 1, pts: -10 }, { key: 'avviso', label: 'Check-in senza avvisare', count: 2, pts: -6 });
    if ([1, 5].includes(i)) d.push({ key: 'mattiniero', label: 'Mattiniero', count: 1, pts: 10, achievement: true });
    if ([1, 5].includes(i)) d.push({ key: 'branco', label: 'Branco', count: 1, pts: 10, achievement: true });
    if (i === 5) d.push({ key: 'maiSaltato', label: 'Mai saltato', count: 1, pts: 20, achievement: true });
    if (i === 5) d.push({ key: 'pomodoro', label: 'Pomodoro del mese', count: 1, pts: 10, achievement: true });
    return d;
  };

  return {
    ...real,
    me: {
      ...me,
      checkedInToday: false,
      sudometroToday: { score: scores[0], title: titles[0], photoId: `fake-sweat-${me.name}` },
      reference: { ...(me.reference || { features: { redness: 0, shine: 0 } }), photoId: `fake-fresh-${me.name}` },
    },
    refPhotos,
    plans: [0, 1, 2, 3, 4, 5, 6].map((n) => ({
      day: daysAgo(-n),
      // giorni con la domanda aperta (gli altri sono "chiusi")
      poll: [0, 1, 3, 4].includes(n) ? { id: '', by: ['Giulia', 'Luca', '', 'Marta', 'Sara'][n] || 'Giulia', byDisplay: ['Giulia', 'Luca', '', 'Marta', 'Sara'][n] || 'Giulia', clock: '08:12' } : null,
      people: people.map((p, i) => {
        const pattern = [
          ['si', 'si', '', '', 'si', '', ''],
          ['si', '', 'si', 'si', '', '', ''],
          ['forse', 'si', '', 'si', '', 'si', ''],
          ['no', '', '', 'si', '', '', ''],
          [null, '', 'forse', '', '', '', 'si'],
          ['si', '', 'si', '', 'si', '', ''],
        ][i];
        const c = [0, 1, 3, 4].includes(n) ? pattern[n] || null : null;
        return { name: p.name, display: p.display, choice: c, time: c === 'si' ? ['18:30', '19:00', '18:00', '18:30', '19:30', '18:30'][i] : '', arrived: n === 0 && i === 5 };
      }),
    })),
    poll: {
      id: 'fake-poll',
      by: 'Giulia',
      byDisplay: 'Giulia',
      clock: '08:12',
      people: people.map((p, i) => ({
        name: p.name,
        display: p.display,
        choice: ['si', 'si', 'forse', 'no', null, 'si'][i],
        time: ['18:30', '19:00', '', '', '', '18:30'][i],
        arrived: i === 5,
      })),
    },
    chatMeta: [],
    week: {
      start: real.week ? real.week.start : daysAgo(now.getDay() ? now.getDay() - 1 : 6),
      ranking: people
        .map((p, i) => ({ name: p.name, display: p.display, goal: p.goal, count: counts[i], streak: streaks[i] }))
        .sort((a, b) => b.count - a.count || b.streak - a.streak),
      pomodoro: { name: 'Marta', display: 'Marta', score: 93 },
      sudometro: people
        .map((p, i) => ({ name: p.name, display: p.display, day: daysAgo(i % 4), score: scores[i], title: titles[i], photoId: `fake-sweat-${p.name}` }))
        .filter((r) => r.score)
        .sort((a, b) => b.score - a.score),
    },
    points: {
      month,
      ranking: people
        .map((p, i) => {
          const d = detail(i);
          return { name: p.name, display: p.display, total: d.reduce((a, g) => a + g.pts, 0), detail: d };
        })
        .sort((a, b) => b.total - a.total),
    },
    albo: [
      { ...prev(3), names: ['Luca'], total: 142, displays: ['Luca'] },
      { ...prev(2), names: ['Giulia', 'Marta'], total: 168, displays: ['Giulia', 'Marta'] },
      { ...prev(1), names: ['Marta'], total: 201, displays: ['Marta'] },
    ],
  };
}

/** Chat fittizia degli ultimi giorni. */
export function fakeChat(me) {
  const names = Object.fromEntries([[me.name, me.display], ...FRIENDS.map((f) => [f.name, f.name])]);
  const msgs = [];
  let id = 0;
  const add = (day, time, name, type, extra) => msgs.push({ id: `fake${String(++id).padStart(3, '0')}`, day, time, name, display: name ? names[name] : '', type, text: '', data: null, ...extra });
  add(daysAgo(2), '18:05', 'Marta', 'event', { data: { kind: 'checkin', count: 3, goal: 4 } });
  add(daysAgo(2), '18:20', 'Luca', 'event', { data: { kind: 'checkin', count: 2, goal: 2 } });
  add(daysAgo(2), '18:21', 'Luca', 'msg', { text: 'Chi c\'è stasera? Panca libera' });
  add(daysAgo(2), '18:40', me.name, 'msg', { text: 'Arrivo tra 20 minuti' });
  add(daysAgo(2), '19:30', 'Marta', 'event', { data: { kind: 'sudometro', score: 93, title: 'Sauna finlandese', photoId: 'fake-sweat-Marta' } });
  add(daysAgo(1), '07:45', 'Giulia', 'event', { data: { kind: 'achievement', title: 'Mattiniero', pts: 10 } });
  add(daysAgo(1), '07:46', 'Giulia', 'msg', { text: 'Allenamento all\'alba, chi mi batte?' });
  add(daysAgo(1), '12:10', 'Paolo', 'msg', { text: 'Io stasera salto, gamba ko' });
  add(daysAgo(0), '08:12', 'Giulia', 'poll', {});
  add(daysAgo(0), '08:30', 'Sara', 'msg', { text: 'Forse passo verso le 19' });
  add(daysAgo(0), '09:02', 'Marta', 'event', { data: { kind: 'checkin', count: 4, goal: 4 } });
  add(daysAgo(0), '09:05', 'Marta', 'msg', { text: 'Obiettivo della settimana fatto' });
  const st = fakeState({ me, week: null });
  return { v: 1, messages: msgs, names, poll: st.poll, plans: st.plans, refPhotos: st.refPhotos };
}

/** Foto fittizia (SVG) per gli id "fake-fresh-Nome" e "fake-sweat-Nome". */
export function fakePhoto(id) {
  const sweaty = id.startsWith('fake-sweat-');
  const name = id.replace(/^fake-(fresh|sweat)-/, '');
  const f = FRIENDS.find((x) => x.name === name);
  const bg = f ? f.color : '#a6ff00';
  const skin = sweaty ? '#e8846f' : '#f1c7a8';
  const drops = sweaty
    ? '<path d="M70 70 q4 8 0 11 q-4-3 0-11Z M128 64 q4 8 0 11 q-4-3 0-11Z M100 52 q4 8 0 11 q-4-3 0-11Z" fill="#7fd3ff"/>'
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="${bg}"/>`
    + `<ellipse cx="100" cy="112" rx="58" ry="70" fill="${skin}"/><circle cx="78" cy="104" r="6" fill="#222"/><circle cx="122" cy="104" r="6" fill="#222"/>`
    + `<path d="M80 142 q20 ${sweaty ? 6 : 14} 40 0" stroke="#222" stroke-width="5" fill="none" stroke-linecap="round"/>${drops}`
    + `<rect y="214" width="200" height="46" fill="rgba(0,0,0,.35)"/><text x="100" y="245" font-family="Helvetica,Arial" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${name.replace(/[<&>]/g, '')}</text></svg>`;
  return { mime: 'image/svg+xml', data: btoa(unescape(encodeURIComponent(svg))) };
}
