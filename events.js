'use strict';
// Приведение событий TikTok к единому виду.
// Разные версии tiktok-live-connector называют поля по-разному (v1: плоские viewerCount, giftName;
// v2: вложенные user, giftDetails/gift, total, count, content). Берём любое из известных имён,
// поэтому счётчики и озвучка не зависят от версии библиотеки.

// Число из number / bigint / строки / Long-объекта; иначе null
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object') {
    if (typeof v.toNumber === 'function') return num(v.toNumber());
    if (typeof v.low === 'number') return v.low;
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(...vals) {
  for (const v of vals) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function userOf(d) {
  d = d || {};
  const u = d.user || d;
  const badges = JSON.stringify(u.badges || u.badgeList || u.userBadges || []).toLowerCase();
  return {
    name: str(u.nickname || u.uniqueId || u.displayId || '') || 'Гость',
    id: str(u.uniqueId || u.userId || ''),
    isSub: !!(u.isSubscriber || u.subscriber || badges.includes('subscriber') || badges.includes('sub_')),
    isMod: !!(u.isModerator || u.moderator),
  };
}

// Время сообщения в миллисекундах (TikTok присылает то секунды, то миллисекунды)
function timeMs(d) {
  const t = pick(d && d.createTime, d && d.common && d.common.createTime, d && d.timestamp);
  if (t === null || t <= 0) return null;
  return t < 1e12 ? t * 1000 : t;
}

function chatOf(d) {
  d = d || {};
  return { ...userOf(d), text: str(d.comment ?? d.content ?? ''), created: timeMs(d) };
}

// Сколько зрителей сейчас в эфире (null — в событии числа нет)
function viewersOf(d) {
  d = d || {};
  return pick(d.viewerCount, d.total, d.totalUser, d.totalUserCount);
}

function likesOf(d) {
  d = d || {};
  return { count: pick(d.likeCount, d.count) ?? 1, total: pick(d.totalLikeCount, d.total) };
}

// done=false — серия подарков ещё идёт: озвучиваем один раз, когда она закончилась
function giftOf(d) {
  d = d || {};
  const det = d.giftDetails || (d.gift && typeof d.gift === 'object' ? d.gift : {}) || {};
  const type = pick(det.giftType, det.type, d.giftType);
  const streakable = type === 1 || det.streakable === true || det.isStreakable === true;
  const ended = !!d.repeatEnd && d.repeatEnd !== '0';
  return {
    ...userOf(d),
    gift: str(det.giftName || det.name || d.giftName || (typeof d.gift === 'string' ? d.gift : '')) || 'подарок',
    count: Math.max(1, pick(d.repeatCount, d.comboCount) || 1),
    done: !streakable || ended,
  };
}

// Подписка на стримера: событие follow либо social с признаком подписки
function isFollowSocial(d) {
  d = d || {};
  if (pick(d.action) === 1) return true;
  const text = [d.displayType, d.label, d.common && d.common.displayText && JSON.stringify(d.common.displayText)]
    .filter(Boolean).join(' ').toLowerCase();
  return /follow/.test(text);
}

module.exports = { num, pick, userOf, timeMs, chatOf, viewersOf, likesOf, giftOf, isFollowSocial };
