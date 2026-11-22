<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__) . '/config/db.php';

$token = trim((string)($_GET['token'] ?? ''));
if ($token === '' || !preg_match('/^[a-f0-9]{32}$/i', $token)) {
    http_response_code(400);
    echo json_encode(['error' => 'Некорректная ссылка']);
    exit;
}

try {
    $db = getDb();
    $st = $db->prepare('SELECT id, title, data, updated_at FROM boards WHERE share_token = ? LIMIT 1');
    $st->execute([$token]);
    $row = $st->fetch();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Карта не найдена или доступ закрыт']);
        exit;
    }
    $decoded = json_decode((string)$row['data'], true);
    if (!is_array($decoded)) {
        $decoded = [];
    }
    if (isset($decoded['data']) && is_array($decoded['data']) && !isset($decoded['nodes'])) {
        $decoded = $decoded['data'];
    }
    if (isset($decoded['nodes']) && is_array($decoded['nodes'])) {
        $isList = array_keys($decoded['nodes']) === range(0, count($decoded['nodes']) - 1);
        if ($isList) {
            $map = [];
            foreach ($decoded['nodes'] as $n) {
                if (is_array($n) && isset($n['id'])) {
                    $map[(string)$n['id']] = $n;
                }
            }
            $decoded['nodes'] = $map;
        }
    }
    $row['data'] = $decoded;
    $row['readonly'] = true;
    $json = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Не удалось отдать данные карты']);
        exit;
    }
    echo $json;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Ошибка сервера', 'detail' => $e->getMessage()]);
}
