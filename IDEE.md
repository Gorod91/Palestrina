# Idee per più avanti

Cose di cui abbiamo parlato ma che non sono ancora nell'app.

## Allenamento: da fare (segnato il 25/10)

- **Fermare con l'accelerometro i timer finiti**: quando un timer (recupero o esercizio a tempo) è finito e lo schermo pulsa, basta muovere o scuotere il telefono per fermarlo, senza toccarlo. Su iPhone serve un tocco una volta sola per dare il permesso al movimento.
- **Il recupero cambiato durante l'allenamento si salva?** Dal codice sì: con − / + si salva subito, per quell'esercizio e in tutte le schede (`recMap`, in `schede/<uid>`). Da provare sul telefono: cambiarlo, chiudere l'app, riaprirla.
- **Salvare ogni modifica durante l'allenamento, anche prima di "Fatto"**: oggi chili e ripetizioni cambiati restano solo in memoria finché non si tocca "Fatto"; se nel frattempo si chiude l'app si perdono. Da salvare subito (sul telefono e poi su Firebase) e ritrovarli riaprendo.

## Sfide: fatte (novità di novembre 2026)

In futuro: rivedere/ampliare l'elenco delle sfide (oggi Plank, Barchetta, Addominali, Squat, Affondi).

## "Cin": telefoni che si toccano (per casi futuri)

Due telefoni che si urtano registrano un picco dell'accelerometro nello stesso istante; il server abbina i due colpi (stessa frazione di secondo) e sa che le due persone erano davvero insieme. Usi possibili: confermare il risultato di una sfida al posto del "✓ Confermo", dare il bonus amici solo se ci si è incontrati davvero, dire "Ci sto" a una sfida con un brindisi. Limiti: app aperta e schermo acceso, un tocco per dare il permesso al movimento (iOS).

## Shop e pubblicità (idea futura)

- **Shop con merchandising** di Palestrina (magliette, borracce, ecc.), come **ordine di gruppo**:
  - nello Shop ognuno sceglie prodotto e taglia e tocca "Prenota"; le prenotazioni finiscono in un foglio (come i check-in);
  - subito dopo, un tasto apre PayPal o Satispay con l'importo già compilato, verso Francesco;
  - una volta al mese (o raggiunti N pezzi) un solo ordine a una tipografia locale o a uno stampatore online: prezzi più bassi, niente scorte (si ordina solo quello già prenotato e pagato), consegna a mano in palestra.
  - **Prodotti sbloccabili**: legati al gioco, per esempio la maglietta del Re del mese acquistabile solo da chi è stato Re, o sconti per chi ha più punti.
- **Linea (decisa)**: solo il **logo a colori**; tutta la linea **scura ma non nero pieno** (antracite / grigio scuro melange) con il logo.
  - Borraccia: quella **con cannuccia** (600 ml) di Spreadshirt.
  - Pantaloncini con tasche, da **Printful** (nessun minimo; Hidalgo scartato: minimo 10 pezzi per taglia):
    - tecnici, tasche in rete, stampa all-over (colore a scelta, ~31 $): https://www.printful.com/it/prodotti/uomo/pantaloncini/pantaloncini-lunghi-sportivi-stampa-all-over
    - in felpa con tasche laterali e posteriore (~26 $): https://www.printful.com/it/prodotti/uomo/pantaloncini/pantaloncini-tuta-uomo-independent-trading-co-ind20srt
  - Asciugamano: **Printful** Hand Towel, 71 × 41 cm, stampa a sublimazione (colore a scelta, ~10 $): https://www.printful.com/custom/home-living/all/hand-towel
- **Prodotti scelti**:
  - Maglietta tecnica grigia melange (Spreadshirt, logo piccolo sul cuore, verde o a colori): https://www.spreadshirt.it/creare-da-se?productType=1310&appearance=1513&size=
  - Sacca sportiva nera (Spreadshirt, logo e scritta "palestrina" al centro, verde o a colori): https://www.spreadshirt.it/creare/dettaglio/sacca-sportiva-PT1155?appearance=2
- **Pubblicità / sponsor** nell'app: studio notarile, medico endocrinologo, studio dentistico, azienda di robot, ecc.

## Altre versioni dell'app

- **iPhone Fold** (pieghevole): da aperto lo schermo è quasi quadrato, quindi due colonne invece di una, per esempio chat e calendario affiancati, oppure classifica accanto a Home. Da chiuso resta l'app di oggi. Si fa con il CSS (layout diverso sopra una certa larghezza) senza toccare il server; da provare sul dispositivo vero per margini e cerniera.
- **Versione desktop**: la stessa PWA aperta dal computer (installabile anche da Chrome/Edge/Safari). Barra laterale al posto della barra in basso, contenuto centrato e più largo, chat a destra sempre visibile. Le notifiche web funzionano anche da desktop.
- **Versioni leggermente personalizzate per ogni partecipante**: stessa app per tutti, ma con piccoli tocchi personali legati al nome:
  - un colore d'accento scelto da ognuno (lime, rosa, azzurro…) usato per pulsanti e anello dell'obiettivo;
  - avatar o emoji personale vicino al nome in chat e in classifica;
  - saluto e frasi motivazionali su misura (per esempio "Bentornato Re" per chi ha la corona, record personali, serie di settimane di fila);
  - obiettivo settimanale personale già previsto dal foglio (colonna C) messo più in evidenza;
  - impostazioni salvate sul server (foglio Utenti) così seguono la persona su ogni dispositivo.

## Schede della palestra (prossima cosa grossa)

Ricordare pesi e ripetizioni per macchina/esercizio, come Hevy, Strong, Fitbod, Alpha Progression.

- **Basi**: per ogni esercizio "Ultima volta: 3×10 a 45 kg" con "Uguale" / "+2,5 kg"; schede personali (A/B, Push/Pull/Gambe); recupero automatico con il timer silenzioso che c'è già; serie salvate sul telefono e inviate quando torna la rete (in palestra spesso non c'è campo).
- **Il nostro vantaggio**: catalogo condiviso delle macchine della NOSTRA palestra, con regolazioni personali (sedile, schienale) e foto; "Inizia scheda A?" dopo il check-in; record in chat ("Nuovo record di Rizzo sulla panca").
- **Dati**: fogli Esercizi (nome, tipo, gruppo muscolare, chi l'ha aggiunto), Schede (di chi, nome, esercizi in ordine), Serie (data, persona, esercizio, kg, ripetizioni); il server manda solo il riepilogo "ultima volta".
- **Deciso (18/10): su Firebase (Firestore) fin dall'inizio**, non su fogli/Apps Script: in palestra spesso non c'è campo e Firebase salva sul telefono e invia appena torna la rete; serie e "ultima volta" in tempo reale. Accesso con lo stesso permesso della chat (custom token del server). Punti o penalità eventuali li calcola Apps Script leggendo da Firebase. Quindi i fogli Esercizi/Schede/Serie qui sotto diventano raccolte Firestore.
- **Fase 1 fatta (20/10), in modalità prova e per Francesco anche fuori (WORKOUT_USERS in Code.gs, dati veri in `serie` e `schede`)**: esercizi in ordine libero ("Cambia esercizio", puntini toccabili), tab Allenamento al posto di Timer (timer dentro), la scheda A di Francesco (dalla foto del 20/10, con serie × ripetizioni e note; prima pagina "Mobilità" da spuntare (5 minuti); sit-up, plank e barchetta come "Circuito addome" da 3 giri, anche guidato), catalogo di esempio, serie su Firebase (`prova_serie`, `prova_schede`, regole in `firestore.rules`), "ultima volta", recupero di 1:30, allenamento libero dal catalogo; senza rete le serie restano sul telefono e partono dopo. Codice in `public/allenamento.js`.
- **Fase 2 fatta (21/10), solo per Francesco**: matita su ogni scheda → modifica (nome, esercizi trascinando ≡, × per togliere, foglio serie × ripetizioni con scelte rapide e nota, circuiti con giri/recupero/esercizi, Elimina); "+ Nuova scheda"; "+ Esercizi" dal catalogo a spunte con "Nuova macchina" (nome, gruppo, kg/rip/tempo/metri); "Copia una scheda" (per persona: quelle inserite per Rizzo, Ceppo, Gualo e, quando avranno accesso, le loro); "Salva come scheda" dopo l'allenamento libero; recupero con − + ricordato per esercizio. Tutto in `schede/<uid>` = { list, extra, rec }: al primo salvataggio ci finiscono le schede di esempio del codice, da lì contano solo quelle del documento. Niente avviso al check-in.
- **Fasi**: 1 diario (catalogo, serie, ultima volta, recupero, senza rete) → 2 schede e partenza dal check-in → 3 progressi (record, grafici) → 4 gioco (record in chat, punti/sfide, dormiente).
- **Deciso (16/10)** — proposta grafica: https://claude.ai/artifact/XtjfhUp7MWgbWBywSjDMQH
  - Tab **Allenamento** al posto di Timer (timer dentro). Nessun avviso al check-in: è il tab che propone la scheda da fare (quella non fatta da più tempo).
  - Per ogni esercizio solo **"l'ultima volta"** (serie, ripetizioni, kg): niente peso consigliato, niente obiettivo serie×rip nella scheda.
  - Scheda della macchina con foto e "chi la usa". **Tutto visibile** al gruppo.
  - Grafico dei progressi (peso migliore, volume), senza massimale.
  - Schede create da ognuno per sé: "Nuova scheda" → esercizi dal catalogo comune (ricerca, filtro per gruppo) o "+ Nuova macchina"; "Copia la scheda di…"; "Allenamento libero" → "Salva come scheda". Ognuno modifica solo le sue; l'admin sistema il catalogo (nomi, doppioni).
  - **Catalogo fittizio** per partire; il catalogo vero con un processo da concordare (idea: Francesco manda le foto di tutte le macchine e Claude lo compila).
  - Prova solo per Francesco (elenco TESTERS sul server, codice in un file separato, fogli nuovi), poi rilascio con le slide.
  - **Per dopo**: regolazioni personali, record in chat, punti del gioco.
  - **Scartati**: massimale stimato e peso consigliato automatico (anche per il futuro).
  - **Tecnica corretta** di ogni esercizio: trovare un modo per mostrarla (video brevi, animazione, altro), da decidere.

## Sudometro: strade alternative (da valutare con più dati)

Il Sudometro 2 gira in silenzio dal 15/10 (Dettagli del foglio). Altre idee, dalla più promettente:
1. **Selfie d'ingresso** al check-in come riferimento del giorno (stesso posto e luce).
2. **Flash dello schermo**: due fotogrammi con e senza schermo bianco, la differenza isola la riflessione della pelle.
3. **Breve video** muovendo la testa: i riflessi del sudore si spostano, la pelle no; meno foto mosse.
4. **Capelli bagnati**: più scuri, appiccicati e lucidi rispetto al riferimento.
5. **Punteggio rispetto a sé stessi** (storico personale).
6. **Modello addestrato** sulle nostre foto etichettate, quando saranno qualche decina.
Inoltre: rifiutare le foto di riferimento mosse (dormiente, insieme al Sudometro 2).

## Cartine dei personaggi (idea della Michy)

Ogni volta che uno diventa Re del mese sale di livello: il suo personaggio cambia ed evolve, mostrato con una cartina (carta collezionabile).
- Si parte tutti dal livello **Orbit**; poi, per esempio, **Amotti → Itoi → Enkh → Ongil** (nomi e ordine da confermare con la Michy).
- Da decidere: disegni delle cartine (una per livello, forse personalizzata per persona), dove si vedono (profilo, classifica, accanto al nome in chat), animazione di "salita di livello" nel riepilogo di fine mese, se si può anche scendere.
- Da rilasciare come novità dormiente, dopo un'incoronazione del Re.

## Mese a squadre (gennaio, per ora)

Un mese "speciale" con regole diverse dal solito, da rilasciare come novità dormiente a fine dicembre:

- **Sfida a squadre**: il gruppo diviso in squadre (a sorte o scelte), i punti di ognuno vanno alla squadra; classifica delle squadre al posto (o accanto) a quella personale, squadra vincitrice nel riepilogo di fine mese.
- Da decidere: come si attiva un mese speciale (dal foglio o in modalità debug), quali sfide oltre alle squadre, se ha medaglie dedicate.

## Sondaggio: tornare al senso di "domanda"

Con la pianificazione dei 7 giorni il sondaggio sembra un calendario da compilare. Proposte da scegliere:

1. Domande solo su richiesta, per qualsiasi giorno ("Chiedi a tutti" su un giorno → notifica a tutti).
2. Pallino rosso "devi rispondere" sul tab Chat e sul giorno, con "Giulia ti chiede: giovedì ci sei?".
3. Chi non ha risposto per nome ("Mancano: Paolo, Sara") invece del numero.
4. Un solo promemoria automatico a chi non ha risposto, qualche ora dopo la domanda.

Consigliato: 1 + 2 + 3, il 4 solo se serve.

## Tutto su Firebase (piano B, in prova dal 19/10)

Il telefono parla solo con Firebase; Apps Script resta il motore dietro le quinte (coda delle azioni, punti, penalità, sfide, recap, notifiche, accesso col codice), con le tabelle su Firestore (`db/<tabella>`, adattatore con la stessa interfaccia dei fogli) e le foto in `foto/`. In prova già attivo (`prova_db`, `prova_stato`, `prova_azioni`); interruttori e passaggio nel README ("Tutto su Firebase"). Provato in locale con `tools/firebase-prova/test-tutto.js` (anche con `VERO=1`, la configurazione per tutti).

## Chat su Firebase (in corso)

La chat oggi chiede al server ogni 5 secondi se ci sono novità (Apps Script + foglio: 1–6 s di ritardo). Con Firebase (Firestore) il telefono resta collegato e i messaggi arrivano in meno di mezzo secondo, con copia sul telefono e invio senza campo.
- Accesso: il server di oggi verifica il codice e rilascia un permesso Firebase (custom token firmato con la chiave dell'account di servizio, tenuta solo nelle proprietà dello script, mai nel repo).
- Il resto dell'app resta su Apps Script; le notifiche restano su GitHub (più avanti, forse FCM).
- Fasi: 1 progetto Firebase (Francesco) → 2 messaggi in tempo reale solo per Francesco in prova → 3 sondaggio, piani, eventi automatici, cancella/silenzia → 4 copia dello storico e passaggio per tutti.
- **Fase 2 fatta (17/10)**: in modalità prova i messaggi scritti vanno su Firestore (`prova_chat`), sondaggio ed eventi restano su Apps Script. Regole in `firestore.rules` (copiate a mano nella console). Provata in locale con l'emulatore: 0,2 s tra due telefoni.
- **Fase 3 fatta (17/10)**: in prova il server scrive lo stato della chat (sondaggio, piani, eventi, sfide) su Firestore (`prova_state/chat`) a ogni cambiamento; i telefoni lo ricevono subito e chiedono ad Apps Script solo ogni minuto. Cancellazione dei messaggi Firebase e notifiche passano dal server.
- **Fase 4 pronta (18/10, ramo `claude/firebase-fase4`, non attiva)**: passaggio per tutti con l'interruttore `FIREBASE_CHAT` nelle proprietà dello script (`tutti` = acceso, `spento` = tutti tornano al foglio subito) oppure come novità dormiente (feature `firebase` in `NEWS`).
  - Il foglio Chat resta lo storico completo: i messaggi scritti su Firebase ci vengono copiati dal server (a ogni invio, ogni 30 s quando qualcuno chiede la chat, ogni ora); quelli scritti da Apps Script (versioni vecchie, Firebase bloccato) vanno su Firebase con lo stesso id. Niente doppioni.
  - Ritorno automatico ad Apps Script: SDK che non si carica → si riprova fra 5 minuti; Firestore che non risponde → si torna a chiedere ogni 5 s e si scrive dal server; i messaggi rimasti in attesa partono da Apps Script dopo 10 s con lo stesso id.
  - Storico: `copiaChatSuFirebase()` dall'editor, ripetibile.
  - Provata in locale: `tools/firebase-prova` (emulatore, finto Apps Script, tre telefoni).
- **Sondaggio su Firebase (18/10, in prova)**: domande in `domande/<giorno>` e risposte in `piani/<giorno>_<uid>` (in prova `prova_domande`, `prova_piani`), scritte dal telefono: gli altri le vedono in ~0,2 s. Il server le copia dopo nei fogli Chat e Piani (con Cambi e notifiche, azione `fbSync`) e copia su Firebase quelle arrivate da lui. Le regole controllano nome, risposta, orario, giorno e che per quel giorno ci sia la domanda; senza regole nuove il sondaggio torna da solo al server.
