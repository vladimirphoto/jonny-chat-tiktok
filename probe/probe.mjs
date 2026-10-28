import fs from 'fs';
import path from 'path';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const lines = [];
const log = (s) => { lines.push(String(s)); };
const emit = (title) => {
  const msg = lines.join('\n').slice(0, 30000).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
  console.log(`::notice title=${title}::${msg}`);
  lines.length = 0;
};

const root = 'node_modules/tiktok-live-connector';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
log('tiktok-live-connector ' + pkg.version);
log('events: ' + Object.entries(WebcastEvent).filter(([k]) => /CHAT|EMOTE|COMMENT|MESSAGE/i.test(k)).map(([k, v]) => k + '=' + v).join(', '));

// схема чат-сообщения из .d.ts
function walk(d, out = []) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p, out); else if (/\.d\.ts$/.test(f.name)) out.push(p); } return out; }
let shown = 0;
for (const f of walk(root)) {
  const src = fs.readFileSync(f, 'utf8');
  const m = src.match(/(export )?interface WebcastChatMessage \{[\s\S]*?\n\}/);
  if (m && shown < 1) { log('--- ' + f + '\n' + m[0].slice(0, 2500)); shown++; }
}
emit('probe-schema');

const shape = (v, d = 0) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return `str(${v.length})`;
  if (typeof v === 'number' || typeof v === 'bigint') return 'num';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return `[${v.length}]` + (v.length && d < 3 ? shape(v[0], d + 1) : '');
  if (typeof v === 'object') return d > 3 ? '{…}' : '{' + Object.keys(v).map((k) => k + ':' + shape(v[k], d + 1)).join(',') + '}';
  return typeof v;
};

const cands = (process.env.CANDS || 'alishpro0').split(',');
for (const name of cands) {
  const c = new TikTokLiveConnection(name);
  let total = 0, withComment = 0, withEmotes = 0, samples = 0;
  const events = {};
  c.on(WebcastEvent.CHAT, (d) => {
    total++;
    if (d.comment && String(d.comment).length) withComment++;
    if (d.emotes && d.emotes.length) withEmotes++;
    if (samples < 4) { samples++; log('CHAT shape: ' + shape(d)); }
  });
  for (const ev of Object.values(WebcastEvent)) {
    if (ev === WebcastEvent.CHAT) continue;
    c.on(ev, () => { events[ev] = (events[ev] || 0) + 1; });
  }
  try {
    const st = await c.connect();
    log(`connected to ${name}: room ${st.roomId}`);
    await new Promise((r) => setTimeout(r, 45000));
    log(`chats=${total} withComment=${withComment} withEmotes=${withEmotes}`);
    log('other events: ' + JSON.stringify(events));
    await c.disconnect();
  } catch (e) {
    log(`connect ${name} failed: ${e && e.name} :: ${String(e && e.message).slice(0, 300)}`);
  }
  emit('probe-live-' + name);
}
process.exit(0);
