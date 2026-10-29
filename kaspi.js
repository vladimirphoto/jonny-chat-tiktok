'use strict';
// Донаты Каспи: разбор текста уведомления о переводе и маленький приёмник, куда телефон
// присылает это уведомление (HTTP-запрос по Wi-Fi). Модуль не зависит от Electron.
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const PORT_FROM = 7899, PORT_TO = 7919;

const L = '\\p{L}';
const CAP = '[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ]';
const LOW = '[a-zа-яёәғқңөұүһі\'’-]';
// «Айдос А.», «Анна», «Анна К.» — как Каспи показывает отправителя
const NAME = `${CAP}${LOW}+(?:\\s+${CAP}\\.)?`;
const STOP = new Set(['kaspi', 'gold', 'red', 'перевод', 'пополнение', 'вам', 'вы', 'баланс', 'сумма', 'комиссия', 'доступно', 'сообщение', 'комментарий', 'оплата', 'покупка', 'каспи', 'карта', 'карты']);

// слово без учёта регистра, но без флага i (он сломал бы различие заглавных и строчных в имени)
const K = (w) => [...w].map((c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).join('');
const norm = (s) => String(s || '').replace(/[   ]/g, ' ').replace(/\r/g, '').trim();

// суммы в тенге: «1 000 ₸», «+1000 тг», «2 500,50 ₸». Остаток и баланс — не сумма перевода
function amounts(t) {
  const out = [];
  const re = /([+\-−]?)\s*(\d[\d ]*(?:[.,]\d{1,2})?)\s*(?:₸|тг\.?|тенге|tenge|kzt|т|t)(?![\p{L}])/giu;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 18), m.index).toLowerCase();
    if (/(баланс|остаток|доступно|available|balance|лимит|комисси)[^\d]*$/.test(before)) continue;
    let digits = m[2].replace(/ /g, '');
    const frac = /[.,](\d{1,2})$/.exec(digits);
    let v = frac ? Number(digits.slice(0, -frac[0].length)) + Number(frac[1].padEnd(2, '0')) / 100 : Number(digits.replace(/[.,]/g, ''));
    if (!Number.isFinite(v) || v <= 0) continue;
    out.push({ v: Math.round(v), sign: m[1], idx: m.index });
  }
  return out;
}

function nameOf(t) {
  const pick = (re) => {
    const m = new RegExp(re, 'u').exec(t);
    if (!m) return '';
    const n = m[1].trim();
    return STOP.has(n.split(/\s+/)[0].toLowerCase()) ? '' : n;
  };
  return pick(`(?:^|[^${L}])(?:${K('от')}|${K('from')})\\s+(${NAME})`)
    || pick(`(${NAME})\\s+(?:${K('перевёл')}|${K('перевел')}|${K('отправил')}|${K('пополнил')})`)
    || pick(`(?:^|[^${L}])(${CAP}${LOW}+\\s+${CAP}\\.)`)
    || '';
}

function messageOf(t) {
  const m = /(?:сообщение|комментарий|коммент\.?|примечание|назначение)\s*[:\-—]\s*([^\n]+)/iu.exec(t);
  return m ? m[1].trim().slice(0, 140) : '';
}

// strict=false: любой текст с суммой считается донатом (если слова в уведомлении у Каспи другие)
function parse(raw, { strict = true } = {}) {
  const t = norm(raw);
  if (!t) return { ok: false, reason: 'пустой текст' };
  const am = amounts(t);
  if (!am.length) return { ok: false, reason: 'в тексте нет суммы в тенге' };
  if (strict) {
    const strongIn = /(поступил|пополнени|зачислен|получили перевод|вам перевели|вам отправили|(?:отправил|перевёл|перевел)(?:\(а\)|а)?\s+вам|входящ)/iu.test(t);
    const out = /(вы перевели|вы отправили|покупк|списани|снятие|оплата|платеж|платёж|списано|исходящ)/iu.test(t);
    if (out && !strongIn) return { ok: false, reason: 'исходящая операция (не перевод вам)' };
    if (!strongIn && !/перевод/iu.test(t) && !am.some((a) => a.sign === '+')) return { ok: false, reason: 'не похоже на входящий перевод' };
  }
  const a = am.find((x) => x.sign === '+') || am[0];
  return { ok: true, amount: a.v, name: nameOf(t) || 'Аноним', message: messageOf(t) };
}

// из тела запроса достаём текст уведомления: JSON, форма или просто текст
function textFromBody(body, contentType, query) {
  const parts = [];
  const take = (o, depth = 0) => {
    if (o == null || depth > 3) return;
    if (typeof o === 'string') parts.push(o);
    else if (Array.isArray(o)) o.forEach((x) => take(x, depth + 1));
    else if (typeof o === 'object') Object.values(o).forEach((x) => take(x, depth + 1));
  };
  const b = String(body || '');
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('json') || /^\s*[{[]/.test(b)) { try { take(JSON.parse(b)); } catch (_) { parts.push(b); } }
  else if (ct.includes('x-www-form-urlencoded') || /^[\w.-]+=/.test(b)) { new URLSearchParams(b).forEach((v) => parts.push(v)); }
  else parts.push(b);
  if (query) query.forEach((v, k) => { if (k !== 'token') parts.push(v); });
  return parts.filter(Boolean).join('\n').slice(0, 2000);
}

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Приёмник слушает локальную сеть (телефон и компьютер — в одном Wi-Fi). Адрес содержит секретный токен.
function startReceiver({ getConfig, onNotification, getShortcut }) {
  let recent = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // раздача готовой iOS-команды: GET /shortcut/<token>/EchoChat-Kaspi.shortcut (токен в адресе, как и у /kaspi/)
    const sc = /^\/shortcut\/([\w-]+)\/[\w.-]+\.shortcut$/.exec(url.pathname);
    if (sc && req.method === 'GET' && getShortcut) {
      const c = getConfig();
      if (!c.enabled || !c.token || !safeEq(sc[1], c.token)) { res.writeHead(404); return res.end(); }
      return Promise.resolve(getShortcut(req.headers.host)).then((r) => {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="EchoChat-Kaspi.shortcut"', 'Content-Length': r.buf.length, 'Cache-Control': 'no-store' });
        res.end(r.buf);
      }).catch(() => { res.writeHead(500); res.end(); });
    }
    // проверка связи с телефона (откройте адрес в Safari): GET /kaspi/<token>/ping
    const pg = /^\/kaspi\/([\w-]+)\/ping$/.exec(url.pathname);
    if (pg) {
      const c = getConfig();
      const okp = c.enabled && c.token && safeEq(pg[1], c.token);
      res.writeHead(okp ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: !!okp }));
    }
    const m = /^\/kaspi\/([\w-]+)\/?$/.exec(url.pathname) || (url.pathname === '/kaspi' ? [null, url.searchParams.get('token') || ''] : null);
    const cfg = getConfig();
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
    if (!m || !cfg.enabled || !cfg.token || !safeEq(m[1], cfg.token)) return json(404, { ok: false });
    const now = Date.now();
    recent = recent.filter((t) => now - t < 60000);
    if (recent.length >= 30) return json(429, { ok: false, error: 'слишком часто' });
    recent.push(now);
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 16384) { req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const text = textFromBody(Buffer.concat(chunks).toString('utf8'), req.headers['content-type'], url.searchParams);
      let r;
      try { r = onNotification(text) || {}; } catch (e) { r = { accepted: false, reason: String(e && e.message || e) }; }
      json(200, { ok: true, accepted: !!r.accepted, reason: r.reason || '' });
    });
  });
  return new Promise((resolve) => {
    let p = PORT_FROM, ready = false;
    server.on('error', (e) => {
      if (ready) return;
      if (e.code === 'EADDRINUSE' && p < PORT_TO) server.listen(++p, '0.0.0.0');
      else resolve({ port: 0, close() {} });
    });
    server.on('listening', () => { ready = true; resolve({ port: p, close() { try { server.close(); } catch (_) {} } }); });
    server.listen(p, '0.0.0.0');
  });
}

// адреса этого компьютера в локальной сети — для ссылки, которую вводят на телефоне
function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((i) => {
    if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }));
  const rank = (a) => (/^192\.168\./.test(a) ? 0 : /^10\./.test(a) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

const newToken = () => crypto.randomBytes(12).toString('hex');

module.exports = { parse, amounts, textFromBody, startReceiver, lanAddresses, newToken, PORT_FROM, PORT_TO };
