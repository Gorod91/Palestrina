// Slide di fine mese davanti alle novità: prima la classifica del mese, poi l'incoronazione del Re.
// L'app apre la presentazione con ?re=<nomi>&titolo=<Re del mese|Regina del mese|…>&mese=<ottobre>&punti=<n>&m=<yyyy-MM>
// e, se c'è, &classifica=[[nome, punti, 1 se sono io], …]. Senza parametri non fa niente.

// Cronaca del mese: frasi scritte a mano, mostrate solo se la classifica finale le conferma.
const CRONACA = {
  '2026-10': {
    re: 'Primo in classifica ogni giorno del mese.<br>12 volte in palestra, più di tutti.',
    frasi: [
      { se: (pos) => pos.Ceppo === 2 && pos.Crabby === 3, testo: 'Il 31, solo due ore dopo il 74 di Rizzo, <b>Ceppo</b> fa 81 al Sudometro: gli ruba il <b>Pomodoro del mese</b> e con quei 10 punti scavalca <b>Crabby</b> al secondo posto.' },
      { se: (pos) => pos.Crabby < pos.Michy, testo: '<b>Crabby</b>, il nuovo arrivato, si è già lasciato dietro la <b>Michy</b>.' },
      { se: (pos) => pos.SCOOBY > 0, testo: 'Tifiamo tutti per un grande ritorno di <b>SCOOBY</b> a novembre.' },
    ],
  },
};

const CSS = `
  .king { align-items: center; text-align: center; }
  .king .eyebrow { color: #ffd60a; }
  .king .crownbig { width: 150px; height: 125px; margin: 18px 0 6px; color: #ffd60a; filter: drop-shadow(0 0 40px #ffd60a99); }
  .slide.on .crownbig { animation: crowndrop 1.1s cubic-bezier(.2, 1.4, .4, 1) .4s both, shine 2.6s ease-in-out 1.6s infinite; }
  @keyframes crowndrop { from { opacity: 0; transform: translateY(-160px) rotate(-14deg) scale(.6); } to { opacity: 1; transform: none; } }
  @keyframes shine { 0%, 100% { filter: drop-shadow(0 0 30px #ffd60a77); } 50% { filter: drop-shadow(0 0 60px #ffd60acc); } }
  .king h1 { background: linear-gradient(90deg, #ffd60a, #ff9f0a 50%, #ff2d6b); -webkit-background-clip: text; background-clip: text; }
  .king h1 { font-size: clamp(44px, 13vw, 88px); overflow-wrap: anywhere; }
  .king .glow { background: radial-gradient(ellipse at 50% 100%, #ffd60a33, transparent 65%); }
  .king .pts { display: inline-block; margin-top: 6px; padding: 10px 18px; border-radius: 99px; background: #1c1c1e; border: 1px solid #ffd60a55; font-size: 20px; font-weight: 800; }
  .king .sub { margin-top: 18px; font-size: 18px; font-weight: 300; color: #d1d1d6; line-height: 1.4; }
  .confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .confetti i { position: absolute; top: -20px; width: 7px; height: 12px; border-radius: 2px; opacity: 0; }
  .slide.on .confetti i { animation: fall var(--t) linear var(--w) infinite; }
  @keyframes fall { 0% { opacity: 1; transform: translateY(0) rotate(0); } 100% { opacity: .9; transform: translateY(110vh) rotate(var(--r)); } }

  /* Classifica: le righe compaiono dall'ultimo al primo */
  .rank .eyebrow { color: #ffd60a; }
  .race { display: grid; gap: 7px; margin: 22px 0 0; }
  .bar { position: relative; display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 10px; padding: 0 14px; height: 46px; border-radius: 15px; background: #1c1c1e; overflow: hidden; font-size: 17px; }
  .bar .fill { position: absolute; inset: 0 auto 0 0; width: var(--w); border-radius: 15px; background: linear-gradient(90deg, #2c2c2e, #3a3a3c); transform-origin: left; transform: scaleX(0); }
  .slide.on .bar .fill { animation: fillx 1.4s cubic-bezier(.2, .8, .2, 1) both; animation-delay: calc(var(--d) * 1s + .15s); }
  @keyframes fillx { to { transform: scaleX(1); } }
  .bar > :not(.fill) { position: relative; }
  .bar .n { font-weight: 800; color: #8e8e93; text-align: center; }
  .bar .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar .pt { font-weight: 800; font-variant-numeric: tabular-nums; }
  .bar.g1 { height: 60px; font-size: 20px; }
  .bar.g1 .fill { background: linear-gradient(90deg, #ffd60a, #ff9f0a); box-shadow: 0 0 40px #ffd60a66; }
  .bar.g1 > :not(.fill) { color: #000; }
  .bar.g1 .nm svg { width: 22px; height: 18px; margin-left: 6px; vertical-align: -2px; }
  .bar.g2 .fill { background: linear-gradient(90deg, #48484a, #8e8e93); }
  .bar.g3 .fill { background: linear-gradient(90deg, #5c2d14, #b85a2a); }
  .bar.g2 > :not(.fill), .bar.g3 > :not(.fill) { color: #f5f5f7; }
  .bar.me { box-shadow: inset 0 0 0 1px #a6ff00aa; }
  .bar.me .nm::after { content: 'Tu'; margin-left: 8px; padding: 2px 7px; border-radius: 99px; background: #a6ff00; color: #000; font-size: 11px; font-weight: 900; vertical-align: 2px; }
  .cronaca { display: grid; gap: 6px; margin-top: 12px; }
  .cronaca p { padding: 9px 14px; border-radius: 16px 16px 16px 5px; background: #2c2c2e; font-size: 15px; line-height: 1.3; color: #e5e5ea; }
  .cronaca b { color: #f5f5f7; }
  /* Schermi bassi (iPhone SE): tutto un po' più compatto */
  @media (max-height: 700px) {
    .rank h2 { font-size: 32px; }
    .race { margin-top: 14px; gap: 6px; }
    .bar { height: 40px; font-size: 16px; }
    .bar.g1 { height: 50px; font-size: 18px; }
    .cronaca { margin-top: 10px; gap: 5px; }
    .cronaca p { padding: 7px 12px; font-size: 14px; }
  }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CROWN = '<path d="M4 16 L3 7 L8.5 11 L12 4 L15.5 11 L21 7 L20 16 Z" fill="currentColor"/>';

function readRanking(q) {
  try {
    const list = JSON.parse(q.get('classifica') || '[]');
    return Array.isArray(list) ? list.filter((r) => Array.isArray(r) && r[0]).map(([name, pts, me]) => ({ name: String(name), pts: Number(pts) || 0, me: !!me })) : [];
  } catch (err) {
    return [];
  }
}

/** Mette in cima la classifica del mese e l'incoronazione, se l'app ha passato i parametri. */
export function kingSlide() {
  const q = new URLSearchParams(location.search);
  const re = q.get('re');
  if (!re) return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
  const mese = esc(q.get('mese') || '');
  const cronaca = CRONACA[q.get('m')] || {};
  const first = document.querySelector('.slide');

  const ranking = readRanking(q);
  if (ranking.length > 1) {
    const pos = {};
    ranking.forEach((r, k) => (pos[r.name] = k + 1));
    const frasi = (cronaca.frasi || []).filter((f) => { try { return f.se(pos); } catch (err) { return false; } });
    const max = Math.max(1, ...ranking.map((r) => r.pts));
    const L = ranking.length;
    const step = Math.min(0.7, 3.2 / L);
    const last = 0.8 + (L - 1) * step + 1.5; // il primo arriva per ultimo, dopo una pausa
    const rows = ranking.map((r, k) => {
      const d = k === 0 ? last : 0.8 + (L - 1 - k) * step;
      const cls = (k < 3 ? ` g${k + 1}` : '') + (r.me ? ' me' : '');
      return `<div class="bar${cls}" data-a style="--d:${d};--anim:${k === 0 ? 'pop' : 'left'}"><i class="fill" style="--w:${Math.round((r.pts / max) * 100)}%;--d:${d}"></i><span class="n">${k + 1}</span><span class="nm">${esc(r.name)}${k === 0 ? `<svg viewBox="0 0 24 20" aria-hidden="true">${CROWN}</svg>` : ''}</span><span class="pt" data-count="${r.pts}" data-cd="${d + 0.15}">0</span></div>`;
    }).join('');
    const sec = document.createElement('section');
    sec.className = 'slide rank';
    sec.innerHTML = `
      <p class="eyebrow" data-a style="--d:0">Classifica · ${mese}</p>
      <h2 data-a style="--d:.1">Ecco com'è finita.</h2>
      <div class="race">${rows}</div>
      ${frasi.length ? `<div class="cronaca">${frasi.map((f, k) => `<p data-a style="--d:${last + 1.4 + k * 0.6};--anim:left">${f.testo}</p>`).join('')}</div>` : ''}
      <p class="hint" data-a style="--d:${last + 1.4 + frasi.length * 0.6 + 0.4}">Tocca per l'incoronazione</p>`;
    first.before(sec);
    countUp(sec);
  }

  const colors = ['#ffd60a', '#ff9f0a', '#ff2d6b', '#a6ff00', '#3be0ff'];
  const confetti = Array.from({ length: 34 }, (_, k) =>
    `<i style="left:${(k * 37) % 100}%;background:${colors[k % 5]};--t:${2.6 + (k % 5) * 0.5}s;--w:${1.4 + (k % 9) * 0.35}s;--r:${(k % 2 ? 1 : -1) * (300 + k * 20)}deg"></i>`).join('');
  const sec = document.createElement('section');
  sec.className = 'slide king';
  sec.innerHTML = `
    <div class="glow"></div>
    <div class="confetti">${confetti}</div>
    <p class="eyebrow" data-a style="--d:.1">${esc(q.get('titolo') || 'Re del mese')} · ${mese}</p>
    <svg class="crownbig" viewBox="0 0 24 20" aria-hidden="true">${CROWN}<circle cx="3" cy="6" r="1.8" fill="currentColor"/><circle cx="12" cy="3" r="1.8" fill="currentColor"/><circle cx="21" cy="6" r="1.8" fill="currentColor"/><path d="M4 18.5 H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <h1 data-a style="--d:1.3;--anim:pop">${esc(re)}</h1>
    ${q.get('punti') ? `<p class="pts" data-a style="--d:2">${esc(q.get('punti'))} punti</p>` : ''}
    ${cronaca.re ? `<p class="sub" data-a style="--d:2.6">${cronaca.re}</p>` : ''}
    <p class="hint" data-a style="--d:3.2">Tocca per le novità</p>`;
  first.before(sec);
}

/** I punti della classifica contano da 0 ogni volta che la slide si accende. */
function countUp(slide) {
  let timers = [];
  const run = () => {
    timers.forEach(clearTimeout);
    timers = [];
    slide.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count);
      el.textContent = '0';
      timers.push(setTimeout(() => {
        const t0 = performance.now();
        const tick = (t) => {
          const f = Math.min(1, (t - t0) / 1400);
          el.textContent = String(Math.round(to * (1 - Math.pow(1 - f, 3))));
          if (f < 1 && slide.classList.contains('on')) requestAnimationFrame(tick);
          else el.textContent = String(to);
        };
        requestAnimationFrame(tick);
      }, Number(el.dataset.cd) * 1000));
    });
  };
  new MutationObserver(() => { if (slide.classList.contains('on')) run(); }).observe(slide, { attributes: true, attributeFilter: ['class'] });
}
