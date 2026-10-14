# Note per Claude

- L'app è live e la usano gli amici: le modifiche a `public/` e `apps-script/` arrivano a tutti appena pushate su `main`.
- **Nuove funzioni, punteggi o sfide visibili agli altri: chiedere sempre prima** se vanno attivate subito oppure implementate "dormienti" (invisibili) e attivate alle 21:05 dell'ultimo giorno del mese, dopo l'incoronazione del Re, con le slide delle novità inviate in chat.
- Risposte all'utente in italiano, di lunghezza media.
- Codici personali, ADMIN_SECRET, token e `.clasprc.json` non vanno mai scritti nel repo né letti se non serve.
- Novità dormienti: aggiungerle in `NEWS` (`apps-script/Code.gs`), controllare la funzione con `featureOn('nome')` (punti da `featureFrom`), slide brevi in `public/news/<id>.html` nello stile della presentazione (vedi `public/news/2026-11.html`). Provarle con la modalità prova → "Simula il rilascio delle novità".
