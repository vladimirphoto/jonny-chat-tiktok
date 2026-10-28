'use strict';
// Локальный сервер виджета чата: http://127.0.0.1:PORT/chat — ссылка для OBS / TikTok LIVE Studio.
// По умолчанию слушает только этот компьютер; режим «IP локальной сети» включается по выбору пользователя.
const http = require('http');
const PAGE = require('./widget-page');

function start(getSettings, port = 7878) {
  const clients = new Set();
  const history = [];
  let host = '127.0.0.1';
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
    let p = port, tries = 0, ready = false;
    const api = {
      port: 0,
      broadcast(event, data) { if (event === 'msg') { history.push(data); if (history.length > 50) history.shift(); } broadcast(event, data); },
      close() { clearInterval(ping); clients.forEach((c) => { try { c.end(); } catch (_) {} }); server.close(); },
      // Переключает прослушивание между «только этот компьютер» и «вся локальная сеть». Порт тот же;
      // открытые страницы виджета переподключаются сами (retry: 2000).
      setLan(on) {
        const want = on ? '0.0.0.0' : '127.0.0.1';
        if (want === host) return Promise.resolve(true);
        return new Promise((done) => {
          clients.forEach((c) => { try { c.end(); } catch (_) {} });
          clients.clear();
          try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
          server.close(() => {
            const onErr = () => { server.listen(api.port, host); done(false); }; // не вышло — возвращаем как было
            server.once('error', onErr);
            server.listen(api.port, want, () => { server.removeListener('error', onErr); host = want; done(true); });
          });
        });
      },
    };
    server.on('error', (e) => {
      if (ready) return;
      if (e.code === 'EADDRINUSE' && tries++ < 20) server.listen(++p, host);
      else resolve({ port: 0, broadcast() {}, close() {}, setLan: () => Promise.resolve(false) });
    });
    server.on('listening', () => { if (!ready) { ready = true; api.port = p; resolve(api); } });
    server.listen(p, host);
  });
}
module.exports = { start };
