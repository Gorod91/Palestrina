// Slide dell'incoronazione davanti alle novità di fine mese: l'app apre la presentazione con
// ?re=<nomi>&titolo=<Re del mese|Regina del mese|…>&mese=<ottobre>&punti=<n>. Senza parametri non fa niente.

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
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Mette la slide del Re in cima, se l'app ha passato i parametri. */
export function kingSlide() {
  const q = new URLSearchParams(location.search);
  const re = q.get('re');
  if (!re) return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.append(st);
  const sec = document.createElement('section');
  sec.className = 'slide king';
  sec.innerHTML = `
    <div class="glow"></div>
    <p class="eyebrow" data-a style="--d:.1">${esc(q.get('titolo') || 'Re del mese')} · ${esc(q.get('mese') || '')}</p>
    <svg class="crownbig" viewBox="0 0 24 20" aria-hidden="true"><path d="M4 16 L3 7 L8.5 11 L12 4 L15.5 11 L21 7 L20 16 Z" fill="currentColor"/><circle cx="3" cy="6" r="1.8" fill="currentColor"/><circle cx="12" cy="3" r="1.8" fill="currentColor"/><circle cx="21" cy="6" r="1.8" fill="currentColor"/><path d="M4 18.5 H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <h1 data-a style="--d:1.3;--anim:pop">${esc(re)}</h1>
    ${q.get('punti') ? `<p class="pts" data-a style="--d:2">${esc(q.get('punti'))} punti</p>` : ''}
    <p class="hint" data-a style="--d:2.7">Tocca per le novità</p>`;
  document.querySelector('.slide').before(sec);
}
