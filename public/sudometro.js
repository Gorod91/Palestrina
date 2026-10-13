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
  [85, 'Lavatrice in centrifuga'],
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
