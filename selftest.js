// Автотест: запускает окно приложения, нажимает кнопки и проверяет реальные функции.
// Запуск: electron . --selftest --out=result.json
const fs = require('fs');

const { explain, explainGoogle } = require('./errors');
function mainTests() {
  const R = [];
  const add = (name, ok, detail) => R.push({ group: 'logic', name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  const e1 = explain(new Error("The requested user isn't online :("));
  add('«isn\'t online» → понятный русский', e1.code === 'offline' && /не в эфире/i.test(e1.error) && !/[a-z]{4,}/i.test(e1.error.replace(/TikTok|LIVE/g, '')), e1.error);
  const err = new Error('boom'); err.name = 'UserOfflineError';
  add('UserOfflineError → offline', explain(err).code === 'offline');
  add('сеть → русский текст', explain(new Error('getaddrinfo ENOTFOUND')).code === 'network');
  const o = explain(new Error('weird failure xyz'));
  add('неизвестная ошибка — русский текст без английского', o.code === 'other' && !/weird|xyz/.test(o.error), o.error);
  add('Google: неверный ключ', /ключ/i.test(explainGoogle(400, '{"error":{"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}')));
  add('Google: нет Billing', /оплат/i.test(explainGoogle(403, 'This API method requires billing to be enabled')));
  add('Google: API не включён', /не включён/i.test(explainGoogle(403, 'Cloud Text-to-Speech API has not been used in project 123 before or it is disabled')));
  add('Google: лимит', /лимит/i.test(explainGoogle(429, 'RESOURCE_EXHAUSTED quota')));
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
    for (const t of ['voice', 'filters', 'live']) {
      $('.nav[data-tab=' + t + ']').click();
      add('ui', 'вкладка ' + t, $('#tab-' + t).classList.contains('show') && $('#title').textContent.length > 0);
    }
    add('ui', 'иконки в 4 плашках', document.querySelectorAll('.stat .ic').length === 4);
    add('ui', 'иконки в меню', document.querySelectorAll('.nav .ic').length === 3);
    add('ui', 'карточки голосов', document.querySelectorAll('#voices .voice').length === 2, document.querySelectorAll('#voices .voice').length);
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
    // --- голоса: только Светлана и Дмитрий + Google ---
    $('.nav[data-tab=voice]').click();
    const names = [...document.querySelectorAll('#voices .voice b')].map((b) => b.textContent.trim());
    add('ui', 'встроенные голоса: только Светлана и Дмитрий', names.length === 2 && names[0] === 'Светлана' && names[1] === 'Дмитрий', names.join(','));
    add('ui', 'ElevenLabs и Microsoft-каталог убраны', !$('#newProv') && !$('#elKey') && !document.body.innerText.includes('ElevenLabs'));
    add('ui', 'блок Google на месте', !!$('#gKey') && !!$('#btnGCheck') && !!$('#gVoice') && $('#gUsage').textContent.includes('Использовано'));

    // Google-голос: пробуем добавить/удалить без сети (по метаданным)
    const meta = E.gMeta({ id: 'ru-RU-Chirp3-HD-Aoede', gender: 'F' });
    add('logic', 'разбор имени Google-голоса', meta.kind === 'hd' && meta.short === 'Aoede' && /лёгкий/.test(meta.label), meta.label);
    E.fillGoogleVoices([{ id: 'ru-RU-Wavenet-B', gender: 'M' }, { id: 'ru-RU-Chirp3-HD-Kore', gender: 'F' }, { id: 'ru-RU-Neural2-A', gender: 'F' }]);
    add('ui', 'список Google-голосов (HD первыми)', $('#gVoice').options.length === 3 && /HD/.test($('#gVoice').options[0].textContent), $('#gVoice').options[0].textContent);
    const before = document.querySelectorAll('#voices .voice').length;
    $('#newName').value = 'Бодрая Света';
    $('#btnAddVoice').click();
    await sleep(150);
    add('ui', 'добавление Google-голоса', document.querySelectorAll('#voices .voice').length === before + 1, before + '->' + document.querySelectorAll('#voices .voice').length);
    add('ui', 'Google-голос сохранён', (localStorage.getItem('echochat2') || '').includes('Бодрая Света'));
    add('ui', 'для HD-голоса ползунок скорости отключён', $('#rate').disabled && $('#pitch').disabled);
    const del = document.querySelector('#voices .voice.sel .del');
    if (del) del.click();
    await sleep(100);
    add('ui', 'удаление Google-голоса', document.querySelectorAll('#voices .voice').length === before);
    add('ui', 'после удаления ползунки снова активны', !$('#rate').disabled && !$('#pitch').disabled);

    // лимит: при превышении 90% переключаемся на запасной
    E.usage(); E.addUsage('hd', 950000);
    add('logic', 'учёт лимита Google (90%)', E.overBudget('hd') && !E.overBudget('std'));
    E.S.usage.hd = 0;

    // ключ Google: пустой и неверный дают понятные ошибки
    $('#gKey').value = ''; $('#btnGCheck').click(); await sleep(100);
    add('ui', 'Google без ключа — понятная ошибка', $('#voiceMsg').classList.contains('bad') && /ключ/i.test($('#voiceMsg').textContent), $('#voiceMsg').textContent);
    $('#gKey').value = 'AIzaFAKEKEYFORTESTING000000000000000000'; $('#btnGCheck').click();
    const tg = Date.now(); while (Date.now() - tg < 25000 && /Проверяю/.test($('#voiceMsg').textContent)) await sleep(300);
    add('net', 'Google с неверным ключом — русская ошибка', $('#voiceMsg').classList.contains('bad') && /[а-я]/i.test($('#voiceMsg').textContent) && !/API key not valid/i.test($('#voiceMsg').textContent), $('#voiceMsg').textContent);
    $('#gKey').value = ''; E.S.gKey = '';

    // --- кнопка обновления не меняет размер ---
    const ub = $('#btnUpdate');
    const h0 = ub.getBoundingClientRect().height, w0 = ub.getBoundingClientRect().width;
    const labels = ['✓ Версия актуальна', '⬇ Обновить до 10.20.30', 'Скачиваю… 100%', '⬇ Страница загрузки', 'Проверяю…', '⟳ Проверить обновления', 'Перезапуск…'];
    const bad = labels.filter((l) => { ub.textContent = l; const r = ub.getBoundingClientRect(); return Math.abs(r.height - h0) > 0.5 || Math.abs(r.width - w0) > 0.5; });
    add('ui', 'кнопка обновления не меняет размер', bad.length === 0, 'h=' + h0 + ' w=' + w0 + (bad.length ? ' плохие: ' + bad.join(' | ') : ''));
    ub.textContent = '⟳ Проверить обновления';

    // --- сеть: голоса Microsoft ---
    for (const id of ['ru-RU-SvetlanaNeural', 'ru-RU-DmitryNeural']) {
      const r = await window.echo.synth({ text: 'Привет, это проверка голоса.', voice: id, rate: 1, pitch: '+0Hz' });
      add('net', 'голос ' + id, r.ok && r.audio.length > 3000, r.ok ? ('base64 ' + r.audio.length) : r.error);
    }
    const slow = await window.echo.synth({ text: 'Скорость и тон.', voice: 'ru-RU-SvetlanaNeural', rate: 1.3, pitch: '+10Hz' });
    add('net', 'скорость и тон принимаются', slow.ok, slow.ok ? slow.audio.length : slow.error);
    const cat = await window.echo.voices();
    add('net', 'каталог Microsoft (только русские)', cat.voices.length >= 2 && cat.voices.every((v) => /^ru-/i.test(v.id)), cat.ok + ' / ' + cat.voices.map((v) => v.id).join(','));
    const gs = await window.echo.synth({ text: 'тест', provider: 'google', gName: 'ru-RU-Wavenet-A', gKey: '' });
    add('logic', 'Google без ключа возвращает ошибку', !gs.ok && /ключ/i.test(gs.error), gs.error);

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
    add('net', 'текст «Вы не в эфире…»', /не в эфире/i.test(alertText), alertText);
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
    finish([...mainTests(), ...(await win.webContents.executeJavaScript(PAGE_TEST, true))]);
  } catch (e) {
    finish([{ group: 'ui', name: 'автотест не смог запуститься', ok: false, detail: String(e && e.stack || e) }]);
  }
}

module.exports = { run, PAGE_TEST };
