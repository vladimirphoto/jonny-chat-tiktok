'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const lic = require('../license');
const priv = fs.existsSync('/tmp/lic-private.pem') ? fs.readFileSync('/tmp/lic-private.pem') : null;

test('пробный период: 7 дней Pro, затем ограниченный режим', () => {
  const t0 = 1e12;
  assert.equal(lic.state({ trialStart: t0 }, t0 + 86400000).status, 'trial');
  assert.equal(lic.state({ trialStart: t0 }, t0 + 86400000).features.kaspi, true);
  const e = lic.state({ trialStart: t0 }, t0 + 8 * 86400000);
  assert.equal(e.status, 'expired'); assert.equal(e.features.kaspi, false);
});
test('ключи: подпись, подделка, срок, тариф', { skip: !priv }, () => {
  const now = Date.now();
  const k = lic.sign({ id: 'a', plan: 'pro', term: 'month', iat: now, exp: now + 5 * 86400000 }, priv);
  assert.equal(lic.verify(k).ok, true);
  assert.equal(lic.state({ key: k, trialStart: 1 }).status, 'active');
  assert.equal(lic.verify(k.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))).ok, false);
  const forged = 'ECHO-' + Buffer.from(JSON.stringify({ v: 1, plan: 'pro', exp: 0 })).toString('base64url') + '.' + k.split('.')[1];
  assert.equal(lic.verify(forged).ok, false);
  assert.equal(lic.verify(k, now + 10 * 86400000).expired, true);
  const lite = lic.sign({ id: 'b', plan: 'lite', term: 'month', iat: now, exp: 0 }, priv);
  assert.equal(lic.state({ key: lite, trialStart: 1 }).features.kaspi, false);
  assert.equal(lic.verify('мусор').ok, false);
});
