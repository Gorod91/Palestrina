// Invia le notifiche di un evento (checkin, sudometro, recap, test).
// Testi e destinatari arrivano da Apps Script; qui si firma e si invia con Web Push.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const { APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, VAPID_PRIVATE_KEY, VAPID_SUBJECT, EVENT, NAME, TEST, TESTER } = process.env;

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) fail('Mancano i secret APPS_SCRIPT_URL e/o APPS_SCRIPT_SECRET');
if (!VAPID_PRIVATE_KEY) fail('Manca il secret VAPID_PRIVATE_KEY');
if (!EVENT) fail('Evento mancante');

const config = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
const publicKey = (config.match(/vapidPublicKey:\s*'([^']+)'/) || [])[1];
if (!publicKey) fail('Chiave pubblica VAPID non trovata in public/config.js');

try {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:palestrina@example.com', publicKey, VAPID_PRIVATE_KEY.trim());
} catch (err) {
  fail(`Chiavi VAPID non valide: ${err.message}`);
}

async function appsScript(params) {
  const url = new URL(APPS_SCRIPT_URL.trim());
  Object.entries({ ...params, secret: APPS_SCRIPT_SECRET.trim() }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fail(`Risposta non valida da Apps Script (HTTP ${res.status}). L'URL è quello della distribuzione "App web" che finisce con /exec?`);
  }
  if (data.error) fail(`Apps Script: ${data.error}`);
  return data;
}

(async () => {
  const test = TEST === '1' && TESTER ? { test: '1', tester: TESTER } : {};
  const { notifications } = await appsScript({ action: 'pushJob', event: EVENT, name: NAME || '', ...test });
  console.log(`Evento "${EVENT}"${NAME ? ` di ${NAME}` : ''}${test.test ? ` (prova di ${TESTER})` : ''}: ${notifications.length} notifiche da inviare`);

  let ok = 0;
  for (const n of notifications) {
    try {
      await webpush.sendNotification(n.subscription, JSON.stringify({ title: n.title, body: n.body, tab: n.tab || '' }), { TTL: 6 * 3600 });
      ok++;
    } catch (err) {
      console.warn(`::warning::Invio fallito (HTTP ${err.statusCode}): ${err.body || err.message}`);
      if ([404, 410].includes(err.statusCode)) {
        // Iscrizione scaduta (app cancellata o permesso revocato): la togliamo dal foglio.
        await appsScript({ action: 'removeSubscription', endpoint: n.subscription.endpoint });
        console.log('Iscrizione scaduta rimossa');
      }
    }
  }
  console.log(`Inviate ${ok}/${notifications.length}`);
})().catch((err) => fail(err.message));
