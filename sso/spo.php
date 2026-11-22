<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/auth.php';

$ticket = trim((string)($_GET['ticket'] ?? ''));
if ($ticket === '') {
    http_response_code(400);
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>SSO</title></head><body>';
    echo '<h1>Ошибка входа</h1><p>Не передан билет авторизации. Откройте Ментальные карты из панели СПО-ПРОГРЕСС.</p>';
    echo '<p><a href="' . htmlspecialchars(mind_spo_home_url()) . '">На главную СПО-ПРОГРЕСС</a></p>';
    echo '</body></html>';
    exit;
}

$identity = mind_parse_sso_ticket($ticket);
if ($identity === null) {
    http_response_code(403);
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>SSO</title></head><body>';
    echo '<h1>Ошибка входа</h1><p>Билет недействителен или истёк. Откройте Ментальные карты снова из панели преподавателя.</p>';
    echo '<p><a href="' . htmlspecialchars(mind_spo_home_url()) . '">На главную СПО-ПРОГРЕСС</a></p>';
    echo '</body></html>';
    exit;
}

mind_login_from_spo($identity);

$next = trim((string)($_GET['next'] ?? ''));
if ($next !== '' && str_starts_with($next, '/') && !str_starts_with($next, '//')) {
    header('Location: ' . $next, true, 302);
} else {
    header('Location: ../index.php', true, 302);
}
exit;
