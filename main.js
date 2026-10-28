const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const ev = require('./events');
const twitch = require('./twitch');
const widget = require('./widget');

// Пакеты могут быть ESM-only — подключаем через динамический import()
const load = async (name) => {
  const m = await import(name);
  return { ...(m.default && typeof m.default === 'object' ? m.default : {}), ...m };
};

let win = null;
let conn = null;
let tw = null;           // подключение к чату Twitch
let wsrv = null;         // сервер виджета
let wset = {};           // настройки виджета (приходят из окна)
const NAME_COLORS = ['#a78bfa', '#f472b6', '#22d3ee', '#fbbf24', '#34d399', '#818cf8', '#fb7185'];
const colorOf = (s) => NAME_COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % NAME_COLORS.length];
const wmsg = (m) => wsrv && wsrv.broadcast('msg', m);
const SELFTEST = process.argv.includes('--selftest');

function createWindow() {
  // размер под содержимое: все блоки помещаются без прокрутки (но не больше экрана)
  const wa = require('electron').screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1260, wa.width),
    height: Math.min(880, wa.height),
    useContentSize: true,
    minWidth: 1060,
    minHeight: 720,
    show: !SELFTEST,
    backgroundColor: '#0b0b12',
    title: 'ЭхоЧат LIVE',
    icon: path.join(__dirname, 'src', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // озвучка стартует без клика в окне
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

async function disconnect() {
  if (conn) {
    const c = conn;
    conn = null;
    try { c.removeAllListeners(); } catch (_) {}
    try { await Promise.race([c.disconnect(), new Promise((r) => setTimeout(r, 3000))]); } catch (_) {}
  }
}

const { explain } = require('./errors');

async function doConnect(rawName) {
  const username = String(rawName || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').replace(/\/live.*$/i, '');
  if (!username) return { ok: false, code: 'empty', error: 'Введите ник автора.' };
  await disconnect();
  let TikTokLiveConnection, WebcastEvent, ControlEvent;
  try {
    ({ TikTokLiveConnection, WebcastEvent, ControlEvent } = await load('tiktok-live-connector'));
  } catch (err) {
    return { ok: false, code: 'module', error: 'Не удалось загрузить модуль TikTok: ' + String((err && err.message) || err) };
  }
  let c;
  try {
    c = new TikTokLiveConnection(username, {
      processInitialData: false, // «хвост» старых сообщений не нужен — озвучиваем только новое
      fetchRoomInfoOnConnect: true,
      enableExtendedGiftInfo: false,
      authenticateWs: false,
      useMobile: false,
      webClientOptions: {},
      wsClientOptions: {},
    });
  } catch (err) {
    return { ok: false, code: 'init', error: 'Не удалось запустить подключение к TikTok: ' + String((err && err.message) || err) };
  }
  conn = c;
  let ready = false;
  let lastErrAt = 0;
  const alive = () => conn === c;
  const EV = ControlEvent || {};

  c.on(WebcastEvent.CHAT || 'chat', (d) => {
    if (!alive()) return;
    const m = ev.chatOf(d);
    send('tt:chat', m);
    if (m.text) wmsg({ platform: 'tiktok', name: m.name, text: m.text, avatar: m.avatar, color: colorOf(m.name) });
  });
  c.on(WebcastEvent.GIFT || 'gift', (d) => {
    if (!alive()) return;
    const g = ev.giftOf(d);
    if (!g.done) return; // серия подарков идёт — считаем один раз, когда она закончилась
    send('tt:gift', g);
    wmsg({ platform: 'tiktok', name: g.name, avatar: g.avatar, color: colorOf(g.name), gift: { name: g.gift, count: g.count, image: g.image } });
  });
  // подписка: событие follow, а если его нет в версии библиотеки — social с признаком подписки
  const seenFollow = new Map();
  const onFollow = (d) => {
    if (!alive()) return;
    const u = ev.userOf(d);
    const key = u.id || u.name, now = Date.now();
    if (seenFollow.has(key) && now - seenFollow.get(key) < 10000) return; // follow и social приходят парой
    seenFollow.set(key, now);
    if (seenFollow.size > 500) seenFollow.clear();
    send('tt:follow', u);
  };
  c.on(WebcastEvent.FOLLOW || 'follow', onFollow);
  c.on(WebcastEvent.SOCIAL || 'social', (d) => { if (ev.isFollowSocial(d)) onFollow(d); });
  c.on(WebcastEvent.LIKE || 'like', (d) => alive() && send('tt:like', ev.likesOf(d)));
  c.on(WebcastEvent.ROOM_USER || 'roomUser', (d) => {
    if (!alive()) return;
    const count = ev.viewersOf(d);
    if (count !== null) send('tt:viewers', { count });
  });
  c.on(WebcastEvent.STREAM_END || 'streamEnd', () => alive() && send('tt:status', { state: 'ended' }));
  c.on(EV.DISCONNECTED || 'disconnected', () => alive() && send('tt:status', { state: 'offline' }));
  c.on(EV.ERROR || 'error', (e) => {
    if (!alive() || !ready) return; // ошибки подключения показывает сам обработчик ниже — один раз
    if (Date.now() - lastErrAt < 30000) return;
    lastErrAt = Date.now();
    send('tt:error', { message: 'Связь с TikTok нестабильна, пытаемся продолжить…' });
  });

  try {
    const state = await Promise.race([
      c.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
    ]);
    if (!alive()) return { ok: false, code: 'cancelled', error: 'Подключение отменено.' };
    ready = true;
    send('tt:status', { state: 'live', username, roomId: state && state.roomId });
    return { ok: true, username };
  } catch (err) {
    if (conn === c) conn = null;
    try { c.removeAllListeners(); c.disconnect().catch(() => {}); } catch (_) {}
    return { ok: false, ...explain(err) };
  }
}

ipcMain.handle('tt:connect', async (_e, rawName) => {
  try { return await doConnect(rawName); } catch (err) { return { ok: false, ...explain(err) }; }
});

ipcMain.handle('tt:disconnect', async () => {
  await disconnect();
  send('tt:status', { state: 'offline' });
  return { ok: true };
});

// ---------- Голоса ----------
const FALLBACK_VOICES = [
  ['ru-RU-SvetlanaNeural', 'Светлана · русский', 'ru-RU', 'Female'],
  ['ru-RU-DmitryNeural', 'Дмитрий · русский', 'ru-RU', 'Male'],
].map(([id, name, locale, gender]) => ({ id, name, locale, gender }));

let voicesCache = null;
ipcMain.handle('tts:voices', async () => {
  if (voicesCache) return voicesCache;
  let tts = null;
  try {
    const { MsEdgeTTS } = await load('msedge-tts');
    tts = new MsEdgeTTS();
    const list = await Promise.race([
      tts.getVoices(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
    ]);
    const all = (list || []).map((v) => v && v.ShortName).filter(Boolean);
    const voices = (list || []).filter((v) => v && v.ShortName && /^ru-/i.test(v.Locale || v.ShortName) && !/Dariya/i.test(v.ShortName)).map((v) => ({
      id: v.ShortName,
      name: String(v.FriendlyName || v.ShortName).replace(/^Microsoft\s+/, '').replace(/\s*Online \(Natural\)\s*-?\s*/, ' · '),
      locale: v.Locale || '',
      gender: v.Gender || '',
    }));
    if (voices.length >= 2) return (voicesCache = { ok: true, voices, all });
  } catch (_) { /* берём встроенный список */ } finally {
    try { tts && tts.close && tts.close(); } catch (_) {}
  }
  return { ok: false, voices: FALLBACK_VOICES, all: [] };
});

async function edgeSynthOnce(text, voice, rate, pitch, timeoutMs = 8000) {
  let tts = null;
  try {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await load('msedge-tts');
    tts = new MsEdgeTTS();
    const fmt = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3 || OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
    await tts.setMetadata(voice || 'ru-RU-SvetlanaNeural', fmt);
    const res = await tts.toStream(text, { rate: Number(rate) || 1, pitch: pitch || '+0Hz' });
    const chunks = [];
    await Promise.race([
      new Promise((resolve, reject) => {
        res.audioStream.on('data', (ch) => chunks.push(ch));
        res.audioStream.on('end', resolve);
        res.audioStream.on('close', resolve);
        res.audioStream.on('error', reject);
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('tts timeout')), timeoutMs)),
    ]);
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('empty audio');
    return buf;
  } finally {
    try { tts && tts.close && tts.close(); } catch (_) {}
  }
}

// Сервер Microsoft иногда отвечает медленно или обрывает поток. Если ответа нет за HEDGE_MS,
// параллельно запускается ещё одна попытка (до 3), берём первую успешную — без многосекундных пауз.
function edgeSynth(text, voice, rate, pitch) {
  const MAX = 3, HEDGE_MS = 2500;
  return new Promise((resolve, reject) => {
    let done = false, started = 0, failed = 0, last, timer;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const launch = () => {
      if (done || started >= MAX) return;
      started++;
      edgeSynthOnce(text, voice, rate, pitch).then((buf) => finish(resolve, buf)).catch((err) => {
        last = err; failed++;
        if (failed >= MAX) finish(reject, last); else launch(); // оборвалось — сразу следующая попытка
      });
      clearTimeout(timer);
      if (started < MAX) timer = setTimeout(launch, HEDGE_MS);
    };
    launch();
  });
}

ipcMain.handle('tts:synth', async (_e, o) => {
  try {
    const text = String(o.text || '').slice(0, 400);
    if (!text.trim()) return { ok: false, error: 'empty text' };
    const buf = await edgeSynth(text, o.voice, o.rate, o.pitch);
    return { ok: true, audio: buf.toString('base64'), chars: text.length };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// ---------- Twitch (мультистрим) ----------
function stopTwitch() { if (tw) { try { tw.close(); } catch (_) {} tw = null; } }
ipcMain.handle('tw:connect', async (_e, name) => {
  stopTwitch();
  let first = true;
  const t = twitch.connect(name, {
    onStatus: (st) => { if (tw === t) send('tw:status', { state: st, channel: t.channel }); },
    onChat: async (m) => {
      if (tw !== t || !m.text) return;
      const avatar = await twitch.avatarOf(m.id);
      if (tw !== t) return;
      send('tw:chat', { ...m, avatar });
      wmsg({ platform: 'twitch', name: m.name, text: m.text, avatar, color: colorOf(m.name) });
    },
  });
  if (!t.ok) return t;
  tw = t;
  return { ok: true, channel: t.channel };
});
ipcMain.handle('tw:disconnect', () => { stopTwitch(); send('tw:status', { state: 'offline' }); return { ok: true }; });

// ---------- Виджет чата для OBS / TikTok LIVE Studio ----------
// адрес для предпросмотра внутри приложения
ipcMain.handle('widget:url', () => (wsrv && wsrv.port ? `http://127.0.0.1:${wsrv.port}/chat` : ''));
// ссылка для копирования: настоящий https-адрес страницы виджета на GitHub Pages; порт приложения — в параметре
ipcMain.handle('widget:link', () => (wsrv && wsrv.port ? { ok: true, url: widget.PAGES_URL } : { ok: false, url: '' }));
// Доступна ли страница на GitHub Pages (404 — Pages для репозитория ещё не включён)
ipcMain.handle('widget:check', () => new Promise((resolve) => {
  try {
    const r = require('https').get(widget.PAGES_URL, { timeout: 7000, headers: { 'User-Agent': 'echochat' } }, (res) => { res.resume(); resolve({ ok: res.statusCode === 200, status: res.statusCode }); });
    r.on('timeout', () => { r.destroy(); resolve({ ok: false, status: 0 }); });
    r.on('error', () => resolve({ ok: false, status: 0 }));
  } catch (_) { resolve({ ok: false, status: 0 }); }
}));
ipcMain.handle('widget:set', (_e, s) => { wset = { ...(s || {}) }; wsrv && wsrv.broadcast('settings', wset); return { ok: true }; });
ipcMain.handle('widget:test', () => {
  wmsg({ platform: 'tiktok', name: 'Анна', text: 'Привет из TikTok! Так выглядит чат', color: colorOf('Анна') });
  wmsg({ platform: 'twitch', name: 'Max', text: 'Привет из Twitch!', color: colorOf('Max') });
  wmsg({ platform: 'tiktok', name: 'Игорь', color: colorOf('Игорь'), gift: { name: 'Роза', count: 5 } });
  return { ok: true };
});
ipcMain.handle('widget:clear', () => { wsrv && wsrv.broadcast('clear', {}); return { ok: true }; });

const updater = require('./updater');
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('upd:check', async () => {
  try { return await updater.check(); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('upd:install', async () => {
  try { return await updater.install((p) => send('upd:progress', p)); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

app.whenReady().then(async () => {
  try { wsrv = await widget.start(() => wset); } catch (_) { wsrv = null; }
  createWindow();
  // прогрев: модуль, DNS и TLS-соединение готовы до первой фразы эфира
  edgeSynth('Привет', 'ru-RU-SvetlanaNeural', 1, '+0Hz').catch(() => {});
  if (SELFTEST) require('./selftest').run(win, app);
});
app.on('window-all-closed', async () => {
  await disconnect();
  stopTwitch();
  try { wsrv && wsrv.close(); } catch (_) {}
  app.quit();
});
