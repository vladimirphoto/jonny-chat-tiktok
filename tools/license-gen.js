'use strict';
// Выпуск тестовых ключей: node tools/license-gen.js <private.pem> <lite|pro> <month|quarter|year|lifetime> [id]
const fs = require('fs');
const { sign } = require('../license');
const [pem, plan, term, id] = process.argv.slice(2);
if (!pem || !plan || !term) { console.error('node tools/license-gen.js <private.pem> <lite|pro> <month|quarter|year|lifetime> [id]'); process.exit(1); }
const days = { month: 30, quarter: 91, year: 365, lifetime: 0 }[term];
if (days === undefined) { console.error('term: month|quarter|year|lifetime'); process.exit(1); }
const now = Date.now();
console.log(sign({ id: id || 'test-' + now.toString(36), plan, term, iat: now, exp: days ? now + days * 86400000 : 0 }, fs.readFileSync(pem)));
