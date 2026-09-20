<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mind — редактор</title>
    <link rel="stylesheet" href="assets/css/board.css">
</head>
<body class="theme-classic bg-miro shape-capsule">
    <div id="topbar">
        <div class="topbar-left">
            <a href="index.php" class="logo" title="К доскам">
                <i data-lucide="arrow-left"></i>
            </a>
            <button type="button" class="topbar-icon-btn" id="btnOutline" title="Структура карты">
                <i data-lucide="list-tree"></i>
            </button>
            <div class="title-wrap">
                <input type="text" class="board-title" id="boardTitle" value="Моя ментальная карта" maxlength="120" spellcheck="false">
            </div>
        </div>

        <div class="topbar-center">
            <div class="tool-group">
                <button type="button" class="tbtn" id="btnUndo" title="Отменить (Ctrl+Z)" disabled>
                    <i data-lucide="undo-2"></i>
                </button>
                <button type="button" class="tbtn" id="btnRedo" title="Повторить (Ctrl+Y)" disabled>
                    <i data-lucide="redo-2"></i>
                </button>
            </div>
            <div class="tool-sep-v"></div>
            <div class="tool-group">
                <button type="button" class="tbtn" id="btnAddRoot" title="Новая карта">
                    <i data-lucide="file-plus-2"></i>
                </button>
                <button type="button" class="tbtn" id="btnAutoLayout" title="Авто-раскладка">
                    <i data-lucide="git-fork"></i>
                </button>
                <button type="button" class="tbtn" id="btnCenter" title="По центру">
                    <i data-lucide="scan"></i>
                </button>
            </div>
        </div>

        <div class="topbar-right">
            <span class="save-status" id="saveStatus">
                <i data-lucide="cloud-check" class="save-ico"></i>
                <span class="save-text">Сохранено</span>
            </span>
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
            <button type="button" class="topbar-icon-btn" id="btnStyle" title="Свойства">
                <i data-lucide="sliders-horizontal"></i>
            </button>
        </div>
    </div>

    <div id="leftbar">
        <button type="button" class="tool-btn active" data-tool="select" title="Выделение (V)">
            <i data-lucide="mouse-pointer-2"></i>
        </button>
        <button type="button" class="tool-btn" data-tool="pan" title="Рука (H)">
            <i data-lucide="hand"></i>
        </button>
        <div class="tool-sep"></div>
        <button type="button" class="tool-btn" id="btnAddTopic" title="Добавить топик (Tab)">
            <i data-lucide="square-plus"></i>
        </button>
        <button type="button" class="tool-btn" id="btnAddSticker" title="Стикер">
            <i data-lucide="sticky-note"></i>
        </button>
        <button type="button" class="tool-btn" id="btnEdit" title="Редактировать (F2)">
            <i data-lucide="pencil"></i>
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

    <div id="canvas" class="cursor-default">
        <div id="world">
            <svg class="lines" id="lines"></svg>
        </div>
    </div>
    <div id="rubberBand"></div>

    <div id="notePopover" class="note-popover hidden">
        <div class="note-popover-head">
            <strong id="notePopoverTitle">Заметка</strong>
            <button type="button" class="note-popover-close" id="notePopoverClose" title="Закрыть">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="note-popover-body" id="notePopoverBody"></div>
        <div class="note-popover-actions">
            <button type="button" class="btn-miro primary" id="notePopoverEdit">Редактировать</button>
        </div>
    </div>

    <div id="notePanel">
        <div class="panel-header">
            <span class="panel-title">Заметка</span>
            <button type="button" class="panel-close" id="btnCloseNotePanel" title="Закрыть">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="note-panel-topic" id="notePanelTopic">Топик</div>
        <textarea id="nodeNoteInput" rows="12" placeholder="Текст заметки…" maxlength="4000"></textarea>
        <div class="note-panel-actions">
            <button type="button" class="btn-miro" id="btnViewNote" title="Просмотреть">
                <i data-lucide="eye" style="width:14px;height:14px;vertical-align:-2px"></i>
                Просмотр
            </button>
            <button type="button" class="btn-miro primary" id="btnDoneNote">Готово</button>
        </div>
    </div>

    <div id="stylePanel">
        <div class="panel-header">
            <span class="panel-title">Свойства</span>
            <button type="button" class="panel-close" id="btnClosePanel" title="Закрыть">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="panel-section">
            <div id="selectedNodeSection" class="selected-node-section empty">
                <div class="selected-node-title empty" id="selectedNodeTitle">Выделите топик</div>
                <div id="selectedNodeControls" style="display:none">
                    <div class="color-picker-row">
                        <span class="color-picker-label">Фон</span>
                        <input type="color" id="nodeBgColor" value="#ffffff">
                    </div>
                    <div class="color-picker-row">
                        <span class="color-picker-label">Обводка</span>
                        <input type="color" id="nodeBorderColor" value="#E5E3DF">
                    </div>
                    <div class="color-picker-row">
                        <span class="color-picker-label">Текст</span>
                        <input type="color" id="nodeTextColor" value="#050038">
                    </div>
                    <div class="color-picker-row" id="nodeLineColorRow">
                        <span class="color-picker-label">Линия</span>
                        <div class="color-picker-wrapper">
                            <input type="color" id="nodeLineColor" value="#C8C5BE">
                            <button type="button" class="btn-miro" id="btnResetLineColor" title="Сбросить цвет линии">✕</button>
                        </div>
                    </div>
                    <div class="selected-node-actions">
                        <button type="button" class="btn-miro danger" id="btnResetStyle">Сбросить</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Режим карты</div>
            <p class="panel-hint">Свободный — можно двигать топики. Фиксированный — сетка как в XMind, без перетаскивания</p>
            <div class="mode-row" id="mapModeRow">
                <button type="button" class="mode-chip active" data-map-mode="free">Свободный</button>
                <button type="button" class="mode-chip" data-map-mode="fixed">Фиксированный</button>
            </div>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Расположение топиков</div>
            <p class="panel-hint">Фиксированный режим: без выделения — вся карта; с выделением — выбранный топик и его ветка</p>
            <div class="style-grid four-col" id="layoutStyles"></div>
            <button type="button" class="btn-miro" id="btnApplyLayout" style="margin-top:8px;width:100%">Применить раскладку</button>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Стиль линий</div>
            <p class="panel-hint">Без выделения — вся карта; с выделением — связи от топика</p>
            <div class="style-grid line-styles" id="lineStyles"></div>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Цвет линий</div>
            <p class="panel-hint">По теме, свой, радуга (каждая связь своя) или ветки (линия = цвет ветки)</p>
            <div class="mode-row" id="lineModeRow">
                <button type="button" class="mode-chip active" data-line-mode="theme">По теме</button>
                <button type="button" class="mode-chip" data-line-mode="solid">Свой цвет</button>
                <button type="button" class="mode-chip rainbow" data-line-mode="rainbow">Радуга</button>
                <button type="button" class="mode-chip" data-line-mode="branch">Ветки</button>
            </div>
            <div class="swatch-row" id="lineColorRow"></div>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Цвет топиков</div>
            <p class="panel-hint">Радуга — каждый свой. Ветки — цвет по ветке (1-й уровень). Цвет из панели топика — только у выбранного</p>
            <div class="mode-row" id="topicModeRow">
                <button type="button" class="mode-chip active" data-topic-mode="theme">По теме</button>
                <button type="button" class="mode-chip" data-topic-mode="solid">Свой цвет</button>
                <button type="button" class="mode-chip rainbow" data-topic-mode="rainbow">Радуга</button>
                <button type="button" class="mode-chip" data-topic-mode="branch">Ветки</button>
            </div>
            <div class="swatch-row" id="topicColorRow"></div>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Форма</div>
            <p class="panel-hint">По умолчанию овал. Другая форма — для выделенных топиков</p>
            <div class="style-grid three-col" id="shapeStyles"></div>
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Фон доски</div>
            <p class="panel-hint">Стандартный Miro или свой цвет</p>
            <div class="mode-row" id="bgModeRow">
                <button type="button" class="mode-chip active" data-bg-mode="miro">Miro</button>
                <button type="button" class="mode-chip" data-bg-mode="custom">Свой цвет</button>
            </div>
            <div class="swatch-row" id="bgColorRow"></div>
        </div>
    </div>

    <div id="selectionInfo">
        <span>Выделено: <span id="selCount">0</span></span>
        <button type="button" class="danger" id="btnDelSel">Удалить</button>
        <button type="button" id="btnClearSel">Снять</button>
    </div>

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
        <b>Tab</b> — дочерний · <b>− / число</b> на топике — свернуть · <b>/</b> — свернуть выделенный · <b>Del</b> — удалить · стикер — кнопка на панели
    </div>

    <script src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script>
    <script>window.BOARD_ID = <?= (int)($_GET['id'] ?? 0) ?>;</script>
    <script src="assets/js/layouts.js"></script>
    <script src="assets/js/history.js"></script>
    <script src="assets/js/board.js"></script>
    <script>
        if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    </script>
</body>
</html>
