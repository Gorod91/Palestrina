# Idee per più avanti

Cose di cui abbiamo parlato ma che non sono ancora nell'app.

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

## Chat su Firebase (in corso)

La chat oggi chiede al server ogni 5 secondi se ci sono novità (Apps Script + foglio: 1–6 s di ritardo). Con Firebase (Firestore) il telefono resta collegato e i messaggi arrivano in meno di mezzo secondo, con copia sul telefono e invio senza campo.
- Accesso: il server di oggi verifica il codice e rilascia un permesso Firebase (custom token firmato con la chiave dell'account di servizio, tenuta solo nelle proprietà dello script, mai nel repo).
- Il resto dell'app resta su Apps Script; le notifiche restano su GitHub (più avanti, forse FCM).
- Fasi: 1 progetto Firebase (Francesco) → 2 messaggi in tempo reale solo per Francesco in prova → 3 sondaggio, piani, eventi automatici, cancella/silenzia → 4 copia dello storico e passaggio per tutti.
- Da verificare: se il Wi-Fi aziendale di Michy blocca anche Firebase.
