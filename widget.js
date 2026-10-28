'use strict';
// Локальный сервер виджета чата: http://localhost:PORT/chat — ссылка для OBS / TikTok LIVE Studio.
const http = require('http');
const PAGE = require('./widget-page');

function start(getSettings, port = 7878) {
  const clients = new Set();
  const history = [];
  const server = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/' || u === '/chat') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(PAGE); }
    if (u === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
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
    let p = port, tries = 0;
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && tries++ < 20) server.listen(++p, '127.0.0.1');
      else resolve({ port: 0, broadcast() {}, close() {} });
    });
    server.on('listening', () => resolve({
      port: p,
      broadcast(event, data) { if (event === 'msg') { history.push(data); if (history.length > 50) history.shift(); } broadcast(event, data); },
      close() { clearInterval(ping); clients.forEach((c) => { try { c.end(); } catch (_) {} }); server.close(); },
    }));
    server.listen(p, '127.0.0.1');
  });
}
module.exports = { start };
