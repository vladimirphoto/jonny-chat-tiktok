'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/mentions');

test('упоминание: вырезается только «@ник», слова сообщения не теряются', () => {
  const m = M.create();
  assert.equal(m.strip('@vlad Привет всем'), 'Привет всем'); // раньше «Привет» пропадало как «вторая часть ника»
  assert.equal(m.strip('@vlad, привет'), 'привет');
  assert.equal(m.strip('@vlad: Спасибо Большое'), 'Спасибо Большое');
  assert.equal(m.strip('привет @vlad как дела'), 'привет как дела');
  assert.equal(m.strip('@vlad-2 Привет'), 'Привет');
  assert.equal(m.strip('@Анна Привет, как дела'), 'Привет, как дела');
  assert.equal(m.strip('@@vlad ok'), 'ok');
  assert.equal(m.strip('@vlad.'), '');
  assert.equal(m.strip('@'), '');
  assert.equal(m.strip('почта a@b тест'), 'почта a@b тест'); // «@» внутри слова — не упоминание
});

test('упоминание: ник из двух слов вырезается только если он известен', () => {
  const m = M.create();
  assert.equal(m.strip('@Анна Петрова спасибо'), 'Петрова спасибо'); // неизвестный ник — лучше оставить слово, чем потерять текст
  m.remember('Анна Петрова');
  m.remember('Анна Петрова 🌸 Мария');
  assert.equal(m.strip('@Анна Петрова спасибо'), 'спасибо');
  assert.equal(m.strip('@анна  петрова, спасибо!'), 'спасибо!');
  assert.equal(m.strip('Привет @Анна Петрова'), 'Привет');
  assert.equal(m.strip('@Анна Петрова Мария привет'), 'привет'); // длинный ник проверяется раньше короткого
  assert.equal(m.strip('@Анна Иванова привет'), 'Иванова привет');
  assert.equal(m.strip('@Анна Петровас привет'), 'Петровас привет'); // совпадение только по границе слова
  m.remember('vlad'); m.remember(''); m.remember(null); // одно слово и мусор запоминать не нужно
  assert.equal(m.strip('@vlad Привет всем'), 'Привет всем');
});
