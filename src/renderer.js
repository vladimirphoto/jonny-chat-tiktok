'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)));

/* ---------- настройки и голоса ---------- */
// Живые нейро-голоса Microsoft (бесплатно, без ключей). Мультиязычные читают по-русски,
// у них лёгкий акцент. Недоступные на сервере голоса скрываются сами (см. applyCatalog).
const BUILTIN = [
  { id: 'b-svetlana', name: 'Светлана', desc: 'Женский · родной русский, тёплый', voice: 'ru-RU-SvetlanaNeural', gender: 'F' },
  { id: 'b-dmitry', name: 'Дмитрий', desc: 'Мужской · родной русский, уверенный', voice: 'ru-RU-DmitryNeural', gender: 'M' },
  { id: 'b-ava', name: 'Ава', desc: 'Женский · мягкий, живой', voice: 'en-US-AvaMultilingualNeural', gender: 'F' },
  { id: 'b-emma', name: 'Эмма', desc: 'Женский · спокойный, дружелюбный', voice: 'en-US-EmmaMultilingualNeural', gender: 'F' },
  { id: 'b-vivienne', name: 'Вивьен', desc: 'Женский · нежный, выразительный', voice: 'fr-FR-VivienneMultilingualNeural', gender: 'F' },
  { id: 'b-seraphina', name: 'Серафина', desc: 'Женский · чёткий, уверенный', voice: 'de-DE-SeraphinaMultilingualNeural', gender: 'F' },
  { id: 'b-andrew', name: 'Эндрю', desc: 'Мужской · тёплый, душевный', voice: 'en-US-AndrewMultilingualNeural', gender: 'M' },
  { id: 'b-brian', name: 'Брайан', desc: 'Мужской · ровный, дикторский', voice: 'en-US-BrianMultilingualNeural', gender: 'M' },
  { id: 'b-remy', name: 'Реми', desc: 'Мужской · бархатный, спокойный', voice: 'fr-FR-RemyMultilingualNeural', gender: 'M' },
  { id: 'b-florian', name: 'Флориан', desc: 'Мужской · бодрый, энергичный', voice: 'de-DE-FlorianMultilingualNeural', gender: 'M' },
].map((v) => ({ rate: 0, pitch: 0, ...v, provider: 'edge', builtin: true }));

const DEFAULTS = {
  selected: 'b-svetlana', vol: 80, maxLen: 140, nick: '',
  presets: [],
  wAlignTt: 'left', wAlignTw: 'right', wIcons: true, wAvatars: true, wGifts: true, wShadow: true, wFade: true, wScale: 100, wHeight: 100, wFadeSec: 20, twNick: '',
  ttChat: true, twChat: true, readName: true, gifts: true, follows: true, eventVoice: '', ttVoice: '', twVoice: '',
  skipCmd: true, skipLinks: true, onlyRu: true, noRepeat: true, profanity: true, skipMentions: true, noEmoji: true,
};
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('echochat2') || '{}') }; } catch (_) {}
// прежняя общая настройка выравнивания (split / left / right) переносится на TikTok и Twitch отдельно
try { const raw = JSON.parse(localStorage.getItem('echochat2') || '{}'); if (raw.wAlign && !raw.wAlignTt) { S.wAlignTt = raw.wAlign === 'right' ? 'right' : 'left'; S.wAlignTw = raw.wAlign === 'left' ? 'left' : 'right'; } } catch (_) {}
// встроенные голоса всегда на месте, свои — добавляются после них
S.presets = BUILTIN.map((b) => ({ ...b, ...((S.presets || []).find((p) => p.id === b.id) || {}), builtin: true }));
if (!S.presets.some((p) => p.id === S.selected)) S.selected = BUILTIN[0].id;
delete S.subsOnly; // режим «только подписчики» убран
delete S.showTwitch; // чат Twitch всегда показывается в ленте, если канал подключён
// прежняя общая настройка «озвучивать чат» переносится на обе платформы
try { const raw = JSON.parse(localStorage.getItem('echochat2') || '{}'); if (typeof raw.chat === 'boolean' && raw.ttChat === undefined) { S.ttChat = raw.chat; S.twChat = raw.chat; } } catch (_) {}
delete S.chat;
// голоса платформ: у тех, кто обновился, остаётся прежний голос чата
const ensureRouteVoices = () => ['ttVoice', 'twVoice'].forEach((k) => { if (!S.presets.some((p) => p.id === S[k])) S[k] = S.presets.some((p) => p.id === S.selected) ? S.selected : BUILTIN[0].id; });
ensureRouteVoices();
const save = () => { try { localStorage.setItem('echochat2', JSON.stringify(S)); } catch (_) {} };
const selectedPreset = () => S.presets.find((p) => p.id === S.selected) || S.presets[0];
const ttPreset = () => S.presets.find((p) => p.id === S.ttVoice) || selectedPreset();
const twPreset = () => S.presets.find((p) => p.id === S.twVoice) || selectedPreset();

/* ---------- выпадающие списки в стиле приложения ---------- */
const csels = [];
function closeSels(except) { csels.forEach((c) => { if (c.root !== except) c.root.classList.remove('open'); }); }
function makeSelect(id, { options, get, set }) {
  const root = $('#' + id), val = $('.csel-val', root), drop = $('.csel-drop', root);
  const render = () => {
    const opts = options(), cur = get();
    const o = opts.find((x) => x.v === cur) || opts[0];
    val.textContent = o ? o.label : '';
    drop.innerHTML = '';
    opts.forEach((x) => {
      const d = document.createElement('div');
      d.className = 'csel-opt' + (o && x.v === o.v ? ' sel' : '');
      d.textContent = x.label;
      d.onclick = (e) => { e.stopPropagation(); root.classList.remove('open'); set(x.v); render(); };
      drop.appendChild(d);
    });
  };
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSels(root);
    root.classList.toggle('open');
    if (root.classList.contains('open')) {
      // мало места снизу — раскрываем вверх
      root.classList.remove('up');
      const r = root.getBoundingClientRect(), need = Math.min(drop.scrollHeight, 240) + 12;
      if (window.innerHeight - r.bottom < need && r.top > need) root.classList.add('up');
      drop.classList.toggle('sc', drop.scrollHeight > drop.clientHeight + 1); // отступ под полосу прокрутки
      const sel = $('.sel', drop); if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
  });
  csels.push({ root, render });
  render();
  return render;
}
document.addEventListener('click', () => closeSels());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSels(); });

/* ---------- вкладки ---------- */
const TITLES = {
  live: ['Эфир', 'Подключись к TikTok LIVE и слушай чат вслух'],
  voice: ['Голос', 'Живые голоса, свои пресеты и события для озвучки'],
  filters: ['Фильтры', 'Чистый чат без команд, спама и мата'],
  widgets: ['Виджеты', 'Чат TikTok и Twitch для OBS и TikTok LIVE Studio'],
};
$$('.nav').forEach((b) => b.addEventListener('click', () => {
  $$('.nav').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('show', t.id === 'tab-' + b.dataset.tab));
  document.body.classList.toggle('t-widgets', b.dataset.tab === 'widgets');
  if (b.dataset.tab === 'widgets') initPreview();
  $('#title').textContent = TITLES[b.dataset.tab][0];
  $('#subtitle').textContent = TITLES[b.dataset.tab][1];
}));

$$('input[data-k]').forEach((el) => {
  el.checked = !!S[el.dataset.k];
  el.addEventListener('change', () => { S[el.dataset.k] = el.checked; save(); if (el.dataset.k[0] === 'w') pushWidget(); });
});

// кнопки «озвучивать»: нажата — озвучка включена
$$('.vbtn[data-k]').forEach((b) => {
  const paint = () => { const on = !!S[b.dataset.k]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
  paint();
  b.addEventListener('click', () => { S[b.dataset.k] = !S[b.dataset.k]; save(); paint(); });
});

function bindRange(id, label, fmt, get, set) {
  const el = $('#' + id), lb = $('#' + label);
  const refresh = () => { const v = get(); el.value = v; lb.textContent = fmt(v); };
  el.addEventListener('input', () => { set(+el.value); lb.textContent = fmt(+el.value); save(); });
  return refresh;
}
const refreshVol = bindRange('vol', 'volVal', (v) => v + '%', () => S.vol, (v) => { S.vol = v; if (cur) cur.volume = v / 100; });
const refreshRate = bindRange('rate', 'rateVal', (v) => (v > 0 ? '+' : '') + v + '%', () => selectedPreset().rate, (v) => { selectedPreset().rate = v; });
function syncControls() {
  $('#rate').disabled = false;
  $('#pitch').disabled = false;
  $('#rate').closest('.ctl').classList.remove('off');
  $('#pitch').closest('.ctl').classList.remove('off');
}
const refreshPitch = bindRange('pitch', 'pitchVal', (v) => (v > 0 ? '+' : '') + v + ' Гц', () => selectedPreset().pitch, (v) => { selectedPreset().pitch = v; });
const refreshWScale = bindRange('wScale', 'wScaleVal', (v) => v + '%', () => S.wScale, (v) => { S.wScale = v; pushWidget(); });
const refreshWHeight = bindRange('wHeight', 'wHeightVal', (v) => v + '%', () => S.wHeight, (v) => { S.wHeight = v; pushWidget(); window.echo.widgetSet({ ...getWSet(), _previewHeight: true }); });
$('#wHeight').addEventListener('mousedown', () => window.echo.widgetSet({ ...getWSet(), _previewHeight: true }));
$('#wHeight').addEventListener('touchstart', () => window.echo.widgetSet({ ...getWSet(), _previewHeight: true }), { passive: true });
$('#wHeight').addEventListener('mouseup', () => { window.echo.widgetSet({ ...getWSet(), _previewHeight: false }); });
$('#wHeight').addEventListener('touchend', () => window.echo.widgetSet({ ...getWSet(), _previewHeight: false }));
const refreshWFade = bindRange('wFadeSec', 'wFadeSecVal', (v) => v + ' с', () => S.wFadeSec, (v) => { S.wFadeSec = v; pushWidget(); });
function getWSet() { return { alignTt: S.wAlignTt, alignTw: S.wAlignTw, icons: S.wIcons, avatars: S.wAvatars, gifts: S.wGifts, shadow: S.wShadow, fade: S.wFade, scale: S.wScale, height: S.wHeight, fadeSec: S.wFadeSec }; }
function pushWidget() { window.echo.widgetSet(getWSet()); }
const refreshLen = bindRange('maxLen', 'lenVal', (v) => v, () => S.maxLen, (v) => { S.maxLen = v; });
$('#nick').value = S.nick;
$('#twNick').value = S.twNick || '';

/* ---------- карточки голосов ---------- */
const voicesBox = $('#voices');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderVoices() {
  voicesBox.innerHTML = '';
  S.presets.forEach((p) => {
    const d = document.createElement('div');
    d.className = 'voice' + (p.id === S.selected ? ' sel' : '');
    d.dataset.id = p.id;
    d.innerHTML = `<div class="av">${esc((p.name[0] || '?').toUpperCase())}</div>
      <div class="vi"><b>${esc(p.name)}</b><small>${esc(p.desc || p.voice || '')}</small></div>
      <span class="vtags">${S.ttVoice === p.id ? '<em class="tt">TikTok</em>' : ''}${S.twVoice === p.id ? '<em class="tw">Twitch</em>' : ''}</span>
      <button class="mini play" title="Прослушать">${ICON_PLAY}</button>
      ${p.builtin ? '' : '<button class="mini del" title="Удалить голос">✕</button>'}`;
    d.onclick = () => { S.selected = p.id; save(); renderVoices(); refreshRate(); refreshPitch(); syncControls(); };
    $('.play', d).onclick = (e) => { e.stopPropagation(); previewPreset(p); };
    const del = $('.del', d);
    if (del) del.onclick = (e) => {
      e.stopPropagation();
      S.presets = S.presets.filter((x) => x.id !== p.id);
      if (S.selected === p.id) S.selected = BUILTIN[0].id;
      ensureRouteVoices();
      save(); renderVoices(); refreshRate(); refreshPitch(); syncControls();
    };
    voicesBox.appendChild(d);
  });
  refreshPreviewUi();
  fillVoiceSelects();
}

// голос чата TikTok, голос чата Twitch и голос для подарков и подписок — отдельные выпадающие списки
const voiceOpts = () => S.presets.map((p) => ({ v: p.id, label: p.name + ' · ' + (p.gender === 'M' ? 'муж.' : 'жен.') }));
const routeSelects = [
  makeSelect('ttVoiceSel', { options: voiceOpts, get: () => S.ttVoice, set: (v) => { S.ttVoice = v; save(); renderVoices(); } }),
  makeSelect('twVoiceSel', { options: voiceOpts, get: () => S.twVoice, set: (v) => { S.twVoice = v; save(); renderVoices(); } }),
  makeSelect('eventVoiceSel', {
    options: () => [{ v: '', label: 'Как у чата TikTok' }, ...voiceOpts()],
    get: () => (S.presets.some((p) => p.id === S.eventVoice) ? S.eventVoice : ''),
    set: (v) => { S.eventVoice = v; save(); },
  }),
];
function fillVoiceSelects() { ensureRouteVoices(); routeSelects.forEach((r) => r()); }
const eventPreset = () => S.presets.find((p) => p.id === S.eventVoice) || ttPreset();

// Оставляем только голоса, которые реально есть у сервиса Microsoft
const BASE_IDS = ['b-svetlana', 'b-dmitry'];
function applyCatalog(all) {
  if (!Array.isArray(all) || all.length < 10) return; // каталог не загрузился — показываем всё
  const have = new Set(all);
  S.presets = S.presets.filter((p) => BASE_IDS.includes(p.id) || have.has(p.voice));
  if (!S.presets.some((p) => p.id === S.selected)) S.selected = BUILTIN[0].id;
  ensureRouteVoices(); save();
  renderVoices(); refreshRate(); refreshPitch(); syncControls();
}

/* ---------- прослушивание голоса: ▶ превращается в паузу и останавливает ---------- */
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
let previewItem = null; // { id, item } — фраза, которая сейчас звучит или готовится

function refreshPreviewUi() {
  const pid = previewItem && previewItem.id;
  $$('#voices .play').forEach((b) => {
    const on = b.closest('.voice').dataset.id === pid;
    b.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
    b.title = on ? 'Остановить' : 'Прослушать';
    b.classList.toggle('active', on);
  });
  const t = $('#btnTest'), tOn = !!pid && pid === S.selected;
  t.innerHTML = (tOn ? ICON_PAUSE : ICON_PLAY) + (tOn ? 'Остановить' : 'Проверить голос');
  t.classList.toggle('stop', tOn);
}

function stopPreview() {
  if (!previewItem) return;
  previewItem.item.cancelled = true;
  previewItem = null;
  queue.length = 0; stopCurrent();
  refreshPreviewUi();
}

function previewPreset(p) {
  if (previewItem && previewItem.id === p.id) return stopPreview(); // повторное нажатие — пауза
  stopPreview();
  queue.length = 0; stopCurrent();
  const item = {
    el: null, say: `Привет! Меня зовут ${p.name}. Я буду читать чат твоего эфира.`, preset: p,
    onEnd: () => { if (previewItem && previewItem.item === item) { previewItem = null; refreshPreviewUi(); } },
  };
  previewItem = { id: p.id, item };
  refreshPreviewUi();
  enqueue(item, true);
}
$('#btnTest').onclick = () => previewPreset(selectedPreset());

/* ---------- лента ---------- */
const feed = $('#feed');
const colors = ['#8b5cf6', '#ec4899', '#22d3ee', '#f59e0b', '#10b981', '#6366f1', '#ef4444'];
const colorOf = (s) => colors[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];

const ICON_TT = '<svg class="pi" viewBox="0 0 24 24"><path fill="#fff" d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9a7.3 7.3 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5z"/></svg>';
const ICON_TW = '<svg class="pi" viewBox="0 0 24 24"><path fill="#a970ff" d="M4 2 2.5 6v14H8v2.5h3L13.5 20H18l3.5-3.5V2H4zm15.5 13-2.5 2.5h-4.5L10 20v-2.5H6V4h13.5v11zM16 7.5h-2v5h2v-5zm-5 0H9v5h2v-5z"/></svg>';
function addMsg({ name, text, kind = '', sub = false, color, avatar = '', platform = '', giftImg = '' }) {
  $('.empty', feed)?.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + kind;
  const icon = platform === 'twitch' ? ICON_TW : platform === 'tiktok' ? ICON_TT : '';
  el.innerHTML = `<div class="av" style="background-color:${color || colorOf(name)}">${esc((name[0] || '?').toUpperCase())}</div>
    <div class="b"><div class="n">${icon}${esc(name)}${sub ? '<em>SUB</em>' : ''}</div><div class="t">${esc(text)}${giftImg && /^https:/.test(giftImg) ? `<img class="gi" src="${esc(giftImg)}" alt="">` : ''}</div></div>`;
  if (/^https?:\/\//.test(avatar)) { // аватарка с обеих площадок; если не загрузится — остаётся буква
    const av = $('.av', el), im = new Image();
    im.onload = () => { av.style.backgroundImage = `url("${esc(avatar)}")`; av.textContent = ''; };
    im.src = avatar;
  }
  feed.appendChild(el);
  while (feed.children.length > 150) feed.firstChild.remove();
  feed.scrollTop = feed.scrollHeight;
  return el;
}
// цвет точки в «таблетке»: зелёный — подключились, красный — завершилось или ошибка, голубой — остальное
const sysTone = (t) => (/завершена|ошибк|не удалось|не работает|нестабильн|отклон|отмен|не найден|не в эфире/i.test(t) ? 'bad' : /подключено!|подключён\./i.test(t) ? 'ok' : '');
const sys = (text) => addMsg({ name: 'Система', text, kind: ('sys ' + sysTone(text)).trim(), color: '#475569' });
const resetEmpty = () => { feed.innerHTML = '<div class="empty">Здесь появятся сообщения чата</div>'; };
resetEmpty();
$('#btnClear').onclick = resetEmpty;

/* ---------- фильтры ---------- */
const BAD = /(?:^|[^а-яё])(?:х[уy][йяеёию]|пизд|бл[яе]д|бля|еб[аауо]|ёб|ебл|сук[аи]|муд[аи]|гондон|залуп|пидор|пидр|шлюх|дроч|нахуй|нахер)/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const recent = new Map();

function clean(raw) {
  let t = String(raw || '').trim();
  if (S.noEmoji) t = t.replace(EMOJI, '');
  if (S.skipLinks && /(https?:\/\/|www\.|\b[\w-]+\.(com|ru|net|org|me|io|kz|ua)\b)/i.test(t)) return null;
  if (S.skipCmd && /^[!/]/.test(t)) return null;
  t = t.replace(/\[[A-Za-z0-9_ ]{1,24}\]/g, ' '); // смайлы TikTok вида [rose]
  if (S.skipMentions) t = t.replace(/@[\w.]+/g, '');
  t = t.replace(/(\p{L})\1{2,}/gu, '$1').replace(/\s+/g, ' ').trim(); // «приветттт» -> «привет»
  if (!t || !/[a-zа-яё0-9]/i.test(t)) return null;
  if (S.onlyRu && !/[а-яё]/i.test(t)) return null;
  if (S.profanity && BAD.test(t)) return null;
  if (S.noRepeat) {
    const k = t.toLowerCase(), ts = Date.now();
    for (const [key, v] of recent) if (ts - v > 20000) recent.delete(key);
    if (recent.has(k)) return null;
    recent.set(k, ts);
  }
  if (t.length > S.maxLen) t = t.slice(0, S.maxLen).replace(/\s\S*$/, '') + '…';
  return t;
}
// ник для озвучки: без эмодзи и мусора, чтобы голос не спотыкался
function speakName(n) {
  const t = String(n || '').replace(EMOJI, '').replace(/\d{5,}/g, ' ').replace(/[_.]+/g, ' ').replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return t || 'Гость';
}

/* ---------- очередь озвучки ---------- */
const queue = [];
let busy = false, cur = null, curUrl = null, curEl = null, curResolve = null;

const QUEUE_MAX = 8;       // длиннее очередь — больше отставание от эфира
const STALE_MS = 25000;    // сообщение старше этого времени уже не озвучиваем
function prefetch() { queue.slice(0, 3).forEach(ensureSynth); } // звук готовится заранее, пока говорит предыдущая фраза

let voiceCalls = 0; // сколько раз пытались озвучить (для автотеста)
function enqueue(item, force = false) {
  voiceCalls++;
  if ($('#paused').checked && !force) return;
  if (queue.length >= QUEUE_MAX) queue.shift();
  item.preset = item.preset || selectedPreset();
  item.t = Date.now(); item.force = force;
  queue.push(item);
  prefetch();   // синтез стартует сразу при появлении сообщения
  pump();
}

function stopCurrent() {
  if (cur) { cur.onended = cur.onerror = null; cur.pause(); cur = null; }
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  if (curResolve) { const r = curResolve; curResolve = null; r(); }
}

function playBlob(b64) {
  return new Promise((resolve, reject) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    curUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    cur = new Audio(curUrl);
    cur.volume = S.vol / 100;
    curResolve = resolve;
    cur.onended = () => { curResolve = null; resolve(); };
    cur.onerror = () => { curResolve = null; reject(new Error('audio')); };
    cur.play().catch((e) => { curResolve = null; reject(e); });
  });
}

function synthFor(text, p) {
  return window.echo.synth({
    text, voice: p.voice,
    rate: Math.max(0.5, 1 + (p.rate || 0) / 100),
    pitch: ((p.pitch || 0) >= 0 ? '+' : '') + (p.pitch || 0) + 'Hz',
  }).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
}

// синтез стартует заранее, пока играет предыдущая фраза — без пауз между сообщениями
function ensureSynth(item) {
  if (!item.p) item.p = synthFor(item.say, item.preset);
  return item.p;
}

async function speakItem(item) {
  const r = await ensureSynth(item);
  if (item.cancelled) return; // нажали паузу, пока звук готовился
  // не получилось озвучить — молча пропускаем сообщение: без системного голоса Windows и без уведомлений
  if (r && r.ok) { try { await playBlob(r.audio); } catch (_) {} }
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const it = queue.shift();
      if (it.cancelled) { it.onEnd && it.onEnd(); continue; }
      if (!it.force && Date.now() - it.t > STALE_MS) continue; // устарело — пропускаем, чтобы догнать эфир
      curEl = it.el; curEl?.classList.add('speaking'); document.body.classList.add('talking');
      prefetch();
      try { await speakItem(it); } catch (_) {}
      it.onEnd && it.onEnd();
      curEl?.classList.remove('speaking'); curEl = null;
      stopCurrent();
      if (!queue.length) document.body.classList.remove('talking');
    }
  } finally { busy = false; document.body.classList.remove('talking'); }
}

$('#btnSkip').onclick = () => stopCurrent();
$('#paused').addEventListener('change', (e) => { if (e.target.checked) { queue.length = 0; stopCurrent(); } });

/* ---------- события TikTok ---------- */
const counters = { likes: 0, gifts: 0, follows: 0 };
const bump = (id, v) => { $(id).textContent = v.toLocaleString('ru-RU'); };

// Озвучиваем только то, что написали после подключения. Время отсчитывается от нажатия «Подключить»:
// всё, что создано раньше (хвост чата, который иногда присылает платформа), не показываем и не читаем.
const since = { tiktok: 0, twitch: 0 };
const BACKLOG_WINDOW = 20000, SKEW = 2000;
const isBacklog = (m, platform) => !!(m.created && since[platform] && Date.now() - since[platform] < BACKLOG_WINDOW && m.created < since[platform] - SKEW);
function handleChat(m, platform) {
  if (!m.text || isBacklog(m, platform)) return; // пустые и старые сообщения не показываем и не озвучиваем
  const el = addMsg({ name: m.name, text: m.text, sub: m.isSub, avatar: m.avatar, platform });
  if (platform === 'twitch' ? !S.twChat : !S.ttChat) return; // озвучка этой платформы выключена — сообщение остаётся в ленте
  const t = clean(m.text);
  if (!t) return;
  enqueue({ el, say: S.readName ? `${speakName(m.name)}: ${t}` : t, preset: platform === 'twitch' ? twPreset() : ttPreset() });
}
window.echo.onChat((m) => handleChat(m, 'tiktok'));
// Twitch: сообщения есть только если канал указан и подключён
window.echo.onTwChat((m) => handleChat(m, 'twitch'));
window.echo.onGift((g) => {
  counters.gifts += g.count; bump('#sGifts', counters.gifts);
  const el = addMsg({ name: g.name, text: `🎁 отправил(а) «${g.gift}» ×${g.count}`, kind: 'gift', avatar: g.avatar, platform: 'tiktok', giftImg: g.image });
  if (S.gifts) enqueue({ el, say: g.count > 1 ? `${speakName(g.name)}, спасибо за подарки ${g.gift}, ${g.count} штук` : `${speakName(g.name)}, спасибо за подарок ${g.gift}`, preset: eventPreset() });
});
window.echo.onFollow((f) => {
  counters.follows++; bump('#sFollows', counters.follows);
  const el = addMsg({ name: f.name, text: '➕ подписался(ась) на канал', kind: 'follow', avatar: f.avatar, platform: 'tiktok' });
  if (S.follows) enqueue({ el, say: `${speakName(f.name)}, спасибо за подписку`, preset: eventPreset() });
});
// итог от TikTok (total) надёжнее суммы событий; если итога нет (или 0) — копим сами
window.echo.onLike((l) => {
  counters.likes = l.total > 0 ? Math.max(counters.likes, l.total) : counters.likes + (l.count || 1);
  bump('#sLikes', counters.likes);
});
window.echo.onViewers((v) => { if (Number.isFinite(v.count)) $('#sViewers').textContent = v.count.toLocaleString('ru-RU'); });
// онлайн Twitch считается отдельно: пока стрима нет (или канал не подключён) — прочерк
window.echo.onTwViewers((v) => { $('#sViewersTw').textContent = v && Number.isFinite(v.count) ? v.count.toLocaleString('ru-RU') : '—'; });
window.echo.onError((e) => sys(e.message));

/* ---------- подключение ---------- */
let twLive = false, twConnecting = false;
const connTw = $('#connTw');
const btnTw = $('#btnTwitch');

async function connectTwitch() {
  const nick = $('#twNick').value.trim();
  if (!nick || twConnecting) return false;
  twConnecting = true; btnTw.textContent = 'Подключаю…'; btnTw.disabled = true; S.twNick = nick; save();
  since.twitch = Date.now();
  const r = await window.echo.twConnect(nick);
  btnTw.disabled = false; twConnecting = false;
  if (!r || !r.ok) { btnTw.textContent = 'Подключить'; sys('Twitch: ' + ((r && r.error) || 'ошибка подключения')); return false; }
  sys('Twitch: подключаемся к ' + r.channel + '…');
  return true;
}
async function disconnectTwitch() {
  await window.echo.twDisconnect();
  btnTw.textContent = 'Подключить'; btnTw.classList.remove('connected'); twLive = false;
}
btnTw && (btnTw.onclick = async () => { twLive ? disconnectTwitch() : connectTwitch(); });
$('#twNick').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !twLive) connectTwitch(); });

const btn = $('#btnConnect'), status = $('#status');
const pillTt = $('#pillTt'), pillTw = $('#pillTw');
let connected = false, connecting = false;
let _ttText = '', _twText = '';
// обе плашки видны всегда: «Не в эфире TikTok» / «Не в эфире Twitch» до подключения
function renderPills() {
  [[pillTt, connected, _ttText, 'Не в эфире TikTok'], [pillTw, twLive, _twText, 'Не в эфире Twitch']].forEach(([el, on, txt, off]) => {
    el.classList.toggle('on', on); el.classList.toggle('idle', !on);
    el.lastElementChild.textContent = on ? txt : off;
  });
}
const connNick = $('#connNick'), connStatus = $('#connStatus'), connTwStatus = $('#connTwStatus'), connTime = $('#connTime');
// статус подключения платформы: зелёный — подключена, жёлтый — переподключение
const setSt = (el, t, tone) => { el.textContent = t; el.classList.toggle('ok', tone === 'ok'); el.classList.toggle('warn', tone === 'warn'); };
// ник на цветной плашке; «—» — приглушённый
const setNk = (el, t) => { el.textContent = t; el.classList.toggle('off', !t || t === '—'); };
let liveSince = 0, timerId = null;
const fmtTime = (ms) => [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
  .map((n) => String(n).padStart(2, '0')).join(':');
function startTimer() {
  if (timerId) return; // идёт с первой подключённой платформы
  liveSince = Date.now(); clearInterval(timerId);
  const tick = () => { connTime.textContent = fmtTime(Date.now() - liveSince); };
  tick(); timerId = setInterval(tick, 1000);
}
function stopTimer() { if (connected || twLive) return; clearInterval(timerId); timerId = null; connTime.textContent = '—'; }
function showAlert(text, warn, detail) {
  // сообщение об ошибке выводим в ленте чата, а не под кнопкой
  if (!text) return;
  $('.empty', feed)?.remove();
  feed.querySelectorAll('.msg.notice').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'msg notice' + (warn ? ' warn' : '');
  const t = document.createElement('div'); t.className = 't'; t.textContent = text; el.appendChild(t);
  if (detail) { const d = document.createElement('div'); d.className = 'alert-detail'; d.textContent = 'Техническая информация: ' + detail; el.appendChild(d); }
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}
function setStatus(live, text) {
  connected = live;
  if (live) _ttText = text;
  renderPills();
  btn.textContent = live ? 'Отключить' : 'Подключить';
  btn.classList.toggle('connected', live);
  setSt(connStatus, live ? 'В эфире' : 'Не подключено', live ? 'ok' : '');
  if (!live) { setNk(connNick, '—'); stopTimer(); }
}
window.echo.onTwStatus((s) => {
  twLive = s.state === 'live' || s.state === 'reconnect';
  setSt(connTwStatus, s.state === 'live' ? 'Чат подключён' : s.state === 'reconnect' ? 'Переподключение…' : 'Не подключено', s.state === 'live' ? 'ok' : s.state === 'reconnect' ? 'warn' : '');
  if (s.state === 'live') startTimer(); else if (s.state === 'offline') { stopTimer(); $('#sViewersTw').textContent = '—'; }
  setNk(connTw, s.state === 'live' ? '#' + s.channel : s.state === 'reconnect' ? 'переподключение…' : '—');
  if (s.state === 'live') {
    twLive = true; btnTw.textContent = 'Отключить'; btnTw.classList.add('connected');
    sys('Twitch: чат ' + s.channel + ' подключён.');
    _twText = '#' + s.channel;
  }
  if (s.state === 'offline' || s.state === 'reconnect') {
    if (s.state === 'offline') { twLive = false; btnTw.textContent = 'Подключить'; btnTw.classList.remove('connected'); }
    else { btnTw.textContent = 'Переподкл…'; }
    if (s.state === 'reconnect') _twText = 'Twitch · переподкл…';
  }
  renderPills();
});
window.echo.onStatus((s) => {
  if (s.state === 'live') { setStatus(true, '@' + s.username); setNk(connNick, '@' + s.username); startTimer(); $('#feedSub').textContent = 'Эфир @' + s.username; }
  else {
    setStatus(false, s.state === 'ended' ? 'Эфир завершён' : 'Не в эфире');
    $('#feedSub').textContent = s.state === 'ended' ? 'Трансляция завершена' : 'Отключено';
    if (s.state === 'ended') sys('Трансляция завершена.');
  }
});

btn.onclick = async () => {
  if (connecting) return;
  connecting = true;
  try {
    if (connected) { await window.echo.disconnect(); return; }
    const nick = $('#nick').value.trim().replace(/^@/, '');
    if (!nick) { showAlert('Введите ник стримера TikTok LIVE (без @).', true); $('#nick').focus(); return; }
    S.nick = nick; save();
    since.tiktok = Date.now();
    btn.textContent = 'Подключаю…'; btn.classList.add('connecting');
    $('#feedSub').textContent = 'Ищем эфир @' + nick;
    counters.likes = counters.gifts = counters.follows = 0;
    ['#sLikes', '#sGifts', '#sFollows'].forEach((i) => bump(i, 0));
    $('#sViewers').textContent = '—';
    if (!twLive) resetEmpty();
    sys(`Ищем активный эфир @${nick}…`);
    const r = await window.echo.connect(nick);
    if (!r || !r.ok) {
      setStatus(false, 'Не в эфире');
      $('#feedSub').textContent = 'Не удалось подключиться';
      // одно понятное сообщение на русском — в ленте чата
      showAlert((r && r.error) || 'Не удалось подключиться к эфиру. Попробуйте снова.', r && (r.code === 'offline' || r.code === 'empty'), r && r.detail);
    } else {
      sys('Подключено! Чат будет озвучен.');
      enqueue({ el: null, say: 'Подключено к эфиру. Озвучка включена.' });
    }
  } catch (e) {
    setStatus(false, 'Не в эфире');
    showAlert('Не удалось подключиться к эфиру. Попробуйте снова.', false, e && e.message ? e.message : String(e));
  } finally {
    connecting = false; btn.classList.remove('connecting');
    if (!connected) btn.textContent = 'Подключить';
  }
};
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });

/* ---------- обновление по кнопке ---------- */
const btnUpd = $('#btnUpdate');
let updReady = false;
const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const UPD_ICON = {
  sync: SVG('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/>'),
  ok: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  down: SVG('<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>'),
  open: SVG('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
};
function setUpd(icon, label, spin) {
  btnUpd.innerHTML = (UPD_ICON[icon] || '') + '<span>' + esc(label) + '</span>';
  btnUpd.classList.toggle('spin', !!spin);
}
window.echo.version().then((v) => { $('#verLine').textContent = 'Версия ' + v; });
window.echo.onUpdateProgress((p) => { setUpd('down', `Скачиваю… ${p}%`, true); });

btnUpd.onclick = async () => {
  if (btnUpd.classList.contains('busy')) return;
  btnUpd.classList.add('busy');
  if (!updReady) {
    setUpd('sync', 'Проверяю…', true);
    const r = await window.echo.checkUpdate();
    btnUpd.classList.remove('busy');
    if (!r.ok) { setUpd('sync', 'Проверить обновления'); sys('Не удалось проверить обновления: ' + r.error); return; }
    if (r.available) {
      updReady = true;
      btnUpd.classList.add('new');
      setUpd('down', `Обновить до ${r.version}`);
      sys(`Доступна новая версия ${r.version}. Нажми кнопку слева внизу, чтобы обновиться.`);
    } else {
      setUpd('ok', 'Версия актуальна');
      setTimeout(() => { setUpd('sync', 'Проверить обновления'); }, 3000);
    }
    return;
  }
  setUpd('down', 'Скачиваю… 0%', true);
  const r = await window.echo.installUpdate();
  if (!r.ok) {
    btnUpd.classList.remove('busy');
    setUpd('down', 'Повторить');
    sys('Ошибка обновления: ' + r.error);
  } else if (r.manual) {
    btnUpd.classList.remove('busy');
    setUpd('open', 'Страница загрузки');
  } else {
    setUpd('sync', 'Перезапуск…', true);
  }
};

/* ---------- студия озвучки ---------- */
const studioText = $('#studioText');
function speakStudio() {
  const t = studioText.value.trim();
  if (!t) { studioText.focus(); return; }
  queue.length = 0; stopCurrent();
  enqueue({ el: null, say: t.slice(0, 200), preset: selectedPreset() }, true);
}
$('#btnStudio').onclick = speakStudio;
$$('#chips .chip').forEach((c) => c.onclick = () => { studioText.value = c.textContent; speakStudio(); });

/* ---------- виджет чата ---------- */
// --- выпадающие списки виджета ---
// выравнивание сообщений задаётся отдельно для TikTok и для Twitch
const ALIGN_LABELS = { left: 'Слева', right: 'Справа' };
const alignOpts = () => Object.entries(ALIGN_LABELS).map(([v, label]) => ({ v, label }));
makeSelect('wAlignTtSel', { options: alignOpts, get: () => S.wAlignTt, set: (v) => { S.wAlignTt = v; save(); pushWidget(); } });
makeSelect('wAlignTwSel', { options: alignOpts, get: () => S.wAlignTw, set: (v) => { S.wAlignTw = v; save(); pushWidget(); } });
async function refreshLink() {
  const r = await window.echo.widgetLink().catch(() => null);
  $('#wUrl').value = r && r.ok ? r.url : 'Не удалось запустить сервер виджета';
  checkPage();
}
// Опубликована ли страница на GitHub Pages: 404 значит, что Pages в репозитории ещё не включён
const PAGES_SETTINGS = 'https://github.com/vladimirphoto/jonny-chat-tiktok/settings/pages';
async function checkPage() {
  const el = $('#wStat');
  el.className = 'wstat'; el.textContent = ''; el.dataset.state = 'checking';
  const r = await window.echo.widgetCheck().catch(() => ({ ok: false, status: 0 }));
  if (r.ok) { el.dataset.state = 'ok'; return; } // всё в порядке — ничего не показываем
  el.dataset.state = 'bad'; el.className = 'wstat bad';
  el.innerHTML = r.status === 404
    ? 'Страница виджета ещё не опубликована: в репозитории не включён GitHub Pages. Откройте Settings → Pages, выберите ветку <b>main</b> и папку <b>/docs</b>, нажмите Save и подождите минуту.<br><a href="' + PAGES_SETTINGS + '" target="_blank">Открыть настройки Pages</a><a id="wRecheck">Проверить снова</a>'
    : 'Не удалось проверить страницу виджета (нет доступа к интернету или GitHub).<br><a id="wRecheck">Проверить снова</a>';
  const rc = $('#wRecheck'); if (rc) rc.onclick = checkPage;
}
refreshLink();
$('#wUrl').onfocus = (e) => e.target.select();
$('#wCopy').onclick = async () => {
  const u = $('#wUrl').value;
  try { await navigator.clipboard.writeText(u); } catch (_) { $('#wUrl').select(); document.execCommand('copy'); }
  const b = $('#wCopy'), svg = b.querySelector('svg').outerHTML;
  b.innerHTML = svg + '✓'; setTimeout(() => { b.innerHTML = svg + 'Копировать'; }, 1500);
};
$('#wTest').onclick = () => window.echo.widgetTest();
$('#pvTest').onclick = () => window.echo.widgetTest();
let pvInit = false;
async function initPreview() {
  if (pvInit) return; pvInit = true;
  const u = await window.echo.widgetUrl();
  if (!u) return;
  const f = $('#pvFrame');
  f.addEventListener('load', () => { pushWidget(); setTimeout(() => window.echo.widgetTest(), 500); }, { once: true });
  f.src = u;
}
$('#wClear').onclick = () => window.echo.widgetClear();

/* ---------- старт ---------- */
renderPills(); renderVoices(); refreshVol(); refreshRate(); refreshPitch(); refreshLen(); refreshWScale(); refreshWHeight(); refreshWFade(); syncControls(); pushWidget();
window.echo.voices().then((r) => applyCatalog(r && r.all)).catch(() => {});
window.__echo = { get voiceCalls() { return voiceCalls; }, S, clean, speakName, renderVoices, builtin: BUILTIN, get presets() { return S.presets; }, since, ttPreset, twPreset, eventPreset, setNk };
