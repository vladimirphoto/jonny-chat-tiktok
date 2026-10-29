'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const k = require('../kaspi');

test('сумма и имя: разные формулировки входящего перевода', () => {
  const cases = [
    ['Перевод. Айдос А. отправил(а) вам 1 000 ₸', 1000, 'Айдос А.'],
    ['Вам поступил перевод 2 500 ₸ от Анна К.', 2500, 'Анна К.'],
    ['Пополнение +15 000 ₸. Отправитель: Марат С.\nБаланс: 120 000 ₸', 15000, 'Марат С.'],
    ['Иван И. перевёл(а) вам 500 тг', 500, 'Иван И.'],
    ['Kaspi.kz: Перевод от Дина Н. 1 234,50 ₸', 1235, 'Дина Н.'],
    ['Перевод 3000 ₸', 3000, 'Аноним'],
  ];
  for (const [text, amount, name] of cases) {
    const r = k.parse(text);
    assert.equal(r.ok, true, text);
    assert.equal(r.amount, amount, text);
    assert.equal(r.name, name, text);
  }
});

test('баланс не принимается за сумму перевода', () => {
  const r = k.parse('Баланс: 120 000 ₸. Перевод от Аня Б. 700 ₸');
  assert.equal(r.amount, 700);
});

test('исходящие операции и покупки не считаются донатом', () => {
  for (const t of ['Покупка 4 500 ₸ Magnum', 'Вы перевели 2 000 ₸ Ивану И.', 'Списание 1 000 ₸', 'Оплата 5 000 ₸ Kaspi QR']) {
    assert.equal(k.parse(t).ok, false, t);
  }
});

test('сообщение к переводу', () => {
  const r = k.parse('Перевод от Мира Т. 1 000 ₸\nСообщение: Привет, стример!');
  assert.equal(r.message, 'Привет, стример!');
});

test('нестрогий режим: любой текст с суммой', () => {
  assert.equal(k.parse('Что-то на 900 ₸', { strict: false }).amount, 900);
  assert.equal(k.parse('Что-то на 900 ₸').ok, false);
});

test('текст из тела запроса: JSON, форма, простой текст', () => {
  assert.match(k.textFromBody('{"title":"Kaspi","text":"Перевод 1000 ₸"}', 'application/json'), /Перевод 1000/);
  assert.match(k.textFromBody('title=Kaspi&text=%D0%9F%D0%B5%D1%80%D0%B5%D0%B2%D0%BE%D0%B4+1000', 'application/x-www-form-urlencoded'), /Перевод 1000/);
  assert.equal(k.textFromBody('Перевод 1000 ₸', 'text/plain'), 'Перевод 1000 ₸');
});

test('приёмник: токен, разбор, отказ при неверном токене', async () => {
  const got = [];
  const cfg = { enabled: true, token: 'abc123' };
  const r = await k.startReceiver({ getConfig: () => cfg, onNotification: (t) => { got.push(t); return { accepted: true }; } });
  assert.ok(r.port >= k.PORT_FROM);
  const post = (path, body) => new Promise((res, rej) => {
    const q = http.request({ host: '127.0.0.1', port: r.port, path, method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }, (resp) => {
      let d = ''; resp.on('data', (c) => (d += c)); resp.on('end', () => res({ code: resp.statusCode, body: d }));
    });
    q.on('error', rej); q.end(body);
  });
  const ok = await post('/kaspi/abc123', 'Перевод 1000 ₸');
  assert.equal(ok.code, 200); assert.equal(JSON.parse(ok.body).accepted, true);
  assert.equal(got[0], 'Перевод 1000 ₸');
  assert.equal((await post('/kaspi/wrong', 'x')).code, 404);
  cfg.enabled = false;
  assert.equal((await post('/kaspi/abc123', 'x')).code, 404);
  r.close();
});
