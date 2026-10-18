// Prova della fase 4: tre telefoni (Chromium), emulatore Firestore/Auth e finto Apps Script.
// A = Francesco e B = Paolo con Firebase; C = Michy con Firestore bloccato (Wi-Fi aziendale).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PUB = path.join(__dirname, '../../public');
const SDK = path.join(__dirname, 'node_modules/firebase');
const GAS = 'http://localhost:8787';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const f = path.join(PUB, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (err, b) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }).end(b)));
}).listen(8000);

const post = (p, body) => fetch(GAS + p, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log(cond ? '  ✓' : '  ✗', msg); if (!cond) fails++; };

async function phone(browser, code, { blockFirestore = false, blockSdk = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const logs = [];
  await ctx.addInitScript((code) => {
    sessionStorage.setItem('palestrina.browser', '1');
    localStorage.setItem('palestrina.session', JSON.stringify({ code }));
    window.PALESTRINA_FB_EMU = { auth: 'http://localhost:9099', host: 'localhost', port: 8080 };
  }, code);
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.host === 'localhost:8000' && u.pathname === '/config.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { appsScriptUrl: 'https://finto.apps/exec', vapidPublicKey: '' };" });
    }
    if (u.host === 'localhost:8000' || u.host === 'localhost:9099') return route.continue();
    if (u.host === 'localhost:8080') return blockFirestore ? route.abort() : route.continue();
    if (u.host === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/10.14.1/')) {
      if (blockSdk) return route.abort();
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(SDK, path.basename(u.pathname))) });
    }
    if (u.host === 'finto.apps') {
      const r = await fetch(GAS, { method: 'POST', body: route.request().postData() });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await r.text() });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('ERRORE ' + e.message));
  await page.goto('http://localhost:8000/');
  await page.waitForSelector('.tabbar button[data-tab=chat]', { state: 'visible', timeout: 20000 });
  await page.click('.tabbar button[data-tab=chat]');
  return { page, ctx, logs };
}

const bubbles = (p) => p.$$eval('#chat-list .msg .bubble', (n) => n.map((x) => x.textContent));
async function waitText(p, text, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await bubbles(p)).some((b) => b.includes(text))) return Date.now() - t0;
    await sleep(50);
  }
  return -1;
}
async function send(p, text) {
  await p.fill('#chat-input', text);
  await p.click('#chat-send');
  return Date.now();
}
const count = async (p, text) => (await bubbles(p)).filter((b) => b.includes(text)).length;
const sheetMsgs = async () => ((await post('/run/sheet', { name: 'Chat' })) || []).filter((r) => r[4] === 'msg');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] }).catch(() => chromium.launch({ args: ['--no-proxy-server'] }));
  const A = await phone(browser, 'FRA-1');
  const B = await phone(browser, 'PAO-1');
  const C = await phone(browser, 'MIC-1', { blockFirestore: true });

  console.log('1. Storico copiato: si vede una volta sola');
  ok((await waitText(A.page, 'Messaggio vecchio dal foglio')) >= 0, 'A vede lo storico');
  await sleep(3000);
  ok((await count(A.page, 'Messaggio vecchio dal foglio')) === 1, 'A: niente doppioni dello storico');
  ok((await waitText(C.page, 'Messaggio vecchio dal foglio')) >= 0, 'C (Firestore bloccato) vede lo storico da Apps Script');

  console.log('2. A scrive su Firebase: B in tempo reale, C dal foglio');
  const t0 = await send(A.page, 'Ciao da A');
  const dB = await waitText(B.page, 'Ciao da A', 5000);
  ok(dB >= 0 && dB < 2000, `B lo vede in ${dB} ms`);
  const dC = await waitText(C.page, 'Ciao da A', 20000);
  ok(dC >= 0, `C lo vede da Apps Script in ${dC} ms`);
  ok((await sheetMsgs()).some((r) => r[5] === 'Ciao da A' && r[3] === 'Francesco'), 'copiato nel foglio (chatNotify)');
  ok((await A.page.inputValue('#chat-input')) === '' && (await count(A.page, 'Ciao da A')) === 1, 'A: una volta sola');

  console.log('3. C (Firebase bloccato) scrive: passa da Apps Script e arriva su Firebase');
  await send(C.page, 'Ciao da C');
  const dA = await waitText(A.page, 'Ciao da C', 8000);
  ok(dA >= 0, `A lo vede in ${dA} ms`);
  ok((await waitText(B.page, 'Ciao da C', 8000)) >= 0, 'B lo vede');
  await sleep(6000);
  for (const [n, P] of [['A', A], ['B', B], ['C', C]]) ok((await count(P.page, 'Ciao da C')) === 1 && (await count(P.page, 'Ciao da A')) === 1, `${n}: nessun doppione`);
  ok((await sheetMsgs()).filter((r) => r[5] === 'Ciao da C').length === 1, 'nel foglio una volta');

  console.log('4. Messaggio rimasto in attesa (Firebase bloccato a metà): parte da Apps Script con lo stesso id');
  await B.ctx.setOffline(true);
  await send(B.page, 'In attesa da B');
  ok((await waitText(B.page, 'In attesa da B', 2000)) >= 0, 'B lo vede subito (in attesa)');
  await B.ctx.route('http://localhost:8080/**', (r) => r.abort());
  await B.ctx.setOffline(false);
  const dR = await waitText(A.page, 'In attesa da B', 40000);
  ok(dR >= 0, `A lo riceve in ${dR} ms`);
  await B.ctx.unroute('http://localhost:8080/**');
  await sleep(15000);
  ok((await sheetMsgs()).filter((r) => r[5] === 'In attesa da B').length === 1, 'nel foglio una volta');
  for (const [n, P] of [['A', A], ['B', B], ['C', C]]) ok((await count(P.page, 'In attesa da B')) === 1, `${n}: una volta`);
  const fbDocs = await fetch('http://localhost:8080/v1/projects/palestrina-cb43c/databases/(default)/documents/chat?pageSize=100', { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
  ok(fbDocs.documents.filter((d) => d.fields.text.stringValue === 'In attesa da B').length === 1, 'su Firebase una volta');

  console.log('5. SDK di Firebase bloccato: chat normale da Apps Script');
  const D = await phone(browser, 'MIC-1', { blockSdk: true });
  ok((await waitText(D.page, 'Ciao da A', 15000)) >= 0, 'D vede la chat');
  await send(D.page, 'Ciao da D');
  ok((await waitText(A.page, 'Ciao da D', 8000)) >= 0, 'A lo vede');
  ok(!D.logs.some((l) => l.startsWith('ERRORE')), 'D: nessun errore della pagina');

  console.log('6. Interruttore FIREBASE_CHAT=spento: tutti sul foglio');
  await post('/run/prop', { key: 'FIREBASE_CHAT', value: 'spento' });
  const st = await post('', { action: 'state', code: 'PAO-1' });
  ok(st.features && st.features.firebase === false, 'stato: firebase spento');
  const tk = await post('', { action: 'fbToken', code: 'PAO-1' });
  ok(!!tk.error, 'fbToken rifiutato');
  await post('/run/prop', { key: 'FIREBASE_CHAT', value: 'tutti' });

  for (const [n, P] of [['A', A], ['B', B], ['C', C]]) ok(!P.logs.some((l) => l.startsWith('ERRORE')), `${n}: nessun errore della pagina`);
  if (fails) for (const [n, P] of [['A', A], ['B', B], ['C', C]]) console.log(n, P.logs.slice(-15).join('\n   '));
  console.log(fails ? `\n${fails} controlli falliti` : '\nTutto ok');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
