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

// Подписан ли автор на канал: true / false, либо null, если TikTok не сообщил
function followerOf(u, d) {
  for (const k of ['isFollower', 'is_follower']) if (typeof u[k] === 'boolean') return u[k];
  const info = u.followInfo || u.follow_info || (d && (d.followInfo || d.follow_info));
  let st = info ? pick(info.followStatus, info.follow_status) : null;
  if (st === null) st = pick(u.followStatus, u.follow_status);
  if (st !== null) return st !== 0; // 0 — нет; 1 — подписан; 2 — взаимная подписка
  const role = pick(u.followRole, d && d.followRole);
  if (role !== null) return role >= 1;
  const ident = u.userIdentity || u.user_identity || (d && (d.userIdentity || d.user_identity));
  if (ident) for (const k of ['isFollowerOfAnchor', 'is_follower_of_anchor']) if (typeof ident[k] === 'boolean') return ident[k];
  return null;
}

// Что именно прислал TikTok о подписке — для подсказки к сообщению (диагностика)
function followDebug(u, d) {
  const info = u.followInfo || u.follow_info || (d && (d.followInfo || d.follow_info));
  const parts = [];
  const st = info ? pick(info.followStatus, info.follow_status) : pick(u.followStatus, u.follow_status);
  const role = pick(u.followRole, d && d.followRole);
  if (st !== null) parts.push('followStatus=' + st);
  if (role !== null) parts.push('followRole=' + role);
  return parts.length ? parts.join(', ') : 'TikTok не передал данные о подписке';
}

// Ссылка на аватарку: разные версии библиотеки кладут её в разные поля
function avatarOf(u) {
  const first = (x) => (x && (x.url || (Array.isArray(x.urlList) && x.urlList[0]) || (Array.isArray(x.url_list) && x.url_list[0]) || (Array.isArray(x.urls) && x.urls[0]))) || '';
  const url = u.profilePictureUrl || first(u.profilePicture) || first(u.avatarThumb) || first(u.avatarMedium) || (typeof u.profilePicture === 'string' ? u.profilePicture : '');
  return /^https?:\/\//.test(url) ? url : '';
}

function userOf(d) {
  d = d || {};
  const u = d.user || d;
  const badges = JSON.stringify(u.badges || u.badgeList || u.userBadges || []).toLowerCase();
  return {
    name: str(u.nickname || u.uniqueId || u.displayId || '') || 'Гость',
    id: str(u.uniqueId || u.userId || ''),
    isSub: !!(u.isSubscriber || u.subscriber || badges.includes('subscriber') || badges.includes('sub_')),
    isMod: !!(u.isModerator || u.moderator),
    isFollower: followerOf(u, d),
    fdbg: followDebug(u, d),
    avatar: avatarOf(u),
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
  const total = pick(d.totalLikeCount, d.total);
  return { count: pick(d.likeCount, d.count) ?? 1, total: total > 0 ? total : null }; // 0 — «итога нет», а не «лайков нет»
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
    image: (() => { const i = det.giftPictureUrl || det.giftImage || det.image || d.giftPictureUrl; const x = typeof i === 'string' ? i : (i && (i.url || (i.urlList && i.urlList[0]) || (i.url_list && i.url_list[0]))) || ''; return /^https?:\/\//.test(x) ? x : ''; })(),
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

module.exports = { avatarOf, num, pick, userOf, timeMs, chatOf, viewersOf, likesOf, giftOf, isFollowSocial };
