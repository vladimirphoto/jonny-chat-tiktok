// Автотест: запускает окно приложения, нажимает кнопки и проверяет реальные функции.
// Запуск: electron . --selftest --out=result.json
const fs = require('fs');

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
    add('ui', 'карточки голосов', document.querySelectorAll('#voices .voice').length >= 3, document.querySelectorAll('#voices .voice').length);
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
    E.S.perViewer = true;
    const a1 = E.pickPreset('vasya').id, a2 = E.pickPreset('vasya').id;
    add('logic', 'голос зрителя стабилен', a1 === a2, a1);
    const ids = new Set(['a','bb','ccc','dddd','eeeee','ffffff','ggggggg','hhhhhhhh'].map((n) => E.pickPreset(n).id));
    add('logic', 'ротация голосов даёт разные голоса', ids.size >= 2, [...ids].join(','));
    E.S.perViewer = false;

    // --- свой голос через интерфейс (критично) ---
    $('.nav[data-tab=voice]').click();
    const before = document.querySelectorAll('#voices .voice').length;
    await sleep(1500);
    add('ui', 'каталог голосов загружен', $('#newVoice').options.length >= 5, $('#newVoice').options.length);
    $('#newName').value = 'Тестовый голос';
    $('#btnAddVoice').click();
    await sleep(200);
    const after = document.querySelectorAll('#voices .voice').length;
    add('ui', 'добавление своего голоса', after === before + 1, before + '->' + after);
    add('ui', 'свой голос сохранён', (localStorage.getItem('echochat2') || '').includes('Тестовый голос'));
    const del = document.querySelector('#voices .voice.sel .del');
    if (del) del.click();
    await sleep(100);
    add('ui', 'удаление своего голоса', document.querySelectorAll('#voices .voice').length === before);

    // eleven без ключа должен дать понятную ошибку, а не упасть
    $('#newProv').value = 'eleven'; $('#newProv').dispatchEvent(new Event('change'));
    $('#elKey').value = ''; $('#btnAddVoice').click();
    add('ui', 'ElevenLabs без ключа — ошибка', $('#voiceMsg').classList.contains('bad'), $('#voiceMsg').textContent);
    $('#newProv').value = 'edge'; $('#newProv').dispatchEvent(new Event('change'));

    // --- сеть: голоса Microsoft ---
    for (const id of ['ru-RU-SvetlanaNeural', 'ru-RU-DariyaNeural', 'ru-RU-DmitryNeural', 'en-US-AvaMultilingualNeural', 'kk-KZ-AigulNeural']) {
      const r = await window.echo.synth({ text: 'Привет, это проверка голоса.', voice: id, rate: 1, pitch: '+0Hz' });
      add('net', 'голос ' + id, r.ok && r.audio.length > 3000, r.ok ? ('base64 ' + r.audio.length) : r.error);
    }
    const slow = await window.echo.synth({ text: 'Скорость и тон.', voice: 'ru-RU-SvetlanaNeural', rate: 1.3, pitch: '+10Hz' });
    add('net', 'скорость и тон принимаются', slow.ok, slow.ok ? slow.audio.length : slow.error);
    const cat = await window.echo.voices();
    add('net', 'каталог Microsoft (полный)', cat.ok && cat.voices.length > 100, cat.ok + ' / ' + cat.voices.length);
    const el = await window.echo.synth({ text: 'тест', provider: 'eleven', elVoice: 'x', elKey: '' });
    add('logic', 'ElevenLabs без ключа возвращает ошибку', !el.ok && /ключ/i.test(el.error), el.error);

    // --- сеть: подключение к несуществующему эфиру ---
    $('.nav[data-tab=live]').click();
    $('#nick').value = 'zz_no_such_live_user_84317';
    $('#btnConnect').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 50000 && $('#alert').hidden) await sleep(500);
    add('ui', 'при отсутствии эфира показана ошибка', !$('#alert').hidden, $('#alert').textContent);
    add('ui', 'кнопка вернулась в исходное состояние', $('#btnConnect').textContent === 'Подключиться', $('#btnConnect').textContent);
    add('net', 'текст «Вы не в эфире…»', /не в эфире/i.test($('#alert').textContent), $('#alert').textContent);

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
    finish(await win.webContents.executeJavaScript(PAGE_TEST, true));
  } catch (e) {
    finish([{ group: 'ui', name: 'автотест не смог запуститься', ok: false, detail: String(e && e.stack || e) }]);
  }
}

module.exports = { run };
