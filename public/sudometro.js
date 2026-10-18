// Sudometro: confronta un selfie "riposato" e uno "sudato" e dà un punteggio 0-100.
// Tutto avviene sul telefono: le foto non lasciano mai il dispositivo.
// È un gioco, non una misura scientifica: i pesi sono da tarare sui selfie veri.

const cfg = window.APP_CONFIG;

// Pesi del punteggio: ogni componente vale al massimo `points` punti,
// raggiunti quando la differenza tra i due selfie arriva a `full`.
export const WEIGHTS = {
  // Niente espressioni del viso (smorfie, occhi, bocca): si falsano troppo facilmente.
  redness: { points: 60, full: 8 }, // aumento del canale a* (Lab) su guance e fronte
  shine: { points: 40, full: 0.12 }, // aumento della quota di pixel lucidi su fronte e naso
};

export const TITLES = [
  [85, 'Lava incandescente'],
  [60, 'Pomodoro maturo'],
  [40, 'Si comincia a sudare'],
  [20, 'Appena tiepido'],
  [0, 'Fresco come una rosa'],
];

// Punti del volto (indici della mesh MediaPipe a 468 punti).
const REGIONS = {
  forehead: [151, 108, 337],
  cheeks: [50, 280, 205, 425],
  nose: [1, 4, 195],
};
const FACE_LEFT = 234;
const FACE_RIGHT = 454;

let landmarkerPromise;

function loadLandmarker() {
  landmarkerPromise ||= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(`${cfg.mediapipeBase}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${cfg.mediapipeBase}/wasm`);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: cfg.faceModelUrl, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
    });
  })().catch((err) => {
    landmarkerPromise = null;
    throw err;
  });
  return landmarkerPromise;
}

/** Inizia a scaricare il modello in anticipo (circa 4 MB). */
export function preload() {
  loadLandmarker().catch(() => {});
}

// ---------- Fotocamera ----------

/**
 * Apre la fotocamera frontale a tutto schermo e restituisce un canvas con lo scatto,
 * oppure null se l'utente annulla. Solo foto dal vivo: niente galleria.
 * Con `live` (utenti debug) mostra i parametri del Sudometro in tempo reale,
 * confrontati con `reference` se c'è.
 */
export async function takeSelfie(hint, { live = false, reference = null } = {}) {
  const $ = (id) => document.getElementById(id);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
    audio: false,
  });
  const video = $('video');
  video.srcObject = stream;
  $('camera-hint').textContent = hint;
  $('camera').hidden = false;
  $('camera').classList.toggle('live', live);
  $('live-panel').hidden = !live;
  await video.play().catch(() => {});

  let open = true;
  if (live) liveLoop(video, reference, () => open);

  const result = await new Promise((resolve) => {
    $('btn-shoot').onclick = () => resolve(capture(video, 960)); // più grande: dopo il ritaglio sul viso resta nitida
    $('btn-cancel').onclick = () => resolve(null);
  });

  open = false;
  stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  $('camera').hidden = true;
  const ov = $('overlay');
  ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
  return result;
}

function capture(video, max = 640) {
  const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** JPEG in base64 (senza prefisso data:) da salvare su Drive: lato lungo al massimo 480 px e qualità 0,72
 *  (circa 30-40 KB), così le foto si caricano in fretta. L'analisi usa comunque lo scatto più grande. */
export function toJpegBase64(canvas, quality = 0.72, max = 480) {
  canvas = faceCrop(canvas);
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  let out = canvas;
  if (scale < 1) {
    out = document.createElement('canvas');
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  }
  return out.toDataURL('image/jpeg', quality).split(',')[1];
}

// Riquadro del viso trovato dall'ultima analisi di ogni scatto
const faceBoxes = new WeakMap();

/** Ritaglio 3:4 attorno al viso con un po' di margine (spazio in più sopra per i capelli),
 *  così miniatura e foto aperta mostrano la stessa cosa. Senza viso trovato resta lo scatto intero. */
function faceCrop(canvas) {
  const b = faceBoxes.get(canvas);
  if (!b) return canvas;
  const { width: W, height: H } = canvas;
  let w = b.w * 1.8;
  let h = b.h * 1.75;
  if (w / h < 3 / 4) w = (h * 3) / 4;
  else h = (w * 4) / 3;
  const fit = Math.min(1, W / w, H / h); // non più grande dello scatto
  w *= fit;
  h *= fit;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2 - b.h * 0.12;
  const x = Math.min(Math.max(0, cx - w / 2), W - w);
  const y = Math.min(Math.max(0, cy - h / 2), H - h);
  const out = document.createElement('canvas');
  out.width = Math.round(w);
  out.height = Math.round(h);
  out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
  return out;
}

/** Analizza la fotocamera di continuo e mostra parametri e zone misurate. */
async function liveLoop(video, reference, isOpen) {
  const panel = document.getElementById('live-panel');
  const ov = document.getElementById('overlay');
  panel.textContent = 'Carico il modello…';
  while (isOpen()) {
    const started = performance.now();
    if (video.videoWidth) {
      const frame = capture(video, 480);
      try {
        const { features: f, overlay } = await analyzeDetailed(frame);
        drawOverlay(ov, overlay);
        panel.textContent = describe(f, reference);
      } catch (err) {
        ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
        panel.textContent = err.message;
      }
    }
    // Circa 4 analisi al secondo, senza bloccare il telefono.
    await new Promise((r) => setTimeout(r, Math.max(50, 250 - (performance.now() - started))));
  }
}

const REGION_COLORS = { forehead: '#00d9ff', cheeks: '#fa114f', nose: '#a6ff00' };

function drawOverlay(ov, { width, height, radius, centers }) {
  if (ov.width !== width || ov.height !== height) {
    ov.width = width;
    ov.height = height;
  }
  const g = ov.getContext('2d');
  g.clearRect(0, 0, width, height);
  g.lineWidth = 2;
  centers.forEach(({ x, y, region }) => {
    g.strokeStyle = REGION_COLORS[region];
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.stroke();
  });
}

function describe(f, ref) {
  const sign = (v, d = 1) => (v >= 0 ? '+' : '') + v.toFixed(d);
  const lines = [`Viso: larghezza ${Math.round(f.faceWidthRatio * 100)}% dell'inquadratura`];
  if (!ref) {
    lines.push(`Luce L ${f.L.toFixed(1)}`, `Rossore a* ${f.redness.toFixed(1)}`, `Lucidità ${(f.shine * 100).toFixed(1)}%`);
    lines.push('(nessuna foto di riferimento: niente punteggio)');
    return lines.join('\n');
  }
  const r = score(ref, f);
  const pts = (k) => `${Math.round(r.parts[k])}/${WEIGHTS[k].points}`;
  lines.push(
    `Luce L ${f.L.toFixed(1)} (rif ${ref.L.toFixed(1)}, ${sign(f.L - ref.L)})`,
    `Rossore a* ${f.redness.toFixed(1)} (${sign(r.details.red)}) → ${pts('redness')}`,
    `Lucidità ${(f.shine * 100).toFixed(1)}% (${sign(r.details.shine * 100)}%) → ${pts('shine')}`,
    `Punteggio live: ${r.score} · ${r.title}`,
    ...r.warnings
  );
  return lines.join('\n');
}

// ---------- Analisi ----------

/** Estrae le caratteristiche del viso da un canvas. Lancia un errore se non trova un viso. */
export async function analyze(canvas) {
  return (await analyzeDetailed(canvas)).features;
}

async function analyzeDetailed(canvas) {
  const landmarker = await loadLandmarker();
  const res = landmarker.detect(canvas);
  if (!res.faceLandmarks || !res.faceLandmarks.length) {
    throw new Error('Non vedo un viso: avvicinati e guarda la fotocamera');
  }
  const lm = res.faceLandmarks[0];

  const { width, height } = canvas;
  const xs = lm.map((p) => p.x * width);
  const ys = lm.map((p) => p.y * height);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  faceBoxes.set(canvas, { x: bx, y: by, w: Math.max(...xs) - bx, h: Math.max(...ys) - by });
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const faceWidth = Math.hypot((lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * width, (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * height);
  const radius = Math.max(3, Math.round(faceWidth * 0.05));
  const centers = [];

  const sample = (region) => {
    const px = [];
    REGIONS[region].forEach((i) => {
      const cx = Math.round(lm[i].x * width);
      const cy = Math.round(lm[i].y * height);
      centers.push({ x: cx, y: cy, region });
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
          const o = (y * width + x) * 4;
          px.push(pixelInfo(data[o], data[o + 1], data[o + 2]));
        }
      }
    });
    return px;
  };

  const f = features({
    forehead: sample('forehead'),
    cheeks: sample('cheeks'),
    nose: sample('nose'),
    faceWidthRatio: faceWidth / width,
  });
  return { features: f, overlay: { width, height, radius, centers } };
}

/** Calcola le caratteristiche dai pixel campionati (separata per poterla testare). */
export function features({ forehead, cheeks, nose, faceWidthRatio }) {
  const all = [...forehead, ...cheeks, ...nose];
  if (!all.length) throw new Error('Viso fuori dall\'inquadratura');
  const mean = (arr, k) => arr.reduce((s, p) => s + p[k], 0) / arr.length;

  const L = mean(all, 'L');
  const red = [...cheeks, ...forehead];
  // Lucido = molto più chiaro della media del viso e quasi senza colore.
  // La soglia relativa alla luminosità media compensa la luce diversa tra le due foto.
  const shiny = [...forehead, ...nose];
  const shine = shiny.filter((p) => p.L > L + 18 && p.s < 0.2).length / shiny.length;


  return { L: round(L), redness: round(mean(red, 'a')), shine: round(shine, 4), faceWidthRatio: round(faceWidthRatio, 3) };
}

/** Confronta i due selfie e restituisce punteggio, titolo e dettagli. */
export function score(rest, sweat) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const dRed = sweat.redness - rest.redness;
  const dShine = sweat.shine - rest.shine;

  const parts = {
    redness: clamp01(dRed / WEIGHTS.redness.full) * WEIGHTS.redness.points,
    shine: clamp01(dShine / WEIGHTS.shine.full) * WEIGHTS.shine.points,
  };
  const total = Math.round(parts.redness + parts.shine);
  const title = TITLES.find(([min]) => total >= min)[1];

  const warnings = [];
  if (Math.abs(sweat.L - rest.L) > 15) warnings.push('La luce è molto diversa tra i due selfie: il punteggio è meno affidabile.');
  if (Math.abs(sweat.faceWidthRatio - rest.faceWidthRatio) / rest.faceWidthRatio > 0.35) warnings.push('Distanza dalla fotocamera molto diversa tra i due selfie.');

  return {
    score: total,
    title,
    warnings,
    parts,
    details: { red: round(dRed), shine: round(dShine, 4), light: round(sweat.L - rest.L) },
  };
}

// ---------- Sudometro 2 (per ora calcolato in silenzio, accanto al punteggio attuale) ----------
// Cosa cambia rispetto alla versione 1, guardando i selfie veri:
// - colori corretti sulla luce: la dominante dello sfondo (porta a vetri con luci calde, muro bianco, tubo blu…)
//   viene neutralizzata a metà, così riferimento e selfie da sudato si possono confrontare;
// - rossore sugli zigomi (non sulle guance basse, dove c'è la barba), scartando ombre e riflessi;
// - lucidità relativa, zona per zona (fronte, naso, zigomi): quanto i punti più chiari staccano dalla pelle
//   intorno (la soglia fissa della versione 1 non scattava mai). Una zona più lucida nel riferimento per colpa
//   della luce (es. faretto sulla fronte) non annulla il sudore sulle altre;
// - controllo dello scatto: luce molto diversa dal riferimento o foto mossa → si chiede di rifarlo una volta.

export const WEIGHTS2 = {
  redness: { points: 60, full: 6 }, // tonalità più rossa (gradi di tinta in meno) su zigomi e fronte, colori corretti
  shine: { points: 40, full: 15 }, // aumento medio dei riflessi per zona (fronte, naso, zigomi); una zona in calo conta 0
};
export const QUALITY2 = {
  maxLight: 16, // differenza di luminosità del viso oltre la quale si chiede di rifare lo scatto
  minSharp: 0.35, // nitidezza minima rispetto al riferimento (sotto: foto mossa)
  penalty: 0.7, // punteggio ridotto se anche il secondo scatto non è buono
};
const REGIONS2 = {
  forehead: [151, 108, 337, 9, 107, 336], // fronte bassa: in alto si prendono anche i capelli
  malar: [117, 118, 50, 346, 347, 280],
  nose: [1, 4, 5, 195, 197, 6],
};

// ---------- Sudometro 3 (anche lui in silenzio, accanto al 2) ----------
// Dalle foto diagnostiche del 18/10:
// - riflessi senza capelli e sopracciglia: i pixel scuri nei cerchi (attaccatura, sopracciglia) non contano;
// - tempie in più (lati della fronte, sopra la coda delle sopracciglia), dove il sudore si vede spesso;
// - con la luce molto diversa dal riferimento il rossore non si può misurare: si ignora e il lucido vale di più;
// - lucido pieno a 10 invece che a 15 (il Ceppo, sudato, prendeva solo 30).
export const WEIGHTS3 = {
  // Tarato il 19/10 sulla classifica a occhio di Francesco (9 coppie): media dell'aumento dei riflessi sulle zone
  // + quanto si fa netto il bordo dei riflessi (pelle bagnata) + rossore solo se c'è anche lucido; luce diversa = conta meno.
  edge: 2, // peso del bordo più netto (aumento massimo di "e" fra le zone)
  redness: { perDegree: 3, maxDegrees: 6, minShine: 5 }, // bonus solo se la media dei riflessi è cresciuta di almeno 5
  lightZero: 10, // differenza di luce a cui il confronto non vale più (fra 0 e 10 cala in proporzione)
  full: 16, // valore grezzo che vale 100
};
export const QUALITY3 = { maxLight: 8, minSharp: 0.35 };
// tempie: lati della fronte sopra la coda delle sopracciglia (più in fuori si finiva sullo sfondo o sui capelli)
const TEMPLES3 = [104, 333];

/** Caratteristiche della versione 2 da un canvas o da un'immagine (es. la foto di riferimento salvata). */
export async function analyzeV2(source) {
  let canvas = source;
  if (!(source instanceof HTMLCanvasElement)) {
    canvas = document.createElement('canvas');
    canvas.width = source.naturalWidth || source.width;
    canvas.height = source.naturalHeight || source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
  }
  const landmarker = await loadLandmarker();
  const res = landmarker.detect(canvas);
  if (!res.faceLandmarks || !res.faceLandmarks.length) throw new Error('Viso non trovato');
  const lm = res.faceLandmarks[0];
  const { width: W, height: H } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const xs = lm.map((p) => p.x * W);
  const ys = lm.map((p) => p.y * H);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const faceWidth = Math.hypot((lm[FACE_RIGHT].x - lm[FACE_LEFT].x) * W, (lm[FACE_RIGHT].y - lm[FACE_LEFT].y) * H);

  // Dominante della luce: media dello sfondo (fuori dal viso e dai capelli), corretta a metà
  const gains = grayWorldGains(data, W, H, box, faceWidth);
  const radius = Math.max(3, Math.round(faceWidth * 0.07));
  const sample = (ids) => {
    const px = [];
    ids.forEach((i) => {
      // un landmark, oppure [a, b, t]: il punto a + (b − a)·t
      const [a, b, t] = Array.isArray(i) ? i : [i, i, 0];
      const cx = Math.round((lm[a].x + (lm[b].x - lm[a].x) * t) * W);
      const cy = Math.round((lm[a].y + (lm[b].y - lm[a].y) * t) * H);
      for (let y = cy - radius; y <= cy + radius; y++) {
        for (let x = cx - radius; x <= cx + radius; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H || (x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) continue;
          const o = (y * W + x) * 4;
          const r = Math.min(255, data[o] * gains[0]);
          const g = Math.min(255, data[o + 1] * gains[1]);
          const b = Math.min(255, data[o + 2] * gains[2]);
          const [L, a, bb] = rgbToLab(r, g, b);
          px.push({ x, y, L, a, h: (Math.atan2(bb, a) * 180) / Math.PI, C: Math.hypot(a, bb) });
        }
      }
    });
    return px;
  };
  const skinTone = sample([...REGIONS2.malar, ...REGIONS2.forehead]);
  if (!skinTone.length) throw new Error('Viso fuori dall\'inquadratura');
  // stacco dei riflessi in una zona: (95° percentile − mediana della luminosità) / mediana, in %
  const highlightOf = (px) => {
    const Ls = px.map((p) => p.L).sort((a, b) => a - b);
    const m = quantile(Ls, 0.5);
    return m ? round(((quantile(Ls, 0.95) - m) / m) * 100) : 0;
  };
  const zones = { f: highlightOf(sample(REGIONS2.forehead)), n: highlightOf(sample(REGIONS2.nose)), z: highlightOf(sample(REGIONS2.malar)) };
  const med = median(skinTone.map((p) => p.L));
  // rossore: tinta della pelle "normale" (niente ombre, barba, riflessi). La tinta non cambia con la luminosità,
  // a differenza di a* che cala quando il selfie è più scuro: più è bassa (verso il rosso), più la pelle è rossa.
  const skin = skinTone.filter((p) => p.L > med - 18 && p.L < med + 15);
  const hue = median((skin.length ? skin : skinTone).map((p) => p.h));
  // Sudometro 3: riflessi solo sulla pelle (fuori i pixel molto più scuri della pelle: capelli, sopracciglia, ombre)
  const highlight3 = (px) => highlightOf(px.filter((p) => p.L > med - 20));
  const zones3 = {
    f: highlight3(sample(REGIONS2.forehead)),
    t: highlight3(sample(TEMPLES3)),
    n: highlight3(sample(REGIONS2.nose)),
    z: highlight3(sample(REGIONS2.malar)),
  };
  // Lucentezza (Sudometro 3, solo misurata): com'è fatto il riflesso, non solo quanto è chiaro.
  // w = quanto colore perdono i riflessi rispetto alla pelle (pelle bagnata: riflesso "a specchio", quasi bianco);
  // e = pendenza della luce sui riflessi (bordo netto = lucido, sfumato = opaco), in % della pelle;
  // nb, sz = quanti gruppi di riflessi e quanto grandi (sudore: tanti puntini; pelle asciutta: macchia larga).
  const Lcache = new Map();
  const Lat = (x, y) => {
    const k = y * W + x;
    if (!Lcache.has(k)) {
      const o = k * 4;
      Lcache.set(k, rgbToLab(Math.min(255, data[o] * gains[0]), Math.min(255, data[o + 1] * gains[1]), Math.min(255, data[o + 2] * gains[2]))[0]);
    }
    return Lcache.get(k);
  };
  const grad = (x, y) => (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 ? 0 : Math.hypot(Lat(x + 1, y) - Lat(x - 1, y), Lat(x, y + 1) - Lat(x, y - 1)) / 2);
  const gloss = (all) => {
    const px = all.filter((p) => p.L > med - 20);
    if (px.length < 20) return null;
    const Ls = px.map((p) => p.L).sort((a, b) => a - b);
    const q95 = quantile(Ls, 0.95);
    const mL = quantile(Ls, 0.5) || 1;
    const hl = px.filter((p) => p.L >= q95);
    const cAll = median(px.map((p) => p.C));
    const w = cAll ? round((1 - median(hl.map((p) => p.C)) / cAll) * 100, 1) : 0;
    const e = round((median(hl.map((p) => grad(p.x, p.y))) / mL) * 100, 1);
    const keys = new Set(hl.map((p) => p.y * W + p.x));
    const seen = new Set();
    let nb = 0;
    keys.forEach((k) => {
      if (seen.has(k)) return;
      nb++;
      const stack = [k];
      seen.add(k);
      while (stack.length) {
        const c = stack.pop();
        [c - 1, c + 1, c - W, c + W].forEach((n) => {
          if (keys.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        });
      }
    });
    return { w, e, nb, sz: nb ? round(keys.size / nb, 1) : 0 };
  };
  const gloss3 = { f: gloss(sample(REGIONS2.forehead)), t: gloss(sample(TEMPLES3)), n: gloss(sample(REGIONS2.nose)), z: gloss(sample(REGIONS2.malar)) };
  return {
    v: 2,
    L: round(med),
    hue: round(hue),
    zones,
    zones3,
    gloss3,
    sharp: round(sharpness(data, W, H, box), 1),
    gains: gains.map((g) => round(g, 3)),
  };
}

function median(arr) {
  return quantile([...arr].sort((a, b) => a - b), 0.5);
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Guadagni R, G, B che rendono grigio lo sfondo (metà correzione, limitata): toglie la dominante della luce. */
function grayWorldGains(data, W, H, box, faceWidth) {
  const m = faceWidth * 0.25;
  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.round(Math.min(W, H) / 160));
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      // fuori dal viso, dai capelli (sopra) e dal collo/maglia (sotto)
      if (x > box.x0 - m && x < box.x1 + m && y > box.y0 - m * 2.5) continue;
      const o = (y * W + x) * 4;
      const R = data[o], G = data[o + 1], B = data[o + 2];
      const mx = Math.max(R, G, B);
      if (mx > 245 || mx < 20) continue; // luci bruciate e buio non dicono niente sulla dominante
      r += R; g += G; b += B; n++;
    }
  }
  if (n < 200) return [1, 1, 1];
  const avg = (r + g + b) / (3 * n);
  return [r, g, b].map((c) => Math.max(0.75, Math.min(1.35, Math.sqrt(avg / (c / n)))));
}

/** Nitidezza del viso: varianza del laplaciano sulla luminosità (bassa = foto mossa o sfocata). */
function sharpness(data, W, H, box) {
  const x0 = Math.max(1, Math.round(box.x0));
  const x1 = Math.min(W - 2, Math.round(box.x1));
  const y0 = Math.max(1, Math.round(box.y0));
  const y1 = Math.min(H - 2, Math.round(box.y1));
  const step = Math.max(1, Math.round((x1 - x0) / 140)); // ~140 punti di larghezza, come fra foto di misure diverse
  const lum = (x, y) => {
    const o = (y * W + x) * 4;
    return 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  };
  let s = 0, s2 = 0, n = 0;
  for (let y = y0 + step; y < y1 - step; y += step) {
    for (let x = x0 + step; x < x1 - step; x += step) {
      const v = 4 * lum(x, y) - lum(x - step, y) - lum(x + step, y) - lum(x, y - step) - lum(x, y + step);
      s += v; s2 += v * v; n++;
    }
  }
  return n ? s2 / n - (s / n) ** 2 : 0;
}

/**
 * Punteggio della versione 2. `retake` dice se conviene rifare lo scatto e come:
 * 'luce+' (più luminoso), 'luce-' (meno luminoso), 'mossa' (tieni fermo il telefono), altrimenti null.
 */
export function scoreV2(rest, sweat, { reduced = false } = {}) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const dRed = rest.hue - sweat.hue; // tinta più bassa = più rossa
  // riflessi: media degli aumenti per zona, le zone in calo contano 0
  const keys = Object.keys(sweat.zones);
  const dShine = keys.reduce((s, k) => s + Math.max(0, sweat.zones[k] - (rest.zones[k] || 0)), 0) / keys.length;
  const dL = sweat.L - rest.L;
  let retake = null;
  if (dL < -QUALITY2.maxLight) retake = 'luce+';
  else if (dL > QUALITY2.maxLight) retake = 'luce-';
  else if (rest.sharp && sweat.sharp < rest.sharp * QUALITY2.minSharp) retake = 'mossa';
  const parts = {
    redness: clamp01(dRed / WEIGHTS2.redness.full) * WEIGHTS2.redness.points,
    shine: clamp01(dShine / WEIGHTS2.shine.full) * WEIGHTS2.shine.points,
  };
  const raw = parts.redness + parts.shine;
  const total = Math.round(reduced ? raw * QUALITY2.penalty : raw);
  return {
    score: total,
    title: TITLES.find(([min]) => total >= min)[1],
    retake,
    parts,
    details: { red: round(dRed), shine: round(dShine), light: round(dL), sharp: round(rest.sharp ? sweat.sharp / rest.sharp : 1), reduced },
  };
}

/** Quale dei due scatti tenere quando anche il secondo non è buono: quello con meno problemi. */
export function lessBadV2(rest, a, b) {
  const badness = (f) => Math.max(0, Math.abs(f.L - rest.L) - QUALITY2.maxLight) / QUALITY2.maxLight + Math.max(0, QUALITY2.minSharp - (rest.sharp ? f.sharp / rest.sharp : 1)) * 3;
  return badness(b) < badness(a) ? 'b' : 'a';
}

/** Sudometro 3: stesse foto analizzate, zone e pesi diversi (vedi WEIGHTS3). */
export function scoreV3(rest, sweat) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const keys = Object.keys(sweat.zones3 || {});
  const diff = (k) => sweat.zones3[k] - ((rest.zones3 || {})[k] || 0);
  const gl = (f, k, x) => (((f.gloss3 || {})[k] || {})[x] || 0);
  const hlMean = keys.length ? keys.reduce((t, k) => t + Math.max(0, diff(k)), 0) / keys.length : 0;
  const eMax = Math.max(0, ...keys.map((k) => gl(sweat, k, 'e') - gl(rest, k, 'e')));
  const wMax = Math.max(0, ...keys.map((k) => gl(sweat, k, 'w') - gl(rest, k, 'w'))); // solo registrato, per ora non pesa
  const dRed = rest.hue - sweat.hue;
  const dL = sweat.L - rest.L;
  const light = clamp01(1 - Math.abs(dL) / WEIGHTS3.lightZero); // con luce molto diversa il confronto vale meno
  let retake = null;
  if (dL < -QUALITY3.maxLight) retake = 'luce+';
  else if (dL > QUALITY3.maxLight) retake = 'luce-';
  else if (rest.sharp && sweat.sharp < rest.sharp * QUALITY3.minSharp) retake = 'mossa';
  const R = WEIGHTS3.redness;
  const k = 100 / WEIGHTS3.full;
  const parts = {
    shine: (hlMean + WEIGHTS3.edge * eMax) * light * k,
    redness: hlMean >= R.minShine ? Math.min(R.maxDegrees, Math.max(0, dRed)) * R.perDegree * light * k : 0,
  };
  const total = Math.min(100, Math.round(parts.shine + parts.redness));
  return {
    score: total,
    title: TITLES.find(([min]) => total >= min)[1],
    retake,
    parts,
    details: { red: round(dRed), shine: round(hlMean), edge: round(eMax), spec: round(wMax), light: round(dL), lf: round(light) },
  };
}

export const RETAKE_HINT = {
  'luce+': 'Troppo buio rispetto alla foto di riferimento: rifallo con più luce sul viso.',
  'luce-': 'Troppa luce rispetto alla foto di riferimento: rifallo con meno luce in faccia.',
  mossa: 'Foto mossa: rifalla tenendo fermo il telefono.',
};

// ---------- Colore ----------

function pixelInfo(r, g, b) {
  const [L, a] = rgbToLab(r, g, b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { L, a, s: max ? (max - min) / max : 0 };
}

/** sRGB (0-255) → CIE Lab (D65). Restituisce [L, a, b]. */
export function rgbToLab(r, g, b) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function round(v, digits = 2) {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}
