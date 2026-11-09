// Fogli che salgono dal basso (con la maniglia in cima): si chiudono anche trascinandoli verso il basso, come su iPhone.
// Si prende dalla maniglia o dalla testata; se il contenuto è in cima, anche da un punto qualsiasi del foglio.
// Chiudere = come toccare la × del foglio o fuori dal foglio.

const BOXES = '.wo-edsheet-box, .wo-sheet-box, .sheet-card';
const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Chiude un foglio (.sheet o .wo-sheet) facendolo scendere e sfumare il fondo; poi `done` (o hidden = true). */
export function hideSheet(el, done) {
  if (!el || el.hidden || el.classList.contains('closing')) return;
  const finish = () => {
    el.classList.remove('closing');
    if (done) done(); else el.hidden = true;
    el.style.opacity = '';
    el.querySelectorAll(BOXES).forEach((b) => (b.style.transform = ''));
  };
  if (reduce()) return finish();
  el.classList.add('closing');
  setTimeout(finish, 260);
}

/** Foglio dell'allenamento tolto da un ridisegno: la copia vecchia resta un attimo e scende. */
export function dropOldSheet(old, root) {
  if (!old || reduce()) return;
  old.classList.remove('in');
  old.classList.add('closing');
  root.append(old);
  setTimeout(() => old.remove(), 260);
}

function closeSheet(box) {
  const x = box.querySelector('.sheet-close'); // Punti e medaglie, Registro admin
  if (x) return x.click();
  const grid = box.closest('.wo-sheet'); // griglia "Tutti" dell'allenamento
  if (grid) return hideSheet(grid);
  const dim = box.previousElementSibling; // fogli dell'allenamento: il fondo scuro chiude
  if (dim) dim.click();
}

export function initSheetDrag() {
  let d = null, eatClick = false;
  document.addEventListener('pointerdown', (ev) => {
    const box = ev.target.closest(BOXES);
    if (!box || ev.target.closest('input, textarea, select, [data-grip]')) return;
    const nearTop = ev.clientY - box.getBoundingClientRect().top < 56;
    if (box.scrollTop > 0 && !nearTop) return; // contenuto scorso: vince lo scorrimento
    d = { box, y: ev.clientY, t: ev.timeStamp, dy: 0, v: 0, id: ev.pointerId, moved: false };
  });
  document.addEventListener('pointermove', (ev) => {
    if (!d || ev.pointerId !== d.id) return;
    const dy = ev.clientY - d.y;
    if (!d.moved) {
      if (dy < 8) return;
      d.moved = true;
      d.box.style.transition = 'none';
      try { d.box.setPointerCapture(ev.pointerId); } catch {}
    }
    d.v = (dy - d.dy) / Math.max(1, ev.timeStamp - d.t);
    d.dy = dy;
    d.t = ev.timeStamp;
    d.box.style.transform = `translateY(${Math.max(0, dy)}px)`;
    const dim = d.box.classList.contains('sheet-card') ? d.box.parentElement : d.box.previousElementSibling;
    if (dim) dim.style.opacity = String(Math.max(0.3, 1 - Math.max(0, dy) / 500));
  });
  const end = () => {
    const x = d;
    d = null;
    if (!x || !x.moved) return;
    eatClick = true; // il dito alzato sopra un tasto non vale come tocco
    setTimeout(() => (eatClick = false), 60);
    const { box } = x, close = x.dy > 90 || x.v > 0.6;
    const dim = box.classList.contains('sheet-card') ? box.parentElement : box.previousElementSibling;
    box.style.transition = 'transform .2s ease-out';
    box.style.transform = close ? 'translateY(100%)' : '';
    if (dim && !close) dim.style.opacity = '';
    setTimeout(() => {
      box.style.transition = '';
      if (close) closeSheet(box); // resta giù: la chiusura riparte da dove l'ha lasciato il dito
    }, 200);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('click', (ev) => {
    if (eatClick) { ev.stopPropagation(); ev.preventDefault(); }
  }, true);
}
