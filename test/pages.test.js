'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PAGE = require('../widget-page');

test('страница для GitHub Pages совпадает с виджетом приложения (npm run pages)', () => {
  const f = path.join(__dirname, '..', 'docs', 'chat', 'index.html');
  assert.equal(fs.readFileSync(f, 'utf8'), PAGE);
});

test('страница берёт адрес приложения из параметра port', () => {
  assert.match(PAGE, /URLSearchParams\(location\.search\)\.get\('port'\)/);
  assert.match(PAGE, /EventSource\(BASE\+'\/events'\)/);
});
