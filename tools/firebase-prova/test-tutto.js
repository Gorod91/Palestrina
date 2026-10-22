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
  const slow = { ms: 0 }; // ritardo di Apps Script (per vedere cosa non lo aspetta)
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
      if (slow.ms) await sleep(slow.ms);
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
  return { page, ctx, logs, calls, slow };
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
  F.slow.ms = 4000; // Apps Script lento: il bicipite si toglie quando Firebase conferma, senza aspettarlo
  const tC = Date.now();
  await F.page.$eval('#btn-checkin', (b) => b.click());
  const tDone = await F.page.waitForFunction(() => /Check-in/.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden, null, { timeout: 10000 }).then(() => Date.now() - tC).catch(() => -1);
  ok(tDone >= 0 && tDone < 2000, `F: "Check-in fatto" dopo ${tDone} ms (conferma di Firebase), senza aspettare Apps Script`);
  ok((await waitCount(F, 'Francesco', before + 1, 1000)) >= 0, 'F: il suo check-in si vede subito');
  const dM = await waitCount(M, 'Francesco', before + 1);
  ok(dM >= 0, `M vede il check-in di Francesco dopo ${Date.now() - tC} ms`);
  F.slow.ms = 0;
  await sleep(1500);
  ok((await countOf(F, 'Francesco')) === before + 1, 'F: il check-in resta (nessuno stato vecchio lo cancella)');
  ok(F.calls.filter((c) => c.t >= tC).every((c) => c.action !== 'checkin'), 'F: il check-in non è passato dalla richiesta diretta');
  const q = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: PFX + 'azioni' }] } }) }).then((r) => r.json());
  ok(q.some((x) => x.document && x.document.fields.action.stringValue === 'checkin' && x.document.fields.stato.stringValue === 'fatta'), 'in coda su Firebase, eseguito dal server');
  const pres = await post('/run/sheet', { name: SH('Presenze') });
  ok((pres || []).some((r) => r[2] === 'Francesco' && r[0] === today), 'nella tabella di prova (su Firestore)');

  console.log('2a. Annullare il check-in: si vede appena Firebase conferma, anche con il server lento');
  F.slow.ms = 4000;
  const tU = Date.now();
  await F.page.$eval('#btn-checkin-undo', (b) => b.click());
  const dU = await waitCount(F, 'Francesco', before, 3000);
  ok(dU >= 0, `F: check-in tolto dopo ${Date.now() - tU} ms`);
  F.slow.ms = 0;
  ok((await waitCount(M, 'Francesco', before, 15000)) >= 0, 'M vede il check-in tolto');
  await F.page.$eval('#btn-checkin', (b) => b.click()); // si rifà, per i passi dopo
  ok((await waitCount(M, 'Francesco', before + 1, 15000)) >= 0, 'F di nuovo dentro');

  console.log('2c. Come nel video: annullo e rifaccio subito il check-in con il server lento');
  await post('/delay', { ms: 6000 }); // il server esegue l'annullamento ma pubblica lo stato 6 s dopo
  await F.page.$eval('#btn-checkin-undo', (b) => b.click());
  ok((await waitCount(F, 'Francesco', before, 3000)) >= 0, 'F: annullato subito');
  await sleep(2500);
  await F.page.$eval('#btn-checkin', (b) => b.click());
  ok((await waitCount(F, 'Francesco', before + 1, 3000)) >= 0, 'F: di nuovo dentro subito');
  const seen = [];
  for (let i = 0; i < 40; i++) {
    seen.push(await countOf(F, 'Francesco'));
    await sleep(500);
  }
  ok(seen.every((n) => n === before + 1), `F: il check-in non sparisce mai nei 20 s dopo (${[...new Set(seen)].join(', ')})`);
  await post('/delay', { ms: 0 });
  ok((await waitCount(M, 'Francesco', before + 1, 15000)) >= 0, 'M lo vede');

  console.log('2d. Annulla → check-in → annulla in fretta: alla fine fuori');
  for (const sel of ['#btn-checkin-undo', '#btn-checkin', '#btn-checkin-undo']) {
    await F.page.waitForSelector(sel, { state: 'visible', timeout: 5000 }).catch(() => {});
    await F.page.$eval(sel, (b) => b.click());
    await sleep(700);
  }
  await sleep(8000);
  ok((await countOf(F, 'Francesco')) === before, 'F: alla fine senza check-in');
  ok((await waitCount(M, 'Francesco', before, 10000)) >= 0, 'M: Francesco senza check-in');
  ok(!((await post('/run/sheet', { name: SH('Presenze') })) || []).some((r) => r[2] === 'Francesco' && r[0] === today), 'nella tabella: nessun check-in di Francesco oggi');
  await F.page.$eval('#btn-checkin', (b) => b.click()); // si rifà, per i passi dopo
  ok((await waitCount(M, 'Francesco', before + 1, 15000)) >= 0, 'F di nuovo dentro');

  console.log('2b. Server che non risponde: errore dopo 75 s e il check-in non viene più eseguito');
  M.slow.ms = 0;
  await M.ctx.route('https://finto.apps/**', (r) => r.abort()); // Apps Script irraggiungibile per Michy
  const tS = Date.now();
  await M.page.$eval('#btn-checkin', (b) => b.click());
  ok((await waitCount(M, 'Michy', 1, 3000)) >= 0, 'M: check-in fatto appena Firebase lo conferma');
  const err = await M.page.waitForFunction(() => /server non ha risposto/.test(document.getElementById('toast').textContent) && !document.getElementById('toast').hidden, null, { timeout: 90000 }).then(() => Date.now() - tS).catch(() => -1);
  ok(err >= 70000, `M: errore "il server non ha risposto" dopo ${err} ms`);
  ok((await waitCount(M, 'Michy', 0, 2000)) >= 0, 'M: il check-in sparisce');
  await M.ctx.unroute('https://finto.apps/**');
  await post('', { action: 'coda', code: 'MIC-1', test: !VERO }); // il server torna: non deve eseguirlo più
  await sleep(3000);
  ok((await countOf(F, 'Michy')) === 0, 'F: nessun check-in di Michy eseguito dopo l\'errore');

  console.log('3. Check-in di Michy senza rete: errore subito, non parte niente');
  await M.ctx.setOffline(true);
  await M.page.$eval('#btn-checkin', (b) => b.click());
  const toast = await M.page.waitForFunction(() => !document.getElementById('toast').hidden && /offline/.test(document.getElementById('toast').textContent), null, { timeout: 5000 }).then(() => true).catch(() => false);
  ok(toast, 'M: messaggio "sei offline"');
  ok(await M.page.$eval('#toast', (t) => t.classList.contains('error')), 'M: errore in rosso');
  await M.page.screenshot({ path: path.join(require('os').tmpdir(), 'errore-offline.png') });
  ok((await waitCount(M, 'Michy', 0, 1500)) >= 0, 'M: il check-in non resta sullo schermo');
  await M.ctx.setOffline(false);
  await sleep(5000);
  ok((await countOf(F, 'Michy')) === 0, 'F: nessun check-in di Michy arrivato dopo');
  // Azione arrivata su Firebase molto dopo il tocco (rete instabile): il server la scarta
  const late = await M.page.evaluate(async (pfx) => {
    const { fbSignIn } = await import('./fbchat.js');
    const { fs, db } = await fbSignIn({ name: 'Michy' }, () => Promise.reject(new Error('già dentro')));
    await fs.setDoc(fs.doc(db, pfx + 'azioni', 'tardiva1'), { name: 'Michy', action: 'checkin', data: JSON.stringify({ tapAt: Date.now() - 10 * 60000 }), stato: 'nuova', at: fs.serverTimestamp() });
    return 'ok';
  }, PFX);
  await post('', { action: 'coda', code: 'MIC-1', test: !VERO });
  const d = await owner(`${PFX}azioni/tardiva1`);
  ok(late === 'ok' && d.fields && /tardi/.test(d.fields.esito.stringValue), 'azione arrivata 10 minuti dopo il tocco: scartata');
  ok((await countOf(F, 'Michy')) === 0, 'e nessun check-in registrato');
  await M.page.$eval('#btn-checkin', (b) => b.click());
  ok((await waitCount(F, 'Michy', 1)) >= 0, 'con la rete il check-in di Michy arriva');

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

  console.log('5b. Admin: zip con tutte le foto del Sudometro');
  await F.page.$eval('#btn-photos-zip', (b) => b.click());
  const ready = await F.page.waitForFunction(() => /Zip pronto/.test(document.getElementById('btn-photos-zip').textContent), null, { timeout: 30000 }).then(() => true).catch(() => false);
  ok(ready, `zip preparato (${await F.page.$eval('#btn-photos-zip', (b) => b.textContent)})`);
  const [dl] = await Promise.all([F.page.waitForEvent('download', { timeout: 15000 }), F.page.$eval('#btn-photos-zip', (b) => b.click())]);
  const zipPath = path.join(require('os').tmpdir(), 'sudometro-prova.zip');
  await dl.saveAs(zipPath);
  const list = require('child_process').execFileSync('python3', ['-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({"files": z.namelist(), "bad": z.testzip(), "dati": json.loads(z.read("dati.json"))}))', zipPath], { encoding: 'utf8' });
  const z = JSON.parse(list);
  ok(z.bad === null, 'zip valido');
  ok(z.files.some((f) => /^sudato\/.*_Michy_77\.jpg$/.test(f)), `foto da sudato di Michy nello zip (${z.files.join(', ')})`);
  ok(z.files.some((f) => /^riferimenti\/Michy/.test(f)), 'riferimento di Michy nello zip');
  ok(z.dati.sudometro.some((r) => r.name === 'Michy' && r.score === 77 && r.file), 'dati.json con punteggio e file');

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
