// Понятные русские тексты для ошибок. Вынесено в отдельный файл, чтобы можно было тестировать.

function explain(err) {
  const raw = String((err && (err.message || err.info)) || err || '');
  const name = String((err && (err.name || (err.constructor && err.constructor.name))) || '');
  const all = `${name} ${raw}`.toLowerCase();

  if (/useroffline|isn.?t online|not online|is offline|\boffline\b|not live|isn.?t live|not currently live|has ended|room_?id|not found|404/.test(all)) {
    return { code: 'offline', error: 'Вы не в эфире. Запустите трансляцию в TikTok LIVE, подключитесь и попробуйте снова. Также проверьте, что ник введён правильно.' };
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

// Ошибки Google Cloud Text-to-Speech → понятный русский текст
function explainGoogle(status, bodyText) {
  const t = String(bodyText || '');
  const low = t.toLowerCase();
  if (/api key not valid|api_key_invalid|invalid api key|api key expired/.test(low)) return 'Неверный API-ключ Google. Скопируйте ключ заново целиком.';
  if (/billing/.test(low)) return 'В проекте Google не включена оплата (Billing). Google требует привязать карту, но в рамках бесплатного лимита списаний нет.';
  if (/has not been used|is disabled|service_disabled|accessnotconfigured/.test(low)) return 'В проекте Google не включён сервис Cloud Text-to-Speech API. Включите его (шаг 2 в инструкции).';
  if (/api_key_service_blocked|api_key_http_referrer|restricted|are blocked/.test(low)) return 'Ключ Google ограничен и не разрешает Text-to-Speech API. Создайте ключ без ограничений или разрешите этот API.';
  if (status === 429 || /quota|resource_exhausted|rate/.test(low)) return 'Лимит Google исчерпан. Включён запасной голос Microsoft.';
  if (status === 400 && /voice|language/.test(low)) return 'Этот голос недоступен в Google. Выберите другой.';
  if (status === 401 || status === 403) return 'Google отклонил запрос. Проверьте ключ и что в проекте включены Billing и Text-to-Speech API.';
  return 'Google не ответил (код ' + status + '). Проверьте интернет и попробуйте снова.';
}

module.exports = { explain, explainGoogle };
