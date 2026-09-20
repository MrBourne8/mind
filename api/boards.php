<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once dirname(__DIR__) . '/config/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$input = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];

try {
    $db = getDb();

    if ($method === 'GET' && $id > 0) {
        $st = $db->prepare('SELECT id, title, data, created_at, updated_at FROM boards WHERE id = ?');
        $st->execute([$id]);
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
        $rows = $db->query('SELECT id, title, created_at, updated_at FROM boards ORDER BY updated_at DESC')->fetchAll();
        echo json_encode(['boards' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $title = trim((string)($input['title'] ?? 'Новая доска'));
        if ($title === '') {
            $title = 'Новая доска';
        }
        $data = json_encode($input['data'] ?? ['objects' => [], 'viewport' => ['x' => 0, 'y' => 0, 'zoom' => 1]], JSON_UNESCAPED_UNICODE);
        $st = $db->prepare('INSERT INTO boards (title, data) VALUES (?, ?)');
        $st->execute([$title, $data]);
        echo json_encode(['id' => (int)$db->lastInsertId(), 'title' => $title]);
        exit;
    }

    if ($method === 'PUT' && $id > 0) {
        $fields = [];
        $params = [];
        if (isset($input['title'])) {
            $fields[] = 'title = ?';
            $params[] = trim((string)$input['title']) ?: 'Безымянная доска';
        }
        if (isset($input['data'])) {
            $fields[] = 'data = ?';
            $params[] = json_encode($input['data'], JSON_UNESCAPED_UNICODE);
        }
        if (!$fields) {
            http_response_code(400);
            echo json_encode(['error' => 'Нет данных']);
            exit;
        }
        $fields[] = "updated_at = datetime('now')";
        $params[] = $id;
        $st = $db->prepare('UPDATE boards SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $st->execute($params);
        if ($st->rowCount() === 0) {
            $check = $db->prepare('SELECT id FROM boards WHERE id = ?');
            $check->execute([$id]);
            if (!$check->fetch()) {
                http_response_code(404);
                echo json_encode(['error' => 'Доска не найдена']);
                exit;
            }
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($method === 'DELETE' && $id > 0) {
        $st = $db->prepare('DELETE FROM boards WHERE id = ?');
        $st->execute([$id]);
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Метод не поддерживается']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Ошибка сервера', 'detail' => $e->getMessage()]);
}
