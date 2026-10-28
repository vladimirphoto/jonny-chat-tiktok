// Автотест: запускает окно приложения, нажимает кнопки и проверяет реальные функции.
// Запуск: electron . --selftest --out=result.json
const fs = require('fs');

const { explain } = require('./errors');
const ev = require('./events');
function mainTests() {
  const R = [];
  const add = (name, ok, detail) => R.push({ group: 'logic', name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const e1 = explain(new Error("The requested user isn't online :("));
  add('«isn\'t online» → понятный русский', e1.code === 'offline' && /не в эфире/i.test(e1.error) && !/[a-z]{4,}/i.test(e1.error.replace(/TikTok|LIVE/g, '')), e1.error);
  const e2 = explain(new Error('Failed to retrieve Room ID from alternative source'));
  add('«Failed to retrieve Room ID» → понятный русский', e2.code === 'offline' && /не найден|не в эфире/i.test(e2.error) && !/Failed|Room/.test(e2.error), e2.error);
  const err = new Error('boom'); err.name = 'UserOfflineError';
  add('UserOfflineError → offline', explain(err).code === 'offline');
  add('сеть → русский текст', explain(new Error('getaddrinfo ENOTFOUND')).code === 'network');
  const o = explain(new Error('weird failure xyz'));
  add('неизвестная ошибка — русский текст без английского', o.code === 'other' && !/weird|xyz/.test(o.error), o.error);
  const ch = ev.chatOf({ content: 'привет', user: { nickname: 'Аня' } });
  add('событие чата: текст из content', ch.text === 'привет' && ch.name === 'Аня', JSON.stringify(ch));
  add('событие зрителей: total', ev.viewersOf({ total: 42 }) === 42 && ev.viewersOf({ viewerCount: 7 }) === 7);
  add('событие лайков: count/total', ev.likesOf({ count: 2, total: 55 }).total === 55);
  add('событие подарка: серия не считается, пока идёт', ev.giftOf({ giftDetails: { giftName: 'Rose', giftType: 1 }, repeatEnd: false }).done === false && ev.giftOf({ giftDetails: { giftName: 'Rose', giftType: 1 }, repeatEnd: true }).done === true);
  return R;
}

const outArg = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);

const PAGE_TEST = `(async () => {
  const R = [];
  const add = (group, name, ok, detail) => R.push({ group, name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  try {
    // --- интерфейс (критично) ---
    add('ui', 'preload API', window.echo && ['connect','disconnect','synth','voices','checkUpdate'].every((k) => typeof window.echo[k] === 'function'));
    for (const t of ['voice', 'filters', 'widgets', 'live']) {
      $('.nav[data-tab=' + t + ']').click();
      add('ui', 'вкладка ' + t, $('#tab-' + t).classList.contains('show') && $('#title').textContent.length > 0);
    }
    add('ui', 'вкладка «Виджеты»: ссылка и настройки', /^http:\\/\\/localhost:\\d+\\/chat$/.test($('#wUrl').value) && !!$('#wAlignSel') && document.querySelectorAll('#tab-widgets input[data-k]').length >= 5, $('#wUrl').value);
    add('ui', 'иконки в 4 плашках', document.querySelectorAll('.stat .ic').length === 4);
    add('ui', 'иконки в меню', document.querySelectorAll('.nav .ic').length === 4);
    add('ui', 'карточки голосов', document.querySelectorAll('#voices .voice').length >= 2, document.querySelectorAll('#voices .voice').length);
    add('ui', 'версия в сайдбаре', /\\d+\\.\\d+/.test($('#verLine').textContent), $('#verLine').textContent);

    // --- фильтры (критично) ---
    const E = window.__echo; E.S.maxLen = 60; E.S.noRepeat = false;
    const f = (s) => E.clean(s);
    add('logic', 'эмодзи убираются', f('Привет 😀') === 'Привет', f('Привет 😀'));
    add('logic', 'команды пропускаются', f('!hello привет') === null);
    add('logic', 'ссылки пропускаются', f('заходи на site.com') === null);
    add('logic', 'мат пропускается', f('ты пидор') === null);
    add('logic', 'нерусский пропускается', f('hello world') === null);
    add('logic', 'упоминания вырезаются', f('@vasya привет') === 'привет', f('@vasya привет'));
    add('logic', 'озвучка ника', E.speakName('Вася_Pro😎') === 'Вася Pro', E.speakName('Вася_Pro😎'));
    // --- голоса ---
    $('.nav[data-tab=voice]').click();
    const names = [...document.querySelectorAll('#voices .voice b')].map((b) => b.textContent.trim());
    add('ui', 'голоса: Светлана и Дмитрий первыми, есть мультиязычные', names.length >= 2 && names[0] === 'Светлана' && names[1] === 'Дмитрий', names.join(','));
    const pb = $('#voices .voice .play');
    pb.click(); await sleep(150);
    add('ui', 'кнопка Twitch есть', !!$('#btnTwitch'), !!$('#btnTwitch'));
    add('ui', 'кнопка ▶ при нажатии превращается в паузу', pb.classList.contains('active') && /rect/.test(pb.innerHTML) && /Остановить/.test($('#btnTest').textContent), pb.innerHTML.slice(0, 40) + ' | ' + $('#btnTest').textContent);
    pb.click(); await sleep(150);
    add('ui', 'повторное нажатие останавливает', !pb.classList.contains('active') && /path/.test(pb.innerHTML), pb.innerHTML.slice(0, 40));
    add('ui', 'студия озвучки под «Что озвучивать»', !!$('#studio') && !!$('#studio').previousElementSibling && $('#studio').previousElementSibling.querySelector('[data-k=subsOnly]') !== null);
    add('ui', 'выбор голоса для подарков и подписок', $('#eventVoice').options.length >= 3, $('#eventVoice').options.length);
    add('ui', 'ElevenLabs и Microsoft-каталог убраны', !$('#newProv') && !$('#elKey') && !document.body.innerText.includes('ElevenLabs'));

    // --- кнопка обновления не меняет размер ---
    const ub = $('#btnUpdate');
    const h0 = ub.getBoundingClientRect().height, w0 = ub.getBoundingClientRect().width;
    const labels = ['✓ Версия актуальна', '⬇ Обновить до 10.20.30', 'Скачиваю… 100%', '⬇ Страница загрузки', 'Проверяю…', '⟳ Проверить обновления', 'Перезапуск…'];
    const bad = labels.filter((l) => { ub.textContent = l; const r = ub.getBoundingClientRect(); return Math.abs(r.height - h0) > 0.5 || Math.abs(r.width - w0) > 0.5; });
    add('ui', 'кнопка обновления не меняет размер', bad.length === 0, 'h=' + h0 + ' w=' + w0 + (bad.length ? ' плохие: ' + bad.join(' | ') : ''));
    ub.textContent = '⟳ Проверить обновления';

    // --- сеть: голоса Microsoft ---
    for (const b of E.builtin) {
      const t0 = Date.now();
      const r = await window.echo.synth({ text: 'Привет, как у вас дела?', voice: b.voice, rate: 1, pitch: '+0Hz' });
      add('net', 'голос ' + b.name + ' (' + b.voice + ')', r.ok && r.audio.length > 3000, r.ok ? ((Date.now() - t0) + ' мс, base64 ' + r.audio.length) : r.error);
    }
    const tw = Date.now();
    const w2 = await window.echo.synth({ text: 'Всем привет!', voice: 'ru-RU-SvetlanaNeural', rate: 1, pitch: '+0Hz' });
    add('net', 'задержка синтеза короткой фразы до 3 с', w2.ok && Date.now() - tw < 3000, (Date.now() - tw) + ' мс');
    const slow = await window.echo.synth({ text: 'Скорость и тон.', voice: 'ru-RU-SvetlanaNeural', rate: 1.3, pitch: '+10Hz' });
    add('net', 'скорость и тон принимаются', slow.ok, slow.ok ? slow.audio.length : slow.error);
    const cat = await window.echo.voices();
    add('net', 'каталог Microsoft (только русские)', cat.voices.length >= 2 && cat.voices.every((v) => /^ru-/i.test(v.id)), cat.ok + ' / ' + cat.voices.map((v) => v.id).join(','));

    // --- сеть: подключение к несуществующему эфиру ---
    $('.nav[data-tab=live]').click();
    $('#nick').value = 'zz_no_such_live_user_84317';
    $('#btnConnect').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 50000 && $('#alert').hidden) await sleep(500);
    add('ui', 'при отсутствии эфира показана ошибка', !$('#alert').hidden, $('#alert').textContent);
    add('ui', 'кнопка вернулась в исходное состояние', $('#btnConnect').textContent === 'Подключиться', $('#btnConnect').textContent);
    const alertText = $('#alert').textContent;
    const feedText = $('#feed').innerText;
    add('ui', 'ошибка подключения без технического мусора', !/TypeError|invoking remote|undefined|Cannot read|isn.?t online/i.test(alertText + feedText), alertText);
    add('net', 'текст ошибки об эфире по-русски', /не в эфире|эфир не найден/i.test(alertText) && !/Technical|Failed|Room/i.test(alertText), alertText);
    add('ui', 'сообщение об офлайне показано один раз (не дублируется в ленте)', !/не в эфире|не удалось подключиться|ошибка/i.test(feedText), feedText.replace(/\\n+/g, ' / '));
    add('ui', 'студия озвучки на месте', !!$('#btnStudio') && document.querySelectorAll('#chips .chip').length === 4);
    add('ui', 'переключателя голосов зрителей нет', !document.querySelector('[data-k=perViewer]'));

    // --- проверка обновлений ---
    const up = await window.echo.checkUpdate();
    add('net', 'проверка обновлений', up.ok, JSON.stringify(up).slice(0, 160));
  } catch (e) {
    add('ui', 'исключение в тесте', false, e && e.stack || e);
  }
  add('ui', 'нет ошибок JS в окне', (window.__errors || []).length === 0, (window.__errors || []).join(' | '));
  return R;
})()`;

// Имитация событий TikTok: главный процесс шлёт их окну так же, как это делает библиотека
async function eventTests(win) {
  const R = [];
  const add = (name, ok, detail) => R.push({ group: 'ui', name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const send = (c, p) => win.webContents.send(c, p);
  const q = (js) => win.webContents.executeJavaScript(js, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await q("document.querySelector('.nav[data-tab=live]').click(); document.querySelector('#paused').checked = true; window.__echo.S.noRepeat = false;");
  send('tt:viewers', { count: 1234 });
  send('tt:like', { count: 3, total: 100 });
  send('tt:like', { count: 2, total: null });
  send('tt:like', { count: 1, total: 0 });
  send('tt:like', { count: 5, total: 50 });
  send('tt:gift', { name: 'Аня', gift: 'Rose', count: 3 });
  send('tt:follow', { name: 'Боря' });
  send('tt:chat', { name: 'Вика', text: 'привет всем', created: null });
  send('tt:chat', { name: 'Пустой', text: '', created: null });
  await wait(400);
  const digits = async (sel) => (await q(`document.querySelector('${sel}').textContent`)).replace(/\D/g, '');
  add('событие: зрители отображаются', (await digits('#sViewers')) === '1234', await digits('#sViewers'));
  add('событие: лайки отображаются и копятся', (await digits('#sLikes')) === '103', await digits('#sLikes'));
  add('событие: подарки считаются', (await digits('#sGifts')) === '3', await digits('#sGifts'));
  add('событие: подписки считаются', (await digits('#sFollows')) === '1', await digits('#sFollows'));
  const feed = await q("document.querySelector('#feed').innerText");
  add('событие: сообщение чата с текстом в ленте', /Вика/.test(feed) && /привет всем/.test(feed), feed.replace(/\n+/g, ' / ').slice(0, 160));
  add('событие: пустое сообщение не попадает в ленту', !/Пустой/.test(feed));
  await q("document.querySelector('#btnClear').click()");
  send('tt:chat', { name: 'Миша', text: 'после очистки', created: null });
  await wait(300);
  const feed2 = await q("document.querySelector('#feed').innerText");
  add('после очистки ленты новые сообщения появляются', /после очистки/.test(feed2), feed2.replace(/\n+/g, ' / ').slice(0, 120));
  // только подписчики: чужие помечаются как пропущенные, свои и подписавшиеся в эфире проходят
  await q("window.__echo.S.subsOnly = true");
  send('tt:chat', { name: 'Чужой', text: 'сообщение чужого', isFollower: false, created: null });
  send('tt:chat', { name: 'Свой', text: 'сообщение своего', isFollower: true, created: null });
  send('tt:chat', { name: 'Боря', text: 'подписался в эфире', isFollower: null, created: null });
  await wait(300);
  const skipped = (n) => q(`[...document.querySelectorAll('#feed .msg')].find((m) => m.textContent.includes('${n}')).classList.contains('skip')`);
  add('только подписчики: не подписчик пропущен', (await skipped('Чужой')) === true);
  add('только подписчики: подписчик проходит', (await skipped('Свой')) === false);
  add('только подписчики: подписавшийся в эфире проходит', (await skipped('Боря')) === false);
  await q("window.__echo.S.subsOnly = false; document.querySelector('#paused').checked = false");
  return R;
}

async function run(win, app) {
  const guard = setTimeout(() => finish([{ group: 'ui', name: 'таймаут автотеста', ok: false, detail: '' }]), 200000);
  const finish = (results) => {
    clearTimeout(guard);
    const failedCritical = results.filter((r) => !r.ok && r.group !== 'net');
    const report = { version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, results, criticalFailed: failedCritical.length };
    const txt = JSON.stringify(report, null, 2);
    console.log('SELFTEST_REPORT_BEGIN\n' + txt + '\nSELFTEST_REPORT_END');
    if (outArg) { try { fs.writeFileSync(outArg, txt); } catch (_) {} }
    app.exit(failedCritical.length ? 1 : 0);
  };
  try {
    await new Promise((resolve) => (win.webContents.isLoading() ? win.webContents.once('did-finish-load', resolve) : resolve()));
    await new Promise((r) => setTimeout(r, 800));
    const page = await win.webContents.executeJavaScript(PAGE_TEST, true);
    finish([...mainTests(), ...page, ...(await eventTests(win))]);
  } catch (e) {
    finish([{ group: 'ui', name: 'автотест не смог запуститься', ok: false, detail: String(e && e.stack || e) }]);
  }
}

module.exports = { run, PAGE_TEST };
