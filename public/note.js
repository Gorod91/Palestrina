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
      'Nuova sezione Allenamento al posto del Timer: schede personali, chili e ripetizioni per ogni serie, recupero e risultati della volta precedente',
      'Creazione di nuove schede e copia di quelle degli altri',
      'Grafici dei progressi per ogni esercizio',
      'Pagina Esercizi: un unico elenco comune a tutti, con aggiunta, modifica ed eliminazione degli esercizi (le serie già fatte restano)',
      'Pesi sotto lo zero per gli esercizi assistiti: i chili di aiuto (contrappeso, elastico) si segnano col meno',
      'Bonus Apripista: 3 punti a chi chiede per primo "chi va in palestra?" e quel giorno fa check-in',
      { feature: 'sfide', text: 'Sfide tra chi è in palestra insieme: 5 punti a chi vince, 2 a chi partecipa' },
      'Obiettivo settimanale scelto da ognuno per il mese, da 1 a 5 presenze: richiesto all\'apertura dell\'app e valido fino a fine mese',
      'Presentazione di fine mese: medaglie e Divano d\'oro, classifica completa del mese con la cronaca, poi l\'incoronazione del Re',
    ],
  },
  {
    v: '1.6',
    date: '31 ottobre 2026',
    items: [
      'Penalità: una risposta cambiata da "Ci sono" a "No" poteva restare "Ci sono" nel calcolo e dare "Bidone" invece di "Cambio all\'ultimo"',
    ],
  },
  {
    v: '1.5',
    date: '23 – 27 ottobre 2026',
    items: [
      'Classifica a punti: ogni voce del dettaglio si apre e mostra i giorni in cui sono arrivati punti e penalità, con il motivo',
      'Sudometro: senza rete il selfie resta sul telefono e viene inviato da solo appena torna la connessione, entro un\'ora dallo scatto',
      'Sudometro: conferma del selfie dopo lo scatto, con le opzioni "Usa questa" e "Rifai"',
      'Sudometro: punteggio mostrato con l\'animazione del termometro',
      'Timer: arresto dell\'allarme muovendo il telefono, attivabile dalle Impostazioni',
      'Chiusura di Punti e medaglie trascinando il foglio verso il basso',
      'Chat: nome dell\'autore di nuovo visibile su ogni messaggio',
    ],
  },
  {
    v: '1.4',
    date: '19 – 22 ottobre 2026',
    items: [
      'Chat, sondaggio e check-in aggiornati in tempo reale',
      'Nuova icona dell\'app e opzione "Apri in Safari" per reinstallarla senza ripetere l\'accesso',
      'Classifica delle presenze e galleria del Sudometro con vista Settimana / Mese',
      'Annullamento del check-in immediato; messaggi di errore in rosso',
      'Istruzioni del check-in automatico più compatte nelle Impostazioni',
      'Rimossa la data in cima alle pagine',
    ],
  },
  {
    v: '1.3',
    date: '15 – 18 ottobre 2026',
    items: [
      'Sudometro 2.0: riflessi del sudore misurati zona per zona',
      'Ogni foto del Sudometro affiancata alla foto di riferimento dello stesso giorno',
      'Foto di riferimento consultabile nelle Impostazioni',
      'Chat: tastiera aperta dopo l\'invio, chiusura trascinando verso il basso, sondaggio nascosto durante la scrittura',
      'Chat: corretto il caricamento che a volte non terminava',
      'Timer: corretto il ritorno a 30 secondi del tempo scelto',
    ],
  },
  {
    v: '1.2',
    date: '13 – 14 ottobre 2026',
    items: [
      'Nuova scheda Home',
      'Domande per i giorni successivi, con un indicatore per le risposte mancanti',
      'Penalità nei punti del mese: bidone, cambio all\'ultimo, ritardo, check-in senza avviso, settimana a vuoto',
      'Check-in automatico con il Wi-Fi della palestra tramite l\'app Comandi',
      'Conferma prima del check-in manuale',
      'Check-in e Sudometro più rapidi',
      'Sudometro: nuovo livello "Lava incandescente" oltre 85',
      'Aggiornamento automatico dell\'app all\'apertura',
    ],
  },
  {
    v: '1.1',
    date: '12 ottobre 2026',
    items: [
      'Chat del gruppo con la domanda "chi va in palestra oggi?", orario e programma dei 7 giorni successivi',
      'Punti del mese, medaglie e Re del mese, con corona e albo d\'oro',
      'Nome visualizzato personalizzabile',
      'Foto da fresco affiancata a quella da sudato',
      'Annullamento del check-in, anche dalla chat',
      'Caricamento delle foto più rapido',
    ],
  },
  {
    v: '1.0',
    date: '11 ottobre 2026',
    items: [
      'Prima versione: check-in, Sudometro con foto di riferimento, classifica con le foto e timer per gli addominali',
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
