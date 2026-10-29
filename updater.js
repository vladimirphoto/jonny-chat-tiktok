const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'vladimirphoto/jonny-chat-tiktok';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const PAGE = `https://github.com/${REPO}/releases/latest`;

const parse = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
function isNewer(remote, local) {
  const a = parse(remote), b = parse(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

let found = null;

async function check() {
  const res = await fetch(API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EchoChat-LIVE' },
  });
  if (res.status === 404) return { ok: true, available: false, current: app.getVersion() };
  if (!res.ok) throw new Error('GitHub ответил ' + res.status);
  const rel = await res.json();
  const asset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
  const version = String(rel.tag_name || '').replace(/^v/i, '');
  const available = !!asset && isNewer(version, app.getVersion());
  found = available ? { version, url: asset.browser_download_url, size: asset.size } : null;
  return { ok: true, available, current: app.getVersion(), version, notes: rel.body || '', portable: !!process.env.PORTABLE_EXECUTABLE_FILE };
}

async function install(onProgress) {
  if (!found) throw new Error('Сначала проверь обновления');
  const target = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!target) {
    // запуск не из portable exe (например npm start) — просто открываем страницу релиза
    shell.openExternal(PAGE);
    return { ok: true, manual: true };
  }

  const tmp = path.join(os.tmpdir(), `EchoChat-LIVE-${found.version}.exe.download`);
  const res = await fetch(found.url, { headers: { 'User-Agent': 'EchoChat-LIVE' } });
  if (!res.ok || !res.body) throw new Error('Не удалось скачать: ' + res.status);
  const total = Number(res.headers.get('content-length')) || found.size || 0;
  const out = fs.createWriteStream(tmp);
  let got = 0;
  for await (const chunk of res.body) {
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (total) onProgress(Math.round((got / total) * 100));
  }
  await new Promise((r, j) => { out.end(r); out.on('error', j); });
  if (total && got < total) throw new Error('Загрузка прервана');

  // bat ждёт закрытия приложения, подменяет exe и запускает новую версию
  const bat = path.join(os.tmpdir(), 'echochat-update.bat');
  fs.writeFileSync(bat, [
    '@echo off',
    'chcp 65001 >nul',
    'setlocal',
    'set /a n=0',
    'timeout /t 2 /nobreak >nul',
    ':retry',
    `move /y "${tmp}" "${target}" >nul 2>&1`,
    'if errorlevel 1 (',
    '  set /a n+=1',
    '  if %n% GEQ 40 exit /b 1',
    '  timeout /t 1 /nobreak >nul',
    '  goto retry',
    ')',
    `start "" "${target}"`,
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n'));
  spawn('cmd.exe', ['/c', bat], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  setTimeout(() => app.quit(), 400);
  return { ok: true };
}

module.exports = { check, install };
