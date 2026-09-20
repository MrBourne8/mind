<?php
declare(strict_types=1);

function getDb(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $legacyDir = dirname(__DIR__) . '/data';
    $legacyPath = $legacyDir . '/mind.sqlite';

    // На D: может не быть места — храним БД в LOCALAPPDATA (обычно C:)
    $base = getenv('LOCALAPPDATA') ?: getenv('HOME') ?: $legacyDir;
    $dir = rtrim(str_replace('\\', '/', $base), '/') . '/MindBoard';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $path = $dir . '/mind.sqlite';

    if (!is_file($path) && is_file($legacyPath)) {
        @copy($legacyPath, $path);
    }

    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Безымянная доска',
            data TEXT NOT NULL DEFAULT '{}',
            thumbnail TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    ");

    return $pdo;
}
