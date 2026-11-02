// Medaglie in 3D: animazione quando se ne vince una (o viene strappata), medaglie piccole in Classifica.
// three.js (vendor/three-r128.min.js) si carica solo quando serve: alla prima medaglia da mostrare.
// Metalli: Divano oro, Pomodoro rame, Branco bronzo, Mattiniero argento, Mai saltato acciaio brunito, Gladiatore
// canna di fucile. Fondo e bordo martellati, disegno liscio e lucido, scritte incise; sul retro chi l'ha vinta e perché.

const ICON = {
  maiSaltato: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 15l2.4 2.4 4.6-4.6"/></svg>',
  mattiniero: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 18a6 6 0 0 1 12 0z" fill="currentColor"/><path d="M2 18h20M12 5v2.6M5.3 8.6l1.8 1.8M18.7 8.6l-1.8 1.8M2.4 13.6h2.4M19.2 13.6h2.4M8 21.5h8"/></svg>',
  branco: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="3.4"/><circle cx="5" cy="10" r="2.5"/><circle cx="19" cy="10" r="2.5"/><path d="M5.6 20.5a6.4 6.4 0 0 1 12.8 0z"/><path d="M.8 19a4.2 4.2 0 0 1 6.9-3.2A7.6 7.6 0 0 0 4.6 19zM23.2 19a4.2 4.2 0 0 0-6.9-3.2 7.6 7.6 0 0 1 3.1 3.2z"/></svg>',
  pomodoro: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7.2c4.6 0 8 3.1 8 7.1S16.6 21.5 12 21.5 4 18.4 4 14.3s3.4-7.1 8-7.1z"/><path d="M12 7.6c-1.2-1.4-3.2-1.8-5-1.2 1.2.5 2.2 1.2 2.8 2.1C11 8.2 11.5 8 12 8s1 .2 2.2.5c.6-.9 1.6-1.6 2.8-2.1-1.8-.6-3.8-.2-5 1.2z"/><path d="M12 7.6V3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gladiatore: '<svg viewBox="0 0 24 24" fill="currentColor"><g transform="translate(0 .7) rotate(-40 12 9.8)"><path d="M12 .6 13.7 3.6v10h-3.4v-10z"/><path d="M8.6 15.4c0-1.3 1.5-1.9 3.4-1.9s3.4.6 3.4 1.9z"/><rect x="11.05" y="15.4" width="1.9" height="4.4" rx=".6"/><ellipse cx="12" cy="16.6" rx="1.3" ry=".45"/><ellipse cx="12" cy="18" rx="1.3" ry=".45"/><circle cx="12" cy="21.1" r="1.7"/></g><g transform="translate(0 .7) rotate(40 12 9.8)"><path d="M12 .6 13.7 3.6v10h-3.4v-10z"/><path d="M8.6 15.4c0-1.3 1.5-1.9 3.4-1.9s3.4.6 3.4 1.9z"/><rect x="11.05" y="15.4" width="1.9" height="4.4" rx=".6"/><ellipse cx="12" cy="16.6" rx="1.3" ry=".45"/><ellipse cx="12" cy="18" rx="1.3" ry=".45"/><circle cx="12" cy="21.1" r="1.7"/></g></svg>',
  divano: '<svg viewBox="0 0 24 24"><path d="M5 9V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10a2 2 0 0 1 4 0v3h10v-3a2 2 0 0 1 4 0v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor"/><path d="M6 18v2M18 18v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};
const METAL = {
  branco: ['#b08d57', '#7d6237'],
  mattiniero: ['#d6d9de', '#9aa0a8'],
  maiSaltato: ['#6f93cc', '#3c5f99'],
  pomodoro: ['#d4825e', '#9e4f33'],
  gladiatore: ['#7d8189', '#3a3d43'],
  divano: ['#e8b54d', '#b8862b'],
};
const STOLEN = ['pomodoro', 'gladiatore']; // passano a chi supera chi le ha
const ORDER = ['maiSaltato', 'mattiniero', 'branco', 'pomodoro', 'gladiatore', 'divano'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (s, def) => { const m = String(s || '').match(/\d+/); return m ? Number(m[0]) : def; };
const parseDay = (d) => { const [y, m, g] = d.split('-').map(Number); return new Date(y, m - 1, g); };
const addDays = (d, n) => { const x = parseDay(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const todayStr = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
/** "2026-10-12" (lunedì) → "12–18 ottobre" */
function weekLabel(w) {
  const a = parseDay(w), b = parseDay(addDays(w, 6));
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MESI[b.getMonth()]}` : `${a.getDate()} ${MESI[a.getMonth()]} – ${b.getDate()} ${MESI[b.getMonth()]}`;
}

// ---------- Dati: le medaglie del mese dallo stato ----------

/** Divano d'oro della settimana in corso di premiazione: l'ultimo, finché non passano due settimane. */
function currentDivano(state) {
  const list = (state && state.divani) || [];
  const d = list[list.length - 1];
  if (!d || !d.names || !d.names.length) return null;
  return (parseDay(todayStr()) - parseDay(d.week)) / 86400000 <= 13 ? d : null;
}

/** Tutte le medaglie in gioco: { key → [info] } con chi le ha. */
function allMedals(state) {
  const out = {};
  const pts = state && state.points;
  const now = new Date();
  const month = MESI[now.getMonth()], year = now.getFullYear();
  ((pts && pts.ranking) || []).forEach((r) => {
    r.detail.filter((g) => g.achievement && METAL[g.key]).forEach((g) => {
      const it = (g.items || [])[0] || {};
      const day = it.day || g.day || '';
      (out[g.key] = out[g.key] || []).push({
        key: g.key, label: g.label, pts: g.pts, name: r.name, who: r.display || r.name, note: it.note || g.note || '',
        when: day ? `${parseDay(day).getDate()} ${MESI[parseDay(day).getMonth()]} ${parseDay(day).getFullYear()}` : `${month} ${year}`,
        period: `${month} ${year}`,
      });
    });
  });
  const dv = currentDivano(state);
  if (dv) {
    out.divano = dv.names.map((n, i) => ({
      key: 'divano', label: 'Divano d\'oro', pts: 0, name: n, who: (dv.displays && dv.displays[i]) || n, count: dv.count, week: dv.week,
      note: `${dv.count} ${dv.count === 1 ? 'volta' : 'volte'} in palestra`, when: `settimana ${weekLabel(dv.week)}`, period: weekLabel(dv.week),
    }));
  }
  return out;
}
const mine = (all, name) => ORDER.flatMap((k) => (all[k] || []).filter((x) => x.name === name));
const idOf = (m) => (m.key === 'divano' ? `divano:${m.week}` : m.key);

function subFor(m, all) {
  if (m.key === 'maiSaltato') return 'Obiettivo raggiunto in <b>ogni settimana</b> del mese.';
  if (m.key === 'mattiniero') return `Il <b>${num(m.note, 4)}° check-in</b> del mese prima delle 9.`;
  if (m.key === 'branco') return `Il <b>${num(m.note, 5)}° allenamento</b> del mese insieme agli amici.`;
  if (m.key === 'pomodoro') return `Il <b>Sudometro più alto</b> del mese: ${num(m.note, '')}.<br>Resta tuo finché nessuno ti supera.`;
  if (m.key === 'gladiatore') return `<b>${num(m.note, 3)} sfide vinte</b>: il più vincente del mese.<br>Resta tuo finché nessuno ti supera.`;
  if (m.key === 'divano') {
    const others = ((all && all.divano) || []).filter((x) => x.name !== m.name).map((x) => x.who);
    return `Il meno visto in palestra questa settimana: <b>${m.count}&nbsp;${m.count === 1 ? 'volta' : 'volte'}</b>${others.length ? `, a pari con ${esc(others.join(', '))}` : ''}.<br>Niente punti, ma è d'oro.`;
  }
  return esc(m.note);
}

// ---------- three.js ----------

let threeP = null;
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threeP) {
    threeP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/three-r128.min.js';
      s.onload = () => (window.THREE ? res(window.THREE) : rej(new Error('three.js')));
      s.onerror = () => { threeP = null; rej(new Error('three.js non caricato')); };
      document.head.append(s);
    });
  }
  return threeP;
}
let glOk = null;
function webglOk() {
  if (glOk === null) {
    try { const c = document.createElement('canvas'); glOk = !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch { glOk = false; }
  }
  return glOk;
}

const svgUrl = (key, px, col = '#fff') => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICON[key].replace(/currentColor/g, col).replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" `));
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
const canvasN = (N, read) => { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d', read ? { willReadFrequently: true } : undefined)]; };

const rimText = (m) => `${m.who.toUpperCase()} · ${m.label.toUpperCase()} · ${m.period.toUpperCase()} · `;

/** Fronte: disegno bombato (dalla distanza dal bordo) e scritte incise sul bordo. */
async function reliefCanvas(m, N) {
  const T = window.THREE;
  const img = await loadImg(svgUrl(m.key, N));
  const [, mg] = canvasN(N, true);
  const s = N * 0.5, o = (N - s) / 2;
  mg.drawImage(img, o, o, s, s);
  const md = mg.getImageData(0, 0, N, N).data;
  // distanza dal bordo del disegno (chamfer 3-4, due passate)
  const D = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) D[i] = md[i * 4 + 3] > 127 ? 1e9 : 0;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const i = y * N + x; if (!D[i]) continue; D[i] = Math.min(D[i], D[i - 1] + 3, D[i - N] + 3, D[i - N - 1] + 4, D[i - N + 1] + 4); }
  for (let y = N - 2; y > 0; y--) for (let x = N - 2; x > 0; x--) { const i = y * N + x; if (!D[i]) continue; D[i] = Math.min(D[i], D[i + 1] + 3, D[i + N] + 3, D[i + N + 1] + 4, D[i + N - 1] + 4); }
  // scritte e anellino incisi
  const [, tg] = canvasN(N, true);
  tg.translate(N / 2, N / 2); tg.fillStyle = '#fff';
  tg.font = `800 ${N * 0.05}px Inter, -apple-system, system-ui, sans-serif`; tg.textAlign = 'center'; tg.textBaseline = 'middle';
  const txt = rimText(m), R = N * 0.415, step = (Math.PI * 2) / txt.length;
  [...txt].forEach((ch, k) => { tg.save(); tg.rotate(-Math.PI / 2 + k * step + step / 2); tg.translate(R, 0); tg.rotate(Math.PI / 2); tg.fillText(ch, 0, 0); tg.restore(); });
  tg.strokeStyle = '#fff'; tg.lineWidth = N * 0.007; tg.beginPath(); tg.arc(0, 0, N * 0.365, 0, Math.PI * 2); tg.stroke();
  const td = tg.getImageData(0, 0, N, N).data;
  const [hc, hg] = canvasN(N), [cc, cg] = canvasN(N);
  const H = hg.createImageData(N, N), C = cg.createImageData(N, N);
  const RR = 1024 * 0.075 * 3, BASE = 0.32; // in unità chamfer di un'immagine da 1024
  const [c1h, c2h] = METAL[m.key], c1 = new T.Color(c1h), c2 = new T.Color(c2h);
  for (let i = 0; i < N * N; i++) {
    const d = D[i] * (1024 / N);
    let h = BASE;
    if (d > 0) { const u = Math.min(1, d / RR); const bev = Math.sqrt(1 - (1 - u) * (1 - u)); h = BASE + (1 - BASE) * (0.82 * bev + 0.18 * Math.min(1, d / (RR * 2.4))); }
    const t = td[i * 4 + 3] / 255;
    if (t > 0 && d === 0) h = BASE - 0.22 * t;
    const v = Math.round(h * 255 + Math.random() - 0.5);
    H.data[i * 4] = H.data[i * 4 + 1] = H.data[i * 4 + 2] = v; H.data[i * 4 + 3] = 255;
    const x = (i % N) / N, y = Math.floor(i / N) / N, mix = (x + y) / 2;
    const k = d > 0 ? 1.0 + 0.12 * (h - BASE) : 0.86 - 0.3 * (t > 0 ? t : 0);
    const r = (c1.r * (1 - mix) + c2.r * mix * 0.6 + c1.r * mix * 0.4) * k, g = (c1.g * (1 - mix) + c2.g * mix * 0.6 + c1.g * mix * 0.4) * k, b = (c1.b * (1 - mix) + c2.b * mix * 0.6 + c1.b * mix * 0.4) * k;
    C.data[i * 4] = Math.min(255, r * 255); C.data[i * 4 + 1] = Math.min(255, g * 255); C.data[i * 4 + 2] = Math.min(255, b * 255); C.data[i * 4 + 3] = 255;
  }
  hg.putImageData(H, 0, 0); cg.putImageData(C, 0, 0);
  const [sc, sg] = canvasN(N, true); sg.filter = `blur(${(2.5 * N) / 1024}px)`; sg.drawImage(hc, 0, 0);
  return { h: sc, c: cc, base: null };
}

/** Retro inciso: chi l'ha vinta, perché e quando. */
async function backCanvas(m, N) {
  const BASE = 0.55;
  const img = await loadImg(svgUrl(m.key, 256));
  const [ec, e] = canvasN(N);
  e.fillStyle = '#fff'; e.strokeStyle = '#fff'; e.textAlign = 'center'; e.textBaseline = 'middle';
  const font = (w, px) => `${w} ${px}px Inter, -apple-system, system-ui, sans-serif`;
  const t = (s, y, px, w, sp = 0) => { e.font = font(w, px); if ('letterSpacing' in e) e.letterSpacing = `${(sp * N) / 1024}px`; fit(s, px, w); e.fillText(s, N / 2, N * y); };
  const fit = (s, px, w) => { while (px > 8 && e.measureText(s).width > N * 0.8) { px -= 2; e.font = font(w, px); } };
  e.drawImage(img, N / 2 - N * 0.06, N * 0.17 - N * 0.06, N * 0.12, N * 0.12);
  t('PALESTRINA', 0.29, N * 0.034, 800, 10);
  t(m.label.toUpperCase(), 0.37, N * (m.label.length > 12 ? 0.042 : 0.05), 800, 4);
  t(m.who, 0.5, N * 0.12, 900, 0);
  t(m.note, 0.63, N * 0.042, 600, 0);
  t(m.when, 0.71, N * 0.042, 600, 0);
  e.lineWidth = N * 0.006;
  e.beginPath(); e.moveTo(N * 0.3, N * 0.425); e.lineTo(N * 0.7, N * 0.425); e.stroke();
  e.beginPath(); e.moveTo(N * 0.3, N * 0.575); e.lineTo(N * 0.7, N * 0.575); e.stroke();
  e.beginPath(); e.arc(N / 2, N / 2, N * 0.44, 0, Math.PI * 2); e.stroke();
  const [hc, h] = canvasN(N, true);
  const b = Math.round(BASE * 255);
  h.fillStyle = `rgb(${b},${b},${b})`; h.fillRect(0, 0, N, N);
  const [ic, ig] = canvasN(N); ig.drawImage(ec, 0, 0); ig.globalCompositeOperation = 'source-in'; ig.fillStyle = '#000'; ig.fillRect(0, 0, N, N);
  h.globalAlpha = 0.55; h.filter = `blur(${(1.2 * N) / 1024}px)`; h.drawImage(ic, 0, 0); h.filter = 'none'; h.globalAlpha = 1;
  const [cc, c] = canvasN(N);
  c.fillStyle = METAL[m.key][0]; c.fillRect(0, 0, N, N);
  c.globalAlpha = 0.12; c.fillStyle = '#000'; c.fillRect(0, 0, N, N); c.globalAlpha = 1;
  const [dc, dg] = canvasN(N); dg.drawImage(ec, 0, 0); dg.globalCompositeOperation = 'source-in'; dg.fillStyle = 'rgba(40,20,0,.55)'; dg.fillRect(0, 0, N, N);
  c.drawImage(dc, 0, 0);
  return { h: hc, c: cc, base: BASE };
}

/* Martellatura: colpi tondi sfumati; "tile" ripete ai bordi per poterla piastrellare sul bordo della medaglia */
const dimpleCache = {};
function dimpleCanvas(N, count, rmin, rmax, seed, tile) {
  const key = [N, count, rmin, rmax, seed, tile].join();
  if (dimpleCache[key]) return dimpleCache[key];
  const [c, g] = canvasN(N, true);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N);
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < count; k++) {
    const x0 = r() * N, y0 = r() * N, rad = N * (rmin + r() * (rmax - rmin));
    const offs = tile ? [-N, 0, N] : [0];
    offs.forEach((ox) => offs.forEach((oy) => {
      const x = x0 + ox, y = y0 + oy;
      if (x + rad < 0 || x - rad > N || y + rad < 0 || y - rad > N) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(0.5, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }));
  }
  return (dimpleCache[key] = c);
}
/** Rugosità e microrilievo: campo martellato, disegno liscio e lucido, incisioni opache. */
function finishMaps(hc, base) {
  const N = hc.width, H = hc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, N, N).data;
  const [rc, rg] = canvasN(N), [bc, bg] = canvasN(N);
  const R = rg.createImageData(N, N), B = bg.createImageData(N, N);
  const b = base * 255;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const dim = dimpleCanvas(N, 170, 0.05, 0.095, 11, false).getContext('2d').getImageData(0, 0, N, N).data;
  for (let i = 0; i < N * N; i++) {
    const h = H[i * 4];
    const zone = h > b + 10 ? 2 : h < b - 10 ? 0 : 1; // 2 rilievo, 1 campo, 0 inciso
    const rough = zone === 2 ? 0.14 : zone === 0 ? 0.5 : 0.2 + 0.05 * rnd();
    const dh = zone === 1 ? (dim[i * 4] - 128) * 0.45 : 0;
    const v = Math.round(rough * 255);
    R.data[i * 4] = 0; R.data[i * 4 + 1] = v; R.data[i * 4 + 2] = 0; R.data[i * 4 + 3] = 255;
    const hv = Math.max(0, Math.min(255, h + dh));
    B.data[i * 4] = B.data[i * 4 + 1] = B.data[i * 4 + 2] = hv; B.data[i * 4 + 3] = 255;
  }
  rg.putImageData(R, 0, 0); bg.putImageData(B, 0, 0);
  return { rc, bc };
}

/** Studio fotografico per i riflessi: cupola sfumata con strisce luminose e softbox. */
function makeEnv(T, r) {
  const env = new T.Scene(); env.background = new T.Color(0x0a0a0a);
  const hot = (w, h, k, x, y, z) => { const p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k), side: T.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); };
  const sky = document.createElement('canvas');
  sky.width = 512; sky.height = 256;
  const g = sky.getContext('2d'); const vg = g.createLinearGradient(0, 0, 0, 256);
  vg.addColorStop(0, '#ffffff'); vg.addColorStop(0.35, '#b8b0a4'); vg.addColorStop(0.5, '#2a2622'); vg.addColorStop(0.62, '#050505'); vg.addColorStop(1, '#000');
  g.fillStyle = vg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,.9)'; [40, 150, 300, 420].forEach((x, i) => g.fillRect(x, 30, 10 + i * 6, 110));
  const skyMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(sky), side: T.BackSide }); skyMat.color.setScalar(2.2);
  env.add(new T.Mesh(new T.SphereGeometry(20, 64, 32), skyMat));
  hot(4, 2.2, 5, -3, 4, 4); hot(0.6, 6, 3.5, 4.2, 0.5, 3); hot(0.5, 6, 2.5, -4.6, -0.5, 2); hot(6, 0.4, 2, 0, -3.5, 4); hot(3, 3, 1.2, 1, 2, -6); hot(1, 1, 6, 2.5, 3, 3);
  const pm = new T.PMREMGenerator(r);
  const tex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return tex;
}

/** Scena con la medaglia: { scene, cam, group, ready } (ready: promessa, facce caricate). */
function buildMedal(T, r, m, mini, envTex) {
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0, 4.7);
  scene.environment = envTex;
  scene.add(new T.AmbientLight(0xffffff, 0.15));
  const dl = new T.DirectionalLight(0xffffff, 1.1); dl.position.set(-2, 3, 4); scene.add(dl);
  const col = new T.Color(METAL[m.key][0]).convertSRGBToLinear();
  const metal = new T.MeshStandardMaterial({ color: col, metalness: 1, roughness: 0.2 });
  const group = new T.Group(); scene.add(group);
  // Corpo con bordo rialzato (tornito); punti a passo costante, così la martellatura sul bordo non si stira
  const fz = 0.015;
  const P0 = [[0, fz], [0.8, fz], [0.8, 0.07], [0.82, 0.125], [0.95, 0.135], [1, 0.085], [1, -0.085], [0.95, -0.135], [0.82, -0.125], [0.8, -0.07], [0.8, -fz], [0, -fz]].reverse().map(([x, y]) => new T.Vector2(x, y));
  const segL = P0.slice(1).map((p, k) => p.distanceTo(P0[k])), L = segL.reduce((a, b) => a + b, 0), P = [];
  for (let k = 0; k < P0.length - 1; k++) { const n = Math.max(1, Math.round((segL[k] / L) * (mini ? 80 : 160))); for (let t = 0; t < n; t++) P.push(P0[k].clone().lerp(P0[k + 1], t / n)); }
  P.push(P0[P0.length - 1].clone());
  const body = new T.LatheGeometry(P, mini ? 120 : 240); body.rotateX(Math.PI / 2);
  group.add(new T.Mesh(body, metal));
  const bt = new T.CanvasTexture(dimpleCanvas(512, 90, 0.07, 0.13, 5, true));
  bt.wrapS = bt.wrapT = T.RepeatWrapping; bt.repeat.set(Math.round((2 * Math.PI) / L) * 2, 2); bt.anisotropy = 8;
  metal.bumpMap = bt; metal.bumpScale = 0.012;
  // Facce
  const [alpha, ag] = canvasN(256);
  ag.fillStyle = '#000'; ag.fillRect(0, 0, 256, 256); ag.fillStyle = '#fff'; ag.beginPath(); ag.arc(128, 128, 127, 0, Math.PI * 2); ag.fill();
  const aTex = new T.CanvasTexture(alpha);
  const N = mini ? 512 : 1024;
  const face = (front) => {
    const seg = front ? (mini ? 180 : 400) : (mini ? 120 : 300);
    const mat = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: front ? 0.14 : 0.2, alphaMap: aTex, alphaTest: 0.5, displacementScale: 0.16, displacementBias: -0.16 * 0.32, bumpScale: 0.02, visible: false });
    const mesh = new T.Mesh(new T.PlaneGeometry(1.62, 1.62, seg, seg), mat);
    mesh.position.z = front ? 0.069 : -0.069; if (!front) mesh.rotation.y = Math.PI;
    group.add(mesh);
    return (front ? reliefCanvas(m, N) : backCanvas(m, N)).then(({ h, c, base }) => {
      const fm = finishMaps(h, base != null ? base : 0.32);
      const t = new T.CanvasTexture(h); t.anisotropy = 8;
      const ct = new T.CanvasTexture(c); ct.anisotropy = 8; ct.encoding = T.sRGBEncoding;
      mat.displacementMap = t; mat.map = ct;
      if (base != null) { mat.displacementScale = 0.08; mat.displacementBias = -0.08 * base; }
      const rt = new T.CanvasTexture(fm.rc), bt2 = new T.CanvasTexture(fm.bc); rt.anisotropy = bt2.anisotropy = 8;
      mat.roughnessMap = rt; mat.roughness = 1; mat.bumpMap = bt2; mat.bumpScale = base != null ? 0.025 : 0.02;
      mat.visible = true; mat.needsUpdate = true;
    });
  };
  const ready = Promise.all([face(true), face(false)]);
  return { scene, cam, group, ready };
}

const setupRenderer = (T, r) => { r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.9; };

/** Medaglia grande dentro box (il canvas è più grande del 24%, per i riflessi che escono dal bordo). */
function glMedal(box, m) {
  const T = window.THREE;
  const size = box.clientWidth, px = Math.round(size * 1.24);
  const r = new T.WebGLRenderer({ antialias: true, alpha: true });
  const pr0 = Math.min(2, devicePixelRatio || 1);
  r.setPixelRatio(pr0); r.setSize(px, px); setupRenderer(T, r);
  const cv = r.domElement; cv.className = 'md-glc'; box.append(cv);
  const md = buildMedal(T, r, m, false, makeEnv(T, r));
  let ang = 0, tilt = 0; const t0 = performance.now();
  const tick = (t) => {
    if (!cv.isConnected) { r.dispose(); try { r.forceContextLoss(); } catch { /* già perso */ } return; }
    md.group.rotation.y = (ang * Math.PI) / 180;
    md.group.rotation.x = (tilt * Math.PI) / 180 + Math.sin((t - t0) / 900) * 0.07;
    r.render(md.scene, md.cam);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { ready: md.ready, setAngle: (a) => (ang = a), setTilt: (a) => (tilt = a), setRes: (z) => { r.setPixelRatio(Math.min(4, pr0 * Math.max(1, z))); r.setSize(px, px); } };
}

// ---------- Overlay ----------

let ui = null; // { el, sec, gl, ... } overlay aperto
const timers = [];
const later = (ms, fn) => timers.push(setTimeout(fn, ms));
function clearTimers() { timers.splice(0).forEach(clearTimeout); }

function tabTarget() {
  const b = document.querySelector('.tabbar button[data-tab="classifica"]');
  return b && !b.closest('[hidden]') ? b : null;
}

function overlayHTML(m, lost, eyebrow, sub) {
  const [c, c2] = METAL[m.key];
  return `<div class="mdw in" style="--c:${c};--c2:${c2}" role="dialog" aria-label="${esc(lost ? 'Medaglia strappata' : 'Medaglia vinta')}: ${esc(m.label)}">
    <button class="mdw-x" aria-label="Chiudi">×</button>
    <section class="md-s${lost ? ' lost' : ''}">
      <div class="md-glow"></div>
      <p class="md-eb" data-a style="--d:.1">${esc(eyebrow)}</p>
      <div class="md-medal"><div class="md-coin"></div></div>
      <h1 class="md-t${m.label.length > 12 ? ' long' : ''}" data-a style="--d:${lost ? 1.2 : 1.7}">${esc(m.label)}</h1>
      <p class="md-pill" data-a style="--d:${lost ? 1.5 : 2.05}">${lost ? `<b>-${m.pts}</b> punti` : m.pts ? `<b data-count="${m.pts}">+0</b> punti` : '<b>0</b> punti'}</p>
      <p class="md-sub" data-a style="--d:${lost ? 1.8 : 2.4}">${sub}</p>
    </section>
  </div>`;
}

function flatCoin(box, m) {
  box.innerHTML = `<div class="md-flat"><i>${ICON[m.key]}</i></div>`;
}

function countUp(root) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count), t0 = performance.now();
    const tick = (t) => { const f = Math.min(1, (t - t0) / 900); el.textContent = `+${Math.round(to * (1 - Math.pow(1 - f, 3)))}`; if (f < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}

/** Apre la medaglia a tutto schermo. opts: { eyebrow, target (dove vola alla chiusura), lost, sub, onClose } */
async function openOverlay(m, opts = {}) {
  closeOverlay(true);
  const lost = !!opts.lost;
  const wrap = document.createElement('div');
  wrap.innerHTML = overlayHTML(m, lost, opts.eyebrow || (m.key === 'divano' ? 'Premiazioni · settimana' : 'Medaglia vinta'), opts.sub || subFor(m, opts.all));
  const el = wrap.firstElementChild;
  document.body.append(el);
  const sec = el.querySelector('.md-s'), box = el.querySelector('.md-coin');
  ui = { el, sec, m, opts, gl: null, done: false };
  const me = ui;
  let gl = null;
  if (webglOk()) {
    try { await loadThree(); gl = glMedal(box, m); } catch { gl = null; }
  }
  if (ui !== me) return; // chiusa nel frattempo
  if (!gl) flatCoin(box, m);
  ui.gl = gl;
  const start = () => {
    if (ui !== me) return;
    requestAnimationFrame(() => sec.classList.add('on'));
    if (gl) { // entra girando e rallenta fino al fronte
      const t0 = performance.now() + 300;
      const tw = (t) => { if (ui !== me || me.touched) return; const p = Math.max(0, Math.min(1, (t - t0) / 1700)); gl.setAngle(-720 * Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(tw); };
      gl.setAngle(-720); requestAnimationFrame(tw);
    }
    if (lost) {
      later(2600, () => {
        const medal = sec.querySelector('.md-medal');
        const t0 = performance.now();
        const step = (t) => { const p = Math.min(1, (t - t0) / 1100); if (gl) { gl.setAngle(900 * p * p); gl.setTilt(-30 * p); } if (p < 1 && ui === me) requestAnimationFrame(step); };
        requestAnimationFrame(step);
        medal.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(140px, -420px) scale(.3)', opacity: 0 }], { duration: 1100, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
      });
      el.addEventListener('click', () => closeOverlay());
    } else {
      later(2150, () => countUp(sec));
      later(1500, () => sec.querySelector('.md-medal').classList.add('glowing'));
      interact(me);
    }
  };
  // aspetta le facce (al massimo 2,5 s), così la medaglia non compare liscia
  if (gl) Promise.race([gl.ready, new Promise((r) => setTimeout(r, 2500))]).then(start, start);
  else start();
  el.querySelector('.mdw-x').onclick = (e) => { e.stopPropagation(); if (lost) closeOverlay(); else fly(me, 0); };
}

function closeOverlay(silent) {
  clearTimers();
  if (!ui) return;
  const u = ui;
  ui = null;
  u.el.remove();
  if (!silent && u.opts.onClose) u.opts.onClose();
}

/** Chiusura: la medaglia vola nel tab Classifica (o nella medaglia piccola da cui è stata aperta). */
function fly(u, fromY) {
  if (u.busy || ui !== u) return;
  u.busy = true;
  const medal = u.sec.querySelector('.md-medal');
  const z0 = u.zoom || 1;
  medal.style.transform = '';
  const tgt = u.opts.target && u.opts.target.isConnected ? u.opts.target : tabTarget();
  if (!tgt) return closeOverlay();
  const tb = (tgt.querySelector('svg, canvas') || tgt).getBoundingClientRect(), mb = u.sec.querySelector('.md-coin').getBoundingClientRect();
  const dx = tb.left + tb.width / 2 - (mb.left + mb.width / 2), dy = tb.top + tb.height / 2 - (mb.top + mb.height / 2) + fromY;
  u.el.classList.add('leaving');
  u.sec.querySelectorAll('[data-a]').forEach((x) => x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: 250, fill: 'forwards' }));
  medal.animate([
    { transform: `translateY(${fromY}px) scale(${(1 - fromY / 900) * z0})` },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.55}px) scale(.45)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0.7 },
  ], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
  if (u.gl) {
    const a0 = u.ry || 0, t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 750); u.gl.setAngle(a0 + 540 * p); if (p < 1 && ui === u) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  later(760, () => {
    const fromChip = u.opts.target && u.opts.target.isConnected;
    closeOverlay();
    const anim = (x, cls) => { x.classList.remove(cls); void x.offsetWidth; x.classList.add(cls); setTimeout(() => x.classList.remove(cls), 900); };
    if (fromChip) anim(u.opts.target, 'md-pulse');
    else anim(tgt, 'md-bump');
  });
}

/* Interazioni: trascina sulla medaglia per girarla in ogni direzione (con inerzia, poi torna dritta), tocco per
   lanciarla come una moneta, due dita per lo zoom, scorri giù / × / tocco fuori: vola nel tab Classifica. */
function interact(u) {
  const { sec, gl } = u;
  const medal = sec.querySelector('.md-medal');
  let ry = 0, rx = 0, vy = 0, vx = 0, down = null, last = null, mode = '', ready = false, anim = 0, zoom = 1, pinch = null;
  const pts = new Map();
  const put = () => { u.ry = ry; if (gl) { gl.setAngle(ry); gl.setTilt(rx); } };
  const setZoom = (z, smooth) => {
    if (zoom <= 1.001) { const cw = sec.querySelector('.md-coin').getBoundingClientRect(); medal._oy = innerHeight / 2 - (cw.top + cw.height / 2); }
    zoom = Math.max(1, Math.min(2.4, z)); u.zoom = zoom;
    const tf = `translateY(${(medal._oy || 0) * Math.min(1, zoom - 1)}px) scale(${zoom})`;
    if (smooth) medal.animate([{ transform: medal.style.transform || 'none' }, { transform: zoom > 1.001 ? tf : 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    medal.style.transform = zoom > 1.001 ? tf : '';
    sec.style.setProperty('--fade', Math.max(0, 1 - (zoom - 1) * 1.6));
    medal.style.zIndex = zoom > 1.001 ? 5 : '';
  };
  let resT = 0; const fixRes = () => { clearTimeout(resT); resT = setTimeout(() => gl && gl.setRes(zoom), 120); };
  later(2050, () => { ready = true; });
  const settle = () => {
    cancelAnimationFrame(anim);
    const step = () => {
      if (ui !== u) return;
      vy *= 0.94; vx *= 0.94;
      if (Math.hypot(vx, vy) > 0.5) { ry += vy; rx += vx; put(); anim = requestAnimationFrame(step); return; }
      const ty = Math.round(ry / 180) * 180, tx = Math.round(rx / 360) * 360; // torna dritta: fronte o retro
      ry += (ty - ry) * 0.1; rx += (tx - rx) * 0.1; put();
      if (Math.abs(ty - ry) + Math.abs(tx - rx) < 0.3) { ry = ty; rx = tx; put(); return; }
      anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  };
  const toss = () => {
    if (!gl) return;
    u.busy = true; cancelAnimationFrame(anim);
    const H = Math.min(200, medal.getBoundingClientRect().top + 40), D = 1150, back = Math.random() < 0.5;
    const ry0 = Math.round(ry / 180) * 180, turns = 3 + Math.floor(Math.random() * 2), ry1 = ry0 + turns * 360 + (back ? 180 : 0), rx0 = rx;
    const t0 = performance.now();
    const step = (t) => {
      if (ui !== u) return;
      const p = Math.min(1, (t - t0) / D);
      medal.style.transform = `translateY(${-4 * H * p * (1 - p)}px) scale(${1 + 0.18 * Math.sin(Math.PI * p)})`;
      ry = ry0 + (ry1 - ry0) * (1 - Math.pow(1 - p, 1.6)); rx = rx0 * (1 - p) + 25 * Math.sin(Math.PI * p * turns); put();
      if (p < 1) { anim = requestAnimationFrame(step); return; }
      ry = ry1; rx = 0; put();
      medal.animate([{ transform: 'translateY(0) scaleY(.92)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 380, easing: 'ease-out' });
      medal.style.transform = ''; u.busy = false;
    };
    anim = requestAnimationFrame(step);
  };
  sec.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || u.busy) return;
    u.touched = true;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { // due dita: zoom
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; mode = 'pinch'; cancelAnimationFrame(anim);
      return;
    }
    down = { x: e.clientX, y: e.clientY, onCoin: !!e.target.closest('.md-medal') };
    last = { x: e.clientX, y: e.clientY, t: performance.now() }; mode = '';
    if (down.onCoin) cancelAnimationFrame(anim);
    try { sec.setPointerCapture(e.pointerId); } catch { /* niente */ }
  });
  sec.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch') {
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(20, pinch.d)); }
      return;
    }
    if (!down || !ready || u.busy) return;
    const tx = e.clientX - down.x, ty = e.clientY - down.y, now = performance.now();
    if (!mode && Math.hypot(tx, ty) > 8) mode = (down.onCoin && gl) || zoom > 1.05 ? 'rot' : ty > 0 && Math.abs(ty) > Math.abs(tx) ? 'swipe' : 'none';
    const dx = e.clientX - last.x, dy = e.clientY - last.y, dt = Math.max(8, now - last.t);
    if (mode === 'rot') { ry += dx * 0.9; rx += dy * 0.9; vy = ((dx * 0.9) / dt) * 16; vx = ((dy * 0.9) / dt) * 16; put(); }
    if (mode === 'swipe') { const k = Math.max(0, ty); medal.style.transform = `translateY(${k * 0.6}px) scale(${1 - k / 1500})`; sec.style.setProperty('--fade', Math.max(0.3, 1 - k / 300)); }
    last = { x: e.clientX, y: e.clientY, t: now };
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (mode === 'pinch') { if (pts.size === 0) { mode = ''; down = null; pinch = null; if (zoom < 1.08) setZoom(1, true); fixRes(); } return; }
    if (!down) return;
    const d = down; down = null;
    if (u.busy) return;
    if (mode === 'rot') return settle();
    if (mode === 'swipe') {
      const ty = e.clientY - d.y;
      if (ty > 90) return fly(u, ty * 0.6);
      medal.animate([{ transform: medal.style.transform || 'none' }, { transform: 'none' }], { duration: 250, easing: 'ease-out' });
      medal.style.transform = ''; sec.style.removeProperty('--fade'); return;
    }
    if (mode) return;
    if (d.onCoin && ready) { if (zoom <= 1.05) toss(); return; }
    if (zoom > 1.05) { setZoom(1, true); fixRes(); return; } // tocco fuori da zoomata: torna normale
    fly(u, 0);
  };
  sec.addEventListener('pointerup', up);
  sec.addEventListener('pointercancel', up);
}

// ---------- Medaglie piccole (Classifica): icone 2D, toccandole si aprono in 3D ----------

/** HTML di una medaglia piccola (bottone). */
function chipHTML(m, i) {
  const [c, c2] = METAL[m.key];
  return `<button type="button" class="md-chip" data-i="${i}" style="--c:${c};--c2:${c2}" aria-label="${esc(m.label)}"><i>${ICON[m.key]}</i></button>`;
}

// ---------- Controllo: medaglie nuove o strappate ----------

export function createMedals({ getState, store, isBlocked, mode }) {
  let pending = null; // timer di riprova finché qualcosa copre lo schermo
  let showing = false;
  let chipList = []; // medaglie delle chip in pagina, per indice

  const storeKey = (name, month) => `medaglie|${name}|${mode()}|${month}`;
  const monthNow = () => todayStr().slice(0, 7);

  /** Medaglie da mostrare: le mie nuove e quelle che mi hanno strappato. */
  function todo(state) {
    const me = state && state.me && state.me.name;
    if (!me || !state.points) return null;
    if (state.points.month !== MESI[new Date().getMonth()]) return null; // stato salvato del mese prima: si aspetta quello nuovo
    const all = allMedals(state);
    const have = mine(all, me);
    const k = storeKey(me, monthNow());
    const dk = storeKey(me, 'divani'); // il Divano è settimanale: non riparte col mese nuovo
    const initK = `medaglie-init|${me}|${mode()}`;
    if (!store.get(initK)) { // prima volta: le medaglie già vinte non si festeggiano di nuovo
      store.set(initK, 1);
      store.set(k, have.filter((m) => m.key !== 'divano').map(idOf));
      store.set(dk, have.filter((m) => m.key === 'divano').map(idOf));
      return null;
    }
    const ack = Array.isArray(store.get(k)) ? store.get(k) : [];
    const dack = Array.isArray(store.get(dk)) ? store.get(dk) : [];
    const gained = have.find((m) => !(m.key === 'divano' ? dack : ack).includes(idOf(m)));
    if (gained) {
      const id = idOf(gained);
      return { m: gained, all, mark: () => (gained.key === 'divano' ? store.set(dk, dack.concat(id).slice(-10)) : store.set(k, ack.concat(id))) };
    }
    const lostId = ack.find((id) => STOLEN.includes(id) && !have.some((m) => idOf(m) === id));
    if (lostId) {
      const holder = (all[lostId] || [])[0];
      const label = lostId === 'pomodoro' ? 'Pomodoro del mese' : 'Gladiatore';
      return { m: { key: lostId, label, pts: lostId === 'pomodoro' ? 10 : 5, who: '?', name: '', period: '', note: '', when: '' }, holder, lost: true, all, mark: () => store.set(k, ack.filter((x) => x !== lostId)) };
    }
    return null;
  }

  function check() {
    clearTimeout(pending); pending = null;
    if (showing) return;
    const state = getState();
    const t = todo(state);
    if (!t) return;
    if (isBlocked() || document.hidden) { pending = setTimeout(check, 1500); return; }
    showing = true;
    // segnata subito come vista: se l'app si chiude a metà non riparte
    t.mark();
    const done = () => { showing = false; setTimeout(check, 600); };
    if (t.lost) {
      const h = t.holder;
      const sub = h
        ? `${t.m.key === 'pomodoro' ? `<b>${esc(h.who)}</b> ti ha superato al Sudometro: <b>${num(h.note, '')}</b>.` : `<b>${esc(h.who)}</b> ti ha superato: <b>${num(h.note, '')}</b> sfide vinte.`}<br>C'è tempo fino a fine mese.`
        : 'Non è più tua. C\'è tempo fino a fine mese.';
      const m = h ? { ...h, pts: t.m.pts } : t.m;
      openOverlay(m, { lost: true, eyebrow: 'Medaglia strappata', sub, onClose: done }).catch(done);
    } else {
      openOverlay(t.m, { all: t.all, onClose: done }).catch(done);
    }
  }

  /** Medaglie piccole accanto al nome nella classifica a punti (HTML) e lista per "Medaglie del mese". */
  function chipsFor(name) {
    const state = getState();
    const list = mine(allMedals(state), name);
    return {
      html: list.map((m) => { chipList.push(m); return chipHTML(m, chipList.length - 1); }).join(''),
      names: list.map((m) => m.label.replace(' del mese', '')),
    };
  }
  function resetChips() { chipList = []; }

  /** Dopo aver messo le chip nella pagina: le collega al tocco. */
  function mountChips(root) {
    root.querySelectorAll('.md-chip').forEach((b) => {
      const m = chipList[Number(b.dataset.i)];
      if (!m) return;
      b.onclick = (e) => {
        e.stopPropagation();
        if (!m.who) return; // medaglia ancora di nessuno
        openOverlay(m, { all: allMedals(getState()), eyebrow: `Vinta da ${m.who}`, target: b });
      };
    });
  }

  /** Prova: le mie medaglie del mese tornano da vedere. */
  function replay() {
    const state = getState();
    const me = state && state.me && state.me.name;
    if (!me) return;
    store.set(`medaglie-init|${me}|${mode()}`, 1);
    store.set(storeKey(me, monthNow()), []);
    store.set(storeKey(me, 'divani'), []);
    check();
  }

  return { check, chipsFor, resetChips, mountChips, replay, isOpen: () => !!ui };
}
