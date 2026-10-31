'use strict';
// Вырезание @упоминаний из текста перед озвучкой. Задача — не озвучивать ники, но НИКОГДА не терять слова самого сообщения.
// Поэтому правило одно: «@» + ровно одно слово (ник без пробелов, как в TikTok/Twitch). Второе слово убираем только если
// это точно известный ник из двух слов — тот, что уже писал в чате в этом эфире. Никаких догадок по заглавным буквам:
// «@vlad Привет всем» -> «Привет всем».
(function (root) {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
  const norm = (s) => String(s || '').replace(EMOJI, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const WORD = /^[\p{L}\p{N}_]+(?:[.\-][\p{L}\p{N}_]+)*/u; // точка и дефис — только внутри ника, не в конце («@vlad.»)
  const isWordChar = (c) => !!c && /[\p{L}\p{N}_]/u.test(c);

  function create() {
    const multi = new Map(); // первое слово (нижний регистр) -> известные ники из нескольких слов, длинные первыми
    let count = 0;
    return {
      // запоминает ник, который писал в чате; одно слово запоминать не нужно — оно и так вырезается целиком
      remember(name) {
        const n = norm(name);
        if (!n || !/\s/.test(n)) return;
        if (count > 5000) { multi.clear(); count = 0; }
        const first = n.split(' ')[0];
        const list = multi.get(first) || [];
        if (list.includes(n)) return;
        list.push(n); list.sort((a, b) => b.length - a.length);
        multi.set(first, list); count++;
      },
      strip(text) {
        const t = String(text || '');
        let out = '';
        for (let i = 0; i < t.length;) {
          // «@» начинает упоминание в начале строки или после пробела/знака; внутри слова («a@b») — не трогаем
          if (t[i] !== '@' || (i > 0 && isWordChar(t[i - 1]))) { out += t[i++]; continue; }
          const rest = t.slice(i + 1);
          let cut = 0;
          const w = WORD.exec(rest);
          if (w) {
            cut = w[0].length;
            for (const nick of multi.get(w[0].toLowerCase()) || []) { // длинные ники проверяются раньше коротких
              const re = new RegExp('^' + nick.split(' ').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+') + '(?![\\p{L}\\p{N}_])', 'iu');
              const m = re.exec(rest);
              if (m) { cut = m[0].length; break; }
            }
          }
          i += 1 + cut;
          if (t[i] === ',' || t[i] === ':' || t[i] === ';') i++; // «@ник, привет» -> «привет», без висящей запятой
        }
        return out.replace(/\s+/g, ' ').replace(/^[\s.,:;]+/, '').trim();
      },
    };
  }

  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Mentions = api;
})(typeof window !== 'undefined' ? window : globalThis);
