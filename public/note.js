// Note di rilascio (Impostazioni → Note di rilascio): le modifiche versione per versione, dalla più recente.
// Una versione con `news` resta nascosta finché quella novità non è rilasciata (state.news, NEWS in Code.gs);
// una riga con `feature` finché la funzione non è attiva per tutti (state.features), così niente spoiler.
// Solo cose che vedono tutti: niente admin, prova, debug né ritocchi fatti senza annunci.

const VERSIONS = [
  {
    v: '2.0',
    date: '31 ottobre 2026',
    news: '2026-11',
    items: [
      'Il Timer diventa Allenamento: schede personali, chili e ripetizioni di ogni serie, recupero e quello che avete fatto la volta scorsa',
      'Create le vostre schede o copiate quelle degli amici',
      'Grafici dei progressi per ogni esercizio',
      'Apripista: +3 a chi chiede per primo "chi va in palestra?" e poi ci va',
      { feature: 'sfide', text: 'Sfide tra chi è in palestra insieme: +5 a chi vince, +2 a chi partecipa' },
    ],
  },
  {
    v: '1.5',
    date: '23 – 26 ottobre 2026',
    items: [
      'Sudometro: dopo lo scatto potete scegliere "Usa questa" o "Rifai"',
      'Sudometro: il punteggio si svela con un termometro',
      'Timer: l\'allarme si può fermare muovendo il telefono (da attivare qui nelle Impostazioni)',
      'Punti e medaglie si chiude anche trascinando giù il foglio',
      'Chat: torna il nome di chi scrive su ogni messaggio',
    ],
  },
  {
    v: '1.4',
    date: '19 – 22 ottobre 2026',
    items: [
      'Chat, sondaggio e check-in in tempo reale, più veloci',
      'Nuova icona dell\'app, con "Apri in Safari" per installarla senza rifare l\'accesso',
      'Classifica delle presenze e galleria del Sudometro: interruttore Settimana / Mese',
      'Annulla check-in immediato ed errori in rosso',
      'Check-in automatico più compatto nelle Impostazioni',
      'Tolta la data in cima alle pagine',
    ],
  },
  {
    v: '1.3',
    date: '15 – 18 ottobre 2026',
    items: [
      'Sudometro 2.0: i riflessi del sudore misurati zona per zona',
      'Ogni foto del Sudometro si vede accanto al riferimento di quel giorno',
      'Foto di riferimento sempre visibile nelle Impostazioni',
      'Chat: la tastiera resta aperta dopo l\'invio e si chiude trascinando giù; scrivendo il sondaggio si nasconde',
      'Chat: niente più "Carico la chat…" infinito',
      'Timer: il tempo scelto non torna più a 30 secondi',
    ],
  },
  {
    v: '1.2',
    date: '13 – 14 ottobre 2026',
    items: [
      'Tab Home',
      'Domande per i giorni futuri, con il pallino quando dovete ancora rispondere',
      'Penalità nei punti del mese: bidone, cambio all\'ultimo, ritardo, check-in senza avvisare, settimana a vuoto',
      'Check-in automatico con il Wi-Fi della palestra (app Comandi)',
      'Conferma prima del check-in manuale',
      'Check-in e Sudometro istantanei',
      'Sudometro: sopra 85 è "Lava incandescente"',
      'L\'app si aggiorna da sola quando la aprite',
    ],
  },
  {
    v: '1.1',
    date: '12 ottobre 2026',
    items: [
      'Chat del gruppo con la domanda "chi va in palestra oggi?", orario e piani dei prossimi 7 giorni',
      'Punti del mese, medaglie e Re del mese con la corona e l\'albo d\'oro',
      'Nome visualizzato scelto da ognuno',
      'Foto da fresco accanto a quella da sudato',
      'Annulla check-in, anche dalla chat',
      'Foto più leggere e veloci',
    ],
  },
  {
    v: '1.0',
    date: '11 ottobre 2026',
    items: [
      'Prima versione: check-in, Sudometro con la foto di riferimento, classifica con le foto e timer addominali',
    ],
  },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** HTML delle note visibili con questo stato: solo le novità già rilasciate. */
export function releaseNotesHtml(state) {
  const released = ((state && state.news) || []).map((n) => n.id);
  const features = (state && state.features) || {};
  return VERSIONS.filter((x) => !x.news || released.includes(x.news)).map((x) => {
    const items = x.items
      .filter((it) => typeof it === 'string' || features[it.feature])
      .map((it) => `<li>${esc(typeof it === 'string' ? it : it.text)}</li>`)
      .join('');
    return `<h4>Versione ${esc(x.v)} <span>· ${esc(x.date)}</span></h4><ul class="notes">${items}</ul>`;
  }).join('');
}
