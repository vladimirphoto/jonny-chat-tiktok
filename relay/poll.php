<?php
// Отсюда приложение на компьютере забирает уведомления.
// Параметры: token, after — id последнего уже полученного уведомления (всё до него удаляется).
// Если ответ потерялся по пути, уведомление не пропадает: приложение получит его снова и отбросит повтор по id.
require __DIR__ . '/lib.php';

$token = param('token');
if (!valid_token($token)) out(404, ['ok' => false]);
$after = (int)param('after');

$items = with_queue($token, function (&$items) use ($after) {
    $items = array_values(array_filter($items, fn($i) => (int)$i['id'] > $after));
    return $items;
});
out(200, ['ok' => true, 'items' => $items]);
