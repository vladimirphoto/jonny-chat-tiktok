'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)));

/* ---------- настройки и голоса ---------- */
const BUILTIN = [
  { id: 'b-svetlana', name: 'Светлана', desc: 'Женский · тёплый, естественный', voice: 'ru-RU-SvetlanaNeural', gender: 'F' },
  { id: 'b-dmitry', name: 'Дмитрий', desc: 'Мужской · уверенный, чёткий', voice: 'ru-RU-DmitryNeural', gender: 'M' },
].map((v) => ({ rate: 0, pitch: 0, ...v, provider: 'edge', builtin: true }));

const DEFAULTS = {
  selected: 'b-svetlana', vol: 80, maxLen: 140, nick: '', gKey: '', usage: { m: '', hd: 0, n2: 0, std: 0 },
  presets: [],
  chat: true, readName: true, gifts: true, follows: true, subsOnly: false,
  skipCmd: true, skipLinks: true, onlyRu: true, noRepeat: true, profanity: true, skipMentions: true, noEmoji: true,
};
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('echochat2') || '{}') }; } catch (_) {}
// встроенные голоса всегда на месте, свои — добавляются после них
const customs = (S.presets || []).filter((p) => p && !p.builtin && p.provider === 'google');
S.presets = [...BUILTIN.map((b) => ({ ...b, ...((S.presets || []).find((p) => p.id === b.id) || {}), builtin: true })), ...customs];
if (!S.presets.some((p) => p.id === S.selected)) S.selected = BUILTIN[0].id;
const save = () => { try { localStorage.setItem('echochat2', JSON.stringify(S)); } catch (_) {} };
const selectedPreset = () => S.presets.find((p) => p.id === S.selected) || S.presets[0];

/* ---------- вкладки ---------- */
const TITLES = {
  live: ['Эфир', 'Подключись к TikTok LIVE и слушай чат вслух'],
  voice: ['Голос', 'Живые голоса, свои пресеты и события для озвучки'],
  filters: ['Фильтры', 'Чистый чат без команд, спама и мата'],
};
$$('.nav').forEach((b) => b.addEventListener('click', () => {
  $$('.nav').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('show', t.id === 'tab-' + b.dataset.tab));
  $('#title').textContent = TITLES[b.dataset.tab][0];
  $('#subtitle').textContent = TITLES[b.dataset.tab][1];
}));

$$('input[data-k]').forEach((el) => {
  el.checked = !!S[el.dataset.k];
  el.addEventListener('change', () => { S[el.dataset.k] = el.checked; save(); });
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
  const p = selectedPreset();
  const hd = p.provider === 'google' && p.gKind === 'hd';
  $('#rate').disabled = hd;
  $('#pitch').disabled = p.provider === 'google';
  $('#rate').closest('.ctl').classList.toggle('off', hd);
  $('#pitch').closest('.ctl').classList.toggle('off', p.provider === 'google');
}
const refreshPitch = bindRange('pitch', 'pitchVal', (v) => (v > 0 ? '+' : '') + v + ' Гц', () => selectedPreset().pitch, (v) => { selectedPreset().pitch = v; });
const refreshLen = bindRange('maxLen', 'lenVal', (v) => v, () => S.maxLen, (v) => { S.maxLen = v; });
$('#nick').value = S.nick;

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
      <div class="vi"><b>${esc(p.name)}${p.provider === 'google' ? '<em>Google</em>' : ''}</b><small>${esc(p.desc || p.voice || '')}</small></div>
      <button class="mini play" title="Прослушать">▶</button>
      ${p.builtin ? '' : '<button class="mini del" title="Удалить голос">✕</button>'}`;
    d.onclick = () => { S.selected = p.id; save(); renderVoices(); refreshRate(); refreshPitch(); syncControls(); };
    $('.play', d).onclick = (e) => { e.stopPropagation(); previewPreset(p); };
    const del = $('.del', d);
    if (del) del.onclick = (e) => {
      e.stopPropagation();
      S.presets = S.presets.filter((x) => x.id !== p.id);
      if (S.selected === p.id) S.selected = BUILTIN[0].id;
      save(); renderVoices(); refreshRate(); refreshPitch(); syncControls();
    };
    voicesBox.appendChild(d);
  });
}

function previewPreset(p) {
  queue.length = 0; stopCurrent();
  enqueue({ el: null, say: `Привет! Меня зовут ${p.name}. Я буду читать чат твоего эфира.`, preset: p }, true);
}
$('#btnTest').onclick = () => previewPreset(selectedPreset());

/* ---------- живые голоса Google (бесплатный месячный лимит) ---------- */
const LIMIT = { hd: 1000000, n2: 1000000, std: 4000000 };
const SAFE = 0.9; // при 90% лимита автоматически уходим на Microsoft
const KIND_NAME = { hd: 'Живые HD', n2: 'Neural2', std: 'WaveNet/Standard' };
const PERSONA = { Zephyr: 'яркий', Puck: 'бодрый', Charon: 'информативный', Kore: 'уверенный', Fenrir: 'эмоциональный', Leda: 'юный', Orus: 'уверенный', Aoede: 'лёгкий', Callirrhoe: 'непринуждённый', Autonoe: 'яркий', Enceladus: 'мягкий', Iapetus: 'чёткий', Umbriel: 'непринуждённый', Algieba: 'плавный', Despina: 'плавный', Erinome: 'чёткий', Algenib: 'с хрипотцой', Rasalgethi: 'информативный', Laomedeia: 'бодрый', Achernar: 'мягкий', Alnilam: 'уверенный', Schedar: 'ровный', Gacrux: 'зрелый', Pulcherrima: 'напористый', Achird: 'дружелюбный', Zubenelgenubi: 'разговорный', Vindemiatrix: 'нежный', Sadachbia: 'живой', Sadaltager: 'знающий', Sulafat: 'тёплый' };

const gKeyEl = $('#gKey'), gVoice = $('#gVoice'), voiceMsg = $('#voiceMsg');
let gCatalog = [];
gKeyEl.value = S.gKey || '';
const say = (t, bad) => { voiceMsg.textContent = t; voiceMsg.className = 'vmsg' + (bad ? ' bad' : ''); };

function gMeta(v) {
  const n = v.id;
  let kind = 'std', short = n.replace(/^ru-RU-/, '');
  if (/Chirp3-HD/i.test(n)) { kind = 'hd'; short = n.split('-').pop(); }
  else if (/Neural2/i.test(n)) { kind = 'n2'; short = 'Neural2 ' + n.split('-').pop(); }
  else if (/Wavenet/i.test(n)) short = 'WaveNet ' + n.split('-').pop();
  else short = 'Standard ' + n.split('-').pop();
  const gender = v.gender === 'M' ? 'муж.' : 'жен.';
  const style = kind === 'hd' && PERSONA[short] ? ' · ' + PERSONA[short] : '';
  return { ...v, kind, short, label: `${KIND_NAME[kind]} · ${short} · ${gender}${style}` };
}
function fillGoogleVoices(list) {
  const order = { hd: 0, n2: 1, std: 2 };
  gCatalog = list.map(gMeta).sort((a, b) => order[a.kind] - order[b.kind] || a.short.localeCompare(b.short));
  gVoice.innerHTML = '';
  gCatalog.forEach((v) => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; gVoice.appendChild(o); });
  if (gVoice.options.length) gVoice.selectedIndex = 0;
}

// учёт символов за месяц (локально) — чтобы не выйти за бесплатный лимит
function usage() {
  const m = new Date().toISOString().slice(0, 7);
  if (!S.usage || S.usage.m !== m) S.usage = { m, hd: 0, n2: 0, std: 0 };
  return S.usage;
}
function addUsage(kind, n) { usage()[kind] += n; save(); renderUsage(); }
const overBudget = (kind) => usage()[kind] >= LIMIT[kind] * SAFE;
function renderUsage() {
  const u = usage();
  const f = (k) => `${KIND_NAME[k]}: ${Math.round(u[k] / 1000).toLocaleString('ru-RU')} тыс. из ${(LIMIT[k] / 1000).toLocaleString('ru-RU')} тыс.`;
  $('#gUsage').textContent = 'Использовано в этом месяце · ' + f('hd') + ' · ' + f('n2') + ' · ' + f('std');
}

function addGoogleVoice(meta, customName) {
  const name = (customName || '').trim() || meta.short;
  const preset = {
    id: 'g-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, builtin: false, provider: 'google',
    gName: meta.id, gKind: meta.kind, gender: meta.gender, rate: 0, pitch: 0,
    desc: 'Google · ' + (meta.label || meta.id),
  };
  S.presets.push(preset);
  S.selected = preset.id;
  save(); renderVoices(); refreshRate(); refreshPitch(); syncControls();
  return preset;
}

$('#btnGCheck').onclick = async () => {
  const key = gKeyEl.value.trim();
  if (!key) return say('Вставьте API-ключ Google.', true);
  say('Проверяю ключ…');
  const r = await window.echo.googleVoices(key).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
  if (!r.ok) return say(r.error, true);
  S.gKey = key; save();
  fillGoogleVoices(r.voices);
  say(`Ключ работает. Найдено русских голосов: ${r.voices.length}. Выберите голос и нажмите «Добавить».`);
};
$('#btnAddVoice').onclick = () => {
  const meta = gCatalog.find((v) => v.id === gVoice.value);
  if (!meta) return say('Сначала проверьте ключ — список голосов загрузится автоматически.', true);
  const p = addGoogleVoice(meta, $('#newName').value);
  $('#newName').value = '';
  say(`Голос «${p.name}» добавлен и выбран. Нажмите ▶, чтобы услышать.`);
};

/* ---------- лента ---------- */
const feed = $('#feed');
const colors = ['#8b5cf6', '#ec4899', '#22d3ee', '#f59e0b', '#10b981', '#6366f1', '#ef4444'];
const colorOf = (s) => colors[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];

function addMsg({ name, text, kind = '', sub = false, color }) {
  $('.empty', feed)?.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + kind;
  el.innerHTML = `<div class="av" style="background:${color || colorOf(name)}">${esc((name[0] || '?').toUpperCase())}</div>
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
// ник для озвучки: без эмодзи и мусора, чтобы голос не спотыкался
function speakName(n) {
  const t = String(n || '').replace(EMOJI, '').replace(/[_.]+/g, ' ').replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return t || 'Гость';
}

/* ---------- очередь озвучки ---------- */
const queue = [];
let busy = false, cur = null, curUrl = null, curEl = null, curResolve = null, lastWarn = 0;

function enqueue(item, force = false) {
  if ($('#paused').checked && !force) return;
  if (queue.length >= 12) queue.shift(); // не копим отставание от эфира
  item.preset = item.preset || selectedPreset();
  queue.push(item);
  pump();
}

function stopCurrent() {
  if (cur) { cur.onended = cur.onerror = null; cur.pause(); cur = null; }
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  try { speechSynthesis.cancel(); } catch (_) {}
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

function fallbackSpeak(text) {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const ru = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ru'));
      if (ru) u.voice = ru;
      u.lang = 'ru-RU'; u.volume = S.vol / 100;
      curResolve = resolve;
      u.onend = u.onerror = () => { curResolve = null; resolve(); };
      speechSynthesis.speak(u);
    } catch (_) { resolve(); }
  });
}

function synthFor(text, p) {
  return window.echo.synth({
    text, provider: p.provider, voice: p.voice, gName: p.gName, gKey: S.gKey,
    rate: Math.max(0.5, 1 + (p.rate || 0) / 100),
    pitch: ((p.pitch || 0) >= 0 ? '+' : '') + (p.pitch || 0) + 'Hz',
  }).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
}
const fallbackPreset = (p) => BUILTIN.find((b) => b.gender === p.gender) || BUILTIN[0];
function warnOnce(text) {
  if (Date.now() - lastWarn > 30000) { lastWarn = Date.now(); sys(text); }
}

// синтез стартует заранее, пока играет предыдущая фраза — без пауз между сообщениями
function ensureSynth(item) {
  if (!item.p) {
    const p = item.preset;
    if (p.provider === 'google' && overBudget(p.gKind)) {
      item.fallback = true;
      warnOnce(`Бесплатный лимит Google (${KIND_NAME[p.gKind]}) почти исчерпан — включён голос Microsoft до начала следующего месяца.`);
      item.p = synthFor(item.say, fallbackPreset(p));
    } else {
      item.p = synthFor(item.say, p);
    }
  }
  return item.p;
}

function setVoiceState(ok) {
  const p = $('#voiceState');
  p.lastChild.textContent = ok ? 'Голос готов' : 'Нет сети · запасной голос';
  p.firstChild.style.background = ok ? 'var(--ok)' : 'var(--bad)';
}

async function speakItem(item) {
  let r = await ensureSynth(item);
  const p = item.preset;
  if (p.provider === 'google' && !item.fallback) {
    if (r && r.ok) addUsage(p.gKind, r.chars || item.say.length);
    else {
      warnOnce(`Голос «${p.name}»: ${(r && r.error) || 'ошибка'} Включён запасной голос Microsoft.`);
      r = await synthFor(item.say, fallbackPreset(p));
    }
  }
  if (r && r.ok) {
    try { setVoiceState(true); await playBlob(r.audio); return; } catch (_) {}
  }
  setVoiceState(false);
  await fallbackSpeak(item.say);
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const it = queue.shift();
      curEl = it.el; curEl?.classList.add('speaking'); document.body.classList.add('talking');
      if (queue[0]) ensureSynth(queue[0]);
      try { await speakItem(it); } catch (_) {}
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

window.echo.onChat((m) => {
  const el = addMsg({ name: m.name, text: m.text, sub: m.isSub });
  if (!S.chat || (S.subsOnly && !m.isSub)) return;
  const t = clean(m.text);
  if (!t) return;
  enqueue({ el, say: S.readName ? `${speakName(m.name)}: ${t}` : t, preset: selectedPreset() });
});
window.echo.onGift((g) => {
  counters.gifts += g.count; bump('#sGifts', counters.gifts);
  const el = addMsg({ name: g.name, text: `🎁 отправил(а) «${g.gift}» ×${g.count}`, kind: 'gift' });
  if (S.gifts) enqueue({ el, say: `${speakName(g.name)} отправил ${g.gift}${g.count > 1 ? ', ' + g.count + ' раз' : ''}. Спасибо!` });
});
window.echo.onFollow((f) => {
  counters.follows++; bump('#sFollows', counters.follows);
  const el = addMsg({ name: f.name, text: '➕ подписался(ась) на канал', kind: 'follow' });
  if (S.follows) enqueue({ el, say: `${speakName(f.name)} подписался на канал. Добро пожаловать!` });
});
window.echo.onLike((l) => { counters.likes = l.total || counters.likes + l.count; bump('#sLikes', counters.likes); });
window.echo.onViewers((v) => { $('#sViewers').textContent = (v.count ?? 0).toLocaleString('ru-RU'); });
window.echo.onError((e) => sys(e.message));

/* ---------- подключение ---------- */
const btn = $('#btnConnect'), status = $('#status'), alertBox = $('#alert');
let connected = false, connecting = false;
function showAlert(text, warn, detail) {
  alertBox.textContent = text;
  if (text && detail) {
    const d = document.createElement('div');
    d.className = 'alert-detail';
    d.textContent = 'Техническая информация: ' + detail;
    alertBox.appendChild(d);
  }
  alertBox.classList.toggle('warn', !!warn);
  alertBox.hidden = !text;
}
function setStatus(live, text) {
  status.classList.toggle('on', live);
  status.lastElementChild.textContent = text;
  connected = live;
  btn.textContent = live ? 'Отключиться' : 'Подключиться';
  btn.classList.toggle('stop', live);
}
window.echo.onStatus((s) => {
  if (s.state === 'live') { setStatus(true, 'В эфире @' + s.username); $('#feedSub').textContent = 'Эфир @' + s.username; }
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
    if (!nick) { showAlert('Введите ник автора TikTok LIVE (без @).', true); $('#nick').focus(); return; }
    S.nick = nick; save();
    showAlert('');
    btn.textContent = 'Подключаюсь…';
    $('#feedSub').textContent = 'Ищем эфир @' + nick;
    counters.likes = counters.gifts = counters.follows = 0;
    ['#sLikes', '#sGifts', '#sFollows'].forEach((i) => bump(i, 0));
    $('#sViewers').textContent = '—';
    resetEmpty();
    sys(`Ищем активный эфир @${nick}…`);
    const r = await window.echo.connect(nick);
    if (!r || !r.ok) {
      setStatus(false, 'Не в эфире');
      $('#feedSub').textContent = 'Не удалось подключиться';
      // одно понятное сообщение на русском — без дублей в ленте
      showAlert((r && r.error) || 'Не удалось подключиться к эфиру. Попробуйте снова.', r && (r.code === 'offline' || r.code === 'empty'), r && r.detail);
    } else {
      showAlert('');
      sys('Подключено! Чат будет озвучен.');
      enqueue({ el: null, say: 'Подключено к эфиру. Озвучка включена.' });
    }
  } catch (e) {
    setStatus(false, 'Не в эфире');
    showAlert('Не удалось подключиться к эфиру. Попробуйте снова.', false, e && e.message ? e.message : String(e));
  } finally {
    connecting = false;
  }
};
$('#nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
try { speechSynthesis.getVoices(); } catch (_) {}

/* ---------- обновление по кнопке ---------- */
const btnUpd = $('#btnUpdate');
let updReady = false;
window.echo.version().then((v) => { $('#verLine').textContent = 'Версия ' + v; });
window.echo.onUpdateProgress((p) => { btnUpd.textContent = `Скачиваю… ${p}%`; });

btnUpd.onclick = async () => {
  if (btnUpd.classList.contains('busy')) return;
  btnUpd.classList.add('busy');
  if (!updReady) {
    btnUpd.textContent = 'Проверяю…';
    const r = await window.echo.checkUpdate();
    btnUpd.classList.remove('busy');
    if (!r.ok) { btnUpd.textContent = '⟳ Проверить обновления'; sys('Не удалось проверить обновления: ' + r.error); return; }
    if (r.available) {
      updReady = true;
      btnUpd.classList.add('new');
      btnUpd.textContent = `⬇ Обновить до ${r.version}`;
      sys(`Доступна новая версия ${r.version}. Нажми кнопку слева внизу, чтобы обновиться.`);
    } else {
      btnUpd.textContent = '✓ Версия актуальна';
      setTimeout(() => { btnUpd.textContent = '⟳ Проверить обновления'; }, 3000);
    }
    return;
  }
  btnUpd.textContent = 'Скачиваю… 0%';
  const r = await window.echo.installUpdate();
  if (!r.ok) {
    btnUpd.classList.remove('busy');
    btnUpd.textContent = '⬇ Повторить';
    sys('Ошибка обновления: ' + r.error);
  } else if (r.manual) {
    btnUpd.classList.remove('busy');
    btnUpd.textContent = '⬇ Страница загрузки';
  } else {
    btnUpd.textContent = 'Перезапуск…';
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

/* ---------- старт ---------- */
renderVoices(); refreshVol(); refreshRate(); refreshPitch(); refreshLen(); syncControls(); renderUsage();
window.__echo = { S, clean, speakName, renderVoices, gMeta, addGoogleVoice, fillGoogleVoices, overBudget, addUsage, usage, get presets() { return S.presets; } };
