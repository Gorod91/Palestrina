// Selettori a segmenti (Settimana / Mese, Peso / Volume) e filtri a pillole: la selezione è una "pillola" che scorre da
// un'opzione all'altra. Funziona anche quando la pagina ridisegna il selettore: ricorda dove era la pillola
// (per selettore, dalle sue etichette) e la fa partire da lì.

const SEGS = '.seg, .wo-seg, .wo-chips, .wo-groups';
const last = new Map();
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const buttons = (seg) => [...seg.children].filter((b) => b.tagName === 'BUTTON');
const keyOf = (seg) => `${seg.className.replace(' has-pill', '')}|${buttons(seg).map((b) => b.textContent.trim()).join('|')}`;

function place(seg) {
  const on = buttons(seg).find((b) => b.classList.contains('on'));
  let pill = seg.querySelector(':scope > .seg-pill');
  if (!on) {
    if (pill) pill.style.opacity = '0';
    return;
  }
  const pos = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  if (!pos.w) return; // selettore nascosto: si sistema quando ricompare
  if (!pill) {
    pill = document.createElement('i');
    pill.className = 'seg-pill';
    pill.setAttribute('aria-hidden', 'true');
    seg.prepend(pill);
  }
  if (!seg.classList.contains('has-pill')) seg.classList.add('has-pill');
  const key = keyOf(seg);
  const prev = seg._pos || last.get(key);
  const set = (p) => {
    pill.style.width = `${p.w}px`;
    pill.style.height = `${p.h}px`;
    pill.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };
  const moved = prev && (prev.x !== pos.x || prev.y !== pos.y || prev.w !== pos.w);
  pill.style.opacity = '';
  if (moved && seg._pos && !reduce()) set(pos); // stesso selettore: basta la transizione
  else {
    pill.style.transition = 'none';
    set(moved && !reduce() ? prev : pos);
    void pill.offsetWidth;
    pill.style.transition = '';
    if (moved && !reduce()) set(pos); // selettore ridisegnato: parte da dove era
  }
  seg._pos = pos;
  last.set(key, pos);
}

let queued = new Set(), all = false, frame = 0;
function schedule(seg) {
  if (seg) queued.add(seg); else all = true;
  if (!frame) frame = requestAnimationFrame(flush);
}
function flush() {
  frame = 0;
  const list = all ? document.querySelectorAll(SEGS) : queued;
  all = false;
  queued = new Set();
  list.forEach((s) => s.isConnected && place(s));
}

export function initSegs() {
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        if (r.attributeName === 'hidden') { schedule(); continue; } // un pannello compare: si sistemano tutti
        const seg = r.target.closest && r.target.parentElement && r.target.parentElement.closest(SEGS);
        if (seg && r.target.tagName === 'BUTTON') schedule(seg);
        continue;
      }
      r.addedNodes.forEach((n) => {
        if (n.nodeType !== 1 || n.classList.contains('seg-pill')) return;
        if (n.matches(SEGS)) schedule(n);
        else if (n.parentElement && n.parentElement.closest(SEGS)) schedule(n.parentElement.closest(SEGS));
        n.querySelectorAll && n.querySelectorAll(SEGS).forEach(schedule);
      });
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', () => document.querySelectorAll(SEGS).forEach((s) => { s._pos = null; last.delete(keyOf(s)); schedule(s); }));
  schedule();
}
