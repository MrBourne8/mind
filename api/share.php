<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__) . '/config/auth.php';
require_once dirname(__DIR__) . '/config/db.php';

$user = mind_require_user(true);
$userId = (int)$user['id'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

if ($id <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Не указан id доски']);
    exit;
}

try {
    $db = getDb();
    $check = $db->prepare('SELECT id, share_token FROM boards WHERE id = ? AND user_id = ?');
    $check->execute([$id, $userId]);
    $row = $check->fetch();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Доска не найдена']);
        exit;
    }

    if ($method === 'GET') {
        $token = $row['share_token'] ?: null;
        echo json_encode([
            'enabled' => $token !== null && $token !== '',
            'token' => $token,
            'url' => $token ? mind_share_view_url($token) : null,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST' || $method === 'PUT') {
        $enabled = !empty($input['enabled']);
        if ($enabled) {
            $token = $row['share_token'] ?: '';
            if ($token === '') {
                $token = bin2hex(random_bytes(16));
                $st = $db->prepare('UPDATE boards SET share_token = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?');
                $st->execute([$token, $id, $userId]);
            }
            echo json_encode([
                'enabled' => true,
                'token' => $token,
                'url' => mind_share_view_url($token),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $st = $db->prepare('UPDATE boards SET share_token = NULL, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?');
        $st->execute([$id, $userId]);
        echo json_encode(['enabled' => false, 'token' => null, 'url' => null], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Метод не поддерживается']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Ошибка сервера', 'detail' => $e->getMessage()]);
}
