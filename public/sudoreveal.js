// Rivelazione del punteggio del Sudometro: a tutto schermo, il selfie sudato in cima e un termometro che sale,
// si ferma in un punto a caso (tra il 20% e il 90%) con il titolo di quel punto in grigio, poi schizza al
// punteggio vero con un lampo; da 60 in su piovono gocce. Si chiude con "Fatto" (o toccando, a fine animazione).

const STOPS = [[0, [0, 217, 255]], [45, [166, 255, 0]], [75, [255, 90, 31]], [100, [250, 17, 79]]];
/** Colore del termometro a quel valore (per il bulbo e il bordo del selfie). */
function colorAt(v) {
  for (let i = 1; i < STOPS.length; i++) {
    if (v > STOPS[i][0]) continue;
    const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], t = (v - a) / (b - a);
    return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(',')})`;
  }
  return 'rgb(250,17,79)';
}
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* niente vibrazione */ } };

/**
 * Mostra la rivelazione. score 0-100, title: titolo vero (già al femminile se serve), titleAt(v): titolo di un
 * valore qualsiasi (per la fermata), photo: immagine del selfie (src). Si risolve quando si chiude.
 */
export function showSudoReveal({ score, title, titleAt, photo }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'sr';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `Sudometro: ${score} su 100`);
    el.innerHTML = `
      <div class="sr-in">
        <div class="sr-kick">Il tuo Sudometro</div>
        ${photo ? '<img class="sr-selfie" alt="">' : ''}
        <div class="sr-meter">
          <div class="sr-tube">
            <div class="sr-glass"><div class="sr-fill"></div></div>
            <div class="sr-bulb"><i></i></div>
            <div class="sr-ticks">${[0, 20, 40, 60, 85, 100].map((v) => `<span style="bottom:${v}%">${v}</span>`).join('')}</div>
          </div>
          <div class="sr-read"><div class="sr-num">0</div><div class="sr-of">su 100</div></div>
        </div>
        <div class="sr-title"><b></b></div>
        <button class="primary sr-ok">Fatto</button>
      </div>
      <div class="sr-flash"></div>
      <canvas class="sr-fx"></canvas>`;
    document.body.append(el);
    const q = (s) => el.querySelector(s);
    const fill = q('.sr-fill'), num = q('.sr-num'), bulb = q('.sr-bulb i'), tEl = q('.sr-title'), tB = q('.sr-title b'), img = q('.sr-selfie'), ok = q('.sr-ok');
    if (img) img.src = photo;
    const set = (v) => {
      fill.style.height = `${v}%`;
      num.textContent = Math.round(v);
      bulb.style.background = colorAt(v);
      if (img) img.style.boxShadow = `0 0 0 3px ${colorAt(v)}`;
    };
    let raf = 0, done = false;
    const close = () => {
      cancelAnimationFrame(raf);
      el.remove();
      resolve();
    };
    ok.onclick = close;
    el.addEventListener('click', (e) => { if (done && e.target !== ok) close(); });

    function finish() {
      done = true;
      set(score);
      num.classList.remove('shake');
      void num.offsetWidth;
      num.classList.add('pop');
      q('.sr-flash').classList.add('go');
      tB.textContent = title;
      tEl.classList.remove('tease');
      tEl.classList.add('on');
      ok.classList.add('on');
      buzz([60]);
      if (score >= 60) rain(score >= 85 ? 140 : 70);
    }

    set(0);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    const a = Math.round(score * (0.2 + Math.random() * 0.7));
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const back = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2); // arriva con un piccolo rimbalzo
    let t0 = 0, teased = false;
    const frame = (now) => {
      t0 ||= now;
      const t = (now - t0) / 1000 - 0.4; // un attimo per guardare il selfie
      if (t < 0) set(0);
      else if (t < 0.8) set(a * ease(t / 0.8));
      else if (t < 2) {
        set(a);
        if (!teased) {
          teased = true;
          num.classList.add('shake');
          buzz([20, 150, 20, 150, 20, 150, 20]);
          tB.textContent = `${titleAt(a)}?`;
          tEl.classList.add('on', 'tease');
        }
      } else if (t < 2.6) {
        if (num.classList.contains('shake')) {
          num.classList.remove('shake');
          tEl.classList.remove('on', 'tease');
        }
        set(a + (score - a) * Math.min(1, back((t - 2) / 0.6)));
      } else return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    function rain(n) {
      const cv = q('.sr-fx'), ctx = cv.getContext('2d'), r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      ctx.scale(dpr, dpr);
      const cols = ['#00d9ff', '#a6ff00', '#fa114f', '#ff5a1f', '#ffffff'];
      const drops = Array.from({ length: n }, () => ({ x: Math.random() * r.width, y: -20 - Math.random() * r.height * 0.8, v: 3 + Math.random() * 4, s: 3 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)], w: Math.random() * 6.28 }));
      let s0 = 0;
      const step = (now) => {
        s0 ||= now;
        const t = now - s0;
        ctx.clearRect(0, 0, r.width, r.height);
        ctx.globalAlpha = t > 2600 ? Math.max(0, 1 - (t - 2600) / 600) : 1;
        drops.forEach((d) => {
          d.y += d.v;
          d.x += Math.sin(d.w + t / 300) * 0.4;
          ctx.fillStyle = d.c;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y - d.s * 1.8);
          ctx.bezierCurveTo(d.x + d.s, d.y - d.s * 0.2, d.x + d.s, d.y + d.s, d.x, d.y + d.s);
          ctx.bezierCurveTo(d.x - d.s, d.y + d.s, d.x - d.s, d.y - d.s * 0.2, d.x, d.y - d.s * 1.8);
          ctx.fill();
        });
        if (t < 3200 && el.isConnected) raf = requestAnimationFrame(step);
        else ctx.clearRect(0, 0, r.width, r.height);
      };
      raf = requestAnimationFrame(step);
    }
  });
}
