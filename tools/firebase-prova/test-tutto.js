// Prova del "tutto su Firebase" in modalità prova: due telefoni (Francesco e Michy, entrambi in prova),
// emulatore Firestore/Auth e finto Apps Script. Si controlla che i telefoni non chiedano più dati ad Apps Script,
// che check-in, Sudometro con foto e registro admin passino dalla coda e arrivino all'altro telefono.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PUB = path.join(__dirname, '../../public');
const SDK = path.join(__dirname, 'node_modules/firebase');
const GAS = 'http://localhost:8787';
const FS = 'http://localhost:8080/v1/projects/palestrina-cb43c/databases/(default)/documents';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const f = path.join(PUB, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (err, b) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }).end(b)));
}).listen(8000);

const post = (p, body) => fetch(GAS + p, { method: 'POST', body: JSON.stringify(body || {}) }).then((r) => r.json());
const owner = (p) => fetch(`${FS}/${p}`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => {
  console.log(cond ? '  ✓' : '  ✗', msg);
  if (!cond) fails++;
};
// VERO=1: la configurazione del passaggio per tutti (fuori dalla prova, FIREBASE_TUTTO = "si")
const VERO = process.env.VERO === '1';
const PFX = VERO ? '' : 'prova_';
const SH = (n) => (VERO ? n : 'Prova · ' + n);
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

async function phone(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const logs = [];
  const calls = []; // azioni chieste ad Apps Script
  await ctx.addInitScript(([code, vero]) => {
    sessionStorage.setItem('palestrina.browser', '1');
    if (!sessionStorage.getItem('prova-impostata')) {
      sessionStorage.setItem('prova-impostata', '1');
      localStorage.setItem('palestrina.session', JSON.stringify({ code }));
      if (!vero) localStorage.setItem('palestrina.testMode', 'true');
    }
    window.PALESTRINA_FB_EMU = { auth: 'http://localhost:9099', host: 'localhost', port: 8080 };
  }, [code, VERO]);
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.host === 'localhost:8000' && u.pathname === '/config.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { appsScriptUrl: 'https://finto.apps/exec', vapidPublicKey: '' };" });
    }
    if (u.host === 'localhost:8000' || u.host === 'localhost:9099' || u.host === 'localhost:8080') return route.continue();
    if (u.host === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/10.14.1/')) {
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(SDK, path.basename(u.pathname))) });
    }
    if (u.host === 'finto.apps') {
      calls.push({ t: Date.now(), action: JSON.parse(route.request().postData() || '{}').action });
      const r = await fetch(GAS, { method: 'POST', body: route.request().postData() });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await r.text() });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('ERRORE ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8000/');
  await page.waitForSelector('#btn-checkin', { state: 'attached', timeout: 20000 });
  return { page, ctx, logs, calls };
}

/** Conteggio della settimana di `name` nella classifica di Home di quel telefono. */
const countOf = (P, name) =>
  P.page.evaluate((name) => {
    const li = [...document.querySelectorAll('#ranking li')].find((x) => x.querySelector('.name').textContent.startsWith(name));
    return li ? Number(li.querySelector('.count').firstChild.textContent) : -1;
  }, name);
async function waitCount(P, name, n, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await countOf(P, name)) === n) return Date.now() - t0;
    await sleep(100);
  }
  return -1;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
  const F = await phone(browser, 'FRA-1');
  const M = await phone(browser, 'MIC-1');

  console.log(`1. ${VERO ? 'Per tutti' : 'In prova'}: lo stato arriva da Firebase e non si chiede più ad Apps Script`);
  await sleep(6000); // collegamento a Firebase e prima pubblicazione dello stato
  ok((await owner(`${PFX}stato/Francesco`)).fields, 'stato di Francesco pubblicato su Firebase');
  const t0 = Date.now();
  await sleep(12000);
  const after = (P) => P.calls.filter((c) => c.t > t0).map((c) => c.action);
  ok(!after(F).some((a) => a === 'state' || a === 'chat'), `F: niente "state" o "chat" ad Apps Script in 12 s (${after(F).join(', ') || 'nessuna richiesta'})`);
  ok(!after(M).some((a) => a === 'state' || a === 'chat'), `M: idem (${after(M).join(', ') || 'nessuna richiesta'})`);

  console.log('2. Check-in di Francesco: va in coda, Michy lo vede da Firebase');
  const before = await countOf(M, 'Francesco');
  const tC = Date.now();
  await F.page.$eval('#btn-checkin', (b) => b.click());
  ok((await waitCount(F, 'Francesco', before + 1, 1000)) >= 0, 'F: il suo check-in si vede subito');
  const dM = await waitCount(M, 'Francesco', before + 1);
  ok(dM >= 0, `M vede il check-in di Francesco dopo ${Date.now() - tC} ms`);
  ok(F.calls.filter((c) => c.t >= tC).every((c) => c.action !== 'checkin'), 'F: il check-in non è passato dalla richiesta diretta');
  const q = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: PFX + 'azioni' }] } }) }).then((r) => r.json());
  ok(q.some((x) => x.document && x.document.fields.action.stringValue === 'checkin' && x.document.fields.stato.stringValue === 'fatta'), 'in coda su Firebase, eseguito dal server');
  const pres = await post('/run/sheet', { name: SH('Presenze') });
  ok((pres || []).some((r) => r[2] === 'Francesco' && r[0] === today), 'nella tabella di prova (su Firestore)');

  console.log('3. Check-in di Michy senza rete, app chiusa e riaperta più tardi con la rete');
  await M.ctx.setOffline(true);
  const tap = new Date();
  await M.page.$eval('#btn-checkin', (b) => b.click());
  ok((await waitCount(M, 'Michy', 1, 1500)) >= 0, 'M: si vede subito anche offline');
  await sleep(1000);
  await M.page.close(); // app chiusa senza rete
  await sleep(65000); // più di un minuto: l'ora di arrivo sarà diversa da quella del tocco
  await M.ctx.setOffline(false);
  const tR = Date.now();
  M.page = await M.ctx.newPage();
  M.page.on('console', (m) => M.logs.push(m.text()));
  M.page.on('pageerror', (e) => M.logs.push('ERRORE ' + e.message));
  M.page.on('dialog', (d) => d.accept());
  await M.page.goto('http://localhost:8000/');
  const dO = await waitCount(F, 'Michy', 1, 90000);
  ok(dO >= 0, `F vede il check-in di Michy ${Date.now() - tR} ms dopo la riapertura`);
  const hhmm = (d) => d.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
  const presM = ((await post('/run/sheet', { name: SH('Presenze') })) || []).find((r) => r[2] === 'Michy' && r[0] === today);
  ok(presM && presM[1] === hhmm(tap), `registrato all'ora del tocco (${presM && presM[1]}, tocco ${hhmm(tap)}, arrivo ${hhmm(new Date(tR))})`);
  ok((await waitCount(M, 'Michy', 1, 5000)) >= 0, 'M: dopo la riapertura il check-in c\'è');

  console.log('4. Sudometro con foto su Firebase (azione in coda, come il telefono)');
  const jpeg = fs.readFileSync(path.join(PUB, 'icons/icon-192.png')).toString('base64'); // contenuto qualsiasi: si controlla il giro
  const sent = await M.page.evaluate(async ([jpeg, pfx]) => {
    const { fbSignIn } = await import('./fbchat.js');
    const { fs, db } = await fbSignIn({ name: 'Michy' }, () => Promise.reject(new Error('già dentro')));
    const put = async (id) => fs.setDoc(fs.doc(db, 'foto', id), { name: 'Michy', label: 'prova', mime: 'image/jpeg', data: fs.Bytes.fromBase64String(jpeg), at: fs.serverTimestamp() });
    const queue = async (action, data) => fs.setDoc(fs.doc(db, pfx + 'azioni', 'z' + Math.random().toString(36).slice(2, 10)), { name: 'Michy', action, data: JSON.stringify(data), stato: 'nuova', at: fs.serverTimestamp() });
    await put('fotorifmichy');
    await queue('setReference', { features: { redness: 0.1, shine: 0.1 }, photoId: 'fotorifmichy' });
    await put('fotosudmichy');
    await queue('sudometro', { score: 77, title: 'Prova', details: {}, photoId: 'fotosudmichy' });
    let wrong = 'no';
    try {
      await fs.setDoc(fs.doc(db, 'foto', 'fotofalsa'), { name: 'Francesco', label: 'x', mime: 'image/jpeg', data: fs.Bytes.fromBase64String(jpeg), at: fs.serverTimestamp() });
      wrong = 'sì';
    } catch { /* deve rifiutarla */ }
    return wrong;
  }, [jpeg, PFX]);
  ok(sent === 'no', 'le regole rifiutano una foto a nome di un altro');
  await post('', { action: 'coda', code: 'MIC-1', test: !VERO });
  const sudo = await post('/run/sheet', { name: SH('Sudometro') });
  ok((sudo || []).some((r) => r[2] === 'Michy' && Number(r[3]) === 77 && r[7] === 'fotosudmichy'), 'Sudometro salvato con la foto di Firebase');
  const gallery = await F.page
    .waitForFunction(() => [...document.querySelectorAll('#gallery img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  ok(gallery, 'F vede la foto di Michy nella galleria (letta da Firebase)');
  ok(!F.calls.some((c) => c.action === 'photos'), 'F: nessuna foto chiesta ad Apps Script');

  console.log('5. Registro admin: annullare il check-in di Michy');
  const log = await post('', { action: 'adminLog', code: 'FRA-1', test: !VERO });
  const item = (log.items || []).find((i) => i.kind === 'presenza' && i.name === 'Michy');
  ok(!!item, 'il check-in di Michy è nel registro');
  if (item) {
    const u = await post('', { action: 'adminUndo', code: 'FRA-1', test: !VERO, kind: item.kind, key: item.key });
    ok(u.ok, 'annullato');
    ok((await waitCount(M, 'Michy', 0)) >= 0, 'M vede il suo check-in tolto');
    const l2 = await post('', { action: 'adminLog', code: 'FRA-1', test: !VERO });
    const undone = (l2.undone || []).find((i) => i.kind === 'presenza');
    const r = undone ? await post('', { action: 'adminRestore', code: 'FRA-1', test: !VERO, id: undone.id }) : { error: 'non trovato' };
    ok(r.ok, `ripristinato (${r.error || 'ok'})`);
    ok((await waitCount(F, 'Michy', 1)) >= 0, 'F rivede il check-in di Michy');
  }

  console.log('6. Regole');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = (name) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: name, user_id: name, pal: true, name, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, aud: 'palestrina-cb43c', iss: 'https://securetoken.google.com/palestrina-cb43c', firebase: { sign_in_provider: 'custom' } })}.`;
  const as = (name, p) => fetch(`${FS}/${p}`, { headers: { Authorization: 'Bearer ' + tok(name) } }).then((r) => r.status);
  ok((await as('Michy', PFX + 'stato/Michy')) === 200, 'Michy legge il proprio stato');
  ok((await as('Michy', PFX + 'stato/Francesco')) === 403, 'Michy non legge lo stato di Francesco');
  ok((await as('Michy', (VERO ? 'db' : 'prova_db') + '/presenze')) === 403, 'le tabelle del server non sono leggibili dai telefoni');

  for (const [n, P] of [['F', F], ['M', M]]) ok(!P.logs.some((l) => l.startsWith('ERRORE')), `${n}: nessun errore della pagina`);
  if (fails) for (const [n, P] of [['F', F], ['M', M]]) console.log(n, P.logs.slice(-12).join('\n   '));
  console.log(fails ? `\n${fails} controlli falliti` : '\nTutto ok');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
