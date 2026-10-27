const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

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

function userOf(d) {
  const u = d.user || {};
  const badges = JSON.stringify(u.badges || u.badgeList || []).toLowerCase();
  return {
    name: u.nickname || u.uniqueId || 'Гость',
    id: u.uniqueId || '',
    isSub: !!(u.isSubscriber || u.subscriber || badges.includes('subscriber') || badges.includes('sub_')),
    isMod: !!(u.isModerator || u.moderator),
  };
}

async function disconnect() {
  if (conn) {
    const c = conn;
    conn = null;
    try { c.removeAllListeners(); } catch (_) {}
    try { await Promise.race([c.disconnect(), new Promise((r) => setTimeout(r, 3000))]); } catch (_) {}
  }
}

// Понятные тексты для типичных ошибок подключения
function explain(err) {
  const raw = String((err && (err.message || err.info)) || err || '');
  const name = String((err && (err.name || (err.constructor && err.constructor.name))) || '');
  const all = `${name} ${raw}`.toLowerCase();
  if (/useroffline|offline|not live|isn.t live|not currently live|has ended|room_id|room id|roomid|not found|404/.test(all)) {
    return { code: 'offline', error: 'Вы не в эфире. Запустите трансляцию в TikTok LIVE, подключитесь и попробуйте снова. Также проверьте, что ник введён правильно.' };
  }
  if (/timeout|timed out|превышено/.test(all)) {
    return { code: 'timeout', error: 'Нет ответа от TikTok. Проверьте интернет и попробуйте снова.' };
  }
  if (/rate.?limit|429|too many|limit exceeded/.test(all)) {
    return { code: 'rate', error: 'TikTok временно ограничил запросы. Подождите минуту и попробуйте снова.' };
  }
  if (/enotfound|econn|network|fetch failed|getaddrinfo|socket/.test(all)) {
    return { code: 'network', error: 'Нет соединения с интернетом или TikTok недоступен. Проверьте сеть и попробуйте снова.' };
  }
  return { code: 'other', error: 'Не удалось подключиться: ' + (raw || name || 'неизвестная ошибка') };
}

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
  const alive = () => conn === c;
  const EV = ControlEvent || {};

  c.on(WebcastEvent.CHAT, (d) => alive() && send('tt:chat', { ...userOf(d), text: d.comment || '' }));
  c.on(WebcastEvent.GIFT, (d) => {
    if (!alive()) return;
    const det = d.giftDetails || {};
    // серия подарков (giftType 1) считается один раз — когда она закончилась
    if (det.giftType === 1 && !d.repeatEnd) return;
    send('tt:gift', { ...userOf(d), gift: det.giftName || d.giftName || 'подарок', count: d.repeatCount || 1 });
  });
  c.on(WebcastEvent.FOLLOW, (d) => alive() && send('tt:follow', userOf(d)));
  c.on(WebcastEvent.LIKE, (d) => alive() && send('tt:like', { total: d.totalLikeCount, count: d.likeCount || 1 }));
  c.on(WebcastEvent.ROOM_USER, (d) => alive() && send('tt:viewers', { count: d.viewerCount }));
  c.on(WebcastEvent.STREAM_END, () => alive() && send('tt:status', { state: 'ended' }));
  c.on(EV.DISCONNECTED || 'disconnected', () => alive() && send('tt:status', { state: 'offline' }));
  c.on(EV.ERROR || 'error', (e) => {
    if (!alive()) return;
    const ex = (e && e.exception) || e;
    send('tt:error', { message: String((ex && ex.message) || (e && e.info) || ex) });
  });

  try {
    const state = await Promise.race([
      c.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
    ]);
    if (!alive()) return { ok: false, code: 'cancelled', error: 'Подключение отменено.' };
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
  ['ru-RU-DariyaNeural', 'Дарья · русский', 'ru-RU', 'Female'],
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
    const voices = (list || []).filter((v) => v && v.ShortName && /^ru-/i.test(v.Locale || v.ShortName)).map((v) => ({
      id: v.ShortName,
      name: String(v.FriendlyName || v.ShortName).replace(/^Microsoft\s+/, '').replace(/\s*Online \(Natural\)\s*-?\s*/, ' · '),
      locale: v.Locale || '',
      gender: v.Gender || '',
    }));
    if (voices.length >= 3) return (voicesCache = { ok: true, voices });
  } catch (_) { /* берём встроенный список */ } finally {
    try { tts && tts.close && tts.close(); } catch (_) {}
  }
  return { ok: false, voices: FALLBACK_VOICES };
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

// Сервер Microsoft иногда обрывает поток — повторяем до 3 раз
async function edgeSynth(text, voice, rate, pitch) {
  let last;
  for (let i = 0; i < 3; i++) {
    try { return await edgeSynthOnce(text, voice, rate, pitch); } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw last;
}

// Свой или клонированный голос ElevenLabs (нужен ключ и Voice ID)
async function elevenSynth(text, voiceId, key) {
  if (!key || !voiceId) throw new Error('Укажите API-ключ и Voice ID ElevenLabs');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Неверный API-ключ ElevenLabs');
      if (res.status === 404) throw new Error('Голос с таким Voice ID не найден в ElevenLabs');
      if (res.status === 402 || res.status === 429) throw new Error('Лимит ElevenLabs исчерпан или тариф не позволяет этот голос');
      throw new Error('ElevenLabs ответил ' + res.status);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(timer); }
}

ipcMain.handle('tts:synth', async (_e, o) => {
  try {
    const text = String(o.text || '').slice(0, 400);
    if (!text.trim()) return { ok: false, error: 'empty text' };
    const buf = o.provider === 'eleven'
      ? await elevenSynth(text, o.elVoice, o.elKey)
      : await edgeSynth(text, o.voice, o.rate, o.pitch);
    return { ok: true, audio: buf.toString('base64') };
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
  if (SELFTEST) require('./selftest').run(win, app);
});
app.on('window-all-closed', async () => {
  await disconnect();
  app.quit();
});
