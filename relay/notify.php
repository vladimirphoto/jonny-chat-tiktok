<?php
// Сюда iPhone присылает уведомление Каспи.
// Пример: https://ВАШ-САЙТ/echochat/notify.php?token=ТОКЕН&bank=kaspi&text=...&app=...&ttl=...
//   token — секретный токен из приложения; text — текст уведомления; ttl — заголовок; app — приложение-источник.
// Работает и с GET, и с POST (форма или JSON).
require __DIR__ . '/lib.php';

$token = param('token');
if (!valid_token($token)) out(404, ['ok' => false]);   // не подсказываем, что именно не так

$text = mb_substr(param('text'), 0, 1500);
$title = mb_substr(param('ttl') !== '' ? param('ttl') : param('title'), 0, 200);
$app = mb_substr(param('app'), 0, 80);
$bank = mb_substr(param('bank'), 0, 20);
if ($text === '' && $title === '') out(400, ['ok' => false, 'error' => 'empty']);

$id = (int)(microtime(true) * 1000) * 1000 + random_int(0, 999);   // растёт со временем, по нему приложение подтверждает приём

$res = with_queue($token, function (&$items) use ($id, $text, $title, $app, $bank) {
    $now = time();
    // защита от флуда: не больше RATE_PER_MINUTE за минуту
    $recent = count(array_filter($items, fn($i) => $now - (int)$i['t'] < 60));
    if ($recent >= RATE_PER_MINUTE || count($items) >= MAX_QUEUE) return 429;
    $items[] = ['id' => $id, 't' => $now, 'text' => $text, 'title' => $title, 'app' => $app, 'bank' => $bank];
    return 200;
});
gc();
out($res, ['ok' => $res === 200]);
