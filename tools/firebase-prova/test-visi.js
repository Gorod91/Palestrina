// Prova di visi, "In palestra adesso", sorpassi e reazioni (dopo test-tutto.js, stesso emulatore e finto server).
// FOTO=percorso di un selfie vero per il ritaglio; MP=cartella del pacchetto npm @mediapipe/tasks-vision.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PUB = path.join(__dirname, '../../public');
const SDK = path.join(__dirname, 'node_modules/firebase');
const MP = process.env.MP;
const FOTO = process.env.FOTO;
const OUT = process.env.OUT || require('os').tmpdir();
const GAS = 'http://localhost:8787';
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm' };

http.createServer((req, res) => {
  const f = path.join(PUB, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (err, b) => (err ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }).end(b)));
}).listen(8000);

const post = (p, body) => fetch(GAS + p, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body || {}) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => {
  console.log(cond ? '  ✓' : '  ✗', msg);
  if (!cond) fails++;
};

async function phone(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: false });
  const logs = [];
  await ctx.addInitScript(([code]) => {
    sessionStorage.setItem('palestrina.browser', '1');
    if (!sessionStorage.getItem('prova-impostata')) {
      sessionStorage.setItem('prova-impostata', '1');
      localStorage.setItem('palestrina.session', JSON.stringify({ code }));
      localStorage.setItem('palestrina.testMode', 'true');
    }
    window.PALESTRINA_FB_EMU = { auth: 'http://localhost:9099', host: 'localhost', port: 8080 };
  }, [code]);
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.host === 'localhost:8000' && u.pathname === '/config.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "window.APP_CONFIG = { appsScriptUrl: 'https://finto.apps/exec', vapidPublicKey: '', mediapipeBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21', faceModelUrl: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' };" });
    }
    if (u.host === 'localhost:8000' && u.pathname === '/selfie.jpg') return route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(FOTO) });
    if (u.host === 'localhost:8000' || u.host === 'localhost:9099' || u.host === 'localhost:8080') return route.continue();
    if (u.host === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/10.14.1/')) {
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(SDK, path.basename(u.pathname))) });
    }
    if (u.host === 'cdn.jsdelivr.net' && MP) {
      const f = path.join(MP, u.pathname.replace(/^\/npm\/@mediapipe\/tasks-vision@[^/]+\//, ''));
      return route.fulfill({ contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    }
    if (u.host === 'storage.googleapis.com') {
      const r = await fetch(u.href);
      return route.fulfill({ status: r.status, contentType: 'application/octet-stream', body: Buffer.from(await r.arrayBuffer()) });
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
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8000/');
  await page.waitForSelector('#btn-checkin', { state: 'attached', timeout: 20000 });
  // Nella prova il foglio dell'obiettivo del mese copre tutto: per le foto si toglie
  await page.addStyleTag({ content: '#goal-sheet, .sheet-backdrop { display: none !important; }' });
  return { page, ctx, logs };
}
const tab = (P, t) => P.page.$eval(`.tabbar button[data-tab="${t}"]`, (b) => b.click());

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-proxy-server'] });
  const F = await phone(browser, 'FRA-1');
  const M = await phone(browser, 'MIC-1');
  await sleep(6000);

  console.log('1. Viso ritagliato da un selfie vero (MediaPipe sul telefono)');
  const face = await M.page.evaluate(async () => {
    const s = await import('./sudometro.js');
    const img = new Image();
    img.src = '/selfie.jpg';
    await img.decode();
    const b64 = await s.faceCutout(img);
    if (!b64) return null;
    const im = new Image();
    im.src = 'data:image/png;base64,' + b64;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    const a = (px, py) => x.getImageData(px, py, 1, 1).data[3];
    return { b64, w: im.width, corner: a(2, 2), center: a(im.width / 2, im.height / 2), kb: Math.round((b64.length * 3) / 4 / 1024) };
  });
  ok(face && face.w === 160, `PNG 160×160 (${face && face.kb} KB)`);
  ok(face && face.corner < 20 && face.center > 230, `sfondo trasparente, viso pieno (angolo ${face && face.corner}, centro ${face && face.center})`);
  if (face) fs.writeFileSync(path.join(OUT, 'viso-michy.png'), Buffer.from(face.b64, 'base64'));

  console.log('2. Il viso va su Firebase e il server lo usa');
  const r = await M.page.evaluate(async (b64) => {
    const { fbSignIn } = await import('./fbchat.js');
    const { fs, db } = await fbSignIn({ name: 'Michy' }, () => Promise.reject(new Error('già dentro')));
    let pngOther = 'rifiutata';
    try {
      await fs.setDoc(fs.doc(db, 'foto', 'pngnonviso'), { name: 'Michy', label: 'sudato', mime: 'image/png', data: fs.Bytes.fromBase64String(b64), at: fs.serverTimestamp() });
      pngOther = 'accettata';
    } catch { /* deve rifiutarla */ }
    const id = 'visomichy' + Math.random().toString(36).slice(2, 8);
    await fs.setDoc(fs.doc(db, 'foto', id), { name: 'Michy', label: 'viso', mime: 'image/png', data: fs.Bytes.fromBase64String(b64), at: fs.serverTimestamp() });
    await fs.setDoc(fs.doc(db, 'prova_azioni', 'v' + Math.random().toString(36).slice(2, 10)), { name: 'Michy', action: 'setFace', data: JSON.stringify({ faceId: id, from: 'sudato', tapAt: Date.now() }), stato: 'nuova', at: fs.serverTimestamp() });
    return { pngOther, id };
  }, face.b64);
  const faceId = r.id;
  ok(r.pngOther === 'rifiutata', 'le regole rifiutano un PNG che non è un viso');
  await post('', { action: 'coda', code: 'MIC-1', test: true });
  await sleep(4000);
  const faces = await F.page.evaluate(() => JSON.parse(localStorage.getItem('palestrina.state') || '{}').data.faces || {});
  ok(faces.Michy === faceId, `nello stato di Francesco: faces.Michy = ${faces.Michy}`);

  console.log('3. In palestra adesso (Home di Francesco)');
  await tab(F, 'oggi');
  const now = await F.page.waitForFunction((id) => {
    const card = document.getElementById('now-card');
    const img = card && !card.hidden && card.querySelector(`img[data-fid="${id}"]`);
    return img && img.complete && img.naturalWidth > 0 ? [...card.querySelectorAll('.now-p p')].map((p) => p.textContent) : null;
  }, faceId, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!now, `card visibile con la faccia di Michy (${now})`);
  await F.page.screenshot({ path: path.join(OUT, 'home.png'), clip: { x: 0, y: 0, width: 375, height: 460 } });

  console.log('4. Sorpasso');
  const pts = await post('/eval', "(() => { TEST = true; MEMO = {}; TABLES = {}; return computePoints('2026-11').concat(computePoints('2026-10')).map((t) => [t.name, t.total]); })");
  console.log('   punti', JSON.stringify(pts.result));
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }).slice(0, 7);
  await post('/run/prop', { key: `prova_prova_sorpassi_${month}`, value: JSON.stringify({ Francesco: 30, Michy: 10, Paolo: 0 }) });
  const unit = await post('/eval', '(() => overtakes({ A: 10, B: 20, C: 0, D: 15 }, { A: 25, B: 20, C: 30, D: 15 }))');
  ok(JSON.stringify(unit.result) === JSON.stringify([{ name: 'C', passed: ['A', 'B', 'D'], pos: 1, pts: 30 }, { name: 'A', passed: ['B', 'D'], pos: 2, pts: 25 }]), `calcolo: C (da 0) supera tutti, A supera B e D ${JSON.stringify(unit.result)}`);
  const zero = await post('/eval', '(() => overtakes({ A: 0, B: 0 }, { A: 10, B: 0 }))');
  ok(zero.result.length === 0, 'chi ha ancora 0 punti non viene superato');
  const tie = await post('/eval', '(() => overtakes({ A: 10, B: 10 }, { A: 12, B: 10 }))');
  ok(tie.result.length === 0, 'da pari a davanti non è un sorpasso');
  await M.page.$eval('#btn-checkin-undo', (b) => b.click()).catch(() => {});
  await sleep(1500);
  await post('', { action: 'coda', code: 'MIC-1', test: true });
  await sleep(1500);
  await M.page.$eval('#btn-checkin', (b) => b.click()).catch(() => {});
  await sleep(1500);
  await post('', { action: 'coda', code: 'MIC-1', test: true });
  const chat = await post('/run/sheet', { name: 'Prova · Chat' });
  const sorp = (chat || []).filter((row) => row[4] === 'event' && /"sorpasso"/.test(row[5]));
  ok(sorp.length >= 1, `evento di sorpasso in chat evento di sorpasso in chat (${sorp.map((x) => x[3] + ' ' + x[5]).join(' | ')})`);
  await tab(F, 'chat');
  const ev = await F.page.waitForFunction(() => {
    const e = document.querySelector('#chat-list .event.sorp');
    const img = e && e.querySelector('img[data-fid]');
    return e && img && img.complete && img.naturalWidth > 0 ? e.textContent : null;
  }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(!!ev && /Michy supera Francesco/.test(ev), `in chat: "${ev}"`);
  await F.page.evaluate(() => document.querySelector('#chat-list .event.sorp').scrollIntoView({ block: 'center' }));
  await sleep(300);
  await F.page.screenshot({ path: path.join(OUT, 'chat-sorpasso.png') });

  console.log('5. Reazioni sulla foto del Sudometro di Michy');
  const sudo = '#chat-list .event.with-photo';
  ok(await F.page.$(sudo + ' .reacts') !== null, 'sotto la foto ci sono le reazioni (+)');
  await F.page.evaluate((s) => [...document.querySelectorAll(s)].pop().scrollIntoView({ block: 'center' }), sudo);
  // tocco normale: si ingrandisce
  await F.page.evaluate((s) => [...document.querySelectorAll(s + ' .pair')].pop().click(), sudo);
  ok(await F.page.$eval('#viewer', (v) => !v.hidden), 'tocco sulla foto: si apre ingrandita');
  await F.page.$eval('#viewer', (v) => v.click());
  // pressione lunga: scelta delle reazioni, la foto non si apre
  // (qui la pressione si simula sull'elemento: nella prova c'è sopra il foglio dell'obiettivo settimanale)
  await F.page.evaluate((s) => { const p = [...document.querySelectorAll(s + ' .pair img, ' + s + ' .pair')].pop(); p.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); }, sudo);
  await sleep(700);
  await F.page.evaluate((s) => { const p = [...document.querySelectorAll(s + ' .pair')].pop(); const t = p.querySelector('img') || p; t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); t.click(); }, sudo);
  await sleep(200);
  ok(await F.page.$('.react-picker') !== null, 'tenendo premuto: compare la scelta delle reazioni');
  ok(await F.page.$eval('#viewer', (v) => v.hidden), 'e la foto non si apre');
  await F.page.screenshot({ path: path.join(OUT, 'chat-reazioni.png') });
  await F.page.$eval('.react-picker button', (b) => b.click()); // 😂
  await sleep(300);
  ok(await F.page.evaluate((s) => [...document.querySelectorAll(s + ' .react-chip.mine')].length === 1, sudo), 'F: la sua reazione si vede subito');
  await tab(M, 'chat');
  const seenM = await M.page.waitForFunction((s) => {
    const c = [...document.querySelectorAll(s + ' .react-chip:not(.react-add)')];
    return c.length ? c.map((x) => x.textContent).join(' ') : null;
  }, sudo, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
  ok(seenM === '😂 1', `M la vede (${seenM})`);
  // M aggiunge la stessa: 2
  await M.page.evaluate((s) => [...document.querySelectorAll(s + ' .react-chip:not(.react-add)')].pop().click(), sudo);
  const two = await F.page.waitForFunction((s) => [...document.querySelectorAll(s + ' .react-chip:not(.react-add)')].some((c) => c.textContent === '😂 2'), sudo, { timeout: 10000 }).then(() => true).catch(() => false);
  ok(two, 'F vede 😂 2 quando reagisce anche Michy');
  // F la toglie
  await F.page.evaluate((s) => [...document.querySelectorAll(s + ' .react-chip.mine')].pop().click(), sudo);
  const back = await M.page.waitForFunction((s) => [...document.querySelectorAll(s + ' .react-chip:not(.react-add)')].some((c) => c.textContent === '😂 1'), sudo, { timeout: 10000 }).then(() => true).catch(() => false);
  ok(back, 'F la toglie: M vede di nuovo 😂 1');
  const bad = await F.page.evaluate(async () => {
    const { fbSignIn } = await import('./fbchat.js');
    const { fs, db } = await fbSignIn({ name: 'Francesco' }, () => Promise.reject(new Error('già dentro')));
    try {
      await fs.setDoc(fs.doc(db, 'prova_reazioni', 'abcdefgh_Michy'), { msg: 'abcdefgh', name: 'Michy', e: ['😂'], at: fs.serverTimestamp() });
      return 'accettata';
    } catch {
      return 'rifiutata';
    }
  });
  ok(bad === 'rifiutata', 'le regole non lasciano reagire a nome di un altro');

  console.log('6. Notifica del sorpasso senza nomi');
  const n = await post('/eval', "(() => { TEST = false; const subs = [{ name: 'Francesco', sub: {} }, { name: 'Michy', sub: {} }]; rows('iscrizioni'); MEMO['iscrizioni:rows'] = subs; return buildNotifications('sorpasso', 'Michy'); })");
  const msgs = n.result || [];
  ok(msgs.length === 2 && !msgs.some((m) => /Michy|Francesco/.test(m.title + m.body)), `a tutti (anche a chi sorpassa), senza nomi: ${JSON.stringify(msgs.map((m) => [m.title, m.body]))}`);

  for (const [k, P] of [['F', F], ['M', M]]) ok(!P.logs.some((l) => l.startsWith('ERRORE')), `${k}: nessun errore della pagina`);
  if (fails) for (const [k, P] of [['F', F], ['M', M]]) console.log(k, P.logs.slice(-15).join('\n   '));
  console.log(fails ? `\n${fails} controlli falliti` : '\nTutto ok');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
