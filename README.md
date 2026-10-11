# 🏋️ Palestrina

Web app per rendere più divertente la palestra tra amici: check-in con un tap, classifica settimanale, streak, **Sudometro** (selfie da sudato contro una foto di riferimento) e notifiche su iPhone. Costo zero, niente App Store.

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

- `public/`: la web app. Le foto del Sudometro vengono analizzate sul telefono con MediaPipe e non escono mai dal dispositivo: al foglio arriva solo il punteggio.
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

> Se modifichi `Code.gs` (incollando la nuova versione dal repo), pubblica di nuovo con *Esegui il deployment → Gestisci deployment → ✏️ → Versione: Nuova versione*: l'URL resta lo stesso.

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

## Cosa fanno gli amici

> Apri il link in **Safari** → **Condividi** → **Aggiungi alla schermata Home** → apri l'icona **Palestrina** → inserisci il **codice** → **Attiva notifiche** → **Consenti**.

Serve iOS 16.4 o successivo. Il codice resta salvato: va reinserito solo se si cancella l'app o si cambia telefono, e i dati non si perdono perché stanno sul foglio.

## Notifiche che arrivano

| Quando | A chi | Esempio |
|---|---|---|
| Check-in | tutti tranne chi l'ha fatto | 💪 Marco è in palestra. Presenza n. 2 della settimana. E tu dove sei? 👀 |
| Sudometro | tutti tranne chi l'ha fatto | 🍅 Sudometro di Anna: 78. "Pomodoro maturo 🍅" |
| Domenica alle 19 | tutti | 🏆 MVP: Marco (4) · 🛋️ Divano d'oro: Luca (1) · 🍅 Pomodoro della settimana: Anna (87) |
| Attivazione | solo chi le attiva | Notifiche attive ✅ |

Si possono anche inviare a mano: *Actions → Notifiche → Run workflow*.

## Sudometro

1. **Una volta sola**: foto di riferimento da riposato, meglio in palestra, nel punto e con la luce dove si faranno i selfie da sudato. Si può rifare quando si vuole ("Rifai la foto di riferimento").
2. **Ogni volta**: un selfie da sudato al momento peggiore dell'allenamento, **uno al giorno**.
3. Il telefono confronta il selfie con la foto di riferimento e calcola un punteggio da 0 a 100:
   - **Rossore** (40 punti): aumento del canale a* (spazio colore Lab) su guance e fronte
   - **Lucidità** (30 punti): pixel molto chiari e poco saturi su fronte e naso, con soglia relativa alla luminosità del viso
   - **Smorfia** (30 punti): blendshape di MediaPipe (occhi strizzati, sopracciglia, bocca, occhi meno aperti)

Della foto di riferimento si salvano solo i valori calcolati (nelle proprietà di Apps Script, chiave `ref_<nome>`), così sopravvivono anche se si reinstalla l'app.

Titoli: sotto 20 "Fresco come una rosa", poi "Appena tiepido", "Si comincia a sudare", da 60 "Pomodoro maturo", da 85 "Lavatrice in centrifuga".
I pesi (`WEIGHTS`) e le soglie (`TITLES`) sono in `public/sudometro.js`, da tarare sui primi selfie veri. Nel foglio, la colonna *Dettagli* registra i valori grezzi di ogni componente.

**Anti-furbizia**: solo fotocamera dal vivo (niente galleria), un check-in e un Sudometro al giorno, controllati da Apps Script.

### Modalità debug
Scrivi `sì` nella colonna **D (Debug)** del foglio Utenti. Quell'utente vede il pulsante **🐞 Prova subito (debug)**, utile per provare e tarare il Sudometro:
- si può ripetere quante volte si vuole, anche dopo il Sudometro del giorno;
- mostra i valori grezzi di ogni componente;
- nel foglio finisce con `sì` nella colonna *Debug*, non conta in classifica né nel recap e non avvisa nessuno.

## Check-in automatico (Comandi iOS)

Nell'app, sezione **📍 Check-in automatico**: ognuno copia il proprio link personale (`…/exec?action=checkin&code=…`) e crea l'automazione in **Comandi → Automazione → + → Arrivo** → posizione della palestra → **Esegui immediatamente** → azione **Ottieni contenuto dell'URL** con il link.
Nel foglio Presenze, la colonna *Fonte* dice se il check-in è arrivato dall'app o dall'automazione.

## Sicurezza e privacy

- Il repo è pubblico (con l'account gratuito serve per GitHub Pages), ma non contiene segreti. Le chiavi stanno nei secret di GitHub e nelle proprietà di Apps Script.
- L'URL di Apps Script è in `config.js`, ma senza un codice personale valido non permette di leggere né scrivere niente. Le funzioni per la GitHub Action richiedono l'ADMIN_SECRET.
- Le foto non lasciano il telefono. Nessuna posizione GPS: solo eventi con data e ora.

## Prossimi passi

- Tarare i pesi del Sudometro dopo 1-2 settimane di selfie veri
- Versione 2: record personali, sfida del lunedì, duelli
