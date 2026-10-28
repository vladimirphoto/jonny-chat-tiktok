// Понятные русские тексты для ошибок. Вынесено в отдельный файл, чтобы можно было тестировать.

function explain(err) {
  const raw = String((err && (err.message || err.info)) || err || '');
  const name = String((err && (err.name || (err.constructor && err.constructor.name))) || '');
  const all = `${name} ${raw}`.toLowerCase();

  if (/useroffline|isn.?t online|not online|is offline|\boffline\b|not live|isn.?t live|not currently live|has ended|room_?id|not found|404/.test(all)) {
    return { code: 'offline', error: 'Вы не в эфире. Запустите трансляцию в TikTok LIVE, подключитесь и попробуйте снова. Также проверьте, что ник введён правильно.' };
  }
  if (/failed to retrieve room|room\s?_?id|initialfetch|webcast.*not|no live|user not found|usernotfound|invalid (user|username)/.test(all)) {
    return { code: 'offline', error: 'Эфир не найден. Проверьте ник и убедитесь, что трансляция уже идёт: запустите TikTok LIVE, подключитесь и попробуйте снова.' };
  }
  if (/signapi|sign server|signature|euler|captcha|blocked|\b403\b|forbidden/.test(all)) {
    return { code: 'blocked', error: 'TikTok временно ограничил подключение (слишком много попыток или сервис недоступен). Подождите 1–2 минуты и попробуйте снова.' };
  }
  if (/rate.?limit|429|too many|limit exceeded/.test(all)) {
    return { code: 'rate', error: 'TikTok временно ограничил запросы. Подождите минуту и попробуйте снова.' };
  }
  if (/timeout|timed out/.test(all)) {
    return { code: 'timeout', error: 'TikTok не отвечает. Проверьте интернет и попробуйте снова.' };
  }
  if (/enotfound|econn|network|fetch failed|getaddrinfo|socket|eai_again|certificate/.test(all)) {
    return { code: 'network', error: 'Нет соединения с интернетом или TikTok недоступен. Проверьте сеть и попробуйте снова.' };
  }
  return {
    code: 'other',
    error: 'Не удалось подключиться к эфиру. Проверьте ник и интернет, затем попробуйте снова.',
    detail: raw || name || '',
  };
}

module.exports = { explain };
