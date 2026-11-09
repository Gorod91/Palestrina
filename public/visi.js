// Pallini con le facce (viso ritagliato senza sfondo dall'ultimo Sudometro, o dalla foto di riferimento):
// "In palestra adesso" in Home e sorpassi in chat. Senza viso, iniziali sul colore della persona.

const COLORS = [
  ['#ff9f0a', '#ff6a00'],
  ['#30d158', '#0a9f3a'],
  ['#a6ff00', '#5fb300'],
  ['#bf5af2', '#8e2bd1'],
  ['#64d2ff', '#1f8fd1'],
  ['#ff375f', '#d1103a'],
  ['#ffd60a', '#c9a400'],
  ['#5e5ce6', '#3634a3'],
];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let people = []; // nomi di tutti, in ordine alfabetico: il colore di ognuno resta sempre lo stesso

export function setPeople(names) {
  people = [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

function colorOf(name) {
  let i = people.indexOf(name);
  if (i < 0) i = [...String(name)].reduce((n, c) => n + c.charCodeAt(0), 0);
  return COLORS[i % COLORS.length];
}

/** HTML del pallino. `faceId` facoltativo; la foto arriva dopo con paintFaces. */
export function faceHtml(name, display, { size = 56, faceId = '', crown = '' } = {}) {
  const [c1, c2] = colorOf(name);
  const ini = esc(String(display || name).trim().slice(0, 2).toUpperCase());
  const img = faceId ? `<img data-fid="${esc(faceId)}" alt="" hidden>` : '';
  return `<span class="fav" style="--s:${size}px;background:linear-gradient(140deg,${c1},${c2})"><b>${ini}</b><span class="fav-face">${img}</span>${crown}</span>`;
}

/** Carica le facce ancora vuote dentro `root` (loadPhoto: id → Promise<url>). */
export function paintFaces(root, loadPhoto) {
  root.querySelectorAll('img[data-fid]:not([src])').forEach((img) => {
    loadPhoto(img.dataset.fid)
      .then((src) => {
        img.src = src;
        img.hidden = false;
        const b = img.closest('.fav').querySelector('b');
        if (b) b.hidden = true;
      })
      .catch(() => {});
  });
}
