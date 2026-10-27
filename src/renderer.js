'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const VOICES = [
  { id: 'ru-RU-SvetlanaNeural', name: 'Светлана', desc: 'Женский · тёплый, естественный' },
  { id: 'ru-RU-DariyaNeural', name: 'Дарья', desc: 'Женский · мягкий, дружелюбный' },
  { id: 'ru-RU-DmitryNeural', name: 'Дмитрий', desc: 'Мужской · уверенный, чёткий' },
];

const DEFAULTS = {
  voice: VOICES[0].id, vol: 80, rate: 0, pitch: 0, maxLen: 140, nick: '',
  chat: true, readName: true, gifts: true, follows: true, subsOnly: false,
  skipCmd: true, skipLinks: true, onlyRu: true, noRepeat: true, profanity: true, skipMentions: true, noEmoji: true,
};
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('echochat') || '{}') }; } catch (_) {}
const save = () => { try { localStorage.setItem('echochat', JSON.stringify(S)); } catch (_) {} };

/* ---------- вкладки ---------- */
const TITLES = {
  live: ['Эфир', 'Подключись к TikTok LIVE и слушай чат вслух'],
  voice: ['Голос', 'Живые нейро-голоса и события для озвучки'],
  filters: ['Фильтры', 'Чистый чат без команд, спама и мата'],
};
$$('.nav').forEach((b) => b.addEventListener('click', () => {
  $$('.nav').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('show', t.id === 'tab-' + b.dataset.tab));
  $('#title').textContent = TITLES[b.dataset.tab][0];
  $('#subtitle').textContent = TITLES[b.dataset.tab][1];
}));

/* ---------- настройки ---------- */
$$('input[data-k]').forEach((el) => {
  el.checked = !!S[el.dataset.k];
  el.addEventListener('change', () => { S[el.dataset.k] = el.checked; save(); });
});
const bindRange = (id, key, label, fmt) => {
  const el = $('#' + id); el.value = S[key]; $('#' + label).textContent = fmt(S[key]);
  el.addEventListener('input', () => { S[key] = +el.value; $('#' + label).textContent = fmt(S[key]); save(); if (id === 'vol' && cur) cur.volume = S.vol / 100; });
};
bindRange('vol', 'vol', 'volVal', (v) => v + '%');
bindRange('rate', 'rate', 'rateVal', (v) => (v > 0 ? '+' : '') + v + '%');
bindRange('pitch', 'pitch', 'pitchVal', (v) => (v > 0 ? '+' : '') + v + ' Гц');
bindRange('maxLen', 'maxLen', 'lenVal', (v) => v);

const voicesBox = $('#voices');
function renderVoices() {
  voicesBox.innerHTML = '';
  VOICES.forEach((v) => {
    const d = document.createElement('div');
    d.className = 'voice' + (v.id === S.voice ? ' sel' : '');
    d.innerHTML = `<div class="av">${v.name[0]}</div><div><b>${v.name}</b><small>${v.desc}</small></div>`;
    d.onclick = () => { S.voice = v.id; save(); renderVoices(); };
    voicesBox.appendChild(d);
  });
}
renderVoices();
$('#nick').value = S.nick;

/* ---------- лента ---------- */
const feed = $('#feed');
const colors = ['#8b5cf6', '#ec4899', '#22d3ee', '#f59e0b', '#10b981', '#6366f1', '#ef4444'];
const colorOf = (s) => colors[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => new Date().toLocaleTimeString('ru-RU');

function addMsg({ name, text, kind = '', sub = false, color }) {
  $('.empty', feed)?.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + kind;
  el.innerHTML = `<div class="av" style="background:${color || colorOf(name)}">${esc(name[0] || '?').toUpperCase()}</div>
    <div class="b"><div class="n">${esc(name)}${sub ? '<em>SUB</em>' : ''}</div><div class="t">${esc(text)}</div></div>`;
  feed.appendChild(el);
  while (feed.children.length > 150) feed.firstChild.remove();
  feed.scrollTop = feed.scrollHeight;
  return el;
}
const sys = (text) => addMsg({ name: 'Система', text, kind: 'sys', color: '#475569' });
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
  if (S.skipMentions) t = t.replace(/@[\w.]+/g, '');
  t = t.replace(/(.)\1{3,}/g, '$1$1$1').replace(/\s+/g, ' ').trim();
  if (!t || !/[a-zа-яё0-9]/i.test(t)) return null;
  if (S.onlyRu && !/[а-яё]/i.test(t)) return null;
  if (S.profanity && BAD.test(t)) return null;
  if (S.noRepeat) {
    const k = t.toLowerCase(), ts = Date.now();
    for (const [key, v] of recent) if (ts - v > 60000) recent.delete(key);
    if (recent.has(k)) return null;
    recent.set(k, ts);
  }
  if (t.length > S.maxLen) t = t.slice(0, S.maxLen).replace(/\s\S*$/, '') + '…';
  return t;
}

/* ---------- очередь озвучки ---------- */
const queue = [];
let busy = false, cur = null, curUrl = null, curEl = null;

function enqueue(item) {
  if ($('#paused').checked) return;
  if (queue.length >= 12) queue.shift(); // не копим отставание от эфира
  queue.push(item);
  pump();
}

function stopCurrent() {
  if (cur) { cur.onended = cur.onerror = null; cur.pause(); cur = null; }
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  speechSynthesis.cancel();
}

function playBlob(b64) {
  return new Promise((resolve, reject) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    curUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    cur = new Audio(curUrl);
    cur.volume = S.vol / 100;
    cur.onended = () => resolve();
    cur.onerror = () => reject(new Error('audio'));
    cur.play().catch(reject);
  });
}

function fallbackSpeak(text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const ru = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ru'));
    if (ru) u.voice = ru;
    u.lang = 'ru-RU'; u.volume = S.vol / 100; u.rate = 1 + S.rate / 100;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

async function speak(text) {
  const rate = (S.rate >= 0 ? '+' : '') + S.rate + '%';
  const pitch = (S.pitch >= 0 ? '+' : '') + S.pitch + 'Hz';
  const r = await window.echo.synth({ text, voice: S.voice, rate, pitch });
  if (r.ok) { try { await playBlob(r.audio); return; } catch (_) {} }
  setVoiceState(false);
  await fallbackSpeak(text);
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const it = queue.shift();
    curEl = it.el; curEl?.classList.add('speaking');
    try { await speak(it.say); } catch (_) {}
    curEl?.classList.remove('speaking'); curEl = null;
    stopCurrent();
  }
  busy = false;
}

$('#btnSkip').onclick = () => { stopCurrent(); curEl?.classList.remove('speaking'); busy = false; pump(); };
$('#paused').addEventListener('change', (e) => { if (e.target.checked) { queue.length = 0; stopCurrent(); busy = false; } });

function setVoiceState(ok) {
  const p = $('#voiceState');
  p.lastChild.textContent = ok ? 'Голос готов' : 'Нет сети · запасной голос';
  p.firstChild.style.background = ok ? 'var(--ok)' : 'var(--bad)';
}

$('#btnTest').onclick = async () => {
  stopCurrent(); queue.length = 0; busy = false;
  const name = VOICES.find((v) => v.id === S.voice)?.name || '';
  setVoiceState(true);
  await speak(`Привет! Меня зовут ${name}. Я буду читать чат твоего эфира.`);
};

/* ---------- события TikTok ---------- */
const counters = { likes: 0, gifts: 0, follows: 0 };
const bump = (id, v) => { $(id).textContent = v.toLocaleString('ru-RU'); };

window.echo.onChat((m) => {
  addMsg({ name: m.name, text: m.text, sub: m.isSub });
  const last = feed.lastChild;
  if (!S.chat || (S.subsOnly && !m.isSub)) return;
  const t = clean(m.text);
  if (!t) return;
  enqueue({ el: last, say: S.readName ? `${m.name}: ${t}` : t });
});
window.echo.onGift((g) => {
  counters.gifts += g.count; bump('#sGifts', counters.gifts);
  const el = addMsg({ name: g.name, text: `🎁 отправил(а) «${g.gift}» ×${g.count}`, kind: 'gift' });
  if (S.gifts) enqueue({ el, say: `${g.name} отправил ${g.gift}${g.count > 1 ? ', ' + g.count + ' раз' : ''}. Спасибо!` });
});
window.echo.onFollow((f) => {
  counters.follows++; bump('#sFollows', counters.follows);
  const el = addMsg({ name: f.name, text: '➕ подписался(ась) на канал', kind: 'follow' });
  if (S.follows) enqueue({ el, say: `${f.name} подписался на канал. Добро пожаловать!` });
});
window.echo.onLike((l) => { counters.likes = l.total || counters.likes + l.count; bump('#sLikes', counters.likes); });
window.echo.onViewers((v) => { $('#sViewers').textContent = (v.count ?? 0).toLocaleString('ru-RU'); });
window.echo.onError((e) => sys('Ошибка: ' + e.message));

/* ---------- подключение ---------- */
const btn = $('#btnConnect'), status = $('#status');
let connected = false;
function setStatus(live, text) {
  status.classList.toggle('on', live);
  status.lastElementChild.textContent = text;
  connected = live;
  btn.textContent = live ? 'Отключиться' : 'Подключиться';
  btn.classList.toggle('stop', live);
}
window.echo.onStatus((s) => {
  if (s.state === 'live') { setStatus(true, 'В эфире @' + s.username); $('#feedSub').textContent = 'Эфир @' + s.username; }
  else { setStatus(false, s.state === 'ended' ? 'Эфир завершён' : 'Не в эфире'); $('#feedSub').textContent = 'Отключено'; }
});

btn.onclick = async () => {
  if (connected) { await window.echo.disconnect(); return; }
  const nick = $('#nick').value.trim().replace(/^@/, '');
  if (!nick) { $('#nick').focus(); return; }
  S.nick = nick; save();
  btn.textContent = 'Подключаюсь…';
  $('#feedSub').textContent = 'Ищем эфир @' + nick;
  resetEmpty();
  sys(`Ищем активный эфир @${nick}…`);
  const r = await window.echo.connect(nick);
  if (!r.ok) {
    setStatus(false, 'Не в эфире');
    $('#feedSub').textContent = 'Не удалось подключиться';
    sys('Эфир не найден. Проверь ник и убедись, что автор уже начал трансляцию. (' + r.error + ')');
  } else {
    sys('Подключено! Чат будет озвучен.');
    enqueue({ el: null, say: 'Подключено к эфиру. Озвучка включена.' });
  }
};
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
speechSynthesis.getVoices();
