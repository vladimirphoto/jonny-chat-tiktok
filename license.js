'use strict';
// Лицензии (тестовая платная версия). Ключ подписан Ed25519: проверяется офлайн, приватный ключ в приложении не хранится.
// Формат ключа: ECHO-<payload base64url>.<подпись base64url>; payload = { v, id, plan: 'lite'|'pro', term, iat, exp (мс, 0 = бессрочно) }
const crypto = require('crypto');
const fs = require('fs');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAKNzoTiIl8Me6Zw6yYESYcwLfoMBurKbRkyhaua1UKhQ=
-----END PUBLIC KEY-----`;
const TRIAL_DAYS = 7, DAY = 86400000;
const PLANS = { lite: { kaspi: false }, pro: { kaspi: true } };
const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payload, privatePem) {
  const body = b64u(JSON.stringify({ v: 1, ...payload }));
  return 'ECHO-' + body + '.' + b64u(crypto.sign(null, Buffer.from(body), privatePem));
}
function verify(key, now = Date.now()) {
  const m = /^ECHO-([\w-]+)\.([\w-]+)$/.exec(String(key || '').trim());
  if (!m) return { ok: false, reason: 'неверный формат ключа' };
  let good = false;
  try { good = crypto.verify(null, Buffer.from(m[1]), PUBLIC_KEY, Buffer.from(m[2], 'base64url')); } catch (_) {}
  if (!good) return { ok: false, reason: 'ключ не прошёл проверку подписи' };
  let p; try { p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (_) { return { ok: false, reason: 'повреждённый ключ' }; }
  if (!PLANS[p.plan]) return { ok: false, reason: 'неизвестный тариф' };
  if (p.exp && now > p.exp) return { ok: false, reason: 'срок ключа истёк', payload: p, expired: true };
  return { ok: true, payload: p };
}
// итоговое состояние: активный ключ > пробный период > ограниченный режим
function state(store, now = Date.now()) {
  const v = store.key ? verify(store.key, now) : null;
  if (v && v.ok) {
    const left = v.payload.exp ? Math.max(0, Math.ceil((v.payload.exp - now) / DAY)) : null;
    return { status: 'active', plan: v.payload.plan, term: v.payload.term, daysLeft: left, features: PLANS[v.payload.plan] };
  }
  const trialEnd = (store.trialStart || now) + TRIAL_DAYS * DAY;
  if (now < trialEnd) return { status: 'trial', plan: 'pro', daysLeft: Math.ceil((trialEnd - now) / DAY), features: PLANS.pro, note: v && v.reason ? v.reason : '' };
  return { status: 'expired', plan: 'lite', daysLeft: 0, features: PLANS.lite, note: v && v.reason ? v.reason : '' };
}
function load(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; } }
function save(file, s) { try { fs.writeFileSync(file, JSON.stringify(s)); } catch (_) {} }

module.exports = { sign, verify, state, load, save, TRIAL_DAYS, PLANS };
