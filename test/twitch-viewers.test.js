'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { viewersOf } = require('../twitch');

const reply = (data) => async () => ({ ok: true, json: async () => data });

test('онлайн Twitch: число зрителей из ответа', async () => {
  assert.equal(await viewersOf('shroud', reply({ data: { user: { stream: { viewersCount: 4321 } } } })), 4321);
});

test('онлайн Twitch: стрима нет, канала нет, сбой сети, плохое имя — null', async () => {
  assert.equal(await viewersOf('shroud', reply({ data: { user: { stream: null } } })), null);
  assert.equal(await viewersOf('shroud', reply({ data: { user: null } })), null);
  assert.equal(await viewersOf('shroud', async () => { throw new Error('net'); }), null);
  assert.equal(await viewersOf('shroud', async () => ({ ok: false })), null);
  assert.equal(await viewersOf('a"b', reply({})), null);
});
