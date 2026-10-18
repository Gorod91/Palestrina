# Prova in locale della chat su Firebase

Niente di questo va online: emulatore Firestore/Auth, `Code.gs` in un finto Apps Script (fogli e proprietà in memoria,
chiave dell'account di servizio generata al volo) e tre telefoni Chromium con Playwright.

```sh
cd tools/firebase-prova && npm i
cp ../../firestore.rules . && npx firebase emulators:start --only firestore,auth --project palestrina-cb43c &   # serve Java
node fake-gas.js ../../apps-script/Code.gs 8787 &
# storico di prova nel foglio Chat, poi la copia su Firebase (come dall'editor)
curl -s localhost:8787/run/append -d '{"name":"Chat","row":["ID","Data","Ora","Nome","Tipo","Testo","Rif","Orario"]}'
curl -s localhost:8787/run/append -d "{\"name\":\"Chat\",\"row\":[\"mgv00001abcd\",\"$(TZ=Europe/Rome date +%F)\",\"08:15\",\"Paolo\",\"msg\",\"Messaggio vecchio dal foglio\",\"\",\"\"]}"
curl -s localhost:8787/run/copiaChatSuFirebase
node test.js
```

`FIREBASE_CHAT=spento node fake-gas.js …` avvia il finto server con Firebase spento.
