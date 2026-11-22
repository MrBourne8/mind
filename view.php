<?php
declare(strict_types=1);

require_once __DIR__ . '/config/db.php';

$token = trim((string)($_GET['t'] ?? ''));
if ($token === '' || !preg_match('/^[a-f0-9]{32}$/i', $token)) {
    http_response_code(400);
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Ссылка недействительна</title></head><body>';
    echo '<h1>Ссылка недействительна</h1><p>Проверьте адрес или попросите новую ссылку у автора карты.</p>';
    echo '</body></html>';
    exit;
}

try {
    $db = getDb();
    $st = $db->prepare('SELECT id, title, data FROM boards WHERE share_token = ? LIMIT 1');
    $st->execute([$token]);
    $row = $st->fetch();
} catch (Throwable $e) {
    $row = false;
}

if (!$row) {
    http_response_code(404);
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Карта недоступна</title></head><body>';
    echo '<h1>Карта не найдена</h1><p>Доступ закрыт или ссылка устарела.</p>';
    echo '</body></html>';
    exit;
}

$title = (string)($row['title'] ?? 'Ментальная карта');
$rawData = $row['data'] ?? '{}';
$decoded = is_string($rawData) ? json_decode($rawData, true) : null;
if (!is_array($decoded)) {
    $decoded = [];
}
// защита от двойного кодирования
if (isset($decoded['data']) && is_array($decoded['data']) && !isset($decoded['nodes'])) {
    $decoded = $decoded['data'];
}
$boardPayload = [
    'id' => (int)$row['id'],
    'title' => $title,
    'data' => $decoded,
    'readonly' => true,
];
$bootJson = json_encode($boardPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($bootJson === false) {
    $bootJson = json_encode([
        'id' => (int)$row['id'],
        'title' => $title,
        'data' => ['nodes' => new stdClass(), 'stickers' => new stdClass()],
        'readonly' => true,
        'error' => 'Данные карты слишком большие или повреждены',
    ], JSON_UNESCAPED_UNICODE);
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?> — просмотр</title>
    <link rel="stylesheet" href="assets/css/board.css">
</head>
<body class="theme-classic bg-miro shape-capsule readonly">
    <div id="topbar">
        <div class="topbar-left">
            <div class="brand-mini" title="Ментальные карты">M</div>
            <button type="button" class="topbar-icon-btn" id="btnOutline" title="Структура карты">
                <i data-lucide="list-tree"></i>
            </button>
            <div class="title-wrap">
                <input type="text" class="board-title" id="boardTitle" value="<?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?>" maxlength="120" spellcheck="false" readonly>
            </div>
            <span class="view-only-badge">Только просмотр</span>
        </div>

        <div class="topbar-center">
            <div class="tool-group">
                <button type="button" class="tbtn" id="btnCenter" title="По центру">
                    <i data-lucide="scan"></i>
                </button>
            </div>
        </div>

        <div class="topbar-right">
            <span class="save-status" id="saveStatus" style="display:none"></span>
            <div class="export-wrap" id="exportWrap">
                <button type="button" class="topbar-icon-btn" id="btnExport" title="Экспорт">
                    <i data-lucide="download"></i>
                </button>
                <div class="export-menu hidden" id="exportMenu">
                    <button type="button" class="export-option" data-export="png">PNG — изображение</button>
                    <button type="button" class="export-option" data-export="svg">SVG — вектор</button>
                    <button type="button" class="export-option" data-export="pdf">PDF — документ</button>
                </div>
            </div>
        </div>
    </div>

    <div id="leftbar">
        <button type="button" class="tool-btn" data-tool="select" title="Выделение (V)">
            <i data-lucide="mouse-pointer-2"></i>
        </button>
        <button type="button" class="tool-btn active" data-tool="pan" title="Рука (H)">
            <i data-lucide="hand"></i>
        </button>
    </div>

    <div id="outlineView" class="hidden" aria-hidden="true">
        <div class="outline-toolbar">
            <span class="outline-toolbar-title">Структура</span>
            <button type="button" class="panel-close" id="btnCloseOutline" title="Закрыть">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="outline-scroll" id="outlineContent"></div>
    </div>

    <div id="canvas" class="cursor-grab">
        <div id="world">
            <svg id="lines" class="lines"></svg>
        </div>
    </div>
    <div id="rubberBand"></div>

    <div id="bottombar">
        <button type="button" class="zoom-btn" id="zoomOut" title="Уменьшить">
            <i data-lucide="minus"></i>
        </button>
        <div class="zoom-level" id="zoomLevel">100%</div>
        <button type="button" class="zoom-btn" id="zoomIn" title="Увеличить">
            <i data-lucide="plus"></i>
        </button>
        <div class="zoom-sep"></div>
        <button type="button" class="zoom-btn" id="zoomFit" title="По центру">
            <i data-lucide="scan"></i>
        </button>
    </div>

    <div id="help">
        Колесо — масштаб · Пробел / рука — перемещение · Только просмотр
    </div>

    <script src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
    <script>
        window.BOARD_ID = 0;
        window.BOARD_READONLY = true;
        window.SHARE_TOKEN = <?= json_encode($token, JSON_UNESCAPED_UNICODE) ?>;
        window.BOARD_BOOTSTRAP = <?= $bootJson ?>;
    </script>
    <script src="assets/js/layouts.js"></script>
    <script src="assets/js/history.js"></script>
    <script src="assets/js/icons.js"></script>
    <script src="assets/js/board.js"></script>
    <script>
        if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    </script>
</body>
</html>
