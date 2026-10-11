// Configurazione di Palestrina. Qui non ci sono segreti: il repo è pubblico.
window.APP_CONFIG = {
  // URL della distribuzione "App web" di Apps Script (finisce con /exec).
  // Senza un codice personale valido non permette di fare nulla.
  appsScriptUrl: 'INCOLLA_QUI_URL_APPS_SCRIPT',

  // Chiave pubblica VAPID per le notifiche (la privata è nel secret VAPID_PRIVATE_KEY).
  vapidPublicKey: 'BJnImNZSyPwqU2Vtc2Ml07aIDMUSstrZNtan2hkZM09_3i1npYtrT14xka7Ea4SU0NNu36daUUIwJJm5pX8wlLw',

  // MediaPipe Face Landmarker, usato dal Sudometro.
  mediapipeBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21',
  faceModelUrl: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',

  // Minuti minimi tra selfie "riposato" e "sudato" (lo controlla anche Apps Script).
  sudometroMinMinutes: 20,
};
