import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';

const emit = (title, msg) => console.log(`::notice title=${title}::` + String(msg).slice(0, 3600).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A'));
process.on('uncaughtException', (e) => emit('probe-uncaught', e && e.stack || e));
process.on('unhandledRejection', (e) => emit('probe-unhandled', e && e.stack || e));

// компактное описание: числа и булевы — значения, строки — длина, объекты — только ключи верхнего уровня
const brief = (v, d = 0) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return `s${v.length}`;
  if (typeof v === 'bigint') return 'big:' + String(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') return d >= 1 ? '{…}' : '{' + Object.keys(v).map((k) => k + ':' + brief(v[k], d + 1)).join(' ') + '}';
  return typeof v;
};
const top = (d) => Object.keys(d).filter((k) => k !== 'common' && k !== 'user').map((k) => k + '=' + brief(d[k], 0)).join(' ');
const userKeys = (u) => u ? Object.keys(u).filter((k) => ['string', 'number', 'boolean'].includes(typeof u[k]) || typeof u[k] === 'bigint').join(',') : 'none';

const name = process.env.CANDS || 'alishpro0';
const c = new TikTokLiveConnection(name, { processInitialData: true, fetchRoomInfoOnConnect: true, enableExtendedGiftInfo: false, authenticateWs: false, useMobile: false, webClientOptions: {}, wsClientOptions: {} });
const seen = {}, counts = {};
const interesting = ['chat', 'gift', 'follow', 'like', 'roomUser', 'member', 'social', 'share', 'emote', 'subscribe'];
for (const ev of Object.values(WebcastEvent)) {
  c.on(ev, (d) => {
    counts[ev] = (counts[ev] || 0) + 1;
    if (!interesting.includes(ev)) return;
    seen[ev] = seen[ev] || [];
    if (seen[ev].length < 2 && d && typeof d === 'object') seen[ev].push({ top: top(d), user: userKeys(d.user), ident: d.userIdentity ? brief(d.userIdentity, 0) : '' });
  });
}
try {
  const st = await c.connect();
  emit('probe-0-conn', `connected room=${st.roomId}`);
  await new Promise((r) => setTimeout(r, 70000));
  await c.disconnect();
} catch (e) {
  emit('probe-0-conn', `connect failed: ${e && e.name} :: ${String(e && e.message).slice(0, 300)}`);
}
emit('probe-1-counts', JSON.stringify(counts));
for (const ev of interesting) {
  if (!seen[ev]) continue;
  emit('probe-ev-' + ev, seen[ev].map((s) => `TOP: ${s.top}\nUSERKEYS: ${s.user}\nIDENT: ${s.ident}`).join('\n--\n'));
}
process.exit(0);
