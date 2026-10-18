# 🏋️ Palestrina

Web app (grafica in stile Apple Fitness) per rendere più divertente la palestra tra amici: check-in con un tap, classifica settimanale, streak, timer addominali, **Sudometro** (selfie da sudato contro una foto di riferimento) e notifiche su iPhone. Costo zero, niente App Store.

## Come è fatta

```
iPhone (web app su GitHub Pages)
   │  check-in, Sudometro, iscrizione notifiche
   ▼
Google Apps Script ──► Google Sheet (Utenti, Presenze, Sudometro, Iscrizioni)
   │  "c'è da avvisare il gruppo"
   ▼
GitHub Action "Notifiche" ──► Web Push (server Apple) ──► iPhone degli amici
```

- `public/`: la web app. Le foto del Sudometro vengono analizzate sul telefono con MediaPipe; poi la foto (JPEG ridotto) viene salvata su Google Drive e il punteggio nel foglio.
- `apps-script/Code.gs`: backend. Gira con l'account Google di Francesco, quindi gli amici non fanno login Google ma usano un codice personale.
- `.github/workflows/notifiche.yml` + `scripts/send.js`: invio delle notifiche, avviato da Apps Script a ogni check-in, a ogni Sudometro e la domenica alle 19 per il recap.
- `.github/workflows/pages.yml`: pubblicazione su GitHub Pages.

## Configurazione (una volta sola)

### 1. GitHub Pages
*Settings → Pages → Build and deployment → Source: **GitHub Actions***. Poi *Actions → Pubblica su GitHub Pages → Run workflow*.
Indirizzo: `https://<utente>.github.io/Palestrina/`

### 2. Google Sheet + Apps Script
1. Crea un nuovo Google Sheet (es. "Palestrina").
2. *Estensioni → Apps Script*. Cancella il contenuto e incolla `apps-script/Code.gs`.
3. *Impostazioni progetto* (ingranaggio) → **Fuso orario: (GMT+01:00) Roma**.
4. Torna all'editor, scegli la funzione **`setup`** e premi **Esegui**. Autorizza l'accesso (*Avanzate → Vai a … (non sicuro)*: lo script è tuo).
   Crea i fogli e il trigger del recap della domenica. Nel *Log di esecuzione* compare l'**ADMIN_SECRET**: copialo.
5. Nel foglio **Utenti** scrivi i nomi degli amici e l'obiettivo settimanale (colonna C, predefinito 3). Poi esegui **`generaCodiciMancanti`**: crea i codici personali da mandare a ognuno.
6. *Esegui il deployment → Nuovo deployment →* tipo **App web**.
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**

   Copia l'**URL dell'app web** (finisce con `/exec`).
7. Su GitHub apri `public/config.js` (matita ✏️ per modificare), incolla l'URL al posto di `INCOLLA_QUI_URL_APPS_SCRIPT` e fai *Commit changes*. Il sito si aggiorna da solo in un minuto.

> Se modifichi `Code.gs` a mano (incollando la nuova versione dal repo), pubblica di nuovo con *Esegui il deployment → Gestisci deployment → ✏️ → Versione: Nuova versione*: l'URL resta lo stesso.

### 3. Notifiche
1. **Token GitHub per Apps Script**: *GitHub → Settings (del tuo profilo) → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   - Repository access: **Only select repositories → Palestrina**
   - Permissions → Repository permissions → **Contents: Read and write**
   - Scadenza: la più lunga disponibile (va rinnovato quando scade)
2. In Apps Script: *Impostazioni progetto → Proprietà script → Aggiungi proprietà*:
   - `GITHUB_TOKEN` = il token appena creato
   - `GITHUB_REPO` = `<utente>/Palestrina`
3. Su GitHub: *Settings → Secrets and variables → Actions → New repository secret*, tre volte:
   - `APPS_SCRIPT_URL` = l'URL `/exec` del punto 2.6
   - `APPS_SCRIPT_SECRET` = l'ADMIN_SECRET del punto 2.4
   - `VAPID_PRIVATE_KEY` = la chiave privata che corrisponde alla `vapidPublicKey` di `public/config.js`

   Per una coppia di chiavi nuova: `npx web-push generate-vapid-keys`, poi metti la pubblica in `config.js` e la privata nel secret.

**Prova**: apri l'app dalla Home, tocca **Attiva notifiche** e consenti. Entro circa un minuto arriva "Notifiche attive ✅". Se non arriva, guarda *Actions → Notifiche*: l'errore è scritto lì.

### 4. Aggiornamento automatico di Apps Script (facoltativo)
Con questa configurazione ogni modifica a `apps-script/` su GitHub viene caricata da sola in Apps Script e pubblicata sullo stesso URL (workflow `.github/workflows/apps-script.yml`, usa [clasp](https://github.com/google/clasp)). Niente più copia-incolla.

1. Attiva l'API: **https://script.google.com/home/usersettings** → **API Google Apps Script** → **On**.
2. Sul computer (serve [Node.js](https://nodejs.org)): da terminale esegui `npx @google/clasp@3.4.1 login`, accedi con l'account Google del foglio e consenti.
   Viene creato il file `.clasprc.json` nella cartella utente (`~/.clasprc.json` su Mac/Linux, `C:\Users\<nome>\.clasprc.json` su Windows).
3. Su GitHub, *Settings → Secrets and variables → Actions*, aggiungi:
   - `CLASPRC_JSON` = tutto il contenuto di `.clasprc.json`
   - `APPS_SCRIPT_ID` = *Apps Script → Impostazioni progetto → ID script*
4. *Actions → Aggiorna Apps Script → Run workflow* per la prima prova.

> Il file `.clasprc.json` dà accesso ai tuoi progetti Apps Script: tienilo solo nel secret. Per revocarlo: https://myaccount.google.com/permissions → clasp → Rimuovi accesso.

## Cosa fanno gli amici

> Apri il link in **Safari** → **Condividi** → **Aggiungi alla schermata Home** → apri l'icona **Palestrina** → inserisci il **codice** → **Attiva notifiche** → **Consenti**.

Serve iOS 16.4 o successivo. Il codice resta salvato: va reinserito solo se si cancella l'app o si cambia telefono, e i dati non si perdono perché stanno sul foglio.

## Notifiche che arrivano

| Quando | A chi | Esempio |
|---|---|---|
| Check-in | tutti tranne chi l'ha fatto | Marco è in palestra. Presenza n. 2 della settimana. E tu dove sei? |
| Sudometro | tutti tranne chi l'ha fatto | Sudometro di Anna: 78. "Pomodoro maturo" |
| Domenica alle 19 | tutti | Premiazioni della settimana: MVP, Divano d'oro, Pomodoro |
| Ultimo giorno del mese alle 21 | tutti | Premiazioni del mese e Re del mese (albo d'oro) |
| Domanda "chi va in palestra oggi?" | tutti tranne chi la fa | Marco chiede: chi va in palestra oggi? |
| Risposta alla domanda | solo chi l'ha fatta | Anna: ci sono alle 18:30 |
| Messaggio in chat | gli altri (max 1 ogni 5 min a persona, silenziabile) | Marco: Chi viene stasera? |
| Attivazione | solo chi le attiva | Notifiche attive |

Si possono anche inviare a mano: *Actions → Notifiche → Run workflow*.

## Sudometro

1. **Una volta sola**: foto di riferimento da riposato, meglio in palestra, nel punto e con la luce dove si faranno i selfie da sudato. Si può rifare quando si vuole ("Rifai la foto di riferimento").
2. **Ogni volta**: un selfie da sudato al momento peggiore dell'allenamento, **uno al giorno**.
3. Il telefono confronta il selfie con la foto di riferimento e calcola un punteggio da 0 a 100:
   - **Rossore** (60 punti): aumento del canale a* (spazio colore Lab) su guance e fronte
   - **Lucidità** (40 punti): pixel molto chiari e poco saturi su fronte e naso, con soglia relativa alla luminosità del viso

   Le espressioni del viso (smorfie, occhi, bocca) non contano: si falsano troppo facilmente.

I valori della foto di riferimento stanno nelle proprietà di Apps Script (chiave `ref_<nome>`), così sopravvivono anche se si reinstalla l'app.

**Ritaglio**: lo scatto viene ritagliato attorno al viso (3:4, con un po' di margine), così miniatura e foto aperta mostrano la stessa cosa.

**Foto su Google Drive**: tutte le foto (riferimento, selfie da sudato, prove di debug) finiscono nella cartella *Palestrina - Foto Sudometro* del Drive di chi ha pubblicato lo script, con una sottocartella per ogni amico. Il foglio Sudometro tiene l'ID del file nella colonna *Foto*.
Una volta sola, dopo l'aggiornamento: nell'editor di Apps Script esegui **`autorizzaDrive`** e consenti l'accesso a Drive (crea anche la cartella).

**Sudometro della settimana**: nell'app, i selfie da sudato della settimana in ordine di punteggio, visibili a tutto il gruppo. Le foto restano private nel Drive: l'app le chiede ad Apps Script con il codice personale, e lo script restituisce solo i file elencati nel foglio Sudometro (niente foto di riferimento, niente prove di debug, nessun altro file del Drive).

Titoli: sotto 20 "Fresco come una rosa", poi "Appena tiepido", "Si comincia a sudare", da 60 "Pomodoro maturo", da 85 "Lava incandescente".
I pesi (`WEIGHTS`) e le soglie (`TITLES`) sono in `public/sudometro.js`, da tarare sui primi selfie veri. Nel foglio, la colonna *Dettagli* registra i valori grezzi di ogni componente.

**Anti-furbizia**: solo fotocamera dal vivo (niente galleria), un check-in e un Sudometro al giorno, controllati da Apps Script.

### Sudometro 2 (in prova silenziosa)
Dall'ottobre 2026 a ogni selfie da sudato l'app calcola anche il punteggio della versione 2, senza mostrarlo: finisce nella colonna *Dettagli* del foglio Sudometro (`v2`), insieme ai valori grezzi delle due foto (`rif` e `sud`: luminosità `L`, tinta `h`, riflessi per zona `hl` (fronte `f`, naso `n`, zigomi `z`), nitidezza `sh`, correzione della luce `g`), per tarare i pesi prima del rilascio. La foto di riferimento si rianalizza dalla sua copia su Drive: nessuno deve rifarla.
- **Colori corretti sulla luce**: la dominante dello sfondo viene neutralizzata a metà.
- **Rossore come tinta** della pelle su zigomi e fronte bassa (non cala quando il selfie è più scuro, come invece a*), scartando ombre, barba e riflessi.
- **Lucidità relativa, zona per zona** (fronte, naso, zigomi): quanto i punti più chiari staccano dalla pelle intorno; si fa la media degli aumenti e una zona in calo (es. faretto sulla fronte nel riferimento) conta 0.
- **Scatto da rifare, una volta sola**: luce molto diversa dal riferimento ("più luce" / "meno luce") o foto mossa ("tieni fermo il telefono"); se anche il secondo non va, si tiene il meno peggio con il punteggio ridotto (×0,7).
Pesi e soglie in `WEIGHTS2` e `QUALITY2` di `public/sudometro.js`. Diventa il punteggio ufficiale (con la richiesta di rifare lo scatto) quando si aggiunge `sudometro2` alle funzioni di una novità in `NEWS`.

### Sudometro 3 (in prova silenziosa, dal 18/10/2026)
Calcolato dalle stesse analisi del 2 e salvato accanto (`v3` in *Dettagli*: punteggio, parti e riflessi per zona `rif`/`sud`, con le tempie `t`). Differenze, dalle foto diagnostiche: i pixel scuri (capelli, sopracciglia) non contano nei riflessi; tempie come zona in più; se la luce cambia più di 8 il rossore si ignora (`redOk: false`) e il lucido vale fino a 70 punti; lucido pieno a 10. Pesi e soglie in `WEIGHTS3` e `QUALITY3`.

### Alias
Nel tab **Impostazioni → Profilo** ognuno può scegliere un **nome visualizzato** (colonna **E "Alias"** del foglio Utenti), usato in classifica e nelle notifiche. Il nome della colonna A resta quello originale e collega tutti i dati (presenze, foto, cartelle su Drive, debug), quindi non va cambiato. Alias vuoto = si vede il nome originale.

### Modalità debug
Scrivi `sì` nella colonna **D (Debug)** del foglio Utenti. Quell'utente vede il pulsante **Prova subito (debug)**, utile per provare e tarare il Sudometro:
- si può ripetere quante volte si vuole, anche dopo il Sudometro del giorno;
- mostra i valori grezzi di ogni componente;
- con la fotocamera aperta mostra i parametri **in tempo reale** (luce, rossore, lucidità, punteggio live rispetto alla foto di riferimento) e le zone del viso misurate: fronte in azzurro, guance in rosso, naso in verde;
- nel foglio finisce con `sì` nella colonna *Debug*, non conta in classifica né nel recap e non avvisa nessuno.

### Admin

Solo per chi è in `ADMIN_USERS` (in `Code.gs`, oggi Francesco): in **Impostazioni → Admin → Registro admin** ci sono check-in, Sudometro, messaggi, domande, risposte e penalità degli ultimi 31 giorni di tutti. Ogni voce si può **annullare** (le penalità si **condonano**) e ogni annullamento si può **ripristinare** dal filtro *Annullati*: le righe tolte restano nel foglio **Annullati** e le foto vanno nel cestino di Drive. Si possono anche aggiungere check-in dimenticati, pure per giorni passati. Nessuna di queste azioni manda notifiche.

### Modalità prova

Solo admin, in **Impostazioni → Admin → Modalità prova** (in alto compare la scritta blu **PROVA**). Le richieste girano davvero su Apps Script, ma:
- check-in, Sudometro, chat, risposte, cambi e annullamenti finiscono nei fogli **Prova · …**, copiati da quelli veri al primo uso;
- le proprietà dello script (foto di riferimento, chat silenziata, albo d'oro…) vengono copiate alla prima modifica come `prova_…`;
- le notifiche arrivano solo a chi prova, con **[PROVA]** nel titolo e l'elenco di chi le avrebbe ricevute;
- nessuna foto vera finisce nel cestino, l'alias non si cambia.

Con la prova attiva c'è **Agisci come**: si sceglie un altro utente e l'app si comporta come se fosse lui (check-in, sfide, risposte, conferme), sempre sui dati di prova e con le notifiche solo a chi prova; in alto compare "PROVA · nome". Ci sono anche **Simula il recap della settimana**, **Simula le premiazioni del mese** e **Riallinea la prova ai dati veri** (cancella fogli e proprietà di prova). Il check-in automatico di Comandi resta sempre vero.

### Novità dormienti

Le funzioni nuove si preparano "dormienti": si aggiungono in `NEWS` in `Code.gs` (id, mese di rilascio, giorno da cui contano i punti, funzioni coinvolte, titolo e testo della notifica) con le slide in `public/news/<id>.html`. Restano invisibili finché, l'ultimo giorno del mese, subito dopo le premiazioni del mese (trigger delle 21, verso le 21:05), il server le rilascia: evento **Novità** in chat con il tasto *Guarda le novità* (slide a tutto schermo) e notifica a tutti. Se il trigger non parte, il rilascio avviene alla prima apertura dell'app dopo le 23 o nei giorni successivi. In modalità prova il tasto **Simula il rilascio delle novità** le mostra in anticipo, e i loro punti contano da subito.

Novità di novembre 2026 (dal 1° novembre):
- **Apripista**: chi fa per primo la domanda "chi va in palestra?" per un giorno e quel giorno fa check-in;
- **Oltre l'obiettivo**: ogni ingresso della settimana dopo quelli dell'obiettivo (con obiettivo 2: dal terzo in poi).
- **Sfide** (+5 a chi vince, +2 a chi partecipa) — annunciate come **sorpresa**: le slide di novembre non dicono cosa sono; alla prima volta che due fanno check-in insieme compaiono in chat la card "Sorpresa svelata: le sfide!" (slide `public/news/sfide.html`) e la prima sfida, sempre Plank. Fino ad allora la regola non compare nella "i". quando almeno due persone fanno check-in a meno di un'ora l'una dall'altra, in chat si apre una sfida a caso (Plank, Barchetta, Addominali, Squat, Affondi; mai la stessa due volte di fila). Chi ha fatto check-in dice "Ci sto" o "Passo" entro un'ora. Plank e Barchetta: un partecipante dichiara chi ha vinto, un altro conferma. Addominali, Squat e Affondi: ognuno scrive le ripetizioni (fino allo sfinimento), un altro conferma; vince chi supera di più il proprio record degli ultimi 60 giorni (la prima volta è calibrazione). Un risultato contestato si corregge una volta, alla seconda vale solo la partecipazione. Chiusura quando tutto è confermato o a mezzanotte (trigger orario `sfideTick`, che manda anche il promemoria dopo 2 ore). Foglio **Sfide**; dal Registro admin si annulla una sfida o un singolo risultato.

### Aggiornamento automatico

A ogni pubblicazione la GitHub Action scrive il commit nel meta `app-version` di `index.html` e in `version.json`. Quando l'app si apre o torna in primo piano confronta le due versioni e, se è vecchia, si ricarica da sola (non mentre si scrive, si usa la fotocamera, c'è un'azione in corso o il timer è attivo).

## Chat

Tab **Chat**: messaggi del gruppo (ultimi 7 giorni) e, in cima, la domanda **"Chi va in palestra oggi?"**.
- Un giorno (oggi o uno dei 6 dopo, nella fila dei giorni) resta **chiuso** finché qualcuno non tocca **"Chiedi a tutti"**: parte la notifica a tutti e da lì si risponde con **Ci sono / Forse / No** e un **orario facoltativo** (ritoccare la risposta la toglie). Chi non ha ancora risposto a una domanda vede un **pallino rosso** sul tab Chat e sul giorno. Chi poi fa check-in risulta "arrivato".
- **Penalità** nei punti del mese (dettaglio nel pulsante "i" della Classifica): Bidone −10, Cambio all'ultimo −5, Ritardo −2 (check-in più di mezz'ora dopo l'orario detto), Check-in senza avvisare −3, Settimana a vuoto −5; il totale del mese può andare sotto zero. Valgono dal giorno in cui sono state introdotte (proprietà PENALTIES_FROM); i cambi di risposta si salvano nel foglio **Cambi**.
- **Vedi la settimana** apre, sotto la fila dei giorni, una riga per persona con le risposte dei 7 giorni: le proprie caselle si toccano per passare a Ci sono → Forse → No → niente. Le risposte stanno nel foglio **Piani**, creato da solo.
- Ogni domanda compare anche nella chat, evidenziata ("Marco chiede: chi va in palestra domani?"), con i pulsanti per rispondere al volo.
- In chat compaiono anche gli **eventi**: check-in, Sudometro (con la foto), **premiazioni della settimana** (domenica alle 19) e **premiazioni del mese** (l'ultimo giorno del mese alle 21: Re del mese, MVP, Divano d'oro e Pomodoro del mese).
- Notifiche: la domanda arriva a tutti; ogni risposta solo a chi l'ha fatta; i messaggi agli altri, al massimo una notifica ogni 5 minuti per persona. Si possono silenziare in **Impostazioni → Notifiche** (la domanda arriva comunque). Toccando la notifica si apre la chat.
- Dati nel foglio **Chat**, creato da solo al primo messaggio. L'app controlla i nuovi messaggi ogni 5 secondi solo mentre la chat è aperta.

## Timer addominali

Tab **Timer**: durata in alto (30 secondi di default, si cambia con − e + di 5 secondi o toccando il numero), poi il pulsante gigante **Inizia**. L'ultimo tempo usato è salvato per ogni account (in Apps Script), quindi resta anche cambiando telefono.
Il timer non suona: a fine tempo lo schermo pulsa lentamente in verde (meno di una volta al secondo, niente flash) finché non lo tocchi, e torna il pulsante Inizia. Toccando il cerchio mentre corre si annulla. Mentre corre, l'app chiede a iOS di tenere lo schermo acceso.

## Check-in automatico (Comandi iOS)

Nell'app, tab **Impostazioni**, sezione **Check-in automatico**: ognuno copia il proprio link personale (`…/exec?action=checkin&code=…`) e crea l'automazione in **Comandi → Automazione → + → Wi-Fi** → rete Wi-Fi della palestra (bisogna esserci collegati almeno una volta) → **Esegui immediatamente** → azione **Ottieni contenuto dell'URL** con il link.
Nel foglio Presenze, la colonna *Fonte* dice se il check-in è arrivato dall'app o dall'automazione.

## Sicurezza e privacy

- Il repo è pubblico (con l'account gratuito serve per GitHub Pages), ma non contiene segreti. Le chiavi stanno nei secret di GitHub e nelle proprietà di Apps Script.
- L'URL di Apps Script è in `config.js`, ma senza un codice personale valido non permette di leggere né scrivere niente. Le funzioni per la GitHub Action richiedono l'ADMIN_SECRET.
- Le foto stanno nel Drive di chi ha pubblicato lo script e non hanno link pubblici. I selfie da sudato li vede tutto il gruppo nell'app: va detto agli amici prima di iniziare. Nessuna posizione GPS: solo eventi con data e ora.

## Prossimi passi

- Tarare i pesi del Sudometro dopo 1-2 settimane di selfie veri
- Versione 2: record personali, sfida del lunedì, duelli
