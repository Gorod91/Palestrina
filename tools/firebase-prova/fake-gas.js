// Finto Apps Script: carica Code.gs in una vm con fogli, proprietà e servizi in memoria.
// Uso: node fake-gas.js ../../apps-script/Code.gs 8787
const fs = require('fs');
const vm = require('vm');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const [file, port = '8787'] = process.argv.slice(2);
const TZ = 'Europe/Rome';

// ---------- Fogli ----------
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (this.sh.data[this.r - 1 + i] ||= [])[this.c - 1 + j] = x; })); this.sh.fill(); return this; }
  setNumberFormat() { return this; }
  getValues() { return this.sh.data.slice(this.r - 1, this.r - 1 + this.nr).map((row) => row.slice(this.c - 1, this.c - 1 + this.nc)); }
  getDisplayValues() { return this.getValues().map((r) => r.map((x) => (x instanceof Date ? x.toISOString() : String(x ?? '')))); }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  width() { return Math.max(0, ...this.data.map((r) => r.length)); }
  fill() { const w = this.width(); this.data.forEach((r) => { for (let i = 0; i < w; i++) if (r[i] === undefined) r[i] = ''; }); }
  appendRow(r) { this.data.push(r.slice()); this.fill(); }
  deleteRow(i) { this.data.splice(i - 1, 1); }
  getDataRange() { return new Range(this, 1, 1, this.data.length, this.width()); }
  getRange(a, b, c, d) { return typeof a === 'string' ? new Range(this, 1, 1, 0, 0) : new Range(this, a, b, c || 1, d || 1); }
  setFrozenRows() {}
  getLastRow() { return this.data.length; }
  getName() { return this.name; }
}
const sheets = {};
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = new Sheet(n)),
  deleteSheet: (sh) => delete sheets[sh.name],
  getSheets: () => Object.values(sheets),
};
const users = new Sheet('Utenti');
users.data = [['Nome', 'Codice', 'Obiettivo settimanale', 'Debug', 'Alias'], ['Francesco', 'FRA-1', 2, 'sì', ''], ['Michy', 'MIC-1', 2, '', ''], ['Paolo', 'PAO-1', 2, '', '']];
sheets.Utenti = users;

// ---------- Proprietà e cache ----------
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const P = {
  RESET_ID: '2026-10-13',
  TRIGGERS_VERSION: '6',
  FIRESTORE_EMULATOR: 'localhost:8080',
  FIREBASE_CLIENT_EMAIL: 'prova@palestrina-cb43c.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  FIREBASE_CHAT: process.env.FIREBASE_CHAT || 'tutti',
  NEWS_RELEASED: JSON.stringify(['sudometro-2', '2026-11']),
};
const props = {
  getProperty: (k) => (k in P ? P[k] : null),
  setProperty: (k, v) => { P[k] = String(v); },
  deleteProperty: (k) => { delete P[k]; },
  getProperties: () => ({ ...P }),
};
const cacheData = {};
const cache = {
  get: (k) => (cacheData[k] && cacheData[k].exp > Date.now() ? cacheData[k].v : null),
  put: (k, v, s = 600) => { cacheData[k] = { v, exp: Date.now() + s * 1000 }; },
  remove: (k) => delete cacheData[k],
};

// ---------- Utilities ----------
function parts(d, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
  return Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
}
const Utilities = {
  formatDate(d, tz, fmt) {
    const p = parts(d, tz);
    return fmt.replace(/yyyy|MM|dd|HH|mm|ss|EEE|u/g, (t) => ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second, EEE: p.weekday, u: String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1) }[t]));
  },
  parseDate(s, tz, fmt) {
    const m = String(s).match(/^(\d{4})-(\d\d)-(\d\d)(?: (\d\d):(\d\d))?/);
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    const p = parts(new Date(guess), tz);
    const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
    return new Date(guess - off);
  },
  base64EncodeWebSafe: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => b & 255))).toString('base64url'),
  base64Encode: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => b & 255))).toString('base64'),
  computeRsaSha256Signature: (s, key) => [...crypto.sign('sha256', Buffer.from(s), key)].map((b) => (b > 127 ? b - 256 : b)),
  getUuid: () => crypto.randomUUID(),
  newBlob: () => ({}),
};
const UrlFetchApp = {
  fetch(url, o = {}) {
    const args = ['-sS', '-X', (o.method || 'get').toUpperCase(), '-w', '\n%{http_code}', url];
    Object.entries(o.headers || {}).forEach(([k, v]) => args.push('-H', `${k}: ${v}`));
    if (o.payload !== undefined) {
      if (typeof o.payload === 'string') args.push('-H', `Content-Type: ${o.contentType || 'text/plain'}`, '--data-binary', o.payload);
      else Object.entries(o.payload).forEach(([k, v]) => args.push('--data-urlencode', `${k}=${v}`));
    }
    const out = execFileSync('curl', args, { encoding: 'utf8', env: { ...process.env, NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1' } });
    const i = out.lastIndexOf('\n');
    const body = out.slice(0, i);
    const code = Number(out.slice(i + 1));
    return { getResponseCode: () => code, getContentText: () => body };
  },
};
const lock = { waitLock() {}, tryLock: () => true, releaseLock() {} };
const ctx = {
  console,
  SpreadsheetApp: { getActive: () => ss },
  PropertiesService: { getScriptProperties: () => props },
  CacheService: { getScriptCache: () => cache },
  LockService: { getScriptLock: () => lock },
  Session: { getScriptTimeZone: () => TZ },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => new Proxy({}, { get: (_, k) => (k === 'create' ? () => ({}) : () => this) }), WeekDay: {} },
  DriveApp: {},
  Logger: { log: (...a) => console.log('[Logger]', ...a) },
  Utilities,
  UrlFetchApp,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;globalThis.__run = (n, ...a) => eval(n)(...a);', ctx, { filename: 'Code.gs' });

http
  .createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let out;
      try {
        if (req.url.startsWith('/run/')) {
          // Funzioni dell'editor (es. copiaChatSuFirebase) e accesso ai fogli per le prove
          const name = req.url.slice(5);
          if (name === 'sheet') out = JSON.stringify((sheets[JSON.parse(body).name] || { data: null }).data);
          else if (name === 'append') { const b = JSON.parse(body); (sheets[b.name] || ss.insertSheet(b.name)).appendRow(b.row); out = '{"ok":true}'; }
          else if (name === 'prop') { const b = JSON.parse(body); if (b.value === null) delete P[b.key]; else P[b.key] = b.value; out = '{"ok":true}'; }
          else out = JSON.stringify({ result: ctx.__run(name) });
        } else out = ctx.doPost({ postData: { contents: body } }).text;
      } catch (err) {
        out = JSON.stringify({ error: String(err.stack || err) });
      }
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(out);
    });
  })
  .listen(+port, () => console.log('finto Apps Script su', port));
