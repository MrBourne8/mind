<?php
declare(strict_types=1);

function mind_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require __DIR__ . '/config.php';
    }
    return $cfg;
}

function mind_sso_secret_path(): string
{
    // domains/localhost/.spo_mindmap_sso_secret — общий с kpk2.0
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.spo_mindmap_sso_secret';
}

function mind_sso_secret(): string
{
    $cfg = mind_config();
    $secret = trim((string)($cfg['sso_secret'] ?? ''));
    if ($secret !== '') {
        return $secret;
    }

    $file = mind_sso_secret_path();
    if (is_file($file)) {
        $fromFile = trim((string)file_get_contents($file));
        if ($fromFile !== '') {
            return $fromFile;
        }
    }

    $secret = bin2hex(random_bytes(32));
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (is_dir($dir) && is_writable($dir)) {
        @file_put_contents($file, $secret . PHP_EOL);
    }
    return $secret;
}

function mind_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

/**
 * @return array{uid:int,name:string,email:string,phone:string,role:string}|null
 */
function mind_parse_sso_ticket(string $ticket): ?array
{
    $ticket = trim($ticket);
    $parts = explode('.', $ticket, 2);
    if (count($parts) !== 2) {
        return null;
    }
    [$body, $sig] = $parts;
    $expected = hash_hmac('sha256', $body, mind_sso_secret());
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $json = base64_decode(strtr($body, '-_', '+/'), true);
    if ($json === false) {
        return null;
    }
    $data = json_decode($json, true);
    if (!is_array($data)) {
        return null;
    }
    $uid = (int)($data['uid'] ?? 0);
    $exp = (int)($data['exp'] ?? 0);
    if ($uid <= 0 || $exp < time()) {
        return null;
    }
    return [
        'uid' => $uid,
        'name' => trim((string)($data['name'] ?? '')),
        'email' => trim((string)($data['email'] ?? '')),
        'phone' => trim((string)($data['phone'] ?? '')),
        'role' => trim((string)($data['role'] ?? 'teacher')) ?: 'teacher',
    ];
}

/**
 * @param array{uid:int,name:string,email:string,phone:string,role:string} $identity
 */
function mind_login_from_spo(array $identity): void
{
    mind_start_session();
    session_regenerate_id(true);
    $_SESSION['mind_user'] = [
        'id' => (int)$identity['uid'],
        'name' => $identity['name'] !== '' ? $identity['name'] : 'Пользователь',
        'email' => $identity['email'],
        'role' => $identity['role'],
    ];
}

function mind_current_user(): ?array
{
    mind_start_session();
    $u = $_SESSION['mind_user'] ?? null;
    if (!is_array($u) || (int)($u['id'] ?? 0) <= 0) {
        return null;
    }
    return $u;
}

function mind_logout(): void
{
    mind_start_session();
    unset($_SESSION['mind_user']);
}

function mind_spo_login_url(): string
{
    $cfg = mind_config();
    $base = $cfg['spo_base_url'] ?: 'https://spo-progress.ru';
    return $base . '/login.php';
}

function mind_spo_home_url(): string
{
    $cfg = mind_config();
    return ($cfg['spo_base_url'] ?: 'https://spo-progress.ru') . '/';
}

function mind_require_user(bool $json = false): array
{
    $user = mind_current_user();
    if ($user !== null) {
        return $user;
    }
    if ($json) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'error' => 'Требуется вход через СПО-ПРОГРЕСС',
            'login' => mind_spo_login_url(),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    header('Location: ' . mind_spo_login_url(), true, 302);
    exit;
}

/** Базовый URL приложения (без слэша в конце). */
function mind_app_base_url(): string
{
    $cfg = mind_config();
    $configured = rtrim((string)($cfg['app_base_url'] ?? ''), '/');
    if ($configured !== '') {
        return $configured;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $dir = rtrim(str_replace('\\', '/', dirname($script)), '/');
    // /api или /sso → на уровень выше
    if (preg_match('#/(api|sso)$#', $dir)) {
        $dir = rtrim(dirname($dir), '/');
    }
    if ($dir === '/' || $dir === '\\' || $dir === '.') {
        $dir = '';
    }
    return ($https ? 'https' : 'http') . '://' . $host . $dir;
}

function mind_share_view_url(string $token): string
{
    return mind_app_base_url() . '/view.php?t=' . rawurlencode($token);
}
