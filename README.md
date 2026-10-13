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

**Foto su Google Drive**: tutte le foto (riferimento, selfie da sudato, prove di debug) finiscono nella cartella *Palestrina - Foto Sudometro* del Drive di chi ha pubblicato lo script, con una sottocartella per ogni amico. Il foglio Sudometro tiene l'ID del file nella colonna *Foto*.
Una volta sola, dopo l'aggiornamento: nell'editor di Apps Script esegui **`autorizzaDrive`** e consenti l'accesso a Drive (crea anche la cartella).

**Sudometro della settimana**: nell'app, i selfie da sudato della settimana in ordine di punteggio, visibili a tutto il gruppo. Le foto restano private nel Drive: l'app le chiede ad Apps Script con il codice personale, e lo script restituisce solo i file elencati nel foglio Sudometro (niente foto di riferimento, niente prove di debug, nessun altro file del Drive).

Titoli: sotto 20 "Fresco come una rosa", poi "Appena tiepido", "Si comincia a sudare", da 60 "Pomodoro maturo", da 85 "Lavatrice in centrifuga".
I pesi (`WEIGHTS`) e le soglie (`TITLES`) sono in `public/sudometro.js`, da tarare sui primi selfie veri. Nel foglio, la colonna *Dettagli* registra i valori grezzi di ogni componente.

**Anti-furbizia**: solo fotocamera dal vivo (niente galleria), un check-in e un Sudometro al giorno, controllati da Apps Script.

### Alias
Nel tab **Altro → Profilo** ognuno può scegliere un **nome visualizzato** (colonna **E "Alias"** del foglio Utenti), usato in classifica e nelle notifiche. Il nome della colonna A resta quello originale e collega tutti i dati (presenze, foto, cartelle su Drive, debug), quindi non va cambiato. Alias vuoto = si vede il nome originale.

### Modalità debug
Scrivi `sì` nella colonna **D (Debug)** del foglio Utenti. Quell'utente vede il pulsante **Prova subito (debug)**, utile per provare e tarare il Sudometro:
- si può ripetere quante volte si vuole, anche dopo il Sudometro del giorno;
- mostra i valori grezzi di ogni componente;
- con la fotocamera aperta mostra i parametri **in tempo reale** (luce, rossore, lucidità, punteggio live rispetto alla foto di riferimento) e le zone del viso misurate: fronte in azzurro, guance in rosso, naso in verde;
- nel foglio finisce con `sì` nella colonna *Debug*, non conta in classifica né nel recap e non avvisa nessuno.

## Chat

Tab **Chat**: messaggi del gruppo (ultimi 7 giorni) e, in cima, la domanda **"Chi va in palestra oggi?"**.
- Un giorno (oggi o uno dei 6 dopo, nella fila dei giorni) resta **chiuso** finché qualcuno non tocca **"Chiedi a tutti"**: parte la notifica a tutti e da lì si risponde con **Ci sono / Forse / No** e un **orario facoltativo** (ritoccare la risposta la toglie). Chi non ha ancora risposto a una domanda vede un **pallino rosso** sul tab Chat e sul giorno. Chi poi fa check-in risulta "arrivato".
- **Penalità** nei punti del mese (dettaglio nel pulsante "i" della Classifica): Bidone −10, Cambio all'ultimo −5, Ritardo −2, Check-in senza avvisare −3, Settimana a vuoto −5. Valgono dal giorno in cui sono state introdotte (proprietà PENALTIES_FROM); i cambi di risposta si salvano nel foglio **Cambi**.
- Nel tab **Oggi** c'è la griglia persone × prossimi 7 giorni: le proprie caselle si toccano per cambiare risposta. Le risposte stanno nel foglio **Piani**, creato da solo.
- In chat compaiono anche gli **eventi**: check-in, Sudometro (con la foto), **premiazioni della settimana** (domenica alle 19) e **premiazioni del mese** (l'ultimo giorno del mese alle 21: Re del mese, MVP, Divano d'oro e Pomodoro del mese).
- Notifiche: la domanda arriva a tutti; ogni risposta solo a chi l'ha fatta; i messaggi agli altri, al massimo una notifica ogni 5 minuti per persona. Si possono silenziare in **Altro → Notifiche** (la domanda arriva comunque). Toccando la notifica si apre la chat.
- Dati nel foglio **Chat**, creato da solo al primo messaggio. L'app controlla i nuovi messaggi ogni 5 secondi solo mentre la chat è aperta.

## Timer addominali

Tab **Timer**: durata in alto (30 secondi di default, si cambia con − e + di 5 secondi o toccando il numero), poi il pulsante gigante **Inizia**. L'ultimo tempo usato è salvato per ogni account (in Apps Script), quindi resta anche cambiando telefono.
Il timer non suona: a fine tempo lo schermo pulsa lentamente in verde (meno di una volta al secondo, niente flash) finché non lo tocchi, e torna il pulsante Inizia. Toccando il cerchio mentre corre si annulla. Mentre corre, l'app chiede a iOS di tenere lo schermo acceso.

## Check-in automatico (Comandi iOS)

Nell'app, tab **Altro**, sezione **Check-in automatico**: ognuno copia il proprio link personale (`…/exec?action=checkin&code=…`) e crea l'automazione in **Comandi → Automazione → + → Arrivo** → posizione della palestra → **Esegui immediatamente** → azione **Ottieni contenuto dell'URL** con il link.
Nel foglio Presenze, la colonna *Fonte* dice se il check-in è arrivato dall'app o dall'automazione.

## Sicurezza e privacy

- Il repo è pubblico (con l'account gratuito serve per GitHub Pages), ma non contiene segreti. Le chiavi stanno nei secret di GitHub e nelle proprietà di Apps Script.
- L'URL di Apps Script è in `config.js`, ma senza un codice personale valido non permette di leggere né scrivere niente. Le funzioni per la GitHub Action richiedono l'ADMIN_SECRET.
- Le foto stanno nel Drive di chi ha pubblicato lo script e non hanno link pubblici. I selfie da sudato li vede tutto il gruppo nell'app: va detto agli amici prima di iniziare. Nessuna posizione GPS: solo eventi con data e ora.

## Prossimi passi

- Tarare i pesi del Sudometro dopo 1-2 settimane di selfie veri
- Versione 2: record personali, sfida del lunedì, duelli
