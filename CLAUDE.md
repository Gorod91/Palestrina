# Note per Claude

- L'app è live e la usano gli amici: le modifiche a `public/` e `apps-script/` arrivano a tutti appena pushate su `main`.
- **Nuove funzioni, punteggi o sfide visibili agli altri: chiedere sempre prima** se vanno attivate subito oppure implementate "dormienti" (invisibili) e attivate alle 21 dell'ultimo giorno del mese insieme all'incoronazione del Re: le slide (precedute da quella del Re, `public/news/re.js`) si aprono da sole a tutti alla prima apertura dell'app e restano in chat.
- Risposte all'utente in italiano, brevi: report circa il 40% più corti di una risposta "media" (solo l'essenziale: cosa è cambiato, cosa è stato provato, cosa serve decidere).
- Codici personali, ADMIN_SECRET, token e `.clasprc.json` non vanno mai scritti nel repo né letti se non serve.
- Novità dormienti: aggiungerle in `NEWS` (`apps-script/Code.gs`), controllare la funzione con `featureOn('nome')` (punti da `featureFrom`), slide brevi in `public/news/<id>.html` nello stile della presentazione (vedi `public/news/2026-11.html`). Provarle con la modalità prova → "Simula il rilascio delle novità".
- **Slide delle novità: usare sempre lo stile di `public/news/2026-11.html`**: a storia (barre in alto, tocco per avanzare, × per chiudere), sfondo nero, Inter, titoli grandi con gradiente lime/azzurro/rosa, animazioni che partono a ogni slide, poche slide brevi, titoli chiari e comprensibili (non solo ad effetto). Dare del "voi".
- Obiettivo settimanale: oggi 2 ingressi per tutti (colonna C del foglio Utenti).
- Schede di allenamento: chi ha già salvato le sue usa la copia su Firebase (`schede/<uid>`). Per sistemarle aggiungere un aggiornamento mirato in `AGGIORNAMENTI` (`public/allenamento.js`, id nuovo crescente) e fare la stessa modifica in `SCHEDE_ESEMPIO`.
- Note di rilascio (Impostazioni → Note di rilascio, `public/note.js`): aggiungere ogni modifica visibile a tutti nella versione in corso. Le novità dormienti vanno in una versione con `news: '<id>'` (e `feature` per le sorprese), così compaiono solo dopo il rilascio. Niente cose di admin, prova, debug o ritocchi fatti senza annunci.
