'use strict';
// Локальный сервер виджета чата. Слушает только этот компьютер (127.0.0.1).
// Ссылка для OBS / TikTok LIVE Studio — настоящий https-адрес страницы на GitHub Pages: она подключается
// к этому серверу из браузера на этом же компьютере. Поэтому разрешаем запросы только с адреса страницы.
const http = require('http');
const PAGE = require('./widget-page');

const PAGES_ORIGIN = 'https://vladimirphoto.github.io';
const PAGES_URL = PAGES_ORIGIN + '/jonny-chat-tiktok/chat/';

function start(getSettings, port = 7878, opts = {}) {
  const origins = opts.origins || [PAGES_ORIGIN];
  const clients = new Set();
  const history = [];
  const host = '127.0.0.1';
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    const origin = req.headers.origin;
    const cors = origin && origins.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Private-Network': 'true' }
      : {};
    if (req.method === 'OPTIONS') { // предварительный запрос браузера (CORS / доступ к локальной сети)
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '600' });
      return res.end();
    }
    if (u === '/' || u === '/chat') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(PAGE); }
    if (u === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...cors });
      res.write('retry: 2000\n\n');
      res.write('event: settings\ndata: ' + JSON.stringify(getSettings()) + '\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(404); res.end();
  });
  const ping = setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 20000);
  const broadcast = (event, data) => {
    const s = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
    clients.forEach((c) => c.write(s));
  };
  return new Promise((resolve) => {
    let p = port, tries = 0, ready = false;
    const api = {
      port: 0,
      broadcast(event, data) { if (event === 'msg') { history.push(data); if (history.length > 50) history.shift(); } broadcast(event, data); },
      close() { clearInterval(ping); clients.forEach((c) => { try { c.end(); } catch (_) {} }); server.close(); },
    };
    server.on('error', (e) => {
      if (ready) return;
      if (e.code === 'EADDRINUSE' && tries++ < 20) server.listen(++p, host);
      else resolve({ port: 0, broadcast() {}, close() {} });
    });
    server.on('listening', () => { if (!ready) { ready = true; api.port = p; resolve(api); } });
    server.listen(p, host);
  });
}
module.exports = { start, PAGES_URL, PAGES_ORIGIN };
