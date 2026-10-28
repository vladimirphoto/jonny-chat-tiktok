'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../events');

test('чат: v1 comment и v2 content', () => {
  assert.equal(E.chatOf({ comment: 'привет', user: { nickname: 'Аня' } }).text, 'привет');
  assert.equal(E.chatOf({ content: 'привет', user: { nickname: 'Аня' } }).text, 'привет');
  assert.equal(E.chatOf({ comment: 'привет', nickname: 'Аня', uniqueId: 'anya' }).name, 'Аня');
  assert.equal(E.chatOf({}).text, '');
  assert.equal(E.chatOf({}).name, 'Гость');
});

test('время сообщения: секунды, миллисекунды, bigint, строка', () => {
  assert.equal(E.timeMs({ createTime: 1700000000 }), 1700000000000);
  assert.equal(E.timeMs({ createTime: '1700000000123' }), 1700000000123);
  assert.equal(E.timeMs({ common: { createTime: 1700000000123n } }), 1700000000123);
  assert.equal(E.timeMs({}), null);
});

test('зрители: viewerCount, total, totalUser', () => {
  assert.equal(E.viewersOf({ viewerCount: 630 }), 630);
  assert.equal(E.viewersOf({ total: 42, totalUser: 900 }), 42);
  assert.equal(E.viewersOf({ totalUser: 900 }), 900);
  assert.equal(E.viewersOf({ total: 7n }), 7);
  assert.equal(E.viewersOf({}), null);
});

test('лайки: likeCount/totalLikeCount и count/total', () => {
  assert.deepEqual(E.likesOf({ likeCount: 3, totalLikeCount: 100 }), { count: 3, total: 100 });
  assert.deepEqual(E.likesOf({ count: 2, total: 55 }), { count: 2, total: 55 });
  assert.deepEqual(E.likesOf({}), { count: 1, total: null });
});

test('подарки: v1 плоский, v2 giftDetails, v2 gift.name', () => {
  let g = E.giftOf({ giftName: 'Rose', giftType: 1, repeatCount: 3, repeatEnd: false, nickname: 'Аня' });
  assert.equal(g.gift, 'Rose'); assert.equal(g.done, false); assert.equal(g.name, 'Аня');
  g = E.giftOf({ giftName: 'Rose', giftType: 1, repeatCount: 3, repeatEnd: true });
  assert.equal(g.done, true); assert.equal(g.count, 3);
  g = E.giftOf({ giftDetails: { giftName: 'Galaxy', giftType: 2 }, repeatCount: 1, user: { nickname: 'Боря' } });
  assert.equal(g.gift, 'Galaxy'); assert.equal(g.done, true); assert.equal(g.name, 'Боря');
  g = E.giftOf({ gift: { name: 'Heart', type: 1 }, repeatCount: 5, repeatEnd: 1 });
  assert.equal(g.gift, 'Heart'); assert.equal(g.done, true);
  g = E.giftOf({});
  assert.equal(g.gift, 'подарок'); assert.equal(g.count, 1); assert.equal(g.done, true);
});

test('подписка из social', () => {
  assert.equal(E.isFollowSocial({ displayType: 'pm_main_follow_message_viewer_2' }), true);
  assert.equal(E.isFollowSocial({ action: 1 }), true);
  assert.equal(E.isFollowSocial({ displayType: 'pm_main_share_message' }), false);
  assert.equal(E.isFollowSocial({ common: { displayText: { key: 'pm_main_follow_message_viewer_2' } } }), true);
});

test('подписчик канала: followInfo, followRole, isFollower, неизвестно', () => {
  assert.equal(E.userOf({ user: { nickname: 'А', followInfo: { followStatus: 1 } } }).isFollower, true);
  assert.equal(E.userOf({ user: { nickname: 'А', followInfo: { followStatus: 2 } } }).isFollower, true);
  assert.equal(E.userOf({ user: { nickname: 'А', followInfo: { followStatus: 0 } } }).isFollower, false);
  assert.equal(E.userOf({ nickname: 'А', followRole: 1 }).isFollower, true);
  assert.equal(E.userOf({ nickname: 'А', followRole: 0 }).isFollower, false);
  assert.equal(E.userOf({ user: { nickname: 'А', isFollower: true } }).isFollower, true);
  assert.equal(E.userOf({ user: { nickname: 'А' } }).isFollower, null);
});

test('лайки: total 0 означает «итога нет»', () => {
  assert.deepEqual(E.likesOf({ count: 4, total: 0 }), { count: 4, total: null });
});
