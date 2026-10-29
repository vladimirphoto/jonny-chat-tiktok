'use strict';
// Генератор iOS-команды («Команды»/Shortcuts) для Каспи: бинарный plist (.shortcut) без внешних зависимостей.
// Команда делает одно: берёт текст уведомления (Shortcut Input) и шлёт POST JSON {"text": ...} на адрес приёмника.
// Формат запроса остаётся прежним: kaspi.textFromBody уже понимает JSON.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function bplist(root) {
  const objs = [];
  const add = (o) => {
    const idx = objs.length; objs.push(null);
    if (typeof o === 'boolean') objs[idx] = { t: 'b', v: o };
    else if (typeof o === 'number') objs[idx] = Number.isInteger(o) ? { t: 'i', v: o } : { t: 'r', v: o };
    else if (typeof o === 'string') objs[idx] = { t: 's', v: o };
    else if (Array.isArray(o)) objs[idx] = { t: 'a', v: o.map(add) };
    else { const ks = Object.keys(o); objs[idx] = { t: 'd', k: ks.map(add), v: ks.map((k) => add(o[k])) }; }
    return idx;
  };
  add(root);
  const refSize = objs.length > 255 ? 2 : 1;
  const ref = (n) => { const b = Buffer.alloc(refSize); refSize === 1 ? b.writeUInt8(n) : b.writeUInt16BE(n); return b; };
  const head = (type, n) => {
    if (n < 15) return Buffer.from([(type << 4) | n]);
    const l = n < 256 ? Buffer.from([0x10, n]) : (() => { const b = Buffer.alloc(3); b[0] = 0x11; b.writeUInt16BE(n, 1); return b; })();
    return Buffer.concat([Buffer.from([(type << 4) | 0xf]), l]);
  };
  const out = [Buffer.from('bplist00')], offs = []; let pos = 8;
  for (const o of objs) {
    let b;
    if (o.t === 'b') b = Buffer.from([o.v ? 0x09 : 0x08]);
    else if (o.t === 'i') { if (o.v >= 0 && o.v < 256) b = Buffer.from([0x10, o.v]); else if (o.v >= 0 && o.v < 65536) { b = Buffer.alloc(3); b[0] = 0x11; b.writeUInt16BE(o.v, 1); } else { b = Buffer.alloc(9); b[0] = 0x13; b.writeBigInt64BE(BigInt(o.v), 1); } }
    else if (o.t === 'r') { b = Buffer.alloc(9); b[0] = 0x23; b.writeDoubleBE(o.v, 1); }
    else if (o.t === 's') { const ascii = /^[\x00-\x7f]*$/.test(o.v); b = ascii ? Buffer.concat([head(5, o.v.length), Buffer.from(o.v, 'ascii')]) : Buffer.concat([head(6, o.v.length), Buffer.from(o.v, 'utf16le').swap16()]); }
    else if (o.t === 'a') b = Buffer.concat([head(10, o.v.length), ...o.v.map(ref)]);
    else b = Buffer.concat([head(13, o.k.length), ...o.k.map(ref), ...o.v.map(ref)]);
    offs.push(pos); pos += b.length; out.push(b);
  }
  const offSize = pos > 65535 ? 4 : 2, table = Buffer.alloc(offs.length * offSize);
  offs.forEach((o, i) => (offSize === 2 ? table.writeUInt16BE(o, i * 2) : table.writeUInt32BE(o, i * 4)));
  const trailer = Buffer.alloc(32);
  trailer[6] = offSize; trailer[7] = refSize; trailer.writeBigUInt64BE(BigInt(objs.length), 8); trailer.writeBigUInt64BE(0n, 16); trailer.writeBigUInt64BE(BigInt(pos), 24);
  return Buffer.concat([...out, table, trailer]);
}

const tokenStr = (s) => ({ Value: { string: s, attachmentsByRange: {} }, WFSerializationType: 'WFTextTokenString' });
// переменная «Ввод команды» (текст уведомления) внутри строки
const inputVar = () => ({ Value: { string: '\uFFFC', attachmentsByRange: { '{0, 1}': { Type: 'ExtensionInput' } } }, WFSerializationType: 'WFTextTokenString' });

// url — полный адрес приёмника, например http://192.168.0.5:7899/kaspi/<token>
function buildShortcut(url) {
  return bplist({
    WFWorkflowClientVersion: '1146.14',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowImportQuestions: [],
    WFWorkflowInputContentItemClasses: ['WFStringContentItem', 'WFGenericFileContentItem'],
    WFWorkflowTypes: [],
    WFWorkflowActions: [{
      WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
      WFWorkflowActionParameters: {
        WFURL: String(url),
        WFHTTPMethod: 'POST',
        WFHTTPBodyType: 'JSON',
        ShowHeaders: false,
        WFJSONValues: { Value: { WFDictionaryFieldValueItems: [{ WFItemType: 0, WFKey: tokenStr('text'), WFValue: inputVar() }] }, WFSerializationType: 'WFDictionaryFieldValue' },
      },
    }],
  });
}

// на macOS Apple умеет подписывать команды: подписанный файл iOS принимает без «ненадёжных команд»
function signIfPossible(buf) {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve({ buf, signed: false });
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-sc-')), i = path.join(d, 'in.shortcut'), o = path.join(d, 'out.shortcut');
    fs.writeFileSync(i, buf);
    execFile('/usr/bin/shortcuts', ['sign', '-m', 'anyone', '-i', i, '-o', o], { timeout: 20000 }, (err) => {
      let r = { buf, signed: false };
      if (!err) { try { r = { buf: fs.readFileSync(o), signed: true }; } catch (_) {} }
      try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
      resolve(r);
    });
  });
}

// тестовые уведомления в реальных форматах Каспи (для проверки без настоящих переводов)
const TEST_NOTIFICATIONS = [
  { text: 'Перевод. Айдос А. отправил(а) вам 1 000 ₸', amount: 1000, name: 'Айдос А.' },
  { text: 'Пополнение +15 000 ₸. Отправитель: Марат С.\nБаланс: 120 000 ₸', amount: 15000, name: 'Марат С.' },
  { text: 'Kaspi.kz: Вам поступил перевод 2 500,50 ₸ от Анна К.\nСообщение: Спасибо за стрим!', amount: 2501, name: 'Анна К.', message: 'Спасибо за стрим!' },
  { text: 'Покупка 4 500 ₸ Magnum', reject: true },
  { text: 'Вы перевели 2 000 ₸ Ивану И.', reject: true },
];

module.exports = { bplist, buildShortcut, signIfPossible, TEST_NOTIFICATIONS };
