const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const ev = require('./events');

// Пакеты могут быть ESM-only — подключаем через динамический import()
const load = async (name) => {
  const m = await import(name);
  return { ...(m.default && typeof m.default === 'object' ? m.default : {}), ...m };
};

let win = null;
let conn = null;
const SELFTEST = process.argv.includes('--selftest');

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 660,
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
      processInitialData: true,
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

  c.on(WebcastEvent.CHAT || 'chat', (d) => alive() && send('tt:chat', ev.chatOf(d)));
  c.on(WebcastEvent.GIFT || 'gift', (d) => {
    if (!alive()) return;
    const g = ev.giftOf(d);
    if (!g.done) return; // серия подарков идёт — считаем один раз, когда она закончилась
    send('tt:gift', g);
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

async function edgeSynthOnce(text, voice, rate, pitch) {
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
      new Promise((_, rej) => setTimeout(() => rej(new Error('tts timeout')), 15000)),
    ]);
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('empty audio');
    return buf;
  } finally {
    try { tts && tts.close && tts.close(); } catch (_) {}
  }
}

// Сервер Microsoft иногда обрывает поток — повторяем до 3 раз (короткие паузы, чтобы не копить задержку)
async function edgeSynth(text, voice, rate, pitch) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await edgeSynthOnce(text, voice, rate, pitch); } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw last;
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

const updater = require('./updater');
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('upd:check', async () => {
  try { return await updater.check(); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('upd:install', async () => {
  try { return await updater.install((p) => send('upd:progress', p)); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

app.whenReady().then(() => {
  createWindow();
  load('msedge-tts').catch(() => {}); // модуль озвучки грузится заранее — первая фраза не ждёт
  if (SELFTEST) require('./selftest').run(win, app);
});
app.on('window-all-closed', async () => {
  await disconnect();
  app.quit();
});
