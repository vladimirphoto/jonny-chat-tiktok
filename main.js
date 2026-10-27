const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

let win = null;
let conn = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#0b0b12',
    title: 'ЭхоЧат LIVE',
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
    try { conn.removeAllListeners(); } catch (_) {}
    try { await conn.disconnect(); } catch (_) {}
    conn = null;
  }
}

ipcMain.handle('tt:connect', async (_e, rawName) => {
  const username = String(rawName || '').trim().replace(/^@/, '');
  if (!username) return { ok: false, error: 'Введи ник автора.' };
  await disconnect();
  conn = new TikTokLiveConnection(username);

  conn.on(WebcastEvent.CHAT, (d) => send('tt:chat', { ...userOf(d), text: d.comment || '' }));
  conn.on(WebcastEvent.GIFT, (d) => {
    // серия подарков считается один раз — когда она закончилась
    if (d.giftType === 1 && !d.repeatEnd) return;
    send('tt:gift', {
      ...userOf(d),
      gift: d.giftName || (d.giftDetails && d.giftDetails.giftName) || 'подарок',
      count: d.repeatCount || 1,
    });
  });
  conn.on(WebcastEvent.FOLLOW, (d) => send('tt:follow', userOf(d)));
  conn.on(WebcastEvent.LIKE, (d) => send('tt:like', { total: d.totalLikeCount, count: d.likeCount || 1 }));
  conn.on(WebcastEvent.ROOM_USER, (d) => send('tt:viewers', { count: d.viewerCount }));
  conn.on(WebcastEvent.STREAM_END, () => send('tt:status', { state: 'ended' }));
  conn.on('disconnected', () => send('tt:status', { state: 'offline' }));
  conn.on('error', (err) => send('tt:error', { message: String((err && err.message) || err) }));

  try {
    const state = await conn.connect();
    send('tt:status', { state: 'live', username, roomId: state && state.roomId });
    return { ok: true, username };
  } catch (err) {
    conn = null;
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('tt:disconnect', async () => {
  await disconnect();
  send('tt:status', { state: 'offline' });
  return { ok: true };
});

// Нейро-голоса Microsoft Edge: естественная интонация, не «робот»
ipcMain.handle('tts:synth', async (_e, { text, voice, rate, pitch }) => {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice || 'ru-RU-SvetlanaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(String(text).slice(0, 400), {
      rate: rate || 'default',
      pitch: pitch || 'default',
    });
    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', resolve);
      audioStream.on('close', resolve);
      audioStream.on('error', reject);
    });
    try { tts.close(); } catch (_) {}
    const buf = Buffer.concat(chunks);
    if (!buf.length) return { ok: false, error: 'empty' };
    return { ok: true, audio: buf.toString('base64') };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', async () => {
  await disconnect();
  app.quit();
});
