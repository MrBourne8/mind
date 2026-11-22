<?php
declare(strict_types=1);
require_once __DIR__ . '/config/auth.php';
$user = mind_require_user(false);
$spoHome = mind_spo_home_url();
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ментальные карты</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/home.css">
</head>
<body>
    <header class="topbar">
        <div class="brand">
            <span class="brand-mark"></span>
            <span class="brand-name">Ментальные карты</span>
        </div>
        <div class="topbar-right">
            <span class="user-chip" title="Вы вошли через СПО-ПРОГРЕСС"><?= htmlspecialchars($user['name'] ?? '', ENT_QUOTES, 'UTF-8') ?></span>
            <a class="btn-ghost" href="<?= htmlspecialchars($spoHome, ENT_QUOTES, 'UTF-8') ?>">В СПО-ПРОГРЕСС</a>
            <button type="button" class="btn-primary" id="btnNew">Создать доску</button>
        </div>
    </header>

    <main class="home">
        <section class="hero">
            <h1>Ваше бесконечное пространство идей</h1>
            <p>Создавайте ментальные карты, стикеры и схемы — как в Miro, только проще.</p>
            <button type="button" class="btn-primary btn-lg" id="btnNewHero">Новая доска</button>
        </section>

        <section class="boards-section">
            <div class="section-head">
                <h2>Недавние доски</h2>
            </div>
            <div class="boards-grid" id="boardsGrid">
                <div class="boards-empty" id="boardsEmpty">Пока нет досок. Создайте первую.</div>
            </div>
        </section>
    </main>

    <div class="modal hidden" id="renameModal">
        <div class="modal-card">
            <h3>Переименовать доску</h3>
            <input type="text" id="renameInput" maxlength="120" placeholder="Название">
            <div class="modal-actions">
                <button type="button" class="btn-ghost" id="renameCancel">Отмена</button>
                <button type="button" class="btn-primary" id="renameSave">Сохранить</button>
            </div>
        </div>
    </div>

    <div class="modal hidden" id="templateModal">
        <div class="modal-card modal-wide">
            <h3>Выберите шаблон расположения</h3>
            <p class="modal-hint">Центральный топик и направление новых дочерних узлов</p>
            <div class="template-grid" id="templateGrid"></div>
            <div class="modal-actions">
                <button type="button" class="btn-ghost" id="templateCancel">Отмена</button>
                <button type="button" class="btn-primary" id="templateCreate">Создать</button>
            </div>
        </div>
    </div>

    <script src="assets/js/layouts.js"></script>
    <script src="assets/js/home.js"></script>
</body>
</html>
