// Corona del Re in 3D: incoronazione a tutto schermo (tocco sulla corona in Classifica) e corona della slide del Re.
// Oro martellato, 6 punte come la corona 2D (#i-crown), 6 smeraldi a taglio smeraldo. Scende girando e resta ferma di fronte.
// three.js (vendor/three-r128.min.js) si carica solo quando serve, come per le medaglie.

let T = null; // window.THREE, dopo loadThree()
const FIN = 'martellata', GEMS = true;
let threeP = null;

function loadThree() {
  if (window.THREE) return Promise.resolve((T = window.THREE));
  if (!threeP) {
    threeP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = new URL('./vendor/three-r128.min.js', import.meta.url).href;
      s.onload = () => (window.THREE ? res((T = window.THREE)) : rej(new Error('three.js')));
      s.onerror = () => { threeP = null; rej(new Error('three.js non caricato')); };
      document.head.append(s);
    });
  }
  return threeP;
}

export function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (err) {
    return false;
  }
}

/* ---------- Martellatura: colpi tondi sfumati, piastrellabili ---------- */
function dimples(N, count, rmin, rmax, seed) {
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N);
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < count; k++) {
    const x0 = r() * N, y0 = r() * N, rad = N * (rmin + r() * (rmax - rmin));
    [-N, 0, N].forEach((ox) => [-N, 0, N].forEach((oy) => {
      const x = x0 + ox, y = y0 + oy;
      if (x + rad < 0 || x - rad > N || y + rad < 0 || y - rad > N) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(0,0,0,.38)'); gr.addColorStop(0.55, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }));
  }
  return c;
}

/* ---------- Studio fotografico per i riflessi ---------- */
function makeEnv(r) {
  const env = new T.Scene(); env.background = new T.Color(0x0a0a0a);
  const hot = (w, h, k, x, y, z, col) => { const p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col || 0xffffff).multiplyScalar(k), side: T.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); env.add(p); };
  const sky = document.createElement('canvas'); sky.width = 512; sky.height = 256;
  const g = sky.getContext('2d'); const vg = g.createLinearGradient(0, 0, 0, 256);
  vg.addColorStop(0, '#ffffff'); vg.addColorStop(0.35, '#c4b8a2'); vg.addColorStop(0.5, '#2e2820'); vg.addColorStop(0.62, '#060504'); vg.addColorStop(1, '#000');
  g.fillStyle = vg; g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,.95)'; [30, 120, 200, 300, 410, 470].forEach((x, i) => g.fillRect(x, 26, 8 + (i % 3) * 7, 120));
  const skyMat = new T.MeshBasicMaterial({ map: new T.CanvasTexture(sky), side: T.BackSide }); skyMat.color.setScalar(2.2);
  env.add(new T.Mesh(new T.SphereGeometry(20, 64, 32), skyMat));
  hot(4, 2.2, 5, -3, 4, 4); hot(0.6, 6, 3.5, 4.2, 0.5, 3); hot(0.5, 6, 2.5, -4.6, -0.5, 2); hot(6, 0.4, 2, 0, -3.5, 4); hot(3, 3, 1.2, 1, 2, -6); hot(1, 1, 6, 2.5, 3, 3); hot(2, 0.5, 3, 0, 5, -2);
  const pm = new T.PMREMGenerator(r); const tex = pm.fromScene(env, 0.03).texture; pm.dispose();
  return tex;
}

/* ---------- Corona ---------- */
// Profilo del bordo alto: sei punte (alte a 0° e 180°, basse a ±60° e ±120°) con valli a V in mezzo,
// come la corona 2D: punta alta al centro, due più basse ai lati.
const R = 1, TH = 0.06, YV = 0.5, YHI = 1.32, YLO = 1.0, FLARE = 0.13;
const tipH = (k) => (k % 3 === 0 ? YHI : YLO); // punta k a k·60°
function topY(a) {
  const u = ((a / (Math.PI / 3)) % 6 + 6) % 6, k = Math.floor(u + 0.5) % 6, d = Math.abs(u - Math.round(u)); // d: 0 sulla punta, 0.5 nella valle
  const hTip = tipH(k);
  const t = d / 0.5;
  // lato della punta leggermente concavo, come una corona vera
  return YV + (hTip - YV) * Math.pow(1 - t, 1.25);
}
const radAt = (y) => R * (1 + FLARE * Math.max(0, y) / YHI);

function bandGeometry() {
  const NA = 1440; // colonne attorno alla corona
  // Sezione: esterno su, bordo arrotondato, interno giù, fondo arrotondato
  const cs = []; const NS = 26, NC = 8;
  for (let i = 0; i <= NS; i++) cs.push({ side: 1, f: i / NS });
  for (let i = 1; i < NC; i++) cs.push({ cap: 'top', f: i / NC });
  for (let i = 0; i <= NS; i++) cs.push({ side: -1, f: 1 - i / NS });
  for (let i = 1; i < NC; i++) cs.push({ cap: 'bot', f: i / NC });
  const M = cs.length;
  const pos = new Float32Array((NA + 1) * M * 3), uv = new Float32Array((NA + 1) * M * 2), outer = new Float32Array((NA + 1) * M);
  const yb = 0.0;
  for (let j = 0; j <= NA; j++) {
    const a = (j / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const yt = topY(a) - TH / 2;
    cs.forEach((c, i) => {
      let y, off;
      if (c.side) { const f = Math.pow(c.f, 0.85); y = yb + (yt - yb) * f; off = (c.side * TH) / 2; }
      else if (c.cap === 'top') { const th = Math.PI * c.f; y = yt + Math.sin(th) * TH / 2; off = Math.cos(th) * TH / 2; }
      else { const th = Math.PI * c.f; y = yb - Math.sin(th) * TH / 2; off = -Math.cos(th) * TH / 2; }
      const rr = radAt(y) + off;
      const k = (j * M + i);
      pos[k * 3] = sa * rr; pos[k * 3 + 1] = y; pos[k * 3 + 2] = ca * rr;
      uv[k * 2] = (j / NA) * 6; uv[k * 2 + 1] = y * 1.0;
      outer[k] = c.side === 1 ? 1 : 0;
    });
  }
  const idx = [];
  for (let j = 0; j < NA; j++) for (let i = 0; i < M; i++) {
    const a = j * M + i, b = j * M + ((i + 1) % M), c = (j + 1) * M + i, d = (j + 1) * M + ((i + 1) % M);
    idx.push(a, c, b, b, c, d);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // cucitura: normali uguali sulla prima e ultima colonna
  const n = g.attributes.normal.array;
  for (let i = 0; i < M; i++) { const a = i * 3, b = (NA * M + i) * 3; for (let q = 0; q < 3; q++) { const v = (n[a + q] + n[b + q]) / 2; n[a + q] = n[b + q] = v; } }
  return g;
}

function buildCrown(envTex) {
  const scene = new T.Scene();
  scene.environment = envTex;
  scene.add(new T.AmbientLight(0xffffff, 0.12));
  const dl = new T.DirectionalLight(0xfff2d6, 1.2); dl.position.set(-2, 4, 4); scene.add(dl);
  const rim = new T.DirectionalLight(0xffffff, 0.6); rim.position.set(3, 1, -3); scene.add(rim);
  const gold = new T.Color('#f4c14a').convertSRGBToLinear();
  const hammer = FIN === 'martellata';
  const mat = new T.MeshStandardMaterial({ color: gold, metalness: 1, roughness: hammer ? 0.16 : 0.07 });
  if (hammer) {
    const bt = new T.CanvasTexture(dimples(512, 120, 0.045, 0.085, 13));
    bt.wrapS = bt.wrapT = T.RepeatWrapping; bt.repeat.set(1, 1); bt.anisotropy = 8;
    mat.bumpMap = bt; mat.bumpScale = 0.006;
  }
  const smooth = new T.MeshStandardMaterial({ color: gold, metalness: 1, roughness: 0.06 }); // sfere e cornici sempre lisce e lucide
  const group = new T.Group(); scene.add(group);
  const crown = new T.Group(); group.add(crown);
  crown.add(new T.Mesh(bandGeometry(), mat));
  // Fascia alla base (la riga sotto la corona 2D) e cornicetta sopra
  const ring = (y, tube, rr = radAt(y)) => { const m = new T.Mesh(new T.TorusGeometry(rr, tube, 32, 240), smooth); m.rotation.x = Math.PI / 2; m.position.y = y; crown.add(m); return m; };
  // Toroide alla base: martellato come la fascia (colpi un po' più piccoli, il tubo è stretto)
  const base = ring(-0.02, 0.085, R + 0.01);
  const tb = new T.CanvasTexture(dimples(512, 120, 0.045, 0.085, 29));
  tb.wrapS = tb.wrapT = T.RepeatWrapping; tb.repeat.set(12, 1); tb.anisotropy = 8;
  base.material = new T.MeshStandardMaterial({ color: gold, metalness: 1, roughness: 0.16, bumpMap: tb, bumpScale: 0.005 });
  ring(0.16, 0.028, radAt(0.16) + 0.02);
  ring(YV - 0.1, 0.022, radAt(YV - 0.1) + 0.015);
  // Cordone lucido lungo il bordo delle punte (il contorno della corona 2D)
  class Edge extends T.Curve {
    getPoint(t, out = new T.Vector3()) { const a = t * Math.PI * 2, y = topY(a) - TH * 0.35, r = radAt(y) + TH * 0.5; return out.set(Math.sin(a) * r, y, Math.cos(a) * r); }
  }
  crown.add(new T.Mesh(new T.TubeGeometry(new Edge(), 2400, 0.024, 12, true), smooth));
  // perline tra le due cornici
  const bead = new T.SphereGeometry(0.03, 20, 14);
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2, y = (0.16 + YV - 0.1) / 2, rr = radAt(y) + 0.035;
    if (GEMS && [0, 1, 7].includes(k % 8)) continue; // lì c'è lo smeraldo
    const m = new T.Mesh(bead, smooth); m.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr); crown.add(m);
  }
  // Sfere sulle punte
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3, h = tipH(k), rad = k % 3 === 0 ? 0.11 : 0.09, rr = radAt(h);
    const m = new T.Mesh(new T.SphereGeometry(rad, 40, 28), smooth);
    m.position.set(Math.sin(a) * rr, h + rad * 0.55, Math.cos(a) * rr); crown.add(m);
  }
  // Smeraldi a taglio smeraldo (ottagono a gradini) incastonati nella fascia, sotto ogni punta
  if (GEMS) crown.add(...emeralds(smooth));
  crown.position.y = -0.62;
  return { scene, group };
}

/* Smeraldo: tavola ottagonale e gradini (corona), padiglione nascosto nel castone. Facce piatte che riflettono
   lo studio come un taglio vero; dentro un nucleo più scuro e luminoso per dare profondità. */
function emeraldGeo(w, h, c, d) {
  const oct = (s) => { const x = (w / 2) * s, y = (h / 2) * s, cx = c * s; return [[-x + cx, y], [x - cx, y], [x, y - cx], [x, -y + cx], [x - cx, -y], [-x + cx, -y], [-x, -y + cx], [-x, y - cx]]; };
  const rings = [[1, 0], [0.9, d * 0.32], [0.8, d * 0.6], [0.66, d * 0.82], [0.62, d * 0.84], [0.62, d * 0.84]];
  const rs = [[1, 0], [0.92, d * 0.3], [0.82, d * 0.58], [0.7, d * 0.8], [0.66, d]];
  const pos = [];
  const P = rs.map(([sc, z]) => oct(sc).map(([x, y]) => [x, y, z]));
  for (let r = 0; r < P.length - 1; r++) for (let i = 0; i < 8; i++) {
    const a = P[r][i], b = P[r][(i + 1) % 8], cc = P[r + 1][(i + 1) % 8], dd = P[r + 1][i];
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
  }
  const top = P[P.length - 1], ctr = [0, 0, d];
  for (let i = 0; i < 8; i++) pos.push(...ctr, ...top[i], ...top[(i + 1) % 8]);
  // padiglione (sotto la cintura)
  const tip = [0, 0, -d * 0.9], g0 = P[0];
  for (let i = 0; i < 8; i++) pos.push(...tip, ...g0[(i + 1) % 8], ...g0[i]);
  void rings;
  for (let i = 0; i < pos.length; i += 9) for (let q = 0; q < 3; q++) { const t = pos[i + 3 + q]; pos[i + 3 + q] = pos[i + 6 + q]; pos[i + 6 + q] = t; } // facce verso l'esterno
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return { g, oct };
}
function emeralds(smooth) {
  const out = [];
  // vetro verde: trasparente (si vede l'oro dietro, tinto di verde), faccette lucidissime che riflettono lo studio
  const outer = new T.MeshPhysicalMaterial({ color: new T.Color('#05863f').convertSRGBToLinear(), metalness: 0, roughness: 0, clearcoat: 1, clearcoatRoughness: 0, reflectivity: 0.7, envMapIntensity: 1.4, transparent: true, opacity: 0.62, depthWrite: false });
  const core = new T.MeshStandardMaterial({ color: new T.Color('#0a9a4c').convertSRGBToLinear(), metalness: 1, roughness: 0.04, emissive: new T.Color('#045c2a'), emissiveIntensity: 0.6, envMapIntensity: 1.3 }); // fuoco interno: brilla verde come la luce dentro la pietra
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3, y = 0.28, rr = radAt(y) + TH / 2 + 0.006, s = k % 3 === 0 ? 1 : 0.85;
    const w = 0.155 * s, h = 0.2 * s, c = 0.04 * s, d = 0.06 * s;
    const grp = new T.Group();
    const { g, oct } = emeraldGeo(w, h, c, d);
    const gem = new T.Mesh(g, outer); gem.renderOrder = 2; grp.add(gem);
    const inner = new T.Mesh(emeraldGeo(w * 0.86, h * 0.86, c * 0.86, d * 0.8).g, core); inner.position.z = -0.002; grp.add(inner);
    // castone: cornice d'oro attorno alla cintura e quattro griffe
    const pts = oct(1.06).map(([x, y]) => new T.Vector3(x, y, 0.004));
    const path = new T.CurvePath(); pts.forEach((p, i) => path.add(new T.LineCurve3(p, pts[(i + 1) % 8])));
    grp.add(new T.Mesh(new T.TubeGeometry(path, 160, 0.011 * s, 10, true), smooth));
    [1, 3, 5, 7].forEach((i) => { const p = pts[i].clone().lerp(pts[(i + 1) % 8], 0.5).multiplyScalar(0.97); const pr = new T.Mesh(new T.SphereGeometry(0.014 * s, 16, 12), smooth); pr.position.set(p.x, p.y, d * 0.3); pr.scale.set(1, 1, 0.8); grp.add(pr); });
    grp.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr); grp.lookAt(Math.sin(a) * 5, y, Math.cos(a) * 5);
    out.push(grp);
  }
  return out;
}

/* ---------- Palco: renderer + corona, usato dall'incoronazione e dalla slide ---------- */
const STAGE = { r: null, env: null, cur: null };
async function stage(box) {
  await loadThree();
  if (!STAGE.r) {
    STAGE.r = new T.WebGLRenderer({ antialias: true, alpha: true });
    STAGE.r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    STAGE.r.outputEncoding = T.sRGBEncoding; STAGE.r.toneMapping = T.ACESFilmicToneMapping; STAGE.r.toneMappingExposure = 0.95;
    STAGE.env = makeEnv(STAGE.r);
    STAGE.cur = buildCrown(STAGE.env);
  }
  const w = box.clientWidth || 340, h = box.clientHeight || 330;
  STAGE.r.setSize(w, h);
  box.append(STAGE.r.domElement);
  const cam = new T.PerspectiveCamera(28, w / h, 0.1, 50);
  cam.position.set(0, 1.3, 5.6); cam.lookAt(0, -0.05, 0);
  return { r: STAGE.r, scene: STAGE.cur.scene, g: STAGE.cur.group, cam };
}

/** Corona della slide del Re: scende girando ogni volta che la slide si accende. false se il 3D non c'è. */
export async function slideCrown(box, slide) {
  if (!webglOk()) return false;
  let s;
  try { s = await stage(box); } catch (err) { return false; }
  let raf = 0, t0 = 0;
  const loop = (t) => {
    const p = Math.min(1, Math.max(0, (t - t0) / 1700)), e = 1 - Math.pow(1 - p, 3);
    s.g.position.y = 1.8 * (1 - e); s.g.rotation.set(0, -Math.PI * 3 * (1 - e), 0); s.g.scale.setScalar(0.7 + 0.3 * e);
    s.r.render(s.scene, s.cam);
    if (p < 1) raf = requestAnimationFrame(loop);
    else if (!box.classList.contains('lit')) box.classList.add('lit');
  };
  const run = () => {
    cancelAnimationFrame(raf);
    box.classList.remove('lit');
    if (!slide.classList.contains('on')) return;
    if (s.r.domElement.parentNode !== box) box.append(s.r.domElement);
    t0 = performance.now() + 200; raf = requestAnimationFrame(loop);
  };
  new MutationObserver(run).observe(slide, { attributes: true, attributeFilter: ['class'] });
  run();
  return true;
}

/* ---------- Incoronazione a tutto schermo ---------- */
let ui = null;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Apre l'incoronazione: { name, eyebrow ("Re di ottobre"), sub ("<b>Re</b> di ottobre"), total, from (corona da cui esce e in cui torna) } */
export async function openCoronation(o) {
  closeCoronation();
  const el = document.createElement('div');
  el.className = 'crw';
  el.innerHTML = `<button class="crw-x" aria-label="Chiudi">×</button>
    <section class="crw-s"><p class="crw-eb" data-a style="--d:.1">${esc(o.eyebrow)}</p>
      <div class="crw-stage"><div class="crw-glow"></div></div>
      <h1 class="crw-t${String(o.name).length > 9 ? ' long' : ''}" data-a style="--d:.5">${esc(o.name)}</h1>
      <p class="crw-sub" data-a style="--d:.7">${o.sub || ''}</p>
      ${o.total ? `<p class="crw-pill" data-a style="--d:.9"><b>${esc(o.total)}</b> punti</p>` : ''}</section>`;
  document.body.append(el);
  const sec = el.querySelector('.crw-s'), box = el.querySelector('.crw-stage');
  const u = { el, sec, box, from: o.from, ry: 0, rx: 0, vy: 0, drag: null, entering: 0, busy: false, s: null, raf: 0 };
  ui = u;
  el.querySelector('.crw-x').onclick = (e) => { e.stopPropagation(); fly(u, 0); };
  if (webglOk()) { try { u.s = await stage(box); } catch (err) { u.s = null; } }
  if (ui !== u) return;
  if (!u.s) box.insertAdjacentHTML('beforeend', '<svg class="crw-flat" viewBox="0 0 24 20"><use href="#i-crown"/></svg>');
  requestAnimationFrame(() => sec.classList.add('on'));
  if (u.from && u.from.isConnected) { // esce dalla corona della Classifica e si gira di fronte
    const fb = u.from.getBoundingClientRect(), sb = box.getBoundingClientRect();
    const dx = fb.left + fb.width / 2 - (sb.left + sb.width / 2), dy = fb.top + fb.height / 2 - (sb.top + sb.height / 2);
    box.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.1)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  setTimeout(() => { if (ui === u) sec.classList.add('lit'); }, 500);
  u.entering = performance.now();
  if (u.s) loop(u);
  interact(u);
}

function loop(u, t = performance.now()) {
  if (ui !== u) return;
  const g = u.s.g;
  const p = Math.min(1, (t - u.entering) / 650);
  if (u.entering && p < 1) {
    const e = 1 - Math.pow(1 - p, 3);
    g.position.y = 0; g.scale.setScalar(1); g.rotation.set(0, -Math.PI * 2 * (1 - e), 0);
  } else if (!u.busy) {
    if (u.entering) { u.entering = 0; u.ry = 0; }
    if (!u.drag) { u.vy *= 0.92; u.ry += u.vy; u.rx *= 0.94; }
    g.rotation.y = u.ry; g.rotation.x = u.rx; // ferma: si muove solo col dito
  }
  u.s.r.render(u.s.scene, u.s.cam);
  u.raf = requestAnimationFrame((tt) => loop(u, tt));
}

/* Trascina = gira la corona; scorri giù, tocco fuori o ×: torna nella Classifica. */
function interact(u) {
  const { el } = u;
  let down = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || u.busy) return;
    down = { x: e.clientX, y: e.clientY, moved: false };
    if (!u.entering) u.drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* niente */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    const tx = e.clientX - down.x, ty = e.clientY - down.y;
    if (Math.hypot(tx, ty) > 8) down.moved = true;
    if (ty > 20 && ty > Math.abs(tx) * 1.4 && !down.rot) { down.swipe = true; u.box.style.transform = `translateY(${ty * 0.6}px) scale(${1 - ty / 1500})`; return; }
    if (!u.drag || down.swipe) return;
    down.rot = true;
    const dx = e.clientX - u.drag.x, dy = e.clientY - u.drag.y, now = performance.now(), dt = Math.max(8, now - u.drag.t);
    u.ry += dx * 0.012; u.rx = Math.max(-0.5, Math.min(0.7, u.rx + dy * 0.008)); u.vy = (dx * 0.012) / dt * 16;
    u.drag = { x: e.clientX, y: e.clientY, t: now };
  });
  const up = (e) => {
    if (!down) return;
    const d = down;
    down = null; u.drag = null;
    const ty = e.clientY - d.y;
    if (d.swipe) {
      if (ty > 90) return fly(u, ty * 0.6);
      u.box.animate([{ transform: u.box.style.transform }, { transform: 'none' }], { duration: 250 });
      u.box.style.transform = '';
      return;
    }
    if (!d.moved && !e.target.closest('.crw-stage')) fly(u, 0);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** Chiusura: la corona vola nella corona della Classifica da cui è uscita. */
function fly(u, fromY) {
  if (u.busy || ui !== u) return;
  const tgt = u.from && u.from.isConnected ? u.from : null;
  if (!tgt) return closeCoronation();
  u.busy = true;
  u.box.style.transform = '';
  const tb = tgt.getBoundingClientRect(), sb = u.box.getBoundingClientRect();
  const dx = tb.left + tb.width / 2 - (sb.left + sb.width / 2), dy = tb.top + tb.height / 2 - (sb.top + sb.height / 2);
  u.el.classList.add('leaving');
  u.sec.querySelectorAll('[data-a]').forEach((x) => x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: 250, fill: 'forwards' }));
  u.box.animate([
    { transform: `translateY(${fromY}px) scale(${1 - fromY / 1500})` },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.55}px) scale(.5)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0.7 },
  ], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
  if (u.s) {
    const a0 = u.ry % (Math.PI * 2), r0 = u.rx, t0 = performance.now(), g = u.s.g;
    const step = (t) => { const p = Math.min(1, (t - t0) / 750), e = 1 - Math.pow(1 - p, 2); g.rotation.y = a0 + (Math.PI * 2 - a0) * e; g.rotation.x = r0 * (1 - e); if (p < 1 && ui === u) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  setTimeout(() => {
    if (ui !== u) return;
    closeCoronation();
    tgt.classList.remove('crown-pulse'); void tgt.offsetWidth; tgt.classList.add('crown-pulse');
    setTimeout(() => tgt.classList.remove('crown-pulse'), 900);
  }, 760);
}

export function closeCoronation() {
  const u = ui;
  if (!u) return;
  ui = null;
  cancelAnimationFrame(u.raf);
  u.el.remove();
}

export const coronationOpen = () => !!ui;
