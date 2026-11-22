<?php
declare(strict_types=1);

/**
 * Настройки Mindmap / интеграция со СПО-ПРОГРЕСС.
 * На сервере задайте через окружение или правьте значения ниже.
 */
return [
    // Куда редиректить, если пользователь не авторизован
    'spo_base_url' => rtrim((string)(getenv('SPO_BASE_URL') ?: 'https://spo-progress.ru'), '/'),

    // Публичный URL этого приложения (поддомен)
    'app_base_url' => rtrim((string)(getenv('MINDMAP_BASE_URL') ?: ''), '/'),

    // Общий секрет SSO с spo-progress (тот же, что в настройках СПО / файле)
    // Если пусто — читается/создаётся файл рядом с проектом
    'sso_secret' => trim((string)(getenv('MINDMAP_SSO_SECRET') ?: '')),
];
