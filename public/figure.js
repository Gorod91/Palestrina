// Omini animati degli esercizi (come i disegnini delle schede di carta): pose di un omino a stecchini che si alternano.
// Ogni posa: h testa [x, y]; b busto (collo, metà, bacino); a braccio; l1, l2 gambe; w peso o maniglia [x, y]; c cavo.
// Riquadro 120 × 80, pavimento a y = 70; le pose si tengono un attimo e poi passano alla successiva.

const P = (pts) => pts.map((p) => p.join(',')).join(' ');

const PONTE_GIU = { h: [20, 62], b: [[28, 65], [44, 66], [60, 66]], a: [[28, 65], [40, 68], [52, 68]], l1: [[60, 66], [76, 52], [86, 68], [92, 69]] };
const PONTE_SU = { h: [20, 62], b: [[28, 65], [44, 59], [60, 52]], a: [[28, 65], [40, 68], [52, 68]], l1: [[60, 52], [78, 47], [86, 68], [92, 69]] };

export const FIGURE = {
  ponte: { poses: [PONTE_GIU, PONTE_SU] },
  'ponte-mono': {
    poses: [
      { ...PONTE_GIU, l2: [[60, 66], [77, 53], [94, 40]] },
      { ...PONTE_SU, l2: [[60, 52], [78, 47], [96, 42]] },
    ],
  },
  'plank-ginocchia': {
    poses: [
      { h: [24, 40], b: [[32, 43], [54, 44], [76, 45]], a: [[32, 43], [33, 56], [34, 68]], l1: [[76, 45], [78, 66], [96, 68]] },
      { h: [24, 37], b: [[32, 41], [54, 38], [76, 35]], a: [[32, 41], [33, 55], [34, 68]], l1: [[76, 35], [83, 55], [96, 68]] },
    ],
  },
  'plank-commando': {
    poses: [
      { h: [22, 52], b: [[30, 58], [50, 60], [70, 61]], a: [[30, 58], [31, 68], [19, 68]], l1: [[70, 61], [88, 64], [106, 68]] },
      { h: [22, 43], b: [[30, 47], [50, 52], [70, 56]], a: [[30, 47], [31, 58], [32, 68]], l1: [[70, 56], [88, 62], [106, 68]] },
    ],
  },
  'ercolina-rot': {
    prop: '<rect x="108" y="8" width="6" height="62" rx="2"/><circle cx="111" cy="28" r="3.5"/>',
    poses: [
      { h: [60, 13], b: [[60, 21], [60, 33], [60, 45]], a: [[60, 23], [50, 29], [41, 32]], l1: [[60, 45], [54, 57], [52, 70]], l2: [[60, 45], [66, 57], [68, 70]], w: [41, 32], c: [[111, 28], [41, 32]] },
      { h: [60, 13], b: [[60, 21], [60, 33], [60, 45]], a: [[60, 23], [70, 29], [79, 32]], l1: [[60, 45], [54, 57], [52, 70]], l2: [[60, 45], [66, 57], [68, 70]], w: [79, 32], c: [[111, 28], [79, 32]] },
    ],
  },
  'goblet-box': {
    prop: '<rect x="24" y="56" width="16" height="14" rx="2"/>',
    poses: [
      { h: [50, 12], b: [[50, 20], [50, 31], [50, 42]], a: [[50, 22], [55, 31], [55, 25]], l1: [[50, 42], [51, 56], [51, 70], [57, 70]], w: [57, 25] },
      { h: [56, 29], b: [[52, 37], [46, 46], [40, 55]], a: [[52, 39], [58, 47], [57, 41]], l1: [[40, 55], [54, 53], [52, 70], [58, 70]], w: [59, 41] },
    ],
  },
  'caviglia-rialzo': {
    prop: '<rect x="62" y="58" width="24" height="12" rx="2"/>',
    poses: [
      { h: [48, 11], b: [[48, 19], [49, 30], [50, 41]], a: [[48, 21], [55, 30], [51, 40]], l1: [[50, 41], [62, 48], [68, 58], [77, 58]], l2: [[50, 41], [47, 56], [44, 70], [51, 70]] },
      { h: [53, 12], b: [[53, 20], [54, 31], [55, 42]], a: [[53, 22], [60, 31], [56, 41]], l1: [[55, 42], [71, 46], [68, 58], [77, 58]], l2: [[55, 42], [50, 56], [44, 70], [51, 70]] },
    ],
  },
  'tappetino-mob': {
    poses: [
      { h: [26, 52], b: [[34, 44], [54, 34], [74, 44]], a: [[34, 44], [34, 56], [34, 68]], l1: [[74, 44], [76, 68], [96, 68]] },
      { h: [24, 36], b: [[34, 44], [54, 50], [74, 44]], a: [[34, 44], [34, 56], [34, 68]], l1: [[74, 44], [76, 68], [96, 68]] },
      { h: [26, 52], b: [[34, 44], [54, 34], [74, 44]], a: [[34, 44], [34, 56], [34, 68]], l1: [[74, 44], [76, 68], [96, 68]] },
      { h: [45, 59], b: [[52, 63], [70, 55], [90, 62]], a: [[52, 63], [38, 68], [22, 68]], l1: [[90, 62], [72, 68], [96, 68]] },
    ],
  },
};

/** SVG animato di un esercizio ('' se non ha il disegno). */
export function figSvg(id, cls = '') {
  const f = FIGURE[id];
  if (!f) return '';
  const n = f.poses.length, hold = 0.35, sec = 1.3 * n;
  // tempi: ogni posa resta ferma per hold, poi si muove verso la successiva
  const times = [], idx = [];
  for (let i = 0; i < n; i++) {
    times.push(i / n, (i + hold) / n);
    idx.push(i, i);
  }
  times.push(1);
  idx.push(0);
  const kt = times.map((t) => t.toFixed(3)).join(';');
  const ks = times.slice(1).map((_, j) => (j % 2 === 0 ? '0 0 1 1' : '.45 0 .55 1')).join(';');
  const anim = (attr, vals) => `<animate attributeName="${attr}" values="${vals.join(';')}" keyTimes="${kt}" calcMode="spline" keySplines="${ks}" dur="${sec}s" repeatCount="indefinite"/>`;
  const seq = (get) => idx.map((i) => get(f.poses[i]));
  const p0 = f.poses[0];
  const line = (k, c = 'wo-fig-body') => (p0[k] ? `<polyline class="${c}" points="${P(p0[k])}">${anim('points', seq((p) => P(p[k])))}</polyline>` : '');
  const dot = (k, r, c) => (p0[k] ? `<circle class="${c}" cx="${p0[k][0]}" cy="${p0[k][1]}" r="${r}">${anim('cx', seq((p) => p[k][0]))}${anim('cy', seq((p) => p[k][1]))}</circle>` : '');
  return `<svg class="wo-fig ${cls}" viewBox="0 0 120 80" aria-hidden="true">
    <line class="wo-fig-floor" x1="4" y1="70.5" x2="116" y2="70.5"/>
    ${f.prop ? `<g class="wo-fig-prop">${f.prop}</g>` : ''}${line('c', 'wo-fig-cable')}
    ${line('l2', 'wo-fig-body back')}${line('b')}${line('l1')}${line('a')}${dot('h', 6, 'wo-fig-head')}${dot('w', 3.5, 'wo-fig-w')}</svg>`;
}
