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
