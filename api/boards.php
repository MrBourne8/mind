<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__) . '/config/auth.php';
require_once dirname(__DIR__) . '/config/db.php';

$user = mind_require_user(true);
$userId = (int)$user['id'];

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$input = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

try {
    $db = getDb();

    if ($method === 'GET' && $id > 0) {
        $st = $db->prepare('SELECT id, title, data, created_at, updated_at FROM boards WHERE id = ? AND user_id = ?');
        $st->execute([$id, $userId]);
        $row = $st->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Доска не найдена']);
            exit;
        }
        $row['data'] = json_decode($row['data'], true) ?? ['objects' => [], 'viewport' => ['x' => 0, 'y' => 0, 'zoom' => 1]];
        echo json_encode($row);
        exit;
    }

    if ($method === 'GET') {
        $st = $db->prepare('SELECT id, title, created_at, updated_at FROM boards WHERE user_id = ? ORDER BY updated_at DESC');
        $st->execute([$userId]);
        echo json_encode(['boards' => $st->fetchAll()]);
        exit;
    }

    if ($method === 'POST') {
        $title = trim((string)($input['title'] ?? 'Новая доска'));
        if ($title === '') {
            $title = 'Новая доска';
        }
        $data = json_encode($input['data'] ?? ['objects' => [], 'viewport' => ['x' => 0, 'y' => 0, 'zoom' => 1]], JSON_UNESCAPED_UNICODE);
        $st = $db->prepare('INSERT INTO boards (user_id, title, data) VALUES (?, ?, ?)');
        $st->execute([$userId, $title, $data]);
        echo json_encode(['id' => (int)$db->lastInsertId(), 'title' => $title]);
        exit;
    }

    if ($method === 'PUT' && $id > 0) {
        $check = $db->prepare('SELECT id FROM boards WHERE id = ? AND user_id = ?');
        $check->execute([$id, $userId]);
        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Доска не найдена']);
            exit;
        }
        $fields = [];
        $params = [];
        if (isset($input['title'])) {
            $fields[] = 'title = ?';
            $params[] = trim((string)$input['title']) ?: 'Безымянная доска';
        }
        if (isset($input['data'])) {
            $fields[] = 'data = ?';
            $boardData = $input['data'];
            // пустой объект nodes не должен превращаться в []
            if (isset($boardData['nodes']) && is_array($boardData['nodes']) && $boardData['nodes'] === []) {
                $boardData['nodes'] = new stdClass();
            }
            if (isset($boardData['stickers']) && is_array($boardData['stickers']) && $boardData['stickers'] === []) {
                $boardData['stickers'] = new stdClass();
            }
            $encoded = json_encode($boardData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($encoded === false) {
                http_response_code(500);
                echo json_encode(['error' => 'Не удалось сохранить данные карты']);
                exit;
            }
            $params[] = $encoded;
        }
        if (!$fields) {
            http_response_code(400);
            echo json_encode(['error' => 'Нет данных']);
            exit;
        }
        $fields[] = "updated_at = datetime('now')";
        $params[] = $id;
        $params[] = $userId;
        $st = $db->prepare('UPDATE boards SET ' . implode(', ', $fields) . ' WHERE id = ? AND user_id = ?');
        $st->execute($params);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($method === 'DELETE' && $id > 0) {
        $st = $db->prepare('DELETE FROM boards WHERE id = ? AND user_id = ?');
        $st->execute([$id, $userId]);
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Метод не поддерживается']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Ошибка сервера', 'detail' => $e->getMessage()]);
}
