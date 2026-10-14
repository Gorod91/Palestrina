// Battito (beta, solo admin): misura i battiti al minuto con la fotocamera, tutto sul telefono.
// - Dito: dito sulla fotocamera posteriore (con la torcia, se il telefono la lascia accendere):
//   a ogni battito il dito si riempie di sangue e diventa un filo più scuro (canale rosso).
// - Viso: fotocamera frontale, fronte al centro dell'ovale: si legge la piccola variazione del verde della pelle.
// Il segnale si ripulisce dalle variazioni lente e dal rumore, e la frequenza si trova con l'autocorrelazione.

const $ = (id) => document.getElementById(id);
const FPS = 30; // ricampionamento uniforme
const WINDOW_S = 12; // secondi di segnale per ogni stima
const NEED_S = 20; // secondi di segnale buono per il risultato
const MIN_BPM = 40;
const MAX_BPM = 190;

let stream = null;
let running = false;

export function initBattito() {
  $('btn-battito').addEventListener('click', () => open());
  $('pulse-close').addEventListener('click', close);
  document.querySelectorAll('[data-pulse-mode]').forEach((b) => b.addEventListener('click', () => start(b.dataset.pulseMode)));
  $('pulse-again').addEventListener('click', () => start($('pulse').dataset.mode || 'dito'));
}

function open() {
  $('pulse').hidden = false;
  $('pulse').dataset.mode = '';
  show('choose');
}

function show(step) {
  ['choose', 'measure', 'result'].forEach((s) => ($(`pulse-${s}`).hidden = s !== step));
}

async function close() {
  stop();
  $('pulse').hidden = true;
}

function stop() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $('pulse-video').srcObject = null;
}

async function start(mode) {
  stop();
  $('pulse').dataset.mode = mode;
  show('measure');
  $('pulse-bpm').textContent = '--';
  $('pulse-hint').textContent = 'Apro la fotocamera…';
  $('pulse-bar').style.width = '0%';
  const finger = mode === 'dito';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: finger ? 'environment' : 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    });
  } catch (err) {
    $('pulse-hint').textContent = `Fotocamera non disponibile: ${err.message}`;
    return;
  }
  const video = $('pulse-video');
  video.classList.toggle('mirror', !finger);
  video.srcObject = stream;
  await video.play().catch(() => {});
  let torch = false;
  if (finger) torch = await setTorch(stream, true);
  $('pulse-torch').textContent = finger ? (torch ? 'Torcia accesa' : 'Torcia non disponibile: mettiti sotto una luce forte') : '';
  running = true;
  loop(video, finger);
}

async function setTorch(s, on) {
  const track = s.getVideoTracks()[0];
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}

/** Legge un valore per fotogramma (media del rosso col dito, del verde sulla fronte) e aggiorna la stima. */
function loop(video, finger) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const samples = []; // { t (s), v }
  let goodSince = null;
  const estimates = [];
  let lastEstimate = 0;
  const t0 = performance.now();

  const step = () => {
    if (!running) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h) {
      // Dito: il centro dell'inquadratura. Viso: la fronte, nella parte alta dell'ovale disegnato a schermo.
      const box = finger ? { x: w * 0.3, y: h * 0.3, w: w * 0.4, h: h * 0.4 } : { x: w * 0.38, y: h * 0.2, w: w * 0.24, h: h * 0.1 };
      canvas.width = 40;
      canvas.height = finger ? 40 : 16;
      ctx.drawImage(video, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < px.length; i += 4) {
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
      }
      const n = px.length / 4;
      r /= n;
      g /= n;
      b /= n;
      const t = (performance.now() - t0) / 1000;
      const covered = !finger || (r > 60 && r > g * 1.6 && r > b * 1.6); // dito sopra l'obiettivo: tutto rosso
      if (!covered) {
        samples.length = 0;
        goodSince = null;
        $('pulse-hint').textContent = 'Copri bene la fotocamera posteriore col polpastrello, senza premere';
      } else {
        samples.push({ t, v: finger ? r : g });
        while (samples.length && samples[0].t < t - WINDOW_S) samples.shift();
      }
      if (covered && t - lastEstimate > 0.5 && samples.length > FPS * 5) {
        lastEstimate = t;
        const est = estimate(samples);
        drawWave(est.wave);
        if (est.quality > 0.45) {
          if (goodSince === null) goodSince = t;
          estimates.push(est.bpm);
          $('pulse-bpm').textContent = Math.round(est.bpm);
          $('pulse-hint').textContent = finger ? 'Ottimo, resta fermo' : 'Ottimo, resta fermo e non parlare';
        } else {
          goodSince = null;
          estimates.length = 0;
          $('pulse-hint').textContent = finger ? 'Segnale debole: resta fermo, appoggia appena il dito' : 'Segnale debole: più luce sul viso, resta fermo';
        }
        $('pulse-quality').textContent = `Qualità ${Math.round(est.quality * 100)}%`;
        const done = goodSince === null ? 0 : Math.min(1, (t - goodSince) / NEED_S);
        $('pulse-bar').style.width = `${Math.round(done * 100)}%`;
        if (done >= 1) return finish(estimates);
      } else if (covered && samples.length <= FPS * 5) {
        $('pulse-hint').textContent = finger ? 'Resta fermo, sto leggendo…' : 'Viso nell\'ovale, resta fermo…';
      }
    }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(step);
    else requestAnimationFrame(step);
  };
  step();
}

function finish(estimates) {
  const list = estimates.slice(-20).sort((a, b) => a - b);
  const bpm = Math.round(list[Math.floor(list.length / 2)]);
  stop();
  $('pulse-result-bpm').textContent = bpm;
  $('pulse-result-text').textContent = describeBpm(bpm);
  show('result');
}

function describeBpm(bpm) {
  if (bpm < 60) return 'Calmo come un monaco.';
  if (bpm < 90) return 'Battito da riposo. Il divano ti chiama.';
  if (bpm < 120) return 'Ci stai lavorando.';
  if (bpm < 150) return 'Allenamento vero.';
  return 'Motore al massimo. Respira.';
}

/**
 * Stima dei bpm da campioni irregolari: ricampiona a 30 Hz, toglie le variazioni lente (media mobile di 1 s),
 * smussa il rumore (media mobile corta) e cerca il ritardo con l'autocorrelazione più alta tra 40 e 190 bpm.
 * Qualità = autocorrelazione normalizzata in quel punto (0-1).
 */
export function estimate(samples) {
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const n = Math.floor((t1 - t0) * FPS);
  const x = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / FPS;
    while (j < samples.length - 2 && samples[j + 1].t < t) j++;
    const a = samples[j];
    const b = samples[j + 1] || a;
    const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    x[i] = a.v + (b.v - a.v) * Math.min(1, Math.max(0, f));
  }
  const smooth = (arr, k) => {
    const out = new Float64Array(arr.length);
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= k) s -= arr[i - k];
      out[i] = s / Math.min(i + 1, k);
    }
    // centrata: sposta indietro di metà finestra
    const half = Math.floor(k / 2);
    const res = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) res[i] = out[Math.min(arr.length - 1, i + half)];
    return res;
  };
  const trend = smooth(x, FPS);
  const hp = x.map((v, i) => v - trend[i]);
  const y = smooth(hp, 4);
  let mean = 0;
  y.forEach((v) => (mean += v));
  mean /= y.length;
  const z = y.map((v) => v - mean);
  let e0 = 0;
  z.forEach((v) => (e0 += v * v));
  const minLag = Math.floor((60 / MAX_BPM) * FPS);
  const maxLag = Math.ceil((60 / MIN_BPM) * FPS);
  const ac = (lag) => {
    let s = 0;
    for (let i = 0; i + lag < z.length; i++) s += z[i] * z[i + lag];
    return s / (e0 || 1) * (z.length / (z.length - lag));
  };
  let best = minLag;
  let bestV = -Infinity;
  const vals = [];
  for (let lag = minLag; lag <= maxLag && lag < z.length - FPS; lag++) {
    const v = ac(lag);
    vals[lag] = v;
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  // Mezzo ritardo quasi altrettanto forte: era un'armonica, il battito vero è il doppio più veloce
  const half = Math.round(best / 2);
  if (half >= minLag && vals[half] !== undefined && vals[half] > bestV * 0.85) {
    best = half;
    bestV = vals[half];
  }
  // Raffinamento parabolico del picco
  const a = vals[best - 1];
  const c = vals[best + 1];
  let lag = best;
  if (a !== undefined && c !== undefined) {
    const d = a - 2 * bestV + c;
    if (d < 0) lag = best + (0.5 * (a - c)) / d;
  }
  return { bpm: (60 * FPS) / lag, quality: Math.max(0, Math.min(1, bestV)), wave: Array.from(z.slice(-FPS * 5)) };
}

function drawWave(wave) {
  const cv = $('pulse-wave');
  const w = (cv.width = cv.clientWidth * 2);
  const h = (cv.height = cv.clientHeight * 2);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (!wave.length) return;
  const max = Math.max(...wave.map(Math.abs)) || 1;
  g.strokeStyle = '#fa114f';
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  wave.forEach((v, i) => {
    const x = (i / (wave.length - 1)) * w;
    const y = h / 2 + (v / max) * h * 0.42; // a ogni battito la pelle scurisce: il valore scende, l'onda sale
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.stroke();
}
