// Allenamento (fase 1, solo in modalità prova): schede, serie e "l'ultima volta" per ogni esercizio.
// Tutto su Firebase: le serie si salvano sul telefono anche senza campo e partono appena torna la rete.
// Raccolte (in prova con prefisso prova_): serie/<giorno>_<uid>_<esercizio> = { name, ex, sets: [{ kg, reps }], t, day, scheda, nome, at }
// (nome: della scheda in quel momento, per i grafici anche se poi la scheda cambia nome o viene eliminata),
// schede/<uid> = { name, list: [{ id, name, ex: [id esercizio] }], extra, rec, agg, at }.
import { fbSignIn, fbUid } from './fbchat.js';
import { figSvg } from './figure.js';
import { bodySvg, ICONE } from './corpo.js';
import { popCount } from './timer.js';

// Catalogo: gli esercizi delle schede che abbiamo; gli esercizi nuovi si aggiungono dall'app ("Nuovo esercizio").
// t: 'kg' (peso e ripetizioni, se manca), 'rip' (solo ripetizioni, a corpo libero), 'sec' (a tempo, in secondi), 'm' (metri)
// old: non più nel catalogo (non si sceglie), resta solo per mostrare il nome delle serie già salvate
export const CATALOGO = [
  { id: 'rot-anca', n: 'Rotazioni d\'anca', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'slanci', n: 'Slanci per lato', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'cane-gatto', n: 'Cane-gatto a 4 zampe', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'aperture-bastone', n: 'Aperture con bastone', g: 'Mobilità', m: 'Bastone', t: 'rip' },
  { id: 'squat', n: 'Squat', g: 'Gambe', m: 'Kettlebell' },
  { id: 'spinte-manubri', n: 'Spinte in alto con manubri in piedi', g: 'Spalle', m: 'Manubri' },
  { id: 'pulley-medio', n: 'Pulley MAG grip medio', g: 'Schiena', m: 'Pulley' },
  { id: 'chest-press-sdraiato', n: 'Chest press orizzontale', g: 'Petto', m: 'Chest press orizzontale' },
  { id: 'situps', n: 'Sit-up', g: 'Addominali', m: 'Corpo libero', t: 'rip' },
  { id: 'plank', n: 'Plank sui gomiti', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  { id: 'barchetta', n: 'Barchetta', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  { id: 'panca', n: 'Panca piana', g: 'Petto', m: 'Bilanciere' },
  { id: 'chest-press', n: 'Chest press', g: 'Petto', m: 'Chest press' },
  { id: 'croci', n: 'Croci ai cavi', g: 'Petto', m: 'Cavi', old: true },
  { id: 'lat', n: 'Lat machine', g: 'Schiena', m: 'Lat machine' },
  { id: 'lat-mag', n: 'Lat machine MAG grip medio', g: 'Schiena', m: 'Lat machine' },
  { id: 'pulley', n: 'Pulley basso', g: 'Schiena', m: 'Pulley' },
  { id: 'rematore', n: 'Rematore con manubrio', g: 'Schiena', m: 'Manubri', old: true },
  { id: 'leg-press', n: 'Leg press', g: 'Gambe', m: 'Leg press' },
  { id: 'leg-ext', n: 'Leg extension', g: 'Gambe', m: 'Leg extension' },
  { id: 'leg-curl', n: 'Leg curl', g: 'Gambe', m: 'Leg curl' },
  { id: 'hip-thrust', n: 'Hip thrust', g: 'Glutei', m: 'Bilanciere', old: true },
  { id: 'calf', n: 'Calf in piedi', g: 'Polpacci', m: 'Macchina', old: true },
  { id: 'shoulder', n: 'Shoulder press', g: 'Spalle', m: 'Macchina', old: true },
  { id: 'alzate', n: 'Alzate laterali', g: 'Spalle', m: 'Manubri' },
  { id: 'curl', n: 'Curl con manubri', g: 'Bicipiti', m: 'Manubri' },
  { id: 'pushdown', n: 'Push down ai cavi', g: 'Tricipiti', m: 'Cavi', old: true },
  { id: 'crunch', n: 'Crunch alla macchina', g: 'Addominali', m: 'Macchina', old: true },
  { id: 'croci-alto', n: 'Croci ai cavi dall\'alto', g: 'Petto', m: 'Cavi' },
  { id: 'leg-press-or', n: 'Leg press orizzontale', g: 'Gambe', m: 'Leg press' },
  { id: 'polpacci-lp', n: 'Polpacci alla leg press orizzontale', g: 'Polpacci', m: 'Leg press' },
  { id: 'affondi-indietro', n: 'Affondi monopodalici indietro', g: 'Gambe', m: 'Manubri' },
  { id: 'abductor', n: 'Abduzioni', g: 'Glutei', m: 'Abductor machine' },
  { id: 'spinte-multipower', n: 'Spinte in alto', g: 'Spalle', m: 'Multipower' },
  { id: 'step-ups', n: 'Step up', g: 'Gambe', m: 'Manubri' },
  { id: 'curl-ez', n: 'Curl con bilanciere EZ', g: 'Bicipiti', m: 'Bilanciere EZ' },
  { id: 'hammer-curl', n: 'Hammer curl con manubri', g: 'Bicipiti', m: 'Manubri' },
  { id: 'trazioni-elastico', n: 'Trazioni con elastico', g: 'Schiena', m: 'Sbarra', t: 'rip' },
  { id: 'pushdown-corda', n: 'Push down con corda', g: 'Tricipiti', m: 'Cavi' },
  { id: 'french-press', n: 'French press con manubri', g: 'Tricipiti', m: 'Manubri' },
  { id: 'russian-twist', n: 'Russian twist', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  { id: 'plank-laterale', n: 'Plank laterale', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  { id: 'situps-tempo', n: 'Sit-up', g: 'Addominali', m: 'Corpo libero', t: 'sec', old: true },
  { id: 'v-sit', n: 'V-sit crunch', g: 'Addominali', m: 'Corpo libero', t: 'sec' },
  // Ceppo
  { id: 'riscaldamento', n: 'Riscaldamento', g: 'Mobilità', m: 'Cardio', t: 'rip' },
  { id: 'capo', n: 'Rotazioni e circonduzioni del capo', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'spalle-mob', n: 'Spalle su e giù, avanti e indietro, circonduzioni', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'circ-braccia', n: 'Circonduzioni braccia', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'rot-busto', n: 'Rotazioni busto', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'circ-anca', n: 'Circonduzioni anca', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'caviglia-rialzo', n: 'Piegamenti caviglia su rialzo', g: 'Mobilità', m: 'Rialzo', t: 'rip' },
  { id: 'tappetino-mob', n: 'Su tappetino: cane-gatto e allungamento', g: 'Mobilità', m: 'Tappetino', t: 'rip' },
  { id: 'ponte', n: 'Ponte su tappetino', g: 'Addominali', m: 'Tappetino', t: 'rip' },
  { id: 'plank-ginocchia', n: 'Plank sollevo ginocchia', g: 'Addominali', m: 'Corpo libero', t: 'rip' },
  { id: 'ponte-mono', n: 'Ponte monopodalico', g: 'Glutei', m: 'Tappetino', t: 'rip' },
  { id: 'plank-commando', n: 'Plank commando', g: 'Addominali', m: 'Corpo libero', t: 'rip' },
  { id: 'ercolina-rot', n: 'Rotazioni busto all\'ercolina', g: 'Addominali', m: 'Ercolina' },
  { id: 'goblet-box', n: 'Goblet squat con box', g: 'Gambe', m: 'Manubri' },
  { id: 'pekdek-or', n: 'Pek dek orizzontale', g: 'Petto', m: 'Pek dek' },
  { id: 'rematore-armstrong', n: 'Rematore Armstrong', g: 'Schiena', m: 'Rematore Armstrong' },
  { id: 'eps-trazioni', n: 'Trazioni assistite', g: 'Schiena', m: 'EPS' },
  { id: 'pekdek-vert', n: 'Pek dek verticale', g: 'Petto', m: 'Pek dek' },
  // Gualo
  { id: 'inarco-gobba', n: 'Inarco e gobba', g: 'Mobilità', m: 'Corpo libero', t: 'rip' },
  { id: 'leg-press-mono', n: 'Leg press orizzontale monopodalica', g: 'Gambe', m: 'Leg press' },
  { id: 'shoulder-bil', n: 'Shoulder press in piedi con bilanciere', g: 'Spalle', m: 'Bilanciere' },
  { id: 'curl-alt', n: 'Curl alternato con manubri', g: 'Bicipiti', m: 'Manubri' },
  { id: 'crunch-terra', n: 'Crunch', g: 'Addominali', m: 'Corpo libero', t: 'rip' },
  { id: 'russian-twist-rip', n: 'Russian twist', g: 'Addominali', m: 'Corpo libero', t: 'rip', old: true },
  { id: 'v-sit-rip', n: 'V-sit crunch', g: 'Addominali', m: 'Corpo libero', t: 'rip', old: true },
  { id: 'low-row', n: 'Low row', g: 'Schiena', m: 'Low row' },
  { id: 'leg-curl-sdraiato', n: 'Leg curl sdraiato', g: 'Gambe', m: 'Leg curl' },
  { id: 'hyper-ext', n: 'Iperestensioni', g: 'Schiena', m: 'Panca hyper extension', t: 'rip' },
  { id: 'piegamenti', n: 'Piegamenti', g: 'Petto', m: 'Corpo libero', t: 'rip' },
  { id: 'vogatore', n: 'Vogatore', g: 'Cardio', m: 'Vogatore', t: 'm' },
];
const EX = Object.fromEntries(CATALOGO.map((e) => [e.id, e]));
// Doppioni uniti (lo stesso esercizio a tempo e a ripetizioni): il vecchio id resta solo per le serie già salvate,
// e "l'ultima volta" del nuovo le conta se sono state fatte nello stesso modo. Come si segna lo dice la scheda (piano.t).
const UNITI = { 'situps-tempo': 'situps', 'russian-twist-rip': 'russian-twist', 'v-sit-rip': 'v-sit' };
/** Esercizio cambiato dall'app nel catalogo comune: nome, attrezzo, gruppo, come si segna ('kg' = peso e ripetizioni). */
function applyCat(e, d) {
  if (!e || !d) return;
  if (typeof d.n === 'string' && d.n) e.n = d.n;
  if (typeof d.m === 'string') e.m = d.m;
  if (typeof d.g === 'string' && d.g) e.g = d.g;
  if (['rip', 'sec', 'm'].includes(d.t)) e.t = d.t;
  else if (d.t === 'kg') delete e.t;
}

/** Esercizio aggiunto da qualcuno ("Nuovo esercizio"): entra nel catalogo come le altre. */
function addEx(e) {
  if (EX[e.id]) return;
  EX[e.id] = e;
  CATALOGO.push(e);
}

// Scheda per chi non ne ha ancora (la creazione delle proprie arriva con la fase 2): la scheda A di Francesco.
// piano: serie × ripetizioni indicate dall'istruttore e note; servono anche per riempire le serie la prima volta.
const SCHEDE_ESEMPIO = [
  {
    id: 'a',
    name: 'Scheda A',
    // "@addome" è un circuito: sit-up, plank e barchetta di fila, ripetuti per più giri (ogni giro salvato come una serie)
    // "@mobilita" è una lista da spuntare (5 minuti di mobilità all'inizio)
    ex: ['@mobilita', 'squat', 'lat-mag', 'spinte-manubri', 'pulley-medio', 'chest-press-sdraiato', 'curl', '@addome'],
    circuiti: {
      mobilita: { n: 'Mobilità', lista: true, durata: "5'", ex: ['rot-anca', 'slanci', 'cane-gatto', 'aperture-bastone'] },
      addome: { n: 'Circuito addome', ex: ['situps', 'plank', 'barchetta'], giri: 3, rec: 60 },
    },
    piano: {
      squat: { s: '4 × 6-8' },
      'lat-mag': { s: '3 × 8-10' },
      'spinte-manubri': { s: '4 × 6-8' },
      'pulley-medio': { s: '3 × 8-10', nota: '1" fermo al petto' },
      'chest-press-sdraiato': { s: '3 × 8-10', nota: '2° piano' },
      curl: { s: '3 × 6-8' },
      'rot-anca': { s: '8 per lato' },
      slanci: { s: '8 per lato' },
      'cane-gatto': { s: '12' },
      'aperture-bastone': { s: '10' },
      situps: { s: '10-12' },
      plank: { s: '30-40"' },
      barchetta: { s: '20-30"' },
    },
  },
];

// Schede di Rizzo (di: non vengono proposte come "da fare"): in fondo a tutte il circuito addome,
// 30" di lavoro per esercizio, di fila, e recupero tra i giri (pausa: secondi tra un esercizio e l'altro, se servono).
const ADDOME_R = { n: 'Circuito addome', ex: ['russian-twist', 'plank-laterale', 'situps', 'v-sit', 'barchetta'], giri: 2, rec: 60 };
const PIANO_ADDOME_R = Object.fromEntries(ADDOME_R.ex.map((e) => [e, { s: '30"' }]));
PIANO_ADDOME_R.situps.t = 'sec';
const rizzo = (id, name, piano) => ({
  id, name, di: 'Rizzo',
  ex: [...Object.keys(piano), '@addome-r'],
  circuiti: { 'addome-r': ADDOME_R },
  piano: { ...piano, ...PIANO_ADDOME_R },
});
SCHEDE_ESEMPIO.push(
  rizzo('r-upper', 'Upper', {
    panca: { s: '5 × 5' },
    'croci-alto': { s: '3 × 12' },
    lat: { s: '3 × 8-10' },
    pulley: { s: '3 × 8-10' },
    alzate: { s: '3 × 10-12' },
  }),
  rizzo('r-lower', 'Lower', {
    'leg-press-or': { s: '4 × 8-10' },
    'leg-ext': { s: '3 × 8-10' },
    'leg-curl': { s: '3 × 8-10' },
    'polpacci-lp': { s: '3 × 10-12' },
    'affondi-indietro': { s: '3 × 8-10' },
    abductor: { s: '3 × 10-12' },
  }),
  rizzo('r-davanti', 'Davanti', {
    panca: { s: '4 × 10' },
    'spinte-multipower': { s: '3 × 8-10' },
    'step-ups': { s: '3 × 8-10' },
    'curl-ez': { s: '3 × 8-10' },
    'hammer-curl': { s: '3 × 8-10' },
  }),
  rizzo('r-dietro', 'Dietro', {
    'trazioni-elastico': { s: '4 × 6', nota: 'più diventi forte, più aumenti le ripetizioni' },
    pulley: { s: '3 × 8-10' },
    'pushdown-corda': { s: '3 × 10-12' },
    'french-press': { s: '3 × 10-12' },
    'leg-curl': { s: '3 × 8-10' },
  }),
);

// Scheda di Ceppo (una sola, dell'istruttore Simone); kg: peso da cui partire, rec: recupero in secondi
SCHEDE_ESEMPIO.push({
  id: 'c-ceppo', name: 'Total body', di: 'Ceppo',
  ex: ['@mob-c', '@colonna-c', 'ercolina-rot', 'leg-press', 'goblet-box', 'pekdek-or', 'rematore-armstrong', 'eps-trazioni', 'pekdek-vert'],
  circuiti: {
    'mob-c': { n: 'Riscaldamento e mobilità', lista: true, durata: "10'", ex: ['riscaldamento', 'capo', 'spalle-mob', 'circ-braccia', 'rot-busto', 'circ-anca', 'caviglia-rialzo', 'tappetino-mob'] },
    'colonna-c': { n: 'Muscoli della colonna', ex: ['ponte', 'plank-ginocchia', 'ponte-mono', 'plank-commando'], giri: 2, rec: 30 },
  },
  piano: {
    riscaldamento: { s: "3-5'" },
    ponte: { s: '10' },
    'plank-ginocchia': { s: '10' },
    'ponte-mono': { s: '10 per gamba' },
    'plank-commando': { s: '6' },
    'ercolina-rot': { s: '2 × 8 per lato', kg: 10 },
    'leg-press': { s: '3 × 6', kg: 80, nota: 'altezza 6', rec: 90 },
    'goblet-box': { s: '3 × 8', kg: 12, nota: 'box + 2 dischi', rec: 60 },
    'pekdek-or': { s: '3 × 8-10', kg: 35 },
    'rematore-armstrong': { s: '3 × 8-10', kg: 25 },
    'eps-trazioni': { s: '3 × 8-10', kg: 50, nota: 'in superserie col pek dek verticale; in alternativa tirate al cavo basso (ercolina) 25 kg' },
    'pekdek-vert': { s: '3 × 8-10', kg: 20, nota: 'in superserie con le trazioni; in alternativa dips all\'EPS 50 kg' },
  },
});

// Schede A e B di Gualo (istruttore Federico): mobilità all'inizio di entrambe, addome a circuito in fondo alla A
const MOB_G = { n: 'Mobilità', lista: true, durata: "5'", ex: ['circ-braccia', 'circ-anca', 'inarco-gobba', 'plank'] };
const PIANO_MOB_G = { 'circ-braccia': { s: '10 avanti, 10 indietro' }, 'circ-anca': { s: '10 orario, 10 antiorario' }, plank: { s: '30"' } };
SCHEDE_ESEMPIO.push(
  {
    id: 'g-a', name: 'Scheda A', di: 'Gualo',
    ex: ['@mob-g', 'leg-press-mono', 'shoulder-bil', 'leg-ext', 'chest-press', 'curl-alt', '@addome-g'],
    circuiti: {
      'mob-g': MOB_G,
      'addome-g': { n: 'Circuito addome', ex: ['crunch-terra', 'russian-twist', 'barchetta', 'v-sit', 'plank-laterale'], giri: 2, rec: 60 },
    },
    piano: {
      ...PIANO_MOB_G,
      'leg-press-mono': { s: '3 × 8-10' },
      'shoulder-bil': { s: '4 × 8' },
      'leg-ext': { s: '3 × 8-10' },
      'chest-press': { s: '3 × 8-10' },
      'curl-alt': { s: '3 × 8-10' },
      'crunch-terra': { s: '15' },
      'russian-twist': { s: '30', t: 'rip' },
      barchetta: { s: '30"' },
      'v-sit': { s: '12 dx, sx, centro', t: 'rip' },
      'plank-laterale': { s: '20"' },
    },
  },
  {
    id: 'g-b', name: 'Scheda B', di: 'Gualo',
    ex: ['@mob-g', 'lat', 'low-row', 'leg-curl-sdraiato', 'hyper-ext', 'piegamenti', 'vogatore', 'pushdown-corda'],
    circuiti: { 'mob-g': MOB_G },
    piano: {
      ...PIANO_MOB_G,
      lat: { s: '3 × 8-10' },
      'low-row': { s: '3 × 8-10' },
      'leg-curl-sdraiato': { s: '3 × 8-10' },
      'hyper-ext': { s: '3 × 8-10' },
      piegamenti: { s: '4 × 20', nota: 'se serve, recupero 1:30', rec: 60 },
      vogatore: { s: "10'", rip: 2000, nota: 'segna i metri fatti' },
      'pushdown-corda': { s: '3 × 10-12', nota: 'bonus, se hai tempo' },
    },
  },
);

/** Schede di chi non ha ancora salvato niente: quelle senza `di` sono di Francesco; agli altri le proprie
 *  (quelle "di" loro, diventano sue), le altre si copiano da "Copia da altri". */
const esempi = (name) => (name === 'Francesco' ? SCHEDE_ESEMPIO : SCHEDE_ESEMPIO.filter((y) => y.di === name).map(({ di, ...y }) => y));

// Aggiornamenti mirati delle schede (quando Francesco chiede di sistemarne una già salvata nei dati di qualcuno):
// ognuno si applica una sola volta alla copia salvata (gli id fatti restano in `agg`) e cambia solo quello che dice,
// lasciando il resto come l'ha personalizzato la persona. Chi non ha ancora salvato niente usa SCHEDE_ESEMPIO,
// quindi la stessa modifica va fatta anche lì. id: numero crescente, mai riusato; per: nomi (se manca, tutti).
//   { id, op: 'piano', scheda, ex, set: { s, nota, kg, rec, rip } }  piano di un esercizio (se c'è ancora; null toglie il campo)
//   { id, op: 'aggiungi', scheda, ex, dopo, piano }                  esercizio in più (se manca), dopo `dopo` o in fondo
//   { id, op: 'togli', scheda, ex }                                  toglie un esercizio
//   { id, op: 'sostituisci', scheda, ex, con, t }                    mette `con` al posto di `ex` (stesso posto e piano; t: come si segna lì)
//   { id, op: 'circuito', scheda, c, set: { n, giri, rec, ex } }     cambia un circuito (c senza @)
//   { id, op: 'nome', scheda, name }                                 rinomina una scheda
//   { id, op: 'nome', di, da, name }                                 rinomina le copie "di" qualcuno che si chiamano ancora `da`
//   { id, op: 'scheda', scheda: { id, name, ex, piano, circuiti } }  scheda intera nuova (se non c'è già)
const AGGIORNAMENTI = [
  // 23/10: via i nomi delle persone dai nomi delle schede (c'è il bollino con la persona)
  { id: 1, op: 'nome', di: 'Rizzo', da: 'Rizzo Upper', name: 'Upper' },
  { id: 2, op: 'nome', di: 'Rizzo', da: 'Rizzo Lower', name: 'Lower' },
  { id: 3, op: 'nome', di: 'Rizzo', da: 'Rizzo Davanti', name: 'Davanti' },
  { id: 4, op: 'nome', di: 'Rizzo', da: 'Rizzo Dietro', name: 'Dietro' },
  { id: 5, op: 'nome', di: 'Ceppo', da: 'Ceppo', name: 'Total body' },
  { id: 6, op: 'nome', di: 'Gualo', da: 'Gualo A', name: 'Scheda A' },
  { id: 7, op: 'nome', di: 'Gualo', da: 'Gualo B', name: 'Scheda B' },
  // 24/10: nella Scheda A di Francesco la lat machine è con la MAG grip medio (esercizio nuovo)
  { id: 8, op: 'sostituisci', scheda: 'a', ex: 'lat', con: 'lat-mag', per: ['Francesco'] },
  // 24/10: doppioni uniti, a tempo o a ripetizioni lo dice la scheda
  ...['r-upper', 'r-lower', 'r-davanti', 'r-dietro'].map((sc, i) => ({ id: 9 + i, op: 'sostituisci', scheda: sc, ex: 'situps-tempo', con: 'situps', t: 'sec' })),
  { id: 13, op: 'sostituisci', scheda: 'g-a', ex: 'russian-twist-rip', con: 'russian-twist', t: 'rip' },
  { id: 14, op: 'sostituisci', scheda: 'g-a', ex: 'v-sit-rip', con: 'v-sit', t: 'rip' },
];

/** Applica un aggiornamento all'elenco di schede (già copiato); quello che non trova lo salta. */
function applyAgg(list, a) {
  if (a.op === 'scheda') {
    if (!list.some((y) => y.id === a.scheda.id)) list.push(JSON.parse(JSON.stringify(a.scheda)));
    return;
  }
  if (a.op === 'nome' && a.da) { // tutte le copie con quel nome (non quelle già rinominate da chi le usa)
    list.forEach((y) => { if (y.di === a.di && y.name === a.da) y.name = a.name; });
    return;
  }
  const sc = list.find((y) => y.id === a.scheda);
  if (!sc) return;
  sc.piano ||= {};
  if (a.op === 'piano') {
    const inUse = sc.ex.includes(a.ex) || Object.values(sc.circuiti || {}).some((c) => c.ex.includes(a.ex));
    if (!inUse) return;
    const pi = (sc.piano[a.ex] ||= {});
    Object.entries(a.set).forEach(([k, v]) => (v == null ? delete pi[k] : (pi[k] = v)));
  } else if (a.op === 'aggiungi') {
    if (sc.ex.includes(a.ex)) return;
    const k = a.dopo ? sc.ex.indexOf(a.dopo) : -1;
    if (k >= 0) sc.ex.splice(k + 1, 0, a.ex);
    else sc.ex.push(a.ex);
    if (a.piano) sc.piano[a.ex] = { ...a.piano };
  } else if (a.op === 'sostituisci') {
    const at = sc.ex.indexOf(a.ex);
    if (at >= 0 && !sc.ex.includes(a.con)) sc.ex[at] = a.con;
    Object.values(sc.circuiti || {}).forEach((c) => { const k = c.ex.indexOf(a.ex); if (k >= 0) c.ex[k] = a.con; });
    if (sc.piano[a.ex] && !sc.piano[a.con]) sc.piano[a.con] = sc.piano[a.ex];
    if (a.t) sc.piano[a.con] = { ...sc.piano[a.con], t: a.t };
  } else if (a.op === 'togli') {
    sc.ex = sc.ex.filter((e) => e !== a.ex);
  } else if (a.op === 'circuito') {
    const c = sc.circuiti && sc.circuiti[a.c];
    if (c) Object.assign(c, JSON.parse(JSON.stringify(a.set)));
  } else if (a.op === 'nome') {
    sc.name = a.name;
  }
}

const REST = 90; // secondi di recupero

/** Serie della prima volta: dal piano della scheda ("4 × 6-8" → 4 serie da 6), altrimenti 3 × 10; kg e rip se indicati. */
function primaVolta(piano) {
  const m = String((piano && piano.s) || '').match(/^(?:(\d+)\s*×\s*)?(\d+)/);
  const n = m ? Number(m[1] || 1) : 3, reps = (piano && piano.rip) || (m ? Number(m[2]) : 10);
  return Array.from({ length: n }, () => ({ kg: (piano && piano.kg) || 0, reps }));
}
const unit = (e) => (e && e.t) || 'kg';
const uShort = (t) => (t === 'sec' ? 's' : t === 'm' ? 'm' : 'rip');
const uLong = (t) => (t === 'sec' ? 'secondi' : t === 'm' ? 'metri' : 'ripetizioni');
const uStep = (t) => (t === 'sec' ? 5 : t === 'm' ? 50 : 1);
/** Peso dopo − o +: a 1 kg fino a 20, sopra a 2,5 kg (sui multipli di 2,5). Si può sempre scrivere a mano. */
function nextKg(v, d) {
  if (d > 0) return v < 20 ? Math.min(20, Math.floor(v) + 1) : Math.floor(v / 2.5 + 1e-9) * 2.5 + 2.5;
  if (v <= 20) return Math.max(0, Math.ceil(v) - 1);
  return Math.max(20, Math.ceil(v / 2.5 - 1e-9) * 2.5 - 2.5);
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());
const daysAgo = (d) => Math.round((Date.parse(today() + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 86400000);
const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
const kgf = (v) => String(v).replace('.', ',');
/** Quanto tempo fa, a parole: ieri, 3 giorni fa, 2 settimane fa, 1 mese fa. */
function agoText(d) {
  const n = daysAgo(d), w = Math.round(n / 7), m = Math.round(n / 30);
  return n <= 0 ? 'oggi' : n === 1 ? 'ieri' : n < 14 ? `${n} giorni fa` : n < 30 ? `${w} settimane fa` : m <= 1 ? '1 mese fa' : `${m} mesi fa`;
}
/** Il simbolo della volta scorsa (freccia che torna indietro attorno a un orologio). */
const PREV_ICON = '<svg class="wo-prev-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M3.6 1.8v2.6h2.6M8 5v3.2l2 1.3"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const copy = (sets) => sets.map((s) => ({ kg: s.kg, reps: s.reps }));

function summary(sets, t = 'kg') {
  const r = sets.map((s) => s.reps);
  const u = (x) => (t === 'sec' ? `${x}"` : t === 'm' ? `${x} m` : x);
  const reps = r.every((x) => x === r[0]) ? (r.length > 1 || t !== 'm' ? `${r.length} × ${u(r[0])}` : u(r[0])) : r.map(u).join(' · ');
  if (t !== 'kg') return reps;
  const kg = sets.every((s) => s.kg === sets[0].kg) ? `${kgf(sets[0].kg)} kg` : 'kg diversi';
  return `${reps} · ${kg}`;
}

export function createWorkout({ root, getToken, toast, openTimer, timerSeconds }) {
  let x = null; // { fs, db } dopo l'accesso
  let me = null;
  let pfx = '';
  let key = '';
  let unsubs = [];
  let ready = false;
  let serie = []; // le mie serie (tutte)
  let schede = null; // le mie schede (null finché non arrivano)
  // cosa si vede: lista, esercizio, catalogo (allenamento libero)
  // pg: pagina della scelta esercizi ('m:Petto' muscolo, 'f:Cardio' famiglia di attrezzi, 'a' tutti; '' la prima), pf: filtro lì dentro
  // ed: scheda in modifica; pickFor: il catalogo sceglie esercizi per la scheda ('edit'), un circuito nuovo ('circnew') o uno esistente ('circ:id')
  const ui = { view: 'list', scheda: '', list: [], i: 0, sets: null, open: -1, editing: false, q: '', g: '', pg: '', pf: '', ed: null, pickFor: '', sel: [], sheet: null, nx: null, prev: '', rotSheet: false, exed: null, cired: null };
  let restEnd = 0;
  let restTotal = REST; // secondi del recupero in corso
  let serieSig = '';
  let altrove = []; // le mie serie salvate dall'altra parte (prova o dati veri)
  let pressed = false; // dito sullo schermo: il ridisegno aspetta che si alzi
  let later = false;
  let extra = []; // macchine aggiunte da me (nel documento delle schede)
  let recMap = {}; // recupero scelto da me per esercizio, in secondi
  let otherSchede = []; // documenti delle schede degli altri, per "Copia una scheda"
  let hasDoc = false; // le mie schede sono già salvate su Firebase (altrimenti si usano quelle di esempio)
  let aggDone = []; // id degli aggiornamenti mirati già applicati alle mie schede
  let rot = []; // schede in rotazione, in ordine (id)

  async function start(user, test) {
    const k = `${user.name}|${test}`;
    if (k === key) return;
    stop();
    key = k;
    me = user;
    pfx = test ? 'prova_' : '';
    loadDraft();
    draw();
    try {
      x = await fbSignIn(user, getToken);
    } catch (err) {
      key = '';
      root.innerHTML = `<p class="wo-empty">Allenamento non disponibile: ${esc(err.message)}</p>`;
      return;
    }
    if (k !== key) return;
    const { fs, db } = x;
    unsubs.push(
      fs.onSnapshot(fs.query(fs.collection(db, pfx + 'serie'), fs.where('name', '==', me.name)), { includeMetadataChanges: true }, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), pending: d.metadata.hasPendingWrites }));
        const sig = JSON.stringify(list.map((s) => [s.id, s.sets, s.pending]));
        serie = list;
        if (ready && sig === serieSig) return; // solo metadati cambiati: ridisegnare farebbe perdere tocchi e tastiera
        serieSig = sig;
        ready = true;
        softDraw();
      }, (err) => toast(`Allenamento: ${err.message}`)),
      fs.onSnapshot(fs.doc(db, pfx + 'schede', fbUid(me.name)), (snap) => {
        const d = snap.exists() ? snap.data() : null;
        hasDoc = !!d;
        schede = d ? d.list || [] : esempi(me.name);
        extra = (d && d.extra) || [];
        extra.forEach(addEx);
        recMap = (d && d.rec) || {};
        aggDone = (d && d.agg) || [];
        rot = (d && d.rot) || [];
        const todo = d ? AGGIORNAMENTI.filter((a) => !aggDone.includes(a.id) && (!a.per || a.per.includes(me.name))) : [];
        if (todo.length) { // aggiornamenti mirati non ancora applicati: si applicano e si salvano subito
          const list = JSON.parse(JSON.stringify(schede));
          todo.forEach((a) => applyAgg(list, a));
          aggDone = [...aggDone, ...todo.map((a) => a.id)];
          writeDoc(list);
        }
        softDraw();
      }, (err) => toast(`Allenamento: ${err.message}`)),
    );
    loadOthers(); // schede degli altri (per il tasto "Schede degli altri")
    // Catalogo comune: attrezzo cambiato dall'app (vale per tutte le schede di tutti)
    unsubs.push(fs.onSnapshot(fs.collection(db, pfx + 'catalogo'), (snap) => {
      snap.docs.forEach((d) => applyCat(EX[d.id], d.data()));
      softDraw();
    }, () => {}));
    // Serie salvate dall'altra parte (in prova se ora si è fuori, o viceversa): si possono copiare qui
    fs.getDocs(fs.query(fs.collection(db, (test ? '' : 'prova_') + 'serie'), fs.where('name', '==', me.name)))
      .then((snap) => {
        if (k !== key) return;
        altrove = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        softDraw();
      })
      .catch(() => {});
  }

  /** Serie dell'altra parte che qui mancano (Firebase accetta solo quelle di oggi e ieri). */
  const daCopiare = () => altrove.filter((a) => daysAgo(a.day) <= 1 && !serie.some((s) => s.id === a.id));

  function copia() {
    const { fs, db } = x;
    daCopiare().forEach((a) => {
      fs.setDoc(fs.doc(db, pfx + 'serie', a.id), { name: me.name, ex: a.ex, sets: copy(a.sets), ...(a.t ? { t: a.t } : {}), day: a.day, scheda: a.scheda || '', nome: a.nome || '', at: fs.serverTimestamp() })
        .catch((err) => toast(`Serie non copiate: ${err.message}`));
    });
  }

  function stop() {
    unsubs.forEach((u) => u());
    unsubs = [];
    key = '';
    ready = false;
    serie = [];
    serieSig = '';
    altrove = [];
    schede = null;
    extra = [];
    recMap = {};
    otherSchede = [];
    hasDoc = false;
    aggDone = [];
    rot = [];
    Object.assign(ui, { view: 'list', ed: null, pickFor: '', sel: [], sheet: null });
    pages = {};
  }

  // ---------- Dati ----------

  const todayDoc = (ex) => serie.find((s) => s.ex === ex && s.day === today());
  /** L'ultima volta prima di oggi. */
  function lastTime(ex, t = tOf(ex)) {
    return serie.filter((s) => (s.ex === ex || UNITI[s.ex] === ex) && s.day < today() && (s.t || unit(EX[s.ex])) === t)
      .sort((a, b) => (a.day < b.day ? 1 : -1))[0] || null;
  }
  /** Circuito di una scheda ("@nome"), oppure null per un esercizio normale. */
  const circIn = (sch, id) => (id[0] === '@' && sch && sch.circuiti ? sch.circuiti[id.slice(1)] || null : null);
  const curSch = () => (schede || []).find((s) => s.id === ui.scheda);
  /** Come si segna un esercizio in una scheda: quello scelto lì, altrimenti quello del catalogo. */
  const tOf = (ex, sch = curSch()) => (sch && sch.piano && sch.piano[ex] && sch.piano[ex].t) || unit(EX[ex]);
  /** Fatto oggi: per un circuito, tutti i suoi esercizi salvati. */
  function isDone(id, sch = curSch()) {
    const c = circIn(sch, id);
    return c ? c.ex.every((e) => todayDoc(e)) : !!todayDoc(id);
  }
  const nameOf = (id, sch = curSch()) => (circIn(sch, id) || EX[id] || { n: id }).n;
  const lastDone = (sch) => serie.filter((s) => s.scheda === sch.id).reduce((m, s) => (s.day > m ? s.day : m), '');
  const doneToday = (sch) => sch.ex.filter((e) => (circIn(sch, e) ? isDone(e, sch) : serie.some((s) => s.ex === e && s.day === today() && s.scheda === sch.id))).length;

  /** La scheda da fare: quella iniziata oggi, se non finita; altrimenti quella non fatta da più tempo. */
  function proposta() {
    const list = (schede || []).filter((s) => !s.di);
    const started = list.find((s) => doneToday(s) > 0 && doneToday(s) < s.ex.length);
    if (started) return started;
    return list.slice().sort((a, b) => (lastDone(a) < lastDone(b) ? -1 : lastDone(a) > lastDone(b) ? 1 : 0))[0];
  }

  function save(ex, sets) {
    const { fs, db } = x;
    const day = today();
    // Non si aspetta Firebase: senza campo resta sul telefono e parte da solo appena torna la rete
    fs.setDoc(fs.doc(db, pfx + 'serie', `${day}_${fbUid(me.name)}_${ex}`), { name: me.name, ex, sets: copy(sets), t: tOf(ex), day, scheda: ui.scheda, nome: curSch() ? curSch().name.slice(0, 60) : '', at: fs.serverTimestamp() })
      .catch((err) => toast(`Serie non salvate: ${err.message}`));
  }

  // ---------- Disegno ----------

  /** Ridisegno per i dati arrivati da Firebase: non mentre si tocca o si scrive, ma subito dopo. */
  function softDraw() {
    const typing = root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
    if (pressed || typing || scrolling) later = true;
    else draw();
  }
  function flush() {
    if (!later || pressed || scrolling) return;
    later = false;
    setTimeout(() => {
      if (!(root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) draw();
      else later = true;
    }, 0);
  }
  root.addEventListener('pointerdown', () => (pressed = true));
  document.addEventListener('pointerup', () => { pressed = false; flush(); });
  document.addEventListener('pointercancel', () => { pressed = false; flush(); });
  root.addEventListener('focusout', () => setTimeout(flush, 0));

  // Indietro trascinando dal bordo sinistro, come in Safari (dalla Home iOS non lo fa da solo):
  // la pagina segue il dito e sotto compare quella prima; oltre metà schermo o con uno scatto si torna lì.
  const backView = () => (ui.view === 'ex' && !ui.scheda ? 'pick' : ui.view === 'pick' && ui.pickFor && !ui.pickFor.startsWith('circ:') ? 'edit' : ui.view === 'newex' ? 'pick' : ui.view === 'prev' ? 'copy' : ui.view === 'exed' ? (ui.exed && ui.exed.back ? 'cired' : 'edit') : ui.view === 'cired' ? 'edit' : ui.view === 'pick' && ui.cired ? 'cired' : 'list');
  function goBack(anim = 'wo-pop') {
    navAnim = anim ? 'wo-pop' : '';
    if (ui.view === 'pick' && ui.pg && !ui.q.trim()) { // da un muscolo o una famiglia: alla prima pagina della scelta
      Object.assign(ui, { pg: '', pf: '' });
      return;
    }
    const v = backView();
    if (ui.view === 'exed') ui.exed = null; // dalla pagina Esercizio: alla modifica (o al circuito da cui eri partito)
    if (ui.view === 'cired') ui.cired = null;
    if (ui.view === 'pick' && v === 'cired') Object.assign(ui, { pickFor: '', sel: [] });
    if (v !== 'pick') Object.assign(ui, { pickFor: v === 'edit' ? '' : ui.pickFor, sel: v === 'edit' ? [] : ui.sel });
    if (v === 'list') Object.assign(ui, { ed: null, pickFor: '', sheet: null });
    ui.view = v;
  }
  function viewHtml(v) {
    return v === 'ex' ? exView() : v === 'pick' ? pickView() : v === 'edit' ? editView() : v === 'newex' ? newExView() : v === 'copy' ? copyView() : v === 'prev' ? prevView() : v === 'exed' ? exedView() : v === 'cired' ? ciredView() : listView();
  }
  let edge = null;
  root.addEventListener('pointerdown', (ev) => {
    if (!ev.target.classList.contains('wo-edge')) return;
    ev.target.setPointerCapture(ev.pointerId);
    edge = { x: ev.clientX, t: ev.timeStamp, dx: 0, v: 0, under: null, els: [] };
  });
  root.addEventListener('pointermove', (ev) => {
    if (!edge) return;
    const dx = Math.max(0, ev.clientX - edge.x);
    if (!edge.under && dx > 6) {
      edge.els = [...root.children].filter((el) => !el.classList.contains('wo-edge'));
      const v = ui.view, pg = ui.pg;
      if (v === 'pick' && pg && !ui.q.trim()) ui.pg = ''; // sotto: la prima pagina della scelta
      else ui.view = backView();
      const html = viewHtml(ui.view);
      Object.assign(ui, { view: v, pg });
      edge.under = document.createElement('div');
      edge.under.className = 'wo-under';
      edge.under.innerHTML = html;
      const cover = document.createElement('div'); // fondo della pagina che scorre via, con l'ombra sul bordo
      cover.className = 'wo-cover';
      root.prepend(edge.under, cover);
      edge.els.push(cover);
      root.classList.add('wo-swiping');
    }
    if (!edge.under) return;
    edge.v = (dx - edge.dx) / Math.max(1, ev.timeStamp - edge.t);
    edge.dx = dx;
    edge.t = ev.timeStamp;
    swipeTo(dx, false);
  });
  const swipeTo = (dx, anim) => {
    const w = root.clientWidth, f = Math.min(1, dx / w);
    edge.els.forEach((el) => {
      el.style.transition = anim ? 'transform .22s ease-out' : '';
      el.style.transform = `translateX(${dx}px)`;
    });
    edge.under.style.transition = anim ? 'transform .22s ease-out, opacity .22s ease-out' : '';
    edge.under.style.transform = `translateX(${(f - 1) * 30}%)`;
    edge.under.style.opacity = String(0.4 + 0.6 * f);
  };
  const edgeEnd = () => {
    const e = edge;
    edge = null;
    if (!e || !e.under) return;
    const w = root.clientWidth, go = e.dx > w / 2 || e.v > 0.5;
    edge = e;
    swipeTo(go ? w : 0, true);
    edge = null;
    setTimeout(() => {
      root.classList.remove('wo-swiping');
      if (go) {
        goBack('');
        draw();
        window.scrollTo(0, 0);
      } else {
        e.under.remove();
        root.querySelector('.wo-cover')?.remove();
        e.els.forEach((el) => { el.style.transform = ''; el.style.transition = ''; });
      }
    }, 230);
  };
  root.addEventListener('pointerup', edgeEnd);
  root.addEventListener('pointercancel', edgeEnd);

  let shownView = 'list';
  let navAnim = 'wo-push'; // animazione del prossimo cambio di pagina ('' dopo il trascinamento dal bordo, che si anima da solo)
  /** Profondità delle pagine: entrando più in fondo la pagina arriva da destra, tornando su da sinistra. */
  const vkey = () => (ui.view === 'pick' && ui.pg && !ui.q.trim() ? 'pick:' + ui.pg : ui.view); // muscolo o attrezzo: pagina a sé
  const depth = (v) => (v.startsWith('pick:') ? depth('pick') + 1 : null) ?? ({ list: 0, copy: 1, edit: 1, prev: 2, cired: 2, exed: 3, newex: 3 })[v] ?? (v === 'pick' ? (ui.pickFor ? 2 : 1) : v === 'ex' ? (ui.scheda ? 1 : 2) : 1);
  const scrollMem = {};
  function draw() {
    if (!me) return;
    if (!ready || !schede) {
      root.innerHTML = '<p class="wo-empty">Carico l\'allenamento…</p>';
      return;
    }
    const sc = document.getElementById('scroller'); // area che scorre dell'app
    const vk = vkey();
    if (sc && vk !== shownView) { // pagina nuova: si parte dall'alto (tornando alla modifica o alla scelta, dal punto in cui eri)
      scrollMem[shownView] = sc.scrollTop;
      const back = (vk === 'edit' && ['pick', 'newex', 'exed', 'cired'].includes(shownView.split(':')[0])) || (vk === 'pick' && shownView.startsWith('pick:'));
      if (navAnim) navAnim = depth(vk) < depth(shownView) ? 'wo-pop' : 'wo-push'; // si va più in fondo o si torna su
      shownView = vk;
      root.innerHTML = viewHtml(ui.view) + (ui.view === 'list' ? '' : '<div class="wo-edge" aria-hidden="true"></div>');
      sc.scrollTop = back ? scrollMem[vk] || 0 : 0;
      // come su iPhone: la pagina nuova entra da destra; tornando indietro quella di prima rientra da sinistra
      if (navAnim) {
        root.classList.remove('wo-push', 'wo-pop');
        void root.offsetWidth;
        root.classList.add(navAnim);
        clearTimeout(root._anim);
        root._anim = setTimeout(() => root.classList.remove('wo-push', 'wo-pop'), 320);
      }
      navAnim = 'wo-push';
    } else root.innerHTML = viewHtml(ui.view) + (ui.view === 'list' ? '' : '<div class="wo-edge" aria-hidden="true"></div>');
    const pager = root.querySelector('#wo-pager');
    if (pager) {
      pager.scrollLeft = ui.i * pageStep(pager);
      if (glide) { // tocco su un puntino o su "Prossimo": la pagina scorre fino all'esercizio
        const to = ui.i * pageStep(pager);
        pager.scrollLeft = glide.from * pageStep(pager);
        requestAnimationFrame(() => pager.scrollTo({ left: to, behavior: 'smooth' }));
      }
      pager.addEventListener('scroll', onPagerScroll, { passive: true });
    }
    glide = null;
    saveDraft();
    setupAll();
    setupDrag();
    sheetTouch();
    tickRest();
  }

  const pageStep = (pager) => {
    const a = pager.children[0], b = pager.children[1];
    return b ? b.offsetLeft - a.offsetLeft : pager.clientWidth;
  };
  let glide = null;
  let scrolling = false, scrollTimer = 0;
  /** Durante il trascinamento si aggiornano solo numero e puntini; la pagina non si ridisegna. */
  function onPagerScroll(ev) {
    const pager = ev.currentTarget;
    scrolling = true;
    clearTimeout(scrollTimer);
    const k = Math.max(0, Math.min(ui.list.length - 1, Math.round(pager.scrollLeft / pageStep(pager))));
    if (k !== ui.i) {
      ui.i = k;
      const num = root.querySelector('#wo-num');
      if (num) num.textContent = k + 1;
      root.querySelectorAll('#wo-dots button').forEach((d, j) => d.classList.toggle('cur', j === k));
    }
    scrollTimer = setTimeout(() => { scrolling = false; flush(); }, 160);
  }


  function listView() {
    const p = proposta();
    const timer = `<button class="wo-row" data-a="timer"><span class="wo-dot"></span><span><b>Timer Addominali</b><small>${timerSeconds()} s</small></span><span class="wo-chev">›</span></button>`;
    const other = (schede || []).map((s) => {
      const d = lastDone(s);
      return `<div class="wo-srow"><button class="wo-row" data-a="sch:${esc(s.id)}"><span><b>${esc(s.name)}${diBadge(s)}</b><small>${s.ex.length} ${s.ex.length === 1 ? 'esercizio' : 'esercizi'}${d ? ` · ${ago(d)}` : ''}</small></span></button>`
        + `<button class="wo-star${rot.includes(s.id) ? ' on' : ''}" data-a="rotx:${esc(s.id)}" aria-label="${rot.includes(s.id) ? 'Togli dalla rotazione' : 'Metti in rotazione'}">${rot.includes(s.id) ? '★' : '☆'}</button>`
        + `<button class="wo-pen" data-a="ed:${esc(s.id)}" aria-label="Modifica ${esc(s.name)}"><svg aria-hidden="true"><use href="#i-pencil"/></svg></button></div>`;
    }).join('');
    let hero = '';
    const ri = rotInfo();
    if (ri) hero = ri.list.length > 1 ? rotHtml(ri) : heroHtml(ri.list[0]); // una sola in rotazione: il riquadro di sempre
    else if (p) hero = heroHtml(p);
    const dc = daCopiare();
    const recupera = dc.length ? `<section class="card wo-copy"><b>${dc.length} ${dc.length === 1 ? 'esercizio salvato' : 'esercizi salvati'} ${pfx ? 'fuori dalla prova' : 'in modalità prova'}</b>
      <span class="wo-sub">${esc(dc.map((a) => (EX[a.ex] || { n: a.ex }).n).join(', '))}</span><button class="primary" data-a="copia">Copia qui</button></section>` : '';
    const lib = liberiOggi();
    const salvaLib = lib.length ? `<section class="card wo-copy"><b>Oggi hai fatto ${lib.length} ${lib.length === 1 ? 'esercizio libero' : 'esercizi liberi'}</b>
      <span class="wo-sub">${esc(lib.map((a) => nameOf(a.ex)).join(', '))}</span><button class="secondary" data-a="fromlib">Salva come scheda</button></section>` : '';
    return `${recupera}${salvaLib}${hero}
      <h2 class="section">${ri ? 'Tutte le schede' : 'Le tue schede'}</h2>
      ${other && !rot.length ? '<p class="wo-sub wo-rot-hint">Tocca ☆ per mettere una scheda in rotazione</p>' : ''}
      ${other ? `<section class="card wo-list">${other}</section>` : ''}
      ${ui.rotSheet && ri ? rotSheetHtml(ri) : ''}
      <section class="card wo-list"><button class="wo-row wo-altri" data-a="copy"><span class="wo-altri-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.4 0 4 1.5 4.5 4"/></svg></span>`
        + `<span><b>Schede degli altri</b><small>${esc(altri().names.join(', '))} · ${altri().n} schede</small></span><span class="wo-chev">›</span></button></section>
      <div class="wo-btns"><button class="secondary" data-a="nuova">+ Nuova scheda</button><button class="secondary" data-a="libero">Allenamento libero</button></div>
      <section class="card wo-list">${timer}</section>`;
  }

  /** Bollino con la persona da cui viene una scheda copiata: resta anche se la scheda cambia nome. */
  // Se l'ho modificata, nel bollino resta la persona e compare "modificata".
  const diBadge = (sc) => (sc.di ? `<span class="wo-di${sc.mod ? ' mod' : ''}"><i>${esc(sc.di[0])}</i>${esc(sc.di)}${sc.mod ? '<em>modificata</em>' : ''}</span>` : '');

  /** Riquadro grande della scheda da fare. */
  function heroHtml(p) {
    const n = doneToday(p), d = lastDone(p);
    const all = n === p.ex.length;
    const sub = all ? 'Fatta oggi ✓' : n ? `${n} di ${p.ex.length} esercizi fatti` : `${p.ex.length} esercizi${d ? ` · l'hai fatta ${ago(d)}` : ' · mai fatta'}`;
    return `<section class="wo-hero"><div class="wo-hero-name">${esc(p.name)}${diBadge(p)}</div><div class="wo-sub">${sub}</div><button class="primary" data-a="go:${esc(p.id)}">${all ? 'Rivedi' : n ? 'Continua' : 'Inizia'}</button></section>`;
  }

  // ---------- Rotazione: le schede da fare a turno (stellina) ----------
  const lastAt = (sch) => serie.filter((a) => a.scheda === sch.id).reduce((m, a) => Math.max(m, a.at && a.at.toMillis ? a.at.toMillis() : 0), 0);

  /** Schede in rotazione e quella che tocca: dopo l'ultima fatta del giro (o quella iniziata oggi), poi si ricomincia. */
  function rotInfo() {
    const list = rot.map((id) => (schede || []).find((y) => y.id === id)).filter(Boolean);
    if (!list.length) return null;
    let last = -1, best = 0;
    list.forEach((y, i) => { const t = lastAt(y); if (t > best) { best = t; last = i; } });
    const cur = last < 0 ? 0 : lastDone(list[last]) === today() ? last : (last + 1) % list.length;
    return { list, cur };
  }

  function rotHtml({ list, cur }) {
    const sc = list[cur], n = doneToday(sc), all = n === sc.ex.length;
    const cards = list.map((y, i) => {
      const d = lastDone(y);
      const sub = i === cur ? (all ? 'fatta oggi ✓' : n ? `${n} di ${y.ex.length}` : 'oggi') : i < cur ? (d ? `✓ ${ago(d)}` : 'mai fatta') : 'dopo';
      return `<button class="wo-rc${i === cur ? ' cur' : i < cur ? ' done' : ''}" data-a="sch:${esc(y.id)}">${i === cur ? '<span class="wo-rc-tag">oggi</span>' : ''}<span class="wo-rc-n">${i + 1}</span><b>${esc(y.name)}</b>${diBadge(y)}<small>${sub}</small></button>`;
    }).join('');
    return `<section class="wo-rot"><div class="wo-rot-h"><h2 class="section">In rotazione</h2>${list.length > 1 ? '<button class="wo-rot-ord" data-a="rotord">Cambia ordine</button>' : ''}</div>
      <div class="wo-rot-g" style="--cols:${Math.min(list.length, 4)}">${cards}</div>
      <button class="primary" data-a="go:${esc(sc.id)}">${all ? 'Rivedi' : n ? 'Continua' : 'Inizia'} ${esc(sc.name)}${diBadge(sc)}</button></section>`;
  }

  /** Foglio "Cambia ordine": si trascinano le schede del giro; ★ la toglie. */
  function rotSheetHtml({ list }) {
    const rows = list.map((y, k) => `<div class="wo-ed-row wo-rot-row" data-k="${k}" data-grip="${k}"><span class="wo-grip" aria-label="Trascina per spostare">≡</span>
      <span class="wo-ed-n"><b>${k + 1}. ${esc(y.name)}${diBadge(y)}</b></span><span></span><button class="wo-star on" data-a="rotx:${esc(y.id)}" aria-label="Togli dalla rotazione">★</button></div>`).join('');
    return `<div class="wo-edsheet"><div class="wo-edsheet-dim" data-a="rotclose"></div><div class="wo-edsheet-box"><div class="wo-grab"></div>
      <b class="wo-sh-t">Ordine della rotazione</b><p class="wo-sub">Trascina una scheda per cambiare l'ordine. Dopo l'ultima si ricomincia.</p>
      <section class="wo-ed-list" data-kind="rot">${rows}</section><button class="primary" data-a="rotclose">Fatto</button></div></div>`;
  }

  function ago(d) {
    const n = daysAgo(d);
    return n <= 0 ? 'oggi' : n === 1 ? 'ieri' : `${n} giorni fa`;
  }

  /** Stato di ogni pagina (esercizio): serie in modifica, serie aperta, "Modifica" dopo Fatto. Resta passando da una pagina all'altra. */
  let pages = {};
  const pageOf = (ex) => (pages[ex] ||= { sets: null, open: -1, editing: false });
  const P = () => pageOf(ui.list[ui.i]);

  // Bozza sul telefono: chili e ripetizioni cambiati (e giri del circuito già fatti) si salvano a ogni tocco,
  // anche prima di "Fatto"; chiudendo e riaprendo l'app il giorno stesso si ritrovano, sull'esercizio dov'eri.
  const draftKey = () => `woDraft|${key}`;
  function saveDraft() {
    if (!key) return;
    const keep = {};
    Object.entries(pages).forEach(([ex, pg]) => {
      const circ = pg.circ && pg.circ.cur > 0 ? pg.circ : null;
      if ((pg.dirty && pg.sets) || circ) keep[ex] = { sets: pg.dirty ? pg.sets : null, editing: !!pg.editing, dirty: !!pg.dirty, ...(circ ? { circ } : {}) };
    });
    try {
      if (!Object.keys(keep).length) localStorage.removeItem(draftKey());
      else localStorage.setItem(draftKey(), JSON.stringify({ day: today(), scheda: ui.scheda, list: ui.list, i: ui.i, view: ui.view, pages: keep }));
    } catch (err) {} // senza spazio o in navigazione privata: resta solo in memoria come prima
  }
  function loadDraft() {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem(draftKey()) || 'null');
    } catch (err) {}
    if (!d || d.day !== today() || !d.pages || !Array.isArray(d.list) || !d.list.length) return;
    pages = {};
    Object.entries(d.pages).forEach(([ex, p]) => (pages[ex] = { open: -1, ...p }));
    Object.assign(ui, { scheda: d.scheda || '', list: d.list, i: Math.min(d.i || 0, d.list.length - 1), view: d.view === 'ex' ? 'ex' : ui.view });
  }

  /** Esercizi della scheda come pagine affiancate: si trascinano col dito, come le schermate della Home di iPhone. */
  function exView() {
    const sch = (schede || []).find((s) => s.id === ui.scheda);
    // "ok" anche su quello aperto: scorrendo via, la barretta resta verde se l'esercizio è fatto ("cur" ha la precedenza)
    const dots = ui.list.map((id, k) => `<button class="${k === ui.i ? 'cur' : ''}${isDone(id) ? ' ok' : ''}" data-a="j:${k}" aria-label="${esc(nameOf(id))}"></button>`).join('');
    const title = sch ? `${esc(sch.name)}${diBadge(sch)} · <span id="wo-num">${ui.i + 1}</span>/${ui.list.length}` : 'Allenamento libero';
    const many = ui.list.length > 1;
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${title}</button></div>
      ${many ? `<div class="wo-dots" id="wo-dots">${dots}</div>` : ''}
      <div class="wo-pager${many ? ' multi' : ''}" id="wo-pager">${ui.list.map((_, k) => pageHtml(k, sch)).join('')}</div>
      ${many ? `<div class="wo-bar"><button class="wo-all" id="wo-all"><svg viewBox="0 0 24 24" aria-hidden="true">${[3, 10, 17].map((y) => [3, 10, 17].map((x) => `<rect x="${x}" y="${y}" width="5.5" height="5.5" rx="1.6"/>`).join('')).join('')}</svg>Tutti</button></div>
      <div class="wo-sheet" id="wo-sheet" hidden><div class="wo-sheet-box"><div class="wo-grab"></div><p class="wo-sheet-hint">Tieni premuto "Tutti" e trascina il dito su un esercizio, poi lascia</p>
        <div class="wo-grid">${ui.list.map((id, k) => {
          const c = circIn(sch, id), e = EX[id] || { n: id }, d = isDone(id), pi = sch && sch.piano ? sch.piano[id] : null;
          const sub = c ? (c.lista ? `${c.durata} · ${c.ex.length} esercizi` : `${c.giri} giri · ${c.ex.length} esercizi`) : pi ? pi.s : e.g || '';
          return `<button class="wo-tile${k === ui.i ? ' cur' : ''}${d ? ' ok' : ''}" data-a="j:${k}" data-k="${k}"><span>${d ? '✓' : k + 1}</span><b>${esc(nameOf(id))}</b><small>${esc(sub)}</small></button>`;
        }).join('')}</div></div></div>` : ''}`;
  }

  // ---------- Circuito (es. sit-up, plank e barchetta di fila, per più giri) ----------

  /** Stato del circuito di una pagina: giro in corso, numero di giri, valori di ogni esercizio, giri già fatti. */
  function circState(id, c, sch) {
    const pg = pageOf(id);
    if (!pg.circ) {
      const vals = {}, done = {};
      c.ex.forEach((e) => {
        const l = lastTime(e);
        vals[e] = l ? l.sets[0].reps : primaVolta(sch && sch.piano ? sch.piano[e] : null)[0].reps;
        done[e] = [];
      });
      pg.circ = { cur: 0, giri: c.giri, vals, done };
    }
    return pg.circ;
  }

  /** Lista da spuntare (es. 5 minuti di mobilità): ogni esercizio si segna con un tocco; spuntati tutti si passa avanti. */
  function listaHtml(k, sch, c) {
    const all = c.ex.every((e) => todayDoc(e));
    return `<section class="wo-page" data-k="${k}">
      <div class="wo-ex"><div class="wo-ex-name">${esc(c.n)}</div><span class="wo-pill wo-plan">${esc(c.durata || '')}</span></div>
      <div class="wo-mobs">${c.ex.map((e) => {
        const d = todayDoc(e), pi = sch && sch.piano ? sch.piano[e] : null;
        return `<button class="wo-mob${d ? ' ok' : ''}" data-a="mob:${e}"><span class="wo-mob-ck">${d ? '✓' : ''}</span>${figSvg(e, 'sm')}<span class="wo-mob-n"><b>${esc(nameOf(e))}</b><small>${esc((EX[e] || {}).m || '')}</small></span><span class="wo-mob-r">${esc(pi ? pi.s : '')}</span></button>`;
      }).join('')}</div>
      ${all ? (nextTodo(k) < 0 ? '<button class="primary" data-a="end">Fine scheda</button>' : '') : '<button class="primary" data-a="moball">✓ Fatto tutto</button>'}
      <p class="wo-sub wo-center">Tocca un esercizio per spuntarlo</p>
    </section>`;
  }

  const listReps = (sch, e) => Number(String((sch && sch.piano && sch.piano[e] && sch.piano[e].s) || '1').match(/\d+/)?.[0] || 1);

  function unsave(ex) {
    const { fs, db } = x;
    fs.deleteDoc(fs.doc(db, pfx + 'serie', `${today()}_${fbUid(me.name)}_${ex}`)).catch((err) => toast(`Non annullato: ${err.message}`));
  }

  function circHtml(k, sch) {
    const id = ui.list[k], c = circIn(sch, id);
    if (c.lista) return listaHtml(k, sch, c);
    const st = circState(id, c, sch);
    const head = `<div class="wo-ex"><div class="wo-ex-name">${esc(c.n)}</div><span class="wo-pill wo-plan">${st.giri} giri</span><span class="wo-pill">recupero ${mmss(c.rec)}${c.rec < 60 ? '"' : ''}</span>${c.pausa ? `<span class="wo-pill">pausa ${c.pausa}"</span>` : ''}</div>`;
    if (isDone(id, sch) && !pageOf(id).rifai) {
      const nx = nextTodo(k);
      return `<section class="wo-page" data-k="${k}">${head}
        <section class="card wo-list">${c.ex.map((e) => `<div class="wo-row"><span><b>${esc(nameOf(e))}</b><small>Fatto oggi · ${summary(todayDoc(e).sets, tOf(e))}</small></span><span class="wo-chev">✓</span></div>`).join('')}</section>
        ${nx < 0 ? '<button class="primary" data-a="end">Fine scheda</button>' : ''}<button class="link-button" data-a="crifai">Rifai il circuito</button></section>`;
    }
    const rounds = Array.from({ length: st.giri }, (_, g) => `<i class="${g < st.cur ? 'ok' : g === st.cur ? 'cur' : ''}">${g < st.cur ? '✓' : `Giro ${g + 1}`}</i>`).join('');
    const rows = c.ex.map((e, j) => {
      const t = tOf(e, sch), l = lastTime(e, t), pi = sch && sch.piano ? sch.piano[e] : null;
      const info = [pi && pi.s, l && `ultima volta ${summary(l.sets, t)}`].filter(Boolean).join(' · ');
      return `<div class="wo-cex"><span class="wo-cn">${j + 1}</span>${figSvg(e, 'sm')}<div class="wo-cname"><b>${esc(nameOf(e))}</b><small>${esc(info)}</small></div>
        <span class="wo-pm"><button data-a="cv-:${e}" aria-label="Meno">−</button><label class="wo-in"><input data-f="c:${e}" inputmode="numeric" value="${st.vals[e]}" aria-label="${esc(nameOf(e))}, tocca per scrivere" onfocus="this.select()" autocomplete="off"><em>${uShort(t)}</em></label><button data-a="cv+:${e}" aria-label="Più">+</button></span></div>`;
    }).join('');
    return `<section class="wo-page" data-k="${k}">${head}
      <div class="wo-rounds"><button data-a="cg-" aria-label="Un giro in meno">−</button>${rounds}<button data-a="cg+" aria-label="Un giro in più">+</button></div>
      <div class="wo-cexs">${rows}</div>
      <button class="primary" data-a="cgiro">✓ Giro ${st.cur + 1} fatto</button>
      <button class="secondary wo-crun" data-a="crun">▶ Avvia circuito guidato</button>
      ${st.cur ? `<button class="link-button" data-a="csave">Salva con ${st.cur} ${st.cur === 1 ? 'giro' : 'giri'}</button>` : ''}
      <p class="wo-sub wo-center">Ogni esercizio salva un giro come una serie</p>
    </section>`;
  }

  /** Un giro finito: i valori attuali di ogni esercizio diventano la sua serie di quel giro. */
  function circRound(id) {
    const c = circIn(curSch(), id), st = pageOf(id).circ;
    if (!c || !st) return;
    c.ex.forEach((e) => st.done[e].push(st.vals[e]));
    st.cur++;
  }

  /** Salva i giri fatti (una serie per giro) e passa al prossimo esercizio della scheda. */
  function circSave(id) {
    const c = circIn(curSch(), id), st = pageOf(id).circ;
    if (!c || !st || !st.cur) return;
    c.ex.forEach((e) => save(e, st.done[e].map((v) => ({ kg: 0, reps: v }))));
    pageOf(id).circ = null;
    pageOf(id).rifai = false;
    const k = ui.list.indexOf(id), nx = nextTodo(k);
    if (nx >= 0 && nx !== k) openEx(nx, k);
  }

  // Circuito guidato a tutto schermo: sit-up (li conti tu e tocchi), plank e barchetta col 3-2-1 e il timer grande,
  // recupero azzurro tra un giro e l'altro; alla fine salva tutto.
  const run = document.createElement('div');
  run.className = 'wo-run';
  run.hidden = true;
  document.body.append(run);
  let runId = '', runPlan = [], runAt = 0, runRaf = 0;

  function circRun(id) {
    const c = circIn(curSch(), id), st = pageOf(id).circ;
    if (!c || !st) return;
    // Riparte sempre dal primo giro, anche se qualche giro era già segnato
    st.cur = 0;
    c.ex.forEach((e) => (st.done[e] = []));
    runId = id;
    runPlan = [];
    for (let g = 0; g < st.giri; g++) {
      c.ex.forEach((e, j) => {
        runPlan.push({ e, g, last: j === c.ex.length - 1 });
        if (c.pausa && j < c.ex.length - 1) runPlan.push({ rest: true, pausa: true, g, poi: c.ex[j + 1] });
      });
      if (g < st.giri - 1) runPlan.push({ rest: true, g });
    }
    runAt = 0;
    run.hidden = false;
    runRender();
  }

  // I passaggi sono pagine affiancate con lo scorrimento nativo (come gli esercizi della scheda): si trascinano col dito;
  // "fatto", "tocca per saltare" e la fine di un timer scorrono alla pagina dopo. L'ultima pagina chiude il circuito.
  const runPager = () => run.querySelector('.wo-run-pager');

  /** Contenuto di una pagina a riposo: sit-up da toccare, "Inizia" per gli esercizi a tempo, recupero pronto a partire. */
  function runPageInner(j) {
    const c = circIn(curSch(), runId), st = pageOf(runId).circ;
    if (j >= runPlan.length) return `<div class="wo-run-done">✓</div><div class="wo-big-head"><b>Fine circuito</b><small>lascia qui per salvare</small></div>`;
    const s = runPlan[j];
    if (s.rest) return `<div class="wo-big-head wo-rest-head"><b>${restName(s)}</b><small>${restNext(s)}</small></div>
      <button class="timer-running wo-run-rest" data-r="next"><span>${mmss(s.pausa ? c.pausa : c.rec)}</span><small>tocca per saltare</small></button>`;
    if (tOf(s.e) !== 'sec') return `<div class="wo-big-head"><b>${esc(nameOf(s.e))}</b><small>contale tu, poi tocca</small></div>${figSvg(s.e, 'run')}
      <button class="wo-run-reps" data-r="next">${st.vals[s.e]}<small>ripetizioni · fatto ✓</small></button>`;
    const total = st.vals[s.e];
    return `<div class="wo-big-head"><b>${esc(nameOf(s.e))}</b><small>${mmss(total)}${total < 60 ? '"' : ''}</small></div>${figSvg(s.e, 'run')}
      <button class="timer-start" data-r="start">Inizia</button>`;
  }

  const restName = (s) => (s.pausa ? 'Pausa' : 'Recupero');
  const restNext = (s) => (s.pausa ? `poi ${esc(nameOf(s.poi))}` : `poi giro ${s.g + 2}`);

  function runTop() {
    const st = pageOf(runId).circ, s = runPlan[Math.min(runAt, runPlan.length - 1)];
    return `<div class="wo-run-steps">${runPlan.map((x, j) => `<i class="${x.rest ? 'rest ' : ''}${j < runAt ? 'ok' : j === runAt ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="wo-run-giro">${runAt >= runPlan.length ? 'Fine' : `Giro ${s.g + 1} di ${st.giri}`}</div>`;
  }

  function runRender() {
    cancelAnimationFrame(runRaf);
    run.classList.remove('rest');
    run.innerHTML = `<div class="wo-run-top">${runTop()}</div>
      <div class="wo-run-pager">${[...runPlan, null].map((_, j) => `<section class="wo-run-page" data-j="${j}">${runPageInner(j)}</section>`).join('')}</div>
      <p class="wo-run-hint">‹ scorri per il passaggio prima o dopo ›</p><button class="wo-run-stop" data-r="stop">Interrompi circuito</button>`;
    const pager = runPager();
    pager.scrollLeft = runAt * pager.clientWidth;
    pager.addEventListener('scroll', () => {
      clearTimeout(pager._t);
      pager._t = setTimeout(() => runSettle(Math.round(pager.scrollLeft / pager.clientWidth)), 110);
    }, { passive: true });
    runActivate();
  }

  /** La pagina k è arrivata al centro: i giri si chiudono (o si riaprono tornando indietro) e parte quello che serve. */
  function runSettle(k) {
    k = Math.max(0, Math.min(runPlan.length, k));
    if (k === runAt) return;
    cancelAnimationFrame(runRaf);
    const c = circIn(curSch(), runId), st = pageOf(runId).circ;
    while (runAt < k) {
      if (runPlan[runAt].last) circRound(runId);
      runAt++;
    }
    while (runAt > k) {
      runAt--;
      if (runPlan[runAt].last && st.cur > 0) {
        c.ex.forEach((e) => st.done[e].pop());
        st.cur--;
      }
    }
    if (runAt >= runPlan.length) return runFinish(c);
    runPlan.forEach((x) => (x.started = false));
    run.querySelectorAll('.wo-run-page').forEach((pg) => (pg.innerHTML = runPageInner(Number(pg.dataset.j))));
    run.querySelector('.wo-run-top').innerHTML = runTop();
    runActivate();
  }

  /** Va alla pagina dopo con lo stesso scorrimento del dito. */
  function runGoNext() {
    const pager = runPager();
    if (pager) pager.scrollTo({ left: (runAt + 1) * pager.clientWidth, behavior: 'smooth' });
  }

  /** Il recupero parte da solo; gli esercizi a tempo dopo "Inizia" (3-2-1); i sit-up aspettano il tocco. */
  function runActivate() {
    const s = runPlan[runAt];
    if (!s || !(s.rest || s.started)) return;
    const c = circIn(curSch(), runId), st = pageOf(runId).circ;
    const page = run.querySelector(`.wo-run-page[data-j="${runAt}"]`);
    const total = s.rest ? (s.pausa ? c.pausa : c.rec) : st.vals[s.e];
    run.classList.toggle('rest', !!s.rest);
    page.innerHTML = `<div class="wo-big-head${s.rest ? ' wo-rest-head' : ''}"><b>${s.rest ? restName(s) : esc(nameOf(s.e))}</b><small>${s.rest ? restNext(s) : ''}</small></div>
      <button class="timer-running${s.rest ? ' wo-run-rest' : ''}" data-r="next"><span></span><small>tocca per saltare</small></button>`;
    const d = page.querySelector('.timer-running'), n = d.querySelector('span');
    const go = Date.now() + (s.rest ? 0 : COUNTDOWN), end = go + total * 1000;
    const tick = () => {
      const now = Date.now(), counting = now < go;
      d.classList.toggle('counting', counting);
      if (counting) {
        popCount(n, String(Math.ceil((go - now) / 1000)));
        d.style.setProperty('--p', '0');
      } else {
        if (now >= end) {
          if (navigator.vibrate) navigator.vibrate(200);
          return runGoNext();
        }
        n.textContent = mmss(Math.ceil((end - now) / 1000));
        d.style.setProperty('--p', String(1 - (end - now) / (total * 1000)));
      }
      runRaf = requestAnimationFrame(tick);
    };
    runRaf = requestAnimationFrame(tick);
  }

  function runFinish(c) {
    const st = pageOf(runId).circ;
    run.classList.remove('rest');
    run.innerHTML = `<div class="wo-run-done">✓</div><div class="wo-big-head"><b>Circuito fatto</b></div>
      <div class="wo-run-sum">${c.ex.map((e) => `<div>${esc(nameOf(e))}<span>${summary(st.done[e].map((v) => ({ kg: 0, reps: v })), tOf(e))}</span></div>`).join('')}</div>
      <button class="primary" data-r="close">Fine · salvato</button>`;
    circSave(runId);
  }

  run.addEventListener('click', (ev) => {
    const r = ev.target.closest('[data-r]')?.dataset.r;
    if (r === 'next') runGoNext();
    if (r === 'start' && runPlan[runAt]) {
      runPlan[runAt].started = true;
      runActivate();
    }
    if (r === 'stop' || r === 'close') {
      cancelAnimationFrame(runRaf);
      run.hidden = true;
      draw();
    }
  });

  /** "▦ Tutti": tenendo premuto si apre la griglia, il dito scorre sulle tessere e lasciando si apre quella; con un tocco resta aperta. */
  function setupAll() {
    const btn = root.querySelector('#wo-all'), sheet = root.querySelector('#wo-sheet');
    if (!btn || !sheet) return;
    let t0 = 0, over = -1;
    const under = (x, y) => {
      const t = document.elementFromPoint(x, y)?.closest('.wo-tile');
      return t && sheet.contains(t) ? Number(t.dataset.k) : -1;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      t0 = Date.now();
      over = -1;
      btn.setPointerCapture(e.pointerId);
      sheet.hidden = false;
    });
    btn.addEventListener('pointermove', (e) => {
      if (!btn.hasPointerCapture(e.pointerId)) return;
      const k = under(e.clientX, e.clientY);
      if (k === over) return;
      over = k;
      sheet.querySelectorAll('.wo-tile').forEach((t) => t.classList.toggle('hl', Number(t.dataset.k) === over));
      if (over >= 0 && navigator.vibrate) navigator.vibrate(8);
    });
    btn.addEventListener('pointerup', () => {
      if (over >= 0) {
        openEx(over); // dalla griglia si salta direttamente, senza far scorrere le pagine
        draw();
      } else if (Date.now() - t0 > 400) sheet.hidden = true; // tenuto premuto ma lasciato fuori dalle tessere
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.stopPropagation()); // l'apertura la fa già pointerdown
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.hidden = true; });
  }

  function pageHtml(k, sch) {
    if (circIn(sch, ui.list[k])) return circHtml(k, sch);
    const ex = ui.list[k], e = EX[ex] || { n: ex, m: '' };
    const pg = pageOf(ex);
    const piano = sch && sch.piano ? sch.piano[ex] : null;
    const t = tOf(ex, sch);
    const done = todayDoc(ex);
    const saved = !!done && !pg.editing;
    if (!pg.sets) pg.sets = copy(done ? done.sets : (lastTime(ex) || { sets: primaVolta(piano) }).sets);
    const sets = saved ? done.sets : pg.sets;
    const last = lastTime(ex);
    const ref = last ? last.sets : null;
    const ago = last ? agoText(last.day) : '';
    const rows = sets.map((s, j) => {
      // accanto a ogni numero quello della stessa serie la volta scorsa; più alto verde, più basso arancione
      const r = ref && ref[j];
      const tone = (a, b) => (saved || !r || a === b ? '' : a > b ? ' up' : ' down');
      const was = (v) => (ref ? `<span class="wo-was">${PREV_ICON}${r ? v : '–'}</span>` : '');
      const kgCell = t === 'kg' ? `<span class="c"><span class="v${tone(s.kg, r && r.kg)}">${kgf(s.kg)}<small>kg</small></span>${was(r && kgf(r.kg))}</span>` : '<span></span>';
      const row = `<button class="wo-set${saved ? ' done' : ''}${pg.open === j ? ' open' : ''}" data-a="o:${j}"><span class="n">${j + 1}</span>${kgCell}<span class="c"><span class="v${tone(s.reps, r && r.reps)}">${s.reps}<small>${uShort(t)}</small></span>${was(r && r.reps)}</span><span class="n">${saved ? (done.pending ? '…' : '✓') : '›'}</span></button>`;
      if (pg.open !== j || saved) return row;
      const field = (kind, value, u, aria) => `<span class="wo-pm">
          <button data-a="${kind}-:${j}" aria-label="Meno ${aria}">−</button>
          <label class="wo-in"><input data-f="${kind}" inputmode="${kind === 'k' ? 'decimal' : 'numeric'}" value="${value}" aria-label="${aria}, tocca per scrivere" onfocus="this.select()" autocomplete="off"><em>${u}</em></label>
          <button data-a="${kind}+:${j}" aria-label="Più ${aria}">+</button></span>`;
      const kgEdit = t === 'kg' ? field('k', kgf(s.kg), 'kg', 'chili') : '';
      const repEdit = field('r', s.reps, uShort(t), uLong(t));
      const prevTxt = !ref ? '' : !r ? 'Serie nuova: la volta scorsa non c\'era'
        : (t !== 'kg' || s.kg === r.kg) && s.reps === r.reps ? 'Come la volta scorsa'
        : `${ago[0].toUpperCase() + ago.slice(1)}: ${t === 'kg' ? `${kgf(r.kg)} kg × ${r.reps}` : `${r.reps} ${uShort(t)}`}`;
      return `${row}<div class="wo-edit"><div class="wo-pms">${kgEdit}${repEdit}</div>${prevTxt ? `<p class="wo-hint wo-hint-prev">${PREV_ICON}${prevTxt}</p>` : ''}<p class="wo-hint">Tocca il numero per scriverlo a mano</p></div>`;
    }).join('');
    const nx = nextTodo(k);
    const btn = saved
      ? `${nx < 0 ? `<button class="primary" data-a="end">${ui.list.length > 1 ? 'Fine scheda' : 'Fine'}</button>` : ''}
         <button class="link-button" data-a="edit">Modifica</button>${done.pending ? '<p class="wo-sub wo-center">Salvato sul telefono: parte appena c\'è rete</p>' : ''}`
      : `<div class="wo-btns"><button class="secondary" data-a="add">+ Serie</button><button class="secondary" data-a="del">− Serie</button></div><button class="primary" data-a="ok">✓ Fatto</button>`;
    return `<section class="wo-page" data-k="${k}">
      <div class="wo-ex"><div class="wo-ex-name">${esc(e.n)}</div>${e.m ? `<span class="wo-pill">${esc(e.m)}</span>` : ''}${piano ? `<span class="wo-pill wo-plan">${esc(piano.s)}</span>` : ''}${piano && piano.nota ? `<span class="wo-pill">${esc(piano.nota)}</span>` : ''}</div>
      ${figSvg(ex, 'card')}
      ${last ? `<p class="wo-last">${PREV_ICON}La volta scorsa, ${ago}</p>` : ''}
      ${t === 'sec' && !saved ? `<div class="wo-tmr" data-ex="${ex}">${tmrHtml(ex, sets)}</div>` : ''}
      <div class="wo-sets">${rows}</div>
      ${btn}
      <div class="wo-rest" data-ex="${ex}">${restHtml(ex)}</div>
    </section>`;
  }

  /** Il primo esercizio non ancora fatto oggi dopo quello aperto (poi si ricomincia dall'inizio), -1 se fatti tutti. */
  function nextTodo(from = ui.i) {
    for (let d = 1; d < ui.list.length; d++) {
      const k = (from + d) % ui.list.length;
      if (!isDone(ui.list[k])) return k;
    }
    return -1;
  }

  // ---------- Timer (recupero ed esercizi a tempo): uguali al timer grande ----------
  // Stesso anello (verde che cresce col tempo passato), aggiornato a ogni fotogramma; gli esercizi a tempo partono
  // dopo 3 secondi di conto alla rovescia; alla fine lo schermo pulsa come il timer addominali finché non lo tocchi.
  const COUNTDOWN = 3000;
  let tmr = { ex: '', j: 0, go: 0, end: 0, total: 0 };
  let raf = 0;
  const tmrSets = (ex) => pageOf(ex).sets || [];
  const dial = (p, inner = '') => `<span class="wo-dial" style="--p:${p}">${inner}</span>`;
  const mmss = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s));

  /** Recupero dell'esercizio: quello scelto da me con − +, altrimenti quello del piano della scheda (rec), altrimenti 1:30. */
  const restOf = (ex) => {
    const sch = curSch(), pi = sch && sch.piano ? sch.piano[ex] : null;
    return recMap[ex] || (pi && pi.rec) || REST;
  };
  function restHtml(ex) {
    if (!restEnd) {
      return `${dial(1)}<b>Recupero</b><span class="wo-recpm"><button class="wo-recb" data-a="rec-:${ex}" aria-label="15 secondi in meno">−</button>`
        + `<button class="wo-chip" data-a="rest">${mmss(restOf(ex))} ▸</button><button class="wo-recb" data-a="rec+:${ex}" aria-label="15 secondi in più">+</button></span>`;
    }
    return `${dial(0)}<span><small>Recupero</small><b class="wo-rest-left">${mmss(restTotal)}</b></span><button class="wo-chip" data-a="stop">Stop</button>`;
  }

  function tmrHtml(ex, sets) {
    const j = tmr.ex === ex ? Math.min(tmr.j, sets.length - 1) : 0;
    if (tmr.ex === ex && tmr.end) {
      return `${dial(0, '<b class="wo-dial-n"></b>')}<div class="wo-tmr-txt"><small>Serie ${j + 1} di ${sets.length}</small><span>tocca Stop per annullare</span></div><button class="wo-chip" data-a="tstop">Stop</button>`;
    }
    const s = sets[j] || sets[0];
    return `<button class="wo-tmr-go" data-a="tgo:${j}"><span>▶</span>${sets.length > 1 ? `Serie ${j + 1} · ` : ''}${s ? s.reps : 0}"</button>`;
  }

  // Timer grande a tutto schermo: compare appena parte un timer (lo stesso anello del timer addominali); un tocco lo annulla
  const big = document.createElement('div');
  big.className = 'wo-big';
  big.hidden = true;
  big.innerHTML = '<div class="wo-big-head"><b></b><small></small></div><button class="timer-running" type="button"><span>0</span><small>tocca per annullare</small></button>';
  document.body.append(big);
  big.querySelector('button').addEventListener('click', () => {
    restEnd = 0;
    tmr.end = 0;
    tickRest();
  });

  /** Ridisegna i riquadri dei timer (all'avvio, allo stop, alla fine); il conto lo aggiorna frame(). */
  function tickRest() {
    big.hidden = !tmr.end; // a tutto schermo solo gli esercizi a tempo: il recupero resta nella sua barra
    if (!big.hidden) {
      const e = EX[tmr.ex] || {};
      big.querySelector('.wo-big-head b').textContent = tmr.end ? e.n || '' : 'Recupero';
      big.querySelector('.wo-big-head small').textContent = tmr.end ? `Serie ${tmr.j + 1} di ${tmrSets(tmr.ex).length}` : '';
      big.classList.toggle('rest', !tmr.end); // il recupero è azzurro
    }
    root.querySelectorAll('.wo-rest').forEach((el) => {
      el.innerHTML = restHtml(el.dataset.ex);
      el.classList.toggle('on', !!restEnd);
    });
    root.querySelectorAll('.wo-tmr').forEach((el) => {
      el.innerHTML = tmrHtml(el.dataset.ex, tmrSets(el.dataset.ex));
      el.classList.toggle('on', tmr.ex === el.dataset.ex && !!tmr.end);
    });
    cancelAnimationFrame(raf);
    if (restEnd || tmr.end) raf = requestAnimationFrame(frame);
  }

  function frame() {
    const now = Date.now();
    const bd = big.querySelector('button'), bn = bd.querySelector('span');
    if (restEnd && !tmr.end) {
      const left = Math.max(0, restEnd - now);
      bd.classList.remove('counting');
      bd.style.setProperty('--p', String(1 - left / (restTotal * 1000)));
      bn.textContent = mmss(Math.ceil(left / 1000));
    }
    if (tmr.end) {
      const counting = now < tmr.go, left = Math.max(0, counting ? tmr.go - now : tmr.end - now);
      bd.classList.toggle('counting', counting);
      bd.style.setProperty('--p', counting ? '0' : String(1 - left / (tmr.total * 1000)));
      if (counting) popCount(bn, mmss(Math.ceil(left / 1000)));
      else bn.textContent = mmss(Math.ceil(left / 1000));
    }
    if (restEnd) {
      if (now >= restEnd) return finish('rest');
      const left = restEnd - now;
      root.querySelectorAll('.wo-rest .wo-dial').forEach((d) => d.style.setProperty('--p', String(1 - left / (restTotal * 1000))));
      root.querySelectorAll('.wo-rest-left').forEach((b) => (b.textContent = mmss(Math.ceil(left / 1000))));
    }
    if (tmr.end) {
      if (now >= tmr.end) return finish('tmr');
      const counting = now < tmr.go;
      const left = counting ? tmr.go - now : tmr.end - now;
      root.querySelectorAll(`.wo-tmr[data-ex="${tmr.ex}"] .wo-dial`).forEach((d) => {
        d.classList.toggle('counting', counting);
        d.style.setProperty('--p', counting ? '0' : String(1 - left / (tmr.total * 1000)));
        const n = d.querySelector('.wo-dial-n');
        if (n && counting) popCount(n, mmss(Math.ceil(left / 1000)));
        else if (n) n.textContent = mmss(Math.ceil(left / 1000));
      });
    }
    raf = requestAnimationFrame(frame);
  }

  function finish(which) {
    if (which === 'rest') restEnd = 0;
    else {
      tmr.end = 0;
      tmr.j = Math.min(tmr.j + 1, Math.max(0, tmrSets(tmr.ex).length - 1)); // pronta la serie dopo
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    const alarm = document.getElementById('timer-alarm'); // lo stesso lampeggio del timer addominali
    if (alarm) alarm.hidden = false;
    tickRest();
  }

  // Tornando nell'app dopo la fine di un timer: il lampeggio parte subito
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (restEnd || tmr.end)) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  });

  const MUSCOLI = ['Petto', 'Schiena', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe', 'Glutei', 'Polpacci', 'Addominali']; // col disegno del corpo
  const FAMIGLIE = ['Corpo libero', 'Macchine e cavi', 'Bilancieri, manubri e kettlebell', 'Cardio'];
  /** Famiglia di attrezzi di un esercizio (il vogatore resta con le macchine: Cardio è l'attrezzo "Cardio"). */
  function famOf(e) {
    const m = (e.m || '').toLowerCase();
    if (m === 'cardio') return 'Cardio';
    if (!m || ['corpo libero', 'tappetino', 'bastone', 'sbarra', 'rialzo'].includes(m)) return 'Corpo libero';
    if (/^(manubri|kettlebell|bilanciere)/.test(m)) return 'Bilancieri, manubri e kettlebell';
    return 'Macchine e cavi';
  }
  const alpha = (a, b) => a.n.localeCompare(b.n, 'it');

  /** Scelta degli esercizi: prima pagina con muscoli e attrezzi, poi l'elenco in ordine alfabetico; la ricerca guarda
   *  nome, muscolo e attrezzo. Con la spunta (multi) si scelgono più esercizi per una scheda o un circuito. */
  function pickBody(multi, had = []) {
    const cat = CATALOGO.filter((e) => !e.old); // old: tolti dal catalogo, restano solo per i nomi delle serie già fatte
    const q = ui.q.trim().toLowerCase();
    const row = (e) => {
      if (!multi) {
        const l = lastTime(e.id, unit(e));
        return `<button class="wo-row" data-a="pick:${e.id}"><span><b>${esc(e.n)}</b><small>${esc(e.m || e.g)}${l ? ` · ${summary(l.sets, unit(e))}` : ''}</small></span><span class="wo-chev">›</span></button>`;
      }
      const h = had.includes(e.id), on = ui.sel.includes(e.id);
      return `<button class="wo-row wo-prow" data-a="${h ? '' : `psel:${e.id}`}"${h ? ' aria-disabled="true"' : ''}><span class="wo-chk${on ? ' on' : ''}${h ? ' had' : ''}">${on || h ? '✓' : ''}</span><span><b>${esc(e.n)}</b><small>${h ? 'già nella scheda' : esc(e.m || e.g)}</small></span></button>`;
    };
    const newRow = multi ? `<button class="wo-row wo-prow" data-a="newex"><span class="wo-chk add"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></span><span><b>Nuovo esercizio</b><small>se non è nell'elenco</small></span></button>` : '';
    const listHtml = (arr, letters = false) => {
      let prev = '';
      const rows = arr.map((e) => {
        const l = e.n[0].toUpperCase(), head = letters && l !== prev ? `<div class="wo-letter">${esc(l)}</div>` : '';
        prev = l;
        return head + row(e);
      }).join('');
      return `<section class="card wo-list">${newRow}${rows || (multi ? '' : '<p class="wo-empty">Nessun esercizio</p>')}</section>`;
    };
    const search = `<input id="wo-q" class="plain wo-search" placeholder="Cerca per nome, muscolo o attrezzo" value="${esc(ui.q)}" autocomplete="off">`;
    if (q) {
      const hit = cat.filter((e) => [e.n, e.g, e.m, famOf(e)].some((v) => (v || '').toLowerCase().includes(q))).sort(alpha);
      return `${search}<div class="wo-pk-sec">${hit.length} ${hit.length === 1 ? 'esercizio' : 'esercizi'}</div>${listHtml(hit)}`;
    }
    const kind = ui.pg[0] || '', val = ui.pg.slice(2);
    if (kind) {
      const inPg = cat.filter((e) => kind === 'a' || (kind === 'm' ? e.g === val : famOf(e) === val)).sort(alpha);
      const by = (e) => (kind === 'm' ? famOf(e) : e.g);
      const chipsOf = kind === 'a' ? [] : [...new Set(inPg.map(by))].sort((x, y) => (kind === 'm' ? FAMIGLIE.indexOf(x) - FAMIGLIE.indexOf(y) : GRUPPI.indexOf(x) - GRUPPI.indexOf(y)));
      const list = ui.pf ? inPg.filter((e) => by(e) === ui.pf) : inPg;
      const pic = kind === 'm' && MUSCOLI.includes(val) ? bodySvg(val, { both: true, cls: 'big' }) : ICONE[val] ? `<span class="wo-fico big">${ICONE[val]}</span>` : '';
      const head = `<div class="wo-pkh">${pic}<b>${kind === 'a' ? 'Tutti gli esercizi' : esc(val)}</b></div>`;
      const chips = chipsOf.length > 1 ? `<div class="wo-groups"><button class="${ui.pf ? '' : 'on'}" data-a="pf:">Tutti</button>${chipsOf.map((c) => `<button class="${ui.pf === c ? 'on' : ''}" data-a="pf:${esc(c)}">${esc(c)}</button>`).join('')}</div>` : '';
      return head + chips + listHtml(list, kind === 'a');
    }
    // prima pagina: recenti, muscoli, attrezzi
    const rec = [];
    serie.slice().sort((a, b) => (a.day < b.day ? 1 : -1)).forEach((x2) => { const id = UNITI[x2.ex] || x2.ex; if (EX[id] && !EX[id].old && !rec.includes(id)) rec.push(id); });
    (schede || []).filter((y) => !y.di).forEach((y) => y.ex.concat(...Object.values(y.circuiti || {}).map((c) => c.ex)).forEach((id) => { if (EX[id] && !EX[id].old && !rec.includes(id)) rec.push(id); }));
    const recIds = rec.filter((id) => !had.includes(id)).slice(0, 10);
    const recHtml = recIds.length ? `<div class="wo-pk-sec">Nelle tue schede e di recente</div><div class="wo-recs">${recIds.map((id) => `<button class="${ui.sel.includes(id) ? 'on' : ''}" data-a="${multi ? 'psel' : 'pick'}:${id}">${esc(EX[id].n)}</button>`).join('')}</div>` : '';
    const n = (f) => cat.filter(f).length;
    const tile = (pg, pic, name, small) => `<button class="wo-mt" data-a="pg:${esc(pg)}">${pic}<b>${esc(name)}</b><small>${small}</small></button>`;
    const mus = [...MUSCOLI.map((g) => tile('m:' + g, bodySvg(g, { crop: true }), g, n((e) => e.g === g))),
      ...['Mobilità', 'Cardio'].map((g) => tile('m:' + g, `<span class="wo-fico">${ICONE[g]}</span>`, g, n((e) => e.g === g))),
      tile('a', '', 'Tutti', `${cat.length} A-Z`)].join('');
    const fams = FAMIGLIE.map((f) => `<button class="wo-ft" data-a="pg:f:${esc(f)}"><span class="wo-fico">${ICONE[f]}</span><b>${esc(f)}</b></button>`).join('');
    return `${search}${recHtml}<div class="wo-pk-sec">Per muscolo</div><div class="wo-mus">${mus}</div>
      <div class="wo-pk-sec">Per attrezzo</div><div class="wo-fams">${fams}</div>
      ${multi ? `<section class="card wo-list wo-pk-new">${newRow}</section>` : ''}`;
  }

  function pickView() {
    if (ui.pickFor) return pickMultiView();
    const back = ui.pg && !ui.q.trim() ? 'Esercizi' : 'Allenamento libero';
    return `<button class="wo-back" data-a="back">‹ ${back}</button>${pickBody(false)}
      <p class="footnote">Manca un esercizio? Aggiungilo da una scheda: ✎ → + Esercizi → Nuovo esercizio.</p>`;
  }

  // ---------- Schede: crea, modifica, copia (fase 2) ----------
  // Tutto nel mio documento schede/<uid>: { list, extra (macchine nuove), rec (recuperi) }. La prima volta che si salva
  // ci finiscono anche le schede di esempio scritte qui sopra; da lì in poi contano solo quelle del documento.

  /** Salva schede, macchine nuove e recuperi nel mio documento. */
  function writeDoc(list = schede) {
    const { fs, db } = x;
    schede = list;
    if (!hasDoc) aggDone = AGGIORNAMENTI.map((a) => a.id); // le schede di esempio li contengono già
    hasDoc = true;
    const data = JSON.parse(JSON.stringify({ name: me.name, list, extra, rec: recMap, agg: aggDone, rot })); // via i campi undefined
    fs.setDoc(fs.doc(db, pfx + 'schede', fbUid(me.name)), { ...data, at: fs.serverTimestamp() })
      .catch((err) => toast(`Schede non salvate: ${err.message}`));
  }

  const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  /** "3 × 8-10" → { n: 3, r: '8-10' }; senza "×" una serie sola (come "10 per gamba"). */
  const splitPlan = (s) => {
    const m = String(s || '').match(/^(\d+)\s*×\s*(.+)$/);
    return m ? { n: Number(m[1]), r: m[2].trim() } : { n: s ? 1 : 3, r: s || '' };
  };
  const joinPlan = (n, r) => (!r ? '' : n > 1 ? `${n} × ${r}` : r);
  const liberiOggi = () => serie.filter((a) => a.day === today() && !a.scheda)
    .sort((a, b) => ((a.at && a.at.toMillis ? a.at.toMillis() : 0) - (b.at && b.at.toMillis ? b.at.toMillis() : 0)));

  function openEditor(sc, isNew) {
    ui.ed = { id: sc.id || newId('s'), name: sc.name || '', ex: (sc.ex || []).slice(), piano: clone(sc.piano || {}), circuiti: clone(sc.circuiti || {}), di: sc.di || '', mod: !!sc.mod, isNew };
    Object.assign(ui, { sheet: null, pickFor: '', sel: [], view: 'edit' });
  }

  const edCirc = (id) => (id[0] === '@' ? ui.ed.circuiti[id.slice(1)] : null);
  function planPill(id) {
    const c = edCirc(id);
    if (c) return c.lista ? c.durata || 'lista' : `${c.giri} giri`;
    const pi = ui.ed.piano[id];
    return pi && pi.s ? pi.s : 'Imposta';
  }

  function editView() {
    const ed = ui.ed;
    const rows = ed.ex.map((id, k) => {
      const c = edCirc(id), pill = planPill(id);
      const sub = c ? `${c.lista ? 'da spuntare' : 'circuito'} · ${c.ex.length} esercizi` : esc((EX[id] || {}).m || '');
      return `<div class="wo-ed-row${c ? ' circ' : ''}" data-k="${k}" data-a="edplan:${k}"><span class="wo-grip" aria-label="Tieni premuto per spostare">≡</span>
        <span class="wo-ed-n"><b>${esc(c ? c.n : (EX[id] || { n: id }).n)}</b><small>${sub}</small></span>
        <button class="wo-ed-plan${pill === 'Imposta' ? ' empty' : ''}" data-a="edplan:${k}">${esc(pill)}</button>
        <button class="wo-ed-x" data-a="edrm:${k}" aria-label="Togli">×</button></div>`;
    }).join('');
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ Annulla</button></div>
      <h2 class="wo-ed-title">${ed.isNew ? 'Nuova scheda' : 'Modifica la scheda'}${diBadge(ed)}</h2>
      <label class="wo-lbl" for="wo-ed-name">Nome</label>
      <input id="wo-ed-name" class="plain wo-ed-name" value="${esc(ed.name)}" placeholder="Per esempio Scheda B" maxlength="40" autocomplete="off">
      <div class="wo-lbl">Esercizi${ed.ex.length > 1 ? ' · tieni premuto per spostarli' : ''}</div>
      ${rows ? `<section class="wo-ed-list">${rows}</section>` : '<p class="wo-empty">Ancora nessun esercizio</p>'}
      <div class="wo-btns"><button class="secondary" data-a="edadd">+ Esercizi</button><button class="secondary" data-a="edcirc">+ Blocco</button></div>
      <button class="primary" data-a="edsave">Salva</button>
      ${ed.isNew ? '' : '<button class="link-button wo-danger" data-a="eddel">Elimina scheda</button>'}
      ${ui.sheet ? sheetHtml() : ''}`;
  }

  // scelte rapide per serie × ripetizioni, secondo come si segna l'esercizio
  const REPS = { kg: ['6-8', '8-10', '10-12', '12'], rip: ['6-8', '8-10', '10-12', '15'], sec: ['20"', '30"', '45"', '60"'], m: ["5'", "10'", '1000', '2000'] };

  /** Foglio dal basso: serie e ripetizioni di un esercizio, oppure giri, recupero ed esercizi di un circuito. */
  function sheetHtml() {
    const sh = ui.sheet, ed = ui.ed;
    let body;
    if (sh.kind === 'newblock') {
      body = `<b class="wo-sh-t">Nuovo blocco</b><p class="wo-sub">Scegli il tipo, poi gli esercizi.</p>
        <div class="wo-kinds2"><button class="${sh.lista ? '' : 'on'}" data-a="nbk:circ"><b>Circuito</b>Esercizi di fila, ripetuti per più giri, con recupero</button>
        <button class="${sh.lista ? 'on' : ''}" data-a="nbk:lista"><b>Lista da spuntare</b>Come la mobilità: si spunta ogni esercizio</button></div>
        <button class="primary" data-a="nbgo">Scegli gli esercizi</button>`;
      return `<div class="wo-edsheet"><div class="wo-edsheet-dim" data-a="shclose"></div><div class="wo-edsheet-box"><div class="wo-grab"></div>${body}</div></div>`;
    }
    return `<div class="wo-edsheet"><div class="wo-edsheet-dim" data-a="shclose"></div><div class="wo-edsheet-box"><div class="wo-grab"></div>${body}<button class="primary" data-a="shclose">Fatto</button></div></div>`;
  }

  /** Catalogo comune (catalogo/<id>): nome, attrezzo, gruppo e come si segna cambiano in tutte le schede. */
  function saveCat(ex, patch) {
    const e = EX[ex];
    if (!e) return;
    const cur = { n: e.n, m: e.m || '', g: e.g || '', t: unit(e) };
    const next = { ...cur, ...patch };
    if (JSON.stringify(next) === JSON.stringify(cur)) return;
    applyCat(e, next);
    const { fs, db } = x;
    fs.setDoc(fs.doc(db, pfx + 'catalogo', ex), { ...next, by: me.name, at: fs.serverTimestamp() })
      .catch((err) => toast(`Esercizio non salvato: ${err.message}`));
  }

  /** Pagina Esercizio (a tutto schermo): sopra quello che vale per tutte le schede, sotto quello di questa scheda. */
  function exedView() {
    const pe = ui.exed, ed = ui.ed;
      const e = EX[pe.ex] || { n: pe.ex }, t = tOf(pe.ex, ed), pi = ed.piano[pe.ex] || {}, { n, r } = splitPlan(pi.s);
      const gruppi = [...new Set([...GRUPPI, e.g].filter(Boolean))];
      const cambiato = pe.t0 && pe.t0 !== t && serie.some((a) => a.ex === pe.ex);
      const body = `
        <div class="wo-part">Per tutte le schede</div>
        <label class="wo-lbl" for="wo-pl-n">Nome</label>
        <input id="wo-pl-n" class="plain wo-sh-in" value="${esc(e.n)}" maxlength="60" autocomplete="off">
        <label class="wo-lbl" for="wo-pl-m">Attrezzo</label>
        <input id="wo-pl-m" class="plain wo-sh-in" value="${esc(e.m || '')}" placeholder="Per esempio Kettlebell, Macchina, Manubri" maxlength="40" autocomplete="off">
        <div class="wo-lbl">Gruppo</div>
        <div class="wo-groups wrap">${gruppi.map((g) => `<button class="${e.g === g ? 'on' : ''}" data-a="plg:${esc(g)}">${esc(g)}</button>`).join('')}</div>
        <div class="wo-part loc">In questa scheda</div>
        <div class="wo-lbl">Come si segna</div>
        <div class="wo-sh-seg">${TIPI.map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-a="plt:${k}">${l}</button>`).join('')}</div>
        ${cambiato ? `<p class="wo-warn">Prima era "${TIPI.find(([k]) => k === pe.t0)[1]}": le serie già fatte restano come erano, da ora in questa scheda si segna in questo modo.</p>` : ''}
        ${pe.back ? '' : `
        <div class="wo-sh-step"><span class="wo-lbl">Serie</span><span class="wo-pm"><button data-a="pln-" aria-label="Una serie in meno">−</button><b>${n}</b><button data-a="pln+" aria-label="Una serie in più">+</button></span></div>
        <div class="wo-lbl">${t === 'sec' ? 'Durata' : t === 'm' ? 'Metri o minuti' : 'Ripetizioni'}</div>
        <div class="wo-sh-seg">${REPS[t].map((v) => `<button class="${v === r ? 'on' : ''}" data-a="plr:${esc(v)}">${esc(v)}</button>`).join('')}</div>
        <input id="wo-pl-r" class="plain wo-sh-in" value="${REPS[t].includes(r) ? '' : esc(r)}" placeholder="Altro, per esempio 8 per lato" maxlength="30" autocomplete="off">
        ${t === 'kg' ? `<label class="wo-lbl" for="wo-pl-kg">Peso iniziale · la prima volta</label>
        <div class="wo-kgf"><input id="wo-pl-kg" class="plain wo-sh-in" inputmode="decimal" value="${pi.kg ? kgf(pi.kg) : ''}" placeholder="0" autocomplete="off"><span>kg</span></div>` : ''}
        <div class="wo-lbl">Nota (facoltativa)</div>
        <input id="wo-pl-nota" class="plain wo-sh-in" value="${esc(pi.nota || '')}" placeholder="Per esempio sedile al 4" maxlength="80" autocomplete="off">`}`;
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${pe.back ? esc(ed.circuiti[pe.back.cid].n) : esc(ed.name || 'Scheda')}</button></div>
      <h2 class="wo-ed-title">${esc((EX[pe.ex] || { n: pe.ex }).n)}</h2>${body}
      <button class="primary wo-exed-ok" data-a="back">Fatto</button>`;
  }

  /** Circuito o lista da spuntare, a pagina intera: nome, giri, recupero, pausa ed esercizi (un tocco apre la loro pagina). */
  function ciredView() {
    const ed = ui.ed, c = ed.circuiti[ui.cired.cid];
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${esc(ed.name || 'Scheda')}</button></div>
      <h2 class="wo-ed-title">${c.lista ? 'Lista da spuntare' : 'Circuito'}</h2>
      <label class="wo-lbl" for="wo-cs-name">Nome</label>
      <input id="wo-cs-name" class="plain wo-ed-name" value="${esc(c.n)}" maxlength="40" autocomplete="off">
        ${c.lista ? `<div class="wo-lbl">Durata</div><input id="wo-cs-dur" class="plain wo-sh-in" value="${esc(c.durata || '')}" placeholder="Per esempio 5'" maxlength="10" autocomplete="off">`
          : `<div class="wo-sh-step"><span class="wo-lbl">Giri</span><span class="wo-pm"><button data-a="csg-" aria-label="Un giro in meno">−</button><b>${c.giri}</b><button data-a="csg+" aria-label="Un giro in più">+</button></span></div>
             <div class="wo-sh-step"><span class="wo-lbl">Recupero tra i giri</span><span class="wo-pm"><button data-a="csr-" aria-label="15 secondi in meno">−</button><b>${mmss(c.rec)}${c.rec < 60 ? '"' : ''}</b><button data-a="csr+" aria-label="15 secondi in più">+</button></span></div>
             <div class="wo-sh-step"><span class="wo-lbl">Pausa tra gli esercizi</span><span class="wo-pm"><button data-a="csp-" aria-label="5 secondi in meno">−</button><b>${c.pausa ? `${c.pausa}"` : 'no'}</b><button data-a="csp+" aria-label="5 secondi in più">+</button></span></div>`}
        <div class="wo-lbl">Esercizi · ${c.lista ? 'ripetizioni' : 'ripetizioni o secondi per giro'}</div>
        <div class="wo-sh-exs">${c.ex.map((e) => `<div class="wo-sh-ex"><button class="wo-sh-exn" data-a="csex:${e}">${esc((EX[e] || { n: e }).n)}</button><input data-csv="${e}" class="plain" value="${esc((ed.piano[e] || {}).s || '')}" placeholder="${tOf(e, ed) === 'sec' ? '30&quot;' : '10'}" maxlength="20" aria-label="${esc((EX[e] || { n: e }).n)}" autocomplete="off"><button class="wo-ed-x" data-a="csrm:${e}" aria-label="Togli">×</button></div>`).join('')}</div>
        <button class="link-button" data-a="csadd">+ Aggiungi esercizi al circuito</button>
      <button class="primary wo-exed-ok" data-a="back">Fatto</button>`;
  }

  function openPick(forWhat) {
    Object.assign(ui, { pickFor: forWhat, sel: [], q: '', g: '', pg: '', pf: '', view: 'pick' });
  }

  /** Catalogo con la spunta multipla: si scelgono più esercizi e si aggiungono insieme. */
  function pickMultiView() {
    const ed = ui.ed;
    const had = ui.pickFor === 'edit' ? ed.ex : ui.pickFor.startsWith('circ:') ? ed.circuiti[ui.pickFor.slice(5)].ex : [];
    const n = ui.sel.length;
    const back = ui.pg && !ui.q.trim() ? 'Esercizi' : `${esc(ed.name || (ed.isNew ? 'Nuova scheda' : 'Scheda'))}${diBadge(ed)}`;
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ ${back}</button></div>
      ${pickBody(true, had)}
      <div class="wo-pickpad"></div>
      <div class="wo-pickbar"><button class="primary" data-a="padd"${n ? '' : ' disabled'}>${n ? `Aggiungi ${n} ${n === 1 ? 'esercizio' : 'esercizi'}` : 'Scegli gli esercizi'}</button></div>`;
  }

  function pickDone() {
    const ed = ui.ed, sel = ui.sel;
    if (ui.pickFor === 'edit') sel.forEach((e) => { if (!ed.ex.includes(e)) ed.ex.push(e); });
    else if ((ui.pickFor === 'circnew' || ui.pickFor === 'listanew') && sel.length) {
      const cid = newId('c');
      ed.circuiti[cid] = ui.pickFor === 'listanew' ? { n: 'Lista', lista: true, durata: '', ex: sel.slice() } : { n: 'Circuito', ex: sel.slice(), giri: 3, rec: 60 };
      ed.ex.push('@' + cid);
      ui.cired = { cid }; // subito giri e recupero
    } else if (ui.pickFor.startsWith('circ:')) {
      const c = ed.circuiti[ui.pickFor.slice(5)];
      sel.forEach((e) => { if (!c.ex.includes(e)) c.ex.push(e); });
    }
    const toCirc = ui.pickFor.startsWith('circ:') || ui.cired;
    Object.assign(ui, { pickFor: '', sel: [], view: toCirc ? 'cired' : 'edit' });
  }

  const GRUPPI = ['Petto', 'Schiena', 'Gambe', 'Glutei', 'Polpacci', 'Spalle', 'Bicipiti', 'Tricipiti', 'Addominali', 'Mobilità', 'Cardio'];
  const TIPI = [['kg', 'Kg e rip'], ['rip', 'Solo rip'], ['sec', 'A tempo'], ['m', 'Metri']];

  function newExView() {
    const nx = ui.nx;
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ Aggiungi esercizi</button></div>
      <h2 class="wo-ed-title">Nuovo esercizio</h2>
      <label class="wo-lbl" for="wo-nx-n">Nome</label>
      <input id="wo-nx-n" class="plain wo-ed-name" value="${esc(nx.n)}" placeholder="Per esempio Hammer incline press" maxlength="50" autocomplete="off">
      <div class="wo-lbl">Gruppo</div>
      <div class="wo-groups wrap">${GRUPPI.map((g) => `<button class="${nx.g === g ? 'on' : ''}" data-a="nxg:${g}">${g}</button>`).join('')}</div>
      <div class="wo-lbl">Come si segna</div>
      <div class="wo-sh-seg">${TIPI.map(([t, l]) => `<button class="${nx.t === t ? 'on' : ''}" data-a="nxt:${t}">${l}</button>`).join('')}</div>
      <label class="wo-lbl" for="wo-nx-m">Dove si trova o attrezzo (facoltativo)</label>
      <input id="wo-nx-m" class="plain wo-sh-in" value="${esc(nx.m)}" placeholder="Per esempio Macchina 12, Manubri" maxlength="40" autocomplete="off">
      <button class="primary" data-a="nxsave">Aggiungi</button>`;
  }

  function saveNewEx() {
    const nx = ui.nx, n = nx.n.trim();
    if (!n) return toast('Scrivi il nome dell\'esercizio');
    if (!nx.g) return toast('Scegli il gruppo');
    const slug = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
    const e = { id: `x-${slug || 'es'}-${Math.random().toString(36).slice(2, 6)}`, n, g: nx.g, m: nx.m.trim() };
    if (nx.t !== 'kg') e.t = nx.t;
    extra.push(e);
    addEx(e);
    writeDoc();
    ui.sel.push(e.id);
    Object.assign(ui, { view: 'pick', q: '', g: e.g, pg: 'm:' + e.g, pf: '', nx: null });
  }

  function saveEditor() {
    const ed = ui.ed, name = ed.name.trim();
    if (!name) return toast('Scrivi il nome della scheda');
    const ex = ed.ex.filter((id) => id[0] !== '@' || (ed.circuiti[id.slice(1)] || { ex: [] }).ex.length); // via i circuiti vuoti
    if (!ex.length) return toast('Aggiungi almeno un esercizio');
    const circuiti = {};
    ex.forEach((id) => { if (id[0] === '@') circuiti[id.slice(1)] = ed.circuiti[id.slice(1)]; });
    const piano = {};
    ex.flatMap((id) => (id[0] === '@' ? circuiti[id.slice(1)].ex : [id])).forEach((e) => {
      const pi = { ...ed.piano[e] };
      if (!pi.nota) delete pi.nota;
      if (!pi.s) delete pi.s;
      if (Object.keys(pi).length) piano[e] = pi;
    });
    const sc = { id: ed.id, name, ex, piano, circuiti };
    if (ed.di) sc.di = ed.di;
    if (ed.di && (!ed.isNew || ed.mod)) sc.mod = true; // copia modificata: la vedono anche gli altri ("da …, modificata")
    const list = clone(schede || []), k = list.findIndex((y) => y.id === ed.id);
    if (k >= 0) list[k] = sc;
    else if (list.length >= 30) return toast('Si possono avere al massimo 30 schede');
    else list.push(sc);
    writeDoc(list);
    Object.assign(ui, { ed: null, sheet: null, view: 'list' });
    toast('Scheda salvata');
  }

  function deleteEditor() {
    const ed = ui.ed;
    if (!confirm(`Eliminare la scheda "${ed.name || 'senza nome'}"? Le serie già fatte restano.`)) return;
    rot = rot.filter((id) => id !== ed.id);
    writeDoc(clone(schede).filter((y) => y.id !== ed.id));
    Object.assign(ui, { ed: null, sheet: null, view: 'list' });
    toast('Scheda eliminata');
  }

  /** Comandi della modifica; false se il comando non è suo. */
  function editCmd(cmd, arg) {
    const ed = ui.ed, sh = ui.sheet;
    const pe = ui.exed;
    const pi = () => (ed.piano[pe.ex] ||= {});
    const circ = () => ed.circuiti[ui.cired.cid];
    if (cmd === 'edrm') ed.ex.splice(Number(arg), 1);
    else if (cmd === 'edplan') {
      const id = ed.ex[Number(arg)];
      if (id[0] === '@') Object.assign(ui, { cired: { cid: id.slice(1) }, view: 'cired' });
      else Object.assign(ui, { exed: { ex: id, t0: tOf(id, ed) }, view: 'exed' });
    } else if (cmd === 'shclose') ui.sheet = sh && sh.back ? sh.back : null; // dal circuito si torna al circuito
    else if (cmd === 'plg') saveCat(pe.ex, { g: arg });
    else if (cmd === 'plt') { // come si segna: solo in questa scheda (se è come nel catalogo non serve scriverlo)
      if (arg === unit(EX[pe.ex])) delete pi().t;
      else pi().t = arg;
    }
    else if (cmd === 'csp-' || cmd === 'csp+') {
      const p = Math.max(0, Math.min(60, (circ().pausa || 0) + (cmd === 'csp+' ? 5 : -5)));
      if (p) circ().pausa = p;
      else delete circ().pausa;
    } else if (cmd === 'csex') Object.assign(ui, { exed: { ex: arg, t0: tOf(arg, ed), back: ui.cired }, view: 'exed' });
    else if (cmd === 'nbk') ui.sheet = { kind: 'newblock', lista: arg === 'lista' };
    else if (cmd === 'nbgo') { const l = sh.lista; ui.sheet = null; openPick(l ? 'listanew' : 'circnew'); }
    else if (cmd === 'pln-' || cmd === 'pln+') {
      const p = splitPlan(pi().s);
      pi().s = joinPlan(Math.max(1, Math.min(10, p.n + (cmd === 'pln+' ? 1 : -1))), p.r || (tOf(pe.ex, ed) === 'sec' ? '30"' : '10'));
    } else if (cmd === 'plr') pi().s = joinPlan(splitPlan(pi().s).n, arg);
    else if (cmd === 'csg-' || cmd === 'csg+') circ().giri = Math.max(1, Math.min(8, circ().giri + (cmd === 'csg+' ? 1 : -1)));
    else if (cmd === 'csr-' || cmd === 'csr+') circ().rec = Math.max(15, Math.min(300, circ().rec + (cmd === 'csr+' ? 15 : -15)));
    else if (cmd === 'csrm') circ().ex = circ().ex.filter((e) => e !== arg);
    else if (cmd === 'csadd') openPick('circ:' + ui.cired.cid);
    else if (cmd === 'edadd') openPick('edit');
    else if (cmd === 'edcirc') ui.sheet = { kind: 'newblock', lista: false };
    else if (cmd === 'psel') ui.sel = ui.sel.includes(arg) ? ui.sel.filter((e) => e !== arg) : [...ui.sel, arg];
    else if (cmd === 'padd') pickDone();
    else if (cmd === 'newex') Object.assign(ui, { nx: { n: ui.q.trim(), g: ui.pg.startsWith('m:') ? ui.pg.slice(2) : '', t: 'kg', m: '' }, view: 'newex' });
    else if (cmd === 'nxg') ui.nx.g = arg;
    else if (cmd === 'nxt') ui.nx.t = arg;
    else if (cmd === 'nxsave') saveNewEx();
    else if (cmd === 'edsave') saveEditor();
    else if (cmd === 'eddel') deleteEditor();
    else return false;
    return true;
  }

  /** Testi scritti nella modifica: si salvano a ogni lettera, senza ridisegnare (resta la tastiera). */
  function editInput(el) {
    const ed = ui.ed, sh = ui.sheet, v = el.value;
    if (!ed) return false;
    if (el.id === 'wo-ed-name') ed.name = v;
    else if (el.id === 'wo-pl-nota') (ed.piano[ui.exed.ex] ||= {}).nota = v;
    else if (el.id === 'wo-pl-r') {
      const pi = (ed.piano[ui.exed.ex] ||= {});
      pi.s = joinPlan(splitPlan(pi.s).n, v.trim());
    } else if (el.id === 'wo-cs-name') ed.circuiti[ui.cired.cid].n = v;
    else if (el.id === 'wo-cs-dur') ed.circuiti[ui.cired.cid].durata = v.trim();
    else if (el.dataset.csv) (ed.piano[el.dataset.csv] ||= {}).s = v.trim();
    else if (el.id === 'wo-nx-n' && ui.nx) ui.nx.n = v;
    else if (el.id === 'wo-nx-m' && ui.nx) ui.nx.m = v;
    else return false;
    return true;
  }

  /** Fogli corti (senza niente da scorrere): tutto il foglio si trascina, senza che Safari lo faccia rimbalzare. */
  function sheetTouch() {
    root.querySelectorAll('.wo-edsheet-box').forEach((b) => (b.style.touchAction = b.scrollHeight <= b.clientHeight + 1 ? 'none' : ''));
  }

  /** Righe da riordinare. Nella modifica: tenendo premuto un punto qualsiasi della riga (subito dalla ≡), e un tocco apre
   *  il foglio Esercizio; nella rotazione: subito, da tutta la riga. Le altre righe si fanno da parte. */
  let dragging = false, dragClick = false;
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false }); // niente scorrimento mentre si trascina
  root.addEventListener('click', (ev) => {
    if (dragClick) { ev.stopPropagation(); ev.preventDefault(); }
  }, true);

  function setupDrag() {
    const list = root.querySelector('.wo-ed-list');
    if (!list) return;
    const rotList = list.dataset.kind === 'rot';
    list.addEventListener('pointerdown', (ev) => {
      const row = ev.target.closest('.wo-ed-row');
      if (!row || ev.target.closest(rotList ? 'button' : '.wo-ed-x')) return; // la ★ e la × restano tasti
      if (rotList || ev.target.closest('.wo-grip')) {
        ev.preventDefault();
        return startDrag(list, row, ev.pointerId, ev.clientY);
      }
      // tenere premuto: parte dopo un attimo, se intanto il dito non si è mosso (altrimenti si sta scorrendo)
      const x0 = ev.clientX, y0 = ev.clientY, id = ev.pointerId;
      let last = y0;
      const timer = setTimeout(() => { stop(); startDrag(list, row, id, y0, last); }, 380);
      const mv = (e) => { if (e.pointerId !== id) return; last = e.clientY; if (Math.abs(e.clientY - y0) > 8 || Math.abs(e.clientX - x0) > 8) { clearTimeout(timer); stop(); } };
      const stop = () => {
        document.removeEventListener('pointermove', mv);
        document.removeEventListener('pointerup', cancel);
        document.removeEventListener('pointercancel', cancel);
      };
      const cancel = () => { clearTimeout(timer); stop(); };
      document.addEventListener('pointermove', mv);
      document.addEventListener('pointerup', cancel);
      document.addEventListener('pointercancel', cancel);
    });
  }

  function startDrag(list, row, pointerId, y0, yNow = y0) {
    const rows = [...list.querySelectorAll('.wo-ed-row')], k = rows.indexOf(row);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const step = rows.length > 1 ? rects[1].top - rects[0].top : rects[k].height;
    const mids = rects.map((r) => r.top + r.height / 2);
    let to = k;
    dragging = true;
    try { row.setPointerCapture(pointerId); } catch {}
    row.classList.add('drag');
    if (navigator.vibrate) navigator.vibrate(12);
    const move = (e) => {
      if (e.pointerId !== pointerId) return;
      const dy = e.clientY - y0, mid = mids[k] + dy;
      row.style.transform = `translateY(${dy}px)`;
      let t = k;
      mids.forEach((m, j) => {
        if (j < k && mid < m) t = Math.min(t, j);
        if (j > k && mid > m) t = Math.max(t, j);
      });
      if (t !== to && navigator.vibrate) navigator.vibrate(6);
      to = t;
      rows.forEach((r, j) => {
        if (j === k) return;
        const sh = k < to && j > k && j <= to ? -step : k > to && j < k && j >= to ? step : 0;
        r.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    };
    const up = (e) => {
      if (e.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      dragging = false;
      dragClick = true; // il dito alzato non vale come tocco sulla riga
      setTimeout(() => (dragClick = false), 60);
      if (list.dataset.kind === 'rot') {
        const ids = rotInfo().list.map((y) => y.id);
        ids.splice(to, 0, ids.splice(k, 1)[0]);
        rot = ids;
        writeDoc();
      } else ui.ed.ex.splice(to, 0, ui.ed.ex.splice(k, 1)[0]);
      draw();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    if (yNow !== y0) move({ pointerId, clientY: yNow });
  }


  function loadOthers() {
    const { fs, db } = x;
    fs.getDocs(fs.collection(db, pfx + 'schede')).then((snap) => {
      otherSchede = snap.docs.map((d) => d.data()).filter((d) => d.name !== me.name);
      softDraw();
    }).catch(() => {});
  }

  /** Schede degli altri per persona: gli originali inseriti per Rizzo, Ceppo, Gualo (anche se li ho cambiati o eliminati
   *  dai miei) e quelle di chi ha già le sue. key: e:<id> (inserite qui) oppure o:<documento>:<n>. */
  function altri() {
    const by = {};
    SCHEDE_ESEMPIO.filter((y) => y.di).forEach((y) => (by[y.di] ||= []).push({ sc: y, key: `e:${y.id}`, chi: y.di }));
    // di ognuno le schede sue e le copie che ha modificato (quelle copiate e lasciate uguali no: sarebbero doppioni)
    otherSchede.forEach((d, i) => (d.list || []).forEach((y, j) => { if (!y.di || y.mod) (by[d.name] ||= []).push({ sc: y, key: `o:${i}:${j}`, chi: d.name }); }));
    const names = Object.keys(by);
    return { by, names, n: names.reduce((t, k) => t + by[k].length, 0) };
  }
  const altroOf = (key) => {
    if (key.startsWith('e:')) {
      const sc = SCHEDE_ESEMPIO.find((y) => y.id === key.slice(2));
      return sc ? { sc, chi: sc.di, ext: [] } : null;
    }
    const [, i, j] = key.split(':'), d = otherSchede[Number(i)];
    return d && d.list && d.list[Number(j)] ? { sc: d.list[Number(j)], chi: d.name, ext: d.extra || [] } : null;
  };
  /** Ce l'ho già: stesso nome e copiata dalla stessa persona. */
  const giaMia = (sc, chi) => (schede || []).some((y) => y.name === sc.name && y.di === chi);

  /** "Schede degli altri": l'elenco per persona; un tocco apre l'anteprima. */
  function copyView() {
    const { by, names } = altri();
    const row = ({ sc, key, chi }) => `<button class="wo-row" data-a="prev:${key}"><span><b>${esc(sc.name)}</b><small>${sc.ex.length} ${sc.ex.length === 1 ? 'esercizio' : 'esercizi'}${key.startsWith('o:') && sc.di ? ` · da ${esc(sc.di)}, modificata` : ''}${giaMia(sc, chi) ? ' · già tra le tue' : ''}</small></span><span class="wo-chev">›</span></button>`;
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ Allenamento</button></div>
      <h2 class="wo-ed-title">Schede degli altri</h2>
      ${names.map((n) => `<div class="wo-who"><span class="wo-av">${esc(n[0])}</span><b>${esc(n)}</b></div><section class="card wo-list">${by[n].map(row).join('')}</section>`).join('') || '<p class="wo-empty">Nessuna scheda</p>'}`;
  }

  /** Anteprima di una scheda degli altri: per usarla si copia tra le mie. */
  function prevView() {
    const a = altroOf(ui.prev);
    if (!a) return copyView();
    const { sc, chi } = a;
    const rows = sc.ex.map((id) => {
      const c = circIn(sc, id), pi = sc.piano && sc.piano[id];
      const v = c ? (c.lista ? c.durata || '' : `${c.giri} giri`) : pi && pi.s ? pi.s : '';
      return `<div class="wo-prev-r${c ? ' circ' : ''}"><span>${esc(nameOf(id, sc))}${c ? `<small>${esc(c.ex.map((e) => nameOf(e, sc)).join(', '))}</small>` : ''}</span><em>${esc(v)}</em></div>`;
    }).join('');
    return `<div class="wo-top"><button class="wo-back" data-a="back">‹ Schede degli altri</button></div>
      <div class="wo-prev-t"><h2 class="wo-ed-title">${esc(sc.name)}</h2><span class="wo-prev-di">di ${esc(chi)}</span></div>
      <section class="card wo-prev">${rows}</section>
      <button class="primary" data-a="cpsave">Copia tra le mie</button>
      <p class="wo-sub wo-center">${giaMia(sc, chi) ? 'Ne hai già una con questo nome: la copia avrà il bollino con la persona.' : 'Per usarla la copi tra le tue; poi la puoi anche modificare.'}</p>`;
  }

  /** Copia la scheda in anteprima tra le mie (resta "di" chi l'ha fatta, quindi non viene proposta come da fare). */
  function copyAltro() {
    const a = altroOf(ui.prev);
    if (!a) return;
    const txt = JSON.stringify(a.sc);
    a.ext.forEach((e) => { // le macchine nuove dell'altro che servono alla scheda
      if (!EX[e.id] && txt.includes(`"${e.id}"`)) {
        extra.push(e);
        addEx(e);
      }
    });
    const c = clone(a.sc);
    c.id = newId('s');
    c.di = a.chi; // il bollino con la persona distingue anche due schede con lo stesso nome
    delete c.mod; // per me è una copia nuova
    const list = clone(schede || []);
    if (list.length >= 30) return toast('Si possono avere al massimo 30 schede');
    list.push(c);
    writeDoc(list);
    Object.assign(ui, { view: 'list', prev: '' });
    toast(`${c.name}: ora è tra le tue`);
  }

  // ---------- Tocchi ----------

  function openEx(i, slideFrom) {
    glide = ui.view === 'ex' && slideFrom != null && slideFrom !== i ? { from: slideFrom } : null;
    ui.i = i;
    ui.view = 'ex';
  }

  function setKg(k, v) {
    if (!(v >= 0) || v > 500) return;
    v = Math.round(v * 4) / 4;
    const sets = P().sets;
    for (let j = k; j < sets.length; j++) sets[j].kg = v; // cambia anche le serie dopo, come succede di solito
  }

  root.addEventListener('click', (ev) => {
    let a = ev.target.closest('[data-a]')?.dataset.a;
    // il recupero parte toccando la barra in qualsiasi punto (fermo; mentre conta c'è il tasto Stop)
    if (!a && ev.target.closest('.wo-rest') && !restEnd) a = 'rest';
    if (!a) return;
    const page = ev.target.closest('.wo-page');
    if (page) ui.i = Number(page.dataset.k); // i tasti valgono per la pagina in cui sono
    const [cmd, arg] = a.split(/:(.*)/s);
    if (cmd === 'timer') return openTimer();
    if (cmd === 'copia') {
      copia();
      return toast('Serie copiate');
    }
    if (cmd === 'rotx') { // stellina: entra in fondo al giro o esce
      rot = rot.includes(arg) ? rot.filter((id) => id !== arg) : [...rot, arg];
      if (rot.length < 2) ui.rotSheet = false;
      writeDoc();
      return draw();
    }
    if (cmd === 'rotord' || cmd === 'rotclose') {
      ui.rotSheet = cmd === 'rotord';
      return draw();
    }
    if (cmd === 'nuova') {
      openEditor({}, true);
      return draw();
    }
    if (cmd === 'ed') {
      const sc = schede.find((y) => y.id === arg);
      if (sc) openEditor(sc, false);
      return draw();
    }
    if (cmd === 'copy') {
      ui.view = 'copy';
      loadOthers();
      return draw();
    }
    if (cmd === 'prev') {
      Object.assign(ui, { view: 'prev', prev: arg });
      return draw();
    }
    if (cmd === 'cpsave') {
      copyAltro();
      return draw();
    }
    if (cmd === 'fromlib') {
      const lib = liberiOggi(), piano = {};
      lib.forEach((a) => {
        const r = a.sets[0].reps, t = a.t || unit(EX[a.ex]);
        piano[a.ex] = { s: joinPlan(a.sets.length, t === 'sec' ? `${r}"` : String(r)), ...(t !== unit(EX[a.ex]) ? { t } : {}) };
      });
      openEditor({ name: '', ex: lib.map((a) => a.ex), piano }, true);
      return draw();
    }
    if (ui.ed && editCmd(cmd, arg)) return draw();
    if (cmd === 'go' || cmd === 'sch') {
      const s = schede.find((y) => y.id === arg);
      if (!s) return;
      if (s.id !== ui.scheda) pages = {}; // la stessa scheda di prima: restano le serie cambiate e non ancora salvate
      ui.scheda = s.id;
      ui.list = s.ex.slice();
      const k = s.ex.findIndex((e) => !isDone(e, s));
      openEx(cmd === 'go' && k >= 0 ? k : 0);
    } else if (cmd === 'libero') {
      Object.assign(ui, { view: 'pick', q: '', pg: '', pf: '' });
    } else if (cmd === 'pg') {
      Object.assign(ui, { pg: arg, pf: '' });
    } else if (cmd === 'pf') {
      ui.pf = arg;
    } else if (cmd === 'pick') {
      ui.scheda = '';
      ui.list = [arg];
      pages = {};
      openEx(0);
    } else if (cmd === 'g') {
      ui.g = arg;
    } else if (cmd === 'back') {
      goBack();
    } else if (cmd === 'end' || cmd === 'home') {
      ui.view = 'list';
    } else if (cmd === 'j') {
      openEx(Number(arg), ui.view === 'ex' && !ev.target.closest('.wo-sheet') ? ui.i : null); // dalla griglia senza scorrimento
    } else if (cmd === 'ok') {
      save(ui.list[ui.i], P().sets);
      Object.assign(P(), { editing: false, open: -1, sets: null, dirty: false });
      const nx = nextTodo(ui.i); // un solo tocco: si passa subito al prossimo esercizio da fare
      if (nx >= 0) openEx(nx, ui.i);
    } else if (cmd === 'edit') {
      Object.assign(P(), { editing: true, dirty: true, sets: copy(todayDoc(ui.list[ui.i]).sets) });
    } else if (cmd === 'add') {
      const sets = P().sets;
      sets.push({ ...sets[sets.length - 1] });
      P().dirty = true;
    } else if (cmd === 'del') {
      if (P().sets.length > 1) P().sets.pop();
      Object.assign(P(), { open: -1, dirty: true });
    } else if (cmd === 'o') {
      const k = Number(arg);
      P().open = P().open === k ? -1 : k;
      if (tOf(ui.list[ui.i]) === 'sec' && !tmr.end) tmr = { ...tmr, ex: ui.list[ui.i], j: k };
    } else if (/^[kr][+-]$/.test(cmd)) {
      const k = Number(arg), d = cmd[1] === '+' ? 1 : -1, sets = P().sets;
      P().dirty = true;
      if (cmd[0] === 'k') setKg(k, nextKg(sets[k].kg, d));
      else {
        const t = tOf(ui.list[ui.i]), step = uStep(t);
        sets[k].reps = Math.max(step, Math.min(t === 'm' ? 20000 : 600, sets[k].reps + step * d));
      }
    } else if (cmd === 'mob' || cmd === 'moball') {
      const sch = curSch(), id = ui.list[ui.i], c = circIn(sch, id);
      if (!c) return;
      const todo = cmd === 'moball' ? c.ex.filter((e) => !todayDoc(e)) : [arg];
      if (cmd === 'mob' && todayDoc(arg)) unsave(arg); // tocco su uno già spuntato: si toglie
      else todo.forEach((e) => save(e, [{ kg: 0, reps: listReps(sch, e) }]));
      const fatti = c.ex.every((e) => todayDoc(e) || todo.includes(e)) && !(cmd === 'mob' && todayDoc(arg));
      if (fatti) { // spuntati tutti: si passa al prossimo esercizio da fare
        const nx = nextTodo(ui.i);
        if (nx >= 0) openEx(nx, ui.i);
      }
    } else if (cmd === 'cg-' || cmd === 'cg+') {
      const st = P().circ;
      if (st) st.giri = Math.max(Math.max(1, st.cur), Math.min(8, st.giri + (cmd === 'cg+' ? 1 : -1)));
    } else if (cmd === 'cv-' || cmd === 'cv+') {
      const st = P().circ, step = tOf(arg) === 'sec' ? 5 : 1;
      if (st) st.vals[arg] = Math.max(step, Math.min(600, st.vals[arg] + (cmd === 'cv+' ? step : -step)));
    } else if (cmd === 'cgiro') {
      const id = ui.list[ui.i];
      circRound(id);
      const st = P().circ;
      if (st && st.cur >= st.giri) circSave(id);
    } else if (cmd === 'csave') {
      circSave(ui.list[ui.i]);
    } else if (cmd === 'crun') {
      circRun(ui.list[ui.i]);
      return;
    } else if (cmd === 'crifai') {
      Object.assign(P(), { circ: null, rifai: true }); // si rifà da capo; i giri salvati restano finché non si salvano i nuovi
    } else if (cmd === 'tgo') {
      const ex = ui.list[ui.i], sets = P().sets || [];
      const j = Math.max(0, Math.min(Number(arg) || 0, sets.length - 1));
      const sec = (sets[j] || {}).reps || 30;
      const go = Date.now() + COUNTDOWN; // 3, 2, 1 come il timer grande
      tmr = { ex, j, go, end: go + sec * 1000, total: sec };
    } else if (cmd === 'tstop') {
      tmr.end = 0;
    } else if (cmd === 'rec-' || cmd === 'rec+') { // si ricorda per l'esercizio, in tutte le schede
      recMap[arg] = Math.max(15, Math.min(600, restOf(arg) + (cmd === 'rec+' ? 15 : -15)));
      writeDoc();
    } else if (cmd === 'rest') {
      restTotal = restOf(ui.list[ui.i]);
      restEnd = Date.now() + restTotal * 1000;
    } else if (cmd === 'stop') {
      restEnd = 0;
    }
    draw();
  });

  root.addEventListener('change', (ev) => {
    if (ui.exed && ['wo-pl-n', 'wo-pl-m'].includes(ev.target.id)) {
      const v = ev.target.value.replace(/\s+/g, ' ').trim();
      if (ev.target.id === 'wo-pl-n') return v ? saveCat(ui.exed.ex, { n: v.slice(0, 60) }) : toast('Il nome non può essere vuoto');
      return saveCat(ui.exed.ex, { m: v.slice(0, 40) });
    }
    if (ev.target.id === 'wo-pl-kg' && ui.ed && ui.exed) { // peso iniziale di questa scheda
      const v = Number(ev.target.value.replace(',', '.')), pi = (ui.ed.piano[ui.exed.ex] ||= {});
      if (v > 0 && v <= 500) pi.kg = Math.round(v * 4) / 4;
      else delete pi.kg;
      return;
    }
    const f = ev.target.dataset.f, page = ev.target.closest('.wo-page');
    if (!f || !page) return;
    ui.i = Number(page.dataset.k);
    const pg = P();
    if (f.startsWith('c:')) { // valore di un esercizio del circuito
      const v = Math.round(Number(ev.target.value.replace(',', '.')));
      if (pg.circ && v >= 1 && v <= 600) pg.circ.vals[f.slice(2)] = v;
      return draw();
    }
    if (pg.open < 0 || !pg.sets) return;
    const v = Number(ev.target.value.replace(',', '.'));
    if (f === 'k') setKg(pg.open, v);
    else if (v >= 1 && v <= (tOf(ui.list[ui.i]) === 'm' ? 20000 : 600)) pg.sets[pg.open].reps = Math.round(v);
    else return;
    pg.dirty = true;
    draw();
  });
  // Invio sulla tastiera: conferma il numero e chiude la tastiera
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.dataset.f) ev.target.blur();
  });
  root.addEventListener('input', (ev) => {
    if (editInput(ev.target)) return;
    if (ev.target.id !== 'wo-q') return;
    ui.q = ev.target.value;
    const pos = ev.target.selectionStart;
    draw();
    const el = root.querySelector('#wo-q');
    el.focus();
    el.setSelectionRange(pos, pos);
  });

  /** Impostazioni → "Segna l'allenamento di oggi come non fatto": cancella le serie salvate oggi. Restituisce quante. */
  async function resetToday() {
    if (!x || !me) throw new Error('Allenamento non collegato');
    const { fs, db } = x;
    const mine = serie.filter((s) => s.day === today());
    await Promise.all(mine.map((s) => fs.deleteDoc(fs.doc(db, pfx + 'serie', s.id))));
    pages = {};
    draw();
    return mine.length;
  }

  return { start, stop, draw, resetToday };
}
