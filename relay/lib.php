<?php
// ЭхоЧат LIVE — сервер-посредник для донатов Каспи.
// iPhone (команда «Команды») шлёт уведомление сюда по интернету, приложение на компьютере забирает его (poll.php).
// Так донаты работают из любой сети, а не только по общему Wi-Fi.

const DATA_DIR = __DIR__ . '/data';
const MAX_BODY = 8192;          // байт на одно уведомление
const MAX_QUEUE = 200;          // сколько уведомлений ждёт забора на один токен
const TTL_SECONDS = 300;        // уведомление старше 5 минут не нужно (стрим уже ушёл дальше)
const RATE_PER_MINUTE = 40;     // защита от флуда на один токен

function out(int $code, array $body): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

// параметры берём из строки запроса, формы или JSON-тела — команда iOS может прислать любым способом
function params(): array {
    static $p = null;
    if ($p !== null) return $p;
    $p = array_merge($_POST, $_GET);
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw !== false && $raw !== '') {
        if (strlen($raw) > MAX_BODY) out(413, ['ok' => false, 'error' => 'too large']);
        $j = json_decode($raw, true);
        if (is_array($j)) $p = array_merge($j, $p);
        elseif (!isset($p['text'])) $p['text'] = $raw;
    }
    return $p;
}

function param(string $k): string {
    $v = params()[$k] ?? '';
    return is_scalar($v) ? trim((string)$v) : '';
}

// токен — длинная случайная строка, её создаёт приложение. Короткие и угадываемые не принимаем
function valid_token(string $t): bool {
    return (bool)preg_match('/^[A-Za-z0-9_-]{16,64}$/', $t);
}

function ensure_dir(): void {
    if (!is_dir(DATA_DIR)) {
        @mkdir(DATA_DIR, 0700, true);
        @file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
        @file_put_contents(DATA_DIR . '/index.html', '');
    }
    if (!is_dir(DATA_DIR) || !is_writable(DATA_DIR)) out(500, ['ok' => false, 'error' => 'data dir not writable']);
}

// токен в имени файла не хранится: только его хэш
function queue_path(string $token): string {
    return DATA_DIR . '/' . hash('sha256', $token) . '.q';
}

// открывает очередь под эксклюзивной блокировкой и отдаёт список записей (по одной JSON-строке)
function with_queue(string $token, callable $fn) {
    ensure_dir();
    $fh = fopen(queue_path($token), 'c+');
    if (!$fh) out(500, ['ok' => false, 'error' => 'storage']);
    flock($fh, LOCK_EX);
    $items = [];
    rewind($fh);
    while (($line = fgets($fh)) !== false) {
        $j = json_decode($line, true);
        if (is_array($j) && isset($j['id'], $j['t'])) $items[] = $j;
    }
    $now = time();
    $items = array_values(array_filter($items, fn($i) => $now - (int)$i['t'] <= TTL_SECONDS));
    $res = $fn($items);
    ftruncate($fh, 0);
    rewind($fh);
    foreach ($items as $i) fwrite($fh, json_encode($i, JSON_UNESCAPED_UNICODE) . "\n");
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $res;
}

// редкая уборка файлов брошенных токенов
function gc(): void {
    if (mt_rand(1, 50) !== 1) return;
    foreach (glob(DATA_DIR . '/*.q') ?: [] as $f) {
        if (time() - filemtime($f) > 86400) @unlink($f);
    }
}
