<?php
declare(strict_types=1);

function getDb(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $path = $dir . DIRECTORY_SEPARATOR . 'mind.sqlite';

    // если недавно писали в LOCALAPPDATA — перенести актуальные данные на D:
    $appData = getenv('LOCALAPPDATA');
    if ($appData) {
        $migrated = rtrim(str_replace('\\', '/', $appData), '/') . '/MindBoard/mind.sqlite';
        $migratedWin = $appData . DIRECTORY_SEPARATOR . 'MindBoard' . DIRECTORY_SEPARATOR . 'mind.sqlite';
        $src = is_file($migratedWin) ? $migratedWin : (is_file($migrated) ? $migrated : null);
        if ($src && is_file($src)) {
            $needCopy = !is_file($path) || filemtime($src) >= filemtime($path);
            if ($needCopy) {
                @copy($src, $path);
                foreach (['-wal', '-shm'] as $suf) {
                    if (is_file($src . $suf)) {
                        @copy($src . $suf, $path . $suf);
                    }
                }
            }
        }
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

/** Абсолютный путь к файлу SQLite (для отладки). */
function getDbPath(): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'mind.sqlite';
}
