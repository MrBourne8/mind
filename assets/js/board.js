(() => {
    const WORLD = 6000;
    const NODE_GAP = 18;
    const LINE_PAD = 10;
    const COLLISION_ITERS = 24;
    const DEFAULT_W = 120;
    const DEFAULT_H = 32;
    const CHILD_DIST = 180;

    const world = document.getElementById('world');
    const linesSvg = document.getElementById('lines');
    const canvasEl = document.getElementById('canvas');
    const rubberBand = document.getElementById('rubberBand');
    const saveStatus = document.getElementById('saveStatus');
    const boardTitleEl = document.getElementById('boardTitle');
    const zoomLevelEl = document.getElementById('zoomLevel');

    const layoutStyles = window.MIND_LAYOUTS || [
        { id: 'radial', name: 'Радиальный', desc: 'Вокруг центра' },
        { id: 'top-down', name: 'Сверху вниз', desc: 'Центр вверху' },
        { id: 'bottom-up', name: 'Снизу вверх', desc: 'Центр внизу' },
        { id: 'left-right', name: 'Слева направо', desc: 'Центр слева' },
        { id: 'right-left', name: 'Справа налево', desc: 'Центр справа' },
        { id: 'tree-right', name: 'Дерево вниз', desc: 'Дети списком снизу' }
    ];
    const shapeStyles = [
        { id: 'capsule', name: 'Овал', desc: 'круглые', radius: '999px' },
        { id: 'rounded', name: 'Скругл.', desc: '8px', radius: '8px' },
        { id: 'square', name: 'Прямоуг.', desc: '4px', radius: '4px' }
    ];
    const lineStyles = [
        { id: 'curve', name: 'Кривая', preview: 'M 4 22 C 28 22, 44 6, 68 6' },
        { id: 'roundedElbow', name: 'Скругл.', preview: 'M 4 22 L 28 22 Q 36 22 36 14 L 36 6 Q 36 4 44 4 L 68 4' },
        { id: 'elbow', name: 'Угол', preview: 'M 4 22 L 36 22 L 36 4 L 68 4' },
        { id: 'straight', name: 'Прямая', preview: 'M 4 20 L 68 6' },
        { id: 'bight', name: 'Дуга', preview: 'M 4 22 C 20 22, 24 4, 36 4 S 52 22, 68 6' },
        { id: 'fold', name: 'Излом', preview: 'M 4 22 L 20 22 L 28 4 L 68 4' }
    ];
    const MIRO_BG = '#F7F6F4';
    const MIRO_GRID = '#E5E3DF';

    let boardId = window.BOARD_ID || 0;
    let boardTitle = 'Моя ментальная карта';
    let nodes = {};
    let stickers = {};
    let nodeSizes = {};
    const STICKER_W = 168;
    const STICKER_H = 168;
    const STICKER_COLORS = ['#FEEC6A', '#FF9AD5', '#90DFEF', '#C5F59C', '#FFC48C', '#FFFFFF'];
    let selectedIds = new Set();
    let selectedId = null;
    let editingId = null;
    let currentZoom = 1;
    let panX = 0, panY = 0;
    let currentTool = 'select';
    let currentLayout = 'radial';
    let mapMode = 'free'; // free | fixed
    let currentShape = 'capsule';
    let bgMode = 'miro'; // miro | custom
    let bgColor = '#FFFFFF';
    let lineMode = 'theme';   // theme | solid | rainbow | branch
    let lineColor = '#C8C5BE';
    let currentLineStyle = 'curve'; // curve | roundedElbow | elbow | straight | bight | fold
    let topicMode = 'theme';  // theme | solid | rainbow | branch
    let topicColor = '#FFFFFF';
    let dirty = false;
    let saveInFlight = false;
    let saveToken = 0;

    const PALETTE = [
        '#F24726', '#FAC710', '#FEE335', '#8FD14F', '#0CA789',
        '#12CDD4', '#2D9BF0', '#414BB2', '#7B64FF', '#9510AC',
        '#DA0063', '#E6E6E6', '#1A1A1A', '#FFFFFF', '#050038'
    ];
    const RAINBOW = [
        '#F24726', '#FAC710', '#8FD14F', '#0CA789', '#12CDD4',
        '#2D9BF0', '#414BB2', '#7B64FF', '#9510AC', '#DA0063',
        '#FF6B35', '#FFB703', '#06D6A0', '#118AB2', '#9B5DE5'
    ];
    let saveTimer = null;
    let dragState = null;
    let panState = null;
    let lassoState = null;
    let spaceHeld = false;
    const history = new HistoryStack(80);
    let applyingHistory = false;
    let historyTimer = null;

    function uid() {
        return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function stickerUid() {
        return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function boardEl(id) {
        return world.querySelector(`.node[data-id="${id}"], .sticker[data-id="${id}"]`);
    }

    function isSticker(id) {
        return !!stickers[id];
    }

    function hashColorIndex(id, len) {
        let h = 0;
        const s = String(id);
        for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
        return h % len;
    }

    function rainbowColor(id) {
        return RAINBOW[hashColorIndex(id, RAINBOW.length)];
    }

    /** Корень ветки = потомок корня карты (1-й уровень). */
    function branchSeedId(id) {
        let cur = id;
        while (cur && nodes[cur] && nodes[cur].parentId) {
            const p = nodes[cur].parentId;
            if (!nodes[p] || !nodes[p].parentId) return cur;
            cur = p;
        }
        return id;
    }

    /** Цвет ветки: свой customStyle.bg, иначе радуга по seed ветки (без наследования от предков). */
    function branchColorOf(id) {
        const n = nodes[id];
        if (n && n.customStyle && n.customStyle.bg) return n.customStyle.bg;
        return rainbowColor(branchSeedId(id));
    }

    function contrastText(hex) {
        const n = hex.replace('#', '');
        const full = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
        const num = parseInt(full, 16);
        const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.62 ? '#1A1A1A' : '#FFFFFF';
    }

    function getRoot() {
        return Object.values(nodes).find(n => !n.parentId) || null;
    }

    function childrenOf(id) {
        return Object.values(nodes).filter(n => n.parentId === id);
    }

    function sortedChildren(parentId) {
        return childrenOf(parentId).sort((a, b) => {
            const ao = a.order != null ? a.order : 0;
            const bo = b.order != null ? b.order : 0;
            if (ao !== bo) return ao - bo;
            return String(a.id).localeCompare(String(b.id));
        });
    }

    function nextSiblingOrder(parentId) {
        const kids = childrenOf(parentId);
        if (!kids.length) return 0;
        return Math.max(...kids.map(k => (k.order != null ? k.order : 0))) + 1;
    }

    /** Гарантирует стабильный order у детей (для старых карт). */
    function ensureChildOrders(parentId) {
        const kids = childrenOf(parentId);
        if (!kids.every(k => k.order != null)) {
            // сортируем по текущей позиции в зависимости от раскладки
            kids.sort((a, b) => {
                const mode = layoutOf(parentId);
                if (mode === 'left-right' || mode === 'right-left' || mode === 'tree-right') {
                    return a.y - b.y || a.x - b.x;
                }
                if (mode === 'radial') {
                    const p = nodes[parentId];
                    const ps = nodeSizes[parentId] || { w: DEFAULT_W, h: DEFAULT_H };
                    const cx = p.x + ps.w / 2, cy = p.y + ps.h / 2;
                    const aa = Math.atan2(a.y + DEFAULT_H / 2 - cy, a.x + DEFAULT_W / 2 - cx);
                    const bb = Math.atan2(b.y + DEFAULT_H / 2 - cy, b.x + DEFAULT_W / 2 - cx);
                    return aa - bb;
                }
                return a.x - b.x || a.y - b.y;
            });
            kids.forEach((k, i) => { k.order = i; });
        }
    }

    function measure(id) {
        const el = world.querySelector(`.node[data-id="${id}"]`);
        if (!el) return nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const w = el.offsetWidth, h = el.offsetHeight;
        if ((!w || !h) && nodeSizes[id]) return nodeSizes[id];
        if (!w || !h) return { w: DEFAULT_W, h: DEFAULT_H };
        return { w, h };
    }

    function updateSizes() {
        const prev = nodeSizes;
        nodeSizes = {};
        Object.keys(nodes).forEach(id => {
            nodeSizes[id] = measure(id);
            if ((!nodeSizes[id].w || !nodeSizes[id].h) && prev[id]) nodeSizes[id] = prev[id];
        });
    }

    function applyTransform() {
        // screen = world * zoom + pan — однозначно, без путаницы порядка translate/scale
        world.style.transform = `matrix(${currentZoom}, 0, 0, ${currentZoom}, ${panX}, ${panY})`;
        zoomLevelEl.textContent = Math.round(currentZoom * 100) + '%';
        canvasEl.style.backgroundPosition = `${panX}px ${panY}px`;
        canvasEl.style.backgroundSize = `${24 * currentZoom}px ${24 * currentZoom}px`;
    }

    // —— Автосвязи ——
    function lineStrokeFor(nodeId) {
        const n = nodes[nodeId];
        if (n && n.lineColor) return n.lineColor;
        if (lineMode === 'branch') return branchColorOf(nodeId);
        if (lineMode === 'rainbow') return rainbowColor(nodeId);
        if (lineMode === 'solid') return lineColor;
        return getComputedStyle(document.body).getPropertyValue('--line-color').trim() || '#C8C5BE';
    }

    function lineStyleOf(parentId) {
        const n = nodes[parentId];
        if (n && n.lineStyle) return n.lineStyle;
        return currentLineStyle;
    }

    function linkAnchors(parent, child, ps, cs) {
        const layout = layoutOf(parent.id);
        const pcx = parent.x + ps.w / 2, pcy = parent.y + ps.h / 2;
        const ccx = child.x + cs.w / 2, ccy = child.y + cs.h / 2;
        if (layout === 'tree-right') {
            return {
                x1: parent.x + Math.min(ps.w / 2, 28),
                y1: parent.y + ps.h,
                x2: child.x,
                y2: ccy,
                dir: 'down-right'
            };
        }
        if (layout === 'left-right') {
            return { x1: parent.x + ps.w, y1: pcy, x2: child.x, y2: ccy, dir: 'right' };
        }
        if (layout === 'right-left') {
            return { x1: parent.x, y1: pcy, x2: child.x + cs.w, y2: ccy, dir: 'left' };
        }
        if (layout === 'top-down') {
            return { x1: pcx, y1: parent.y + ps.h, x2: ccx, y2: child.y, dir: 'down' };
        }
        if (layout === 'bottom-up') {
            return { x1: pcx, y1: parent.y, x2: ccx, y2: child.y + cs.h, dir: 'up' };
        }
        // radial — от края родителя к краю ребёнка по направлению
        const dx = ccx - pcx, dy = ccy - pcy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        const pr = Math.min(ps.w, ps.h) / 2;
        const cr = Math.min(cs.w, cs.h) / 2;
        return {
            x1: pcx + nx * pr,
            y1: pcy + ny * pr,
            x2: ccx - nx * cr,
            y2: ccy - ny * cr,
            dir: 'radial'
        };
    }

    function buildLinkPath(a, style) {
        const { x1, y1, x2, y2, dir } = a;
        const dx = x2 - x1, dy = y2 - y1;
        const st = style || 'curve';

        if (st === 'straight') {
            return `M ${x1} ${y1} L ${x2} ${y2}`;
        }

        if (st === 'elbow' || st === 'fold') {
            if (dir === 'down-right' || dir === 'down' || dir === 'up') {
                const midY = dir === 'up' ? (y1 + y2) / 2 : (dir === 'down-right' ? y2 : (y1 + y2) / 2);
                if (dir === 'down-right') {
                    return `M ${x1} ${y1} L ${x1} ${y2} L ${x2} ${y2}`;
                }
                return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
            }
            const midX = (x1 + x2) / 2;
            if (st === 'fold') {
                const jx = x1 + dx * 0.35;
                return `M ${x1} ${y1} L ${jx} ${y1} L ${jx + (x2 - jx) * 0.2} ${y2} L ${x2} ${y2}`;
            }
            return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        }

        if (st === 'roundedElbow') {
            const r = Math.min(18, Math.abs(dx) / 3, Math.abs(dy) / 3, 28);
            if (dir === 'down-right') {
                const rr = Math.min(r, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 2);
                const sy = y2 > y1 ? 1 : -1;
                const sx = x2 > x1 ? 1 : -1;
                return `M ${x1} ${y1} L ${x1} ${y2 - sy * rr} Q ${x1} ${y2} ${x1 + sx * rr} ${y2} L ${x2} ${y2}`;
            }
            if (dir === 'down' || dir === 'up') {
                const midY = (y1 + y2) / 2;
                const rr = Math.min(r, Math.abs(dx) / 2, Math.abs(dy) / 4);
                const sy = y2 > y1 ? 1 : -1;
                const sx = x2 >= x1 ? 1 : -1;
                return `M ${x1} ${y1} L ${x1} ${midY - sy * rr} Q ${x1} ${midY} ${x1 + sx * rr} ${midY} L ${x2 - sx * rr} ${midY} Q ${x2} ${midY} ${x2} ${midY + sy * rr} L ${x2} ${y2}`;
            }
            // left / right
            const midX = (x1 + x2) / 2;
            const rr = Math.min(r, Math.abs(dx) / 4, Math.abs(dy) / 2);
            const sx = x2 > x1 ? 1 : -1;
            const sy = y2 >= y1 ? 1 : -1;
            return `M ${x1} ${y1} L ${midX - sx * rr} ${y1} Q ${midX} ${y1} ${midX} ${y1 + sy * rr} L ${midX} ${y2 - sy * rr} Q ${midX} ${y2} ${midX + sx * rr} ${y2} L ${x2} ${y2}`;
        }

        if (st === 'bight') {
            if (dir === 'right' || dir === 'left') {
                const sx = dir === 'right' ? 1 : -1;
                const c1x = x1 + sx * Math.abs(dx) * 0.15;
                const c2x = x2 - sx * Math.abs(dx) * 0.55;
                return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
            }
            if (dir === 'down' || dir === 'up' || dir === 'down-right') {
                const sy = (dir === 'up') ? -1 : 1;
                const c1y = y1 + sy * Math.abs(dy) * 0.15;
                const c2y = y2 - sy * Math.abs(dy) * 0.55;
                return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
            }
            const c1x = x1 + dx * 0.2, c1y = y1 + dy * 0.05;
            const c2x = x2 - dx * 0.2, c2y = y2 - dy * 0.05;
            return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
        }

        // curve (по умолчанию)
        if (Math.abs(dx) > Math.abs(dy)) {
            const c1x = x1 + dx * 0.45, c1y = y1;
            const c2x = x2 - dx * 0.45, c2y = y2;
            return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
        }
        const c1x = x1, c1y = y1 + dy * 0.45;
        const c2x = x2, c2y = y2 - dy * 0.45;
        return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
    }

    function drawLines() {
        linesSvg.innerHTML = '';
        Object.values(nodes).forEach(n => {
            if (!n.parentId) return;
            if (!isNodeVisible(n.id)) return;
            const parent = nodes[n.parentId];
            if (!parent || !isNodeVisible(parent.id)) return;
            const ps = nodeSizes[parent.id] || measure(parent.id);
            const cs = nodeSizes[n.id] || measure(n.id);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const anchors = linkAnchors(parent, n, ps, cs);
            path.setAttribute('d', buildLinkPath(anchors, lineStyleOf(parent.id)));
            path.style.stroke = lineStrokeFor(n.id);
            path.style.fill = 'none';
            path.style.strokeWidth = '2.25';
            path.style.strokeLinecap = 'round';
            path.style.strokeLinejoin = 'round';
            linesSvg.appendChild(path);
        });
    }

    function shapeRadius(shapeId) {
        const s = shapeStyles.find(x => x.id === (shapeId || currentShape));
        return (s && s.radius) || '999px';
    }

    function nodeShapeOf(n) {
        return (n && n.shape) || 'capsule';
    }

    function applyNodeShape(el, n) {
        if (!el || !n) return;
        const shape = nodeShapeOf(n);
        el.dataset.shape = shape;
        el.style.borderRadius = shapeRadius(shape);
    }

    function syncShapeCards(activeId) {
        document.querySelectorAll('#shapeStyles .style-card').forEach(c => {
            c.classList.toggle('active', !!activeId && c.dataset.shape === activeId);
        });
    }

    function applyTopicAppearance(el, n) {
        el.style.background = '';
        el.style.borderColor = '';
        el.style.color = '';
        el.style.border = '';
        const textEl = el.querySelector('.node-text');
        if (textEl) textEl.style.color = '';

        applyNodeShape(el, n);

        if (n.customStyle) {
            applyStyle(el, n.customStyle);
            if (!n.parentId && !n.customStyle.border) el.style.border = 'none';
            return;
        }
        if (topicMode === 'branch') {
            if (!n.parentId) return;
            const bg = branchColorOf(n.id);
            const fg = contrastText(bg);
            el.style.background = bg;
            el.style.borderColor = bg;
            el.style.color = fg;
            if (textEl) textEl.style.color = fg;
            return;
        }
        if (topicMode === 'rainbow') {
            const bg = rainbowColor(n.id);
            const fg = contrastText(bg);
            el.style.background = bg;
            el.style.borderColor = bg;
            el.style.color = fg;
            if (textEl) textEl.style.color = fg;
            if (!n.parentId) el.style.border = 'none';
            return;
        }
        if (topicMode === 'solid') {
            const bg = topicColor;
            const fg = contrastText(bg);
            el.style.background = bg;
            el.style.borderColor = bg === '#FFFFFF' || bg === '#E6E6E6' ? '#E5E3DF' : bg;
            el.style.color = fg;
            if (textEl) textEl.style.color = fg;
            if (!n.parentId) {
                el.style.background = bg;
                el.style.border = 'none';
            }
        }
    }

    const LEVEL_GAP = 120;
    const SIBLING_GAP = 40;
    const TREE_BRANCH_X = 56;
    const TREE_FIRST_GAP = 36;

    function nodeDepth(id) {
        let d = 0;
        let cur = id;
        while (cur && nodes[cur] && nodes[cur].parentId) {
            d++;
            cur = nodes[cur].parentId;
            if (d > 64) break;
        }
        return d;
    }

    function layoutOf(id) {
        let cur = id;
        while (cur && nodes[cur]) {
            if (nodes[cur].layout) return nodes[cur].layout;
            cur = nodes[cur].parentId;
        }
        return currentLayout;
    }

    function clearDescendantLayouts(id) {
        sortedChildren(id).forEach(k => {
            delete k.layout;
            clearDescendantLayouts(k.id);
        });
    }

    function subtreeBBox(id) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const walk = nid => {
            if (!isNodeVisible(nid) || !nodes[nid]) return;
            const n = nodes[nid];
            const s = nodeSizes[nid] || { w: DEFAULT_W, h: DEFAULT_H };
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + s.w);
            maxY = Math.max(maxY, n.y + s.h);
            if (nodes[nid].collapsed) return;
            sortedChildren(nid).forEach(k => walk(k.id));
        };
        walk(id);
        if (!isFinite(minX)) {
            const n = nodes[id], s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
            return { x: n.x, y: n.y, w: s.w, h: s.h, cx: n.x + s.w / 2, cy: n.y + s.h / 2 };
        }
        return {
            x: minX, y: minY, w: maxX - minX, h: maxY - minY,
            cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
        };
    }

    function shiftSubtree(id, dx, dy) {
        const walk = nid => {
            if (!nodes[nid]) return;
            nodes[nid].x += dx;
            nodes[nid].y += dy;
            applyNodePos(nid);
            if (nodes[nid].collapsed) return;
            sortedChildren(nid).forEach(k => walk(k.id));
        };
        walk(id);
    }

    function separateSiblingBranches(parentId, maxIters) {
        const kids = sortedChildren(parentId).filter(k => isNodeVisible(k.id));
        if (kids.length < 2) return false;
        const mode = layoutOf(parentId);
        const pad = SIBLING_GAP;
        const iters = maxIters == null ? 8 : maxIters;
        let moved = false;
        const axisX = mode === 'top-down' || mode === 'bottom-up' || mode === 'tree-right';
        const axisY = mode === 'left-right' || mode === 'right-left';

        for (let iter = 0; iter < iters; iter++) {
            let passMoved = false;
            const boxes = kids.map(k => ({ id: k.id, b: subtreeBBox(k.id) }));
            if (axisX) boxes.sort((a, b) => a.b.cx - b.b.cx || a.b.cy - b.b.cy);
            else if (axisY) boxes.sort((a, b) => a.b.cy - b.b.cy || a.b.cx - b.b.cx);

            for (let i = 0; i < boxes.length; i++) {
                for (let j = i + 1; j < boxes.length; j++) {
                    const a = boxes[i].b, b = boxes[j].b;
                    const ox = (a.w / 2 + b.w / 2 + pad) - Math.abs(a.cx - b.cx);
                    const oy = (a.h / 2 + b.h / 2 + pad) - Math.abs(a.cy - b.cy);
                    if (ox <= 0 || oy <= 0) continue;

                    let pushX = 0, pushY = 0;
                    if (axisX) {
                        pushX = (a.cx <= b.cx ? -1 : 1) * (ox / 2 + 1);
                    } else if (axisY) {
                        pushY = (a.cy <= b.cy ? -1 : 1) * (oy / 2 + 1);
                    } else if (ox < oy) {
                        pushX = (a.cx <= b.cx ? -1 : 1) * (ox / 2 + 2);
                    } else {
                        pushY = (a.cy <= b.cy ? -1 : 1) * (oy / 2 + 2);
                    }
                    shiftSubtree(boxes[i].id, pushX, pushY);
                    shiftSubtree(boxes[j].id, -pushX, -pushY);
                    boxes[i].b = subtreeBBox(boxes[i].id);
                    boxes[j].b = subtreeBBox(boxes[j].id);
                    passMoved = true;
                    moved = true;
                }
            }
            if (!passMoved) break;
        }
        return moved;
    }

    /** Раздвигает соседние ветки строго по оси раскладки (без наложений). */
    function packSiblingBranches(parentId) {
        updateSizes();
        if (!nodes[parentId]) return;
        const mode = layoutOf(parentId);
        const kids = sortedChildren(parentId).filter(k => isNodeVisible(k.id));
        if (kids.length < 2) return;
        const pad = SIBLING_GAP;

        if (mode === 'radial') {
            separateSiblingBranches(parentId, 10);
            return;
        }

        for (let iter = 0; iter < 16; iter++) {
            const boxes = kids.map(k => ({ id: k.id, n: nodes[k.id], b: subtreeBBox(k.id) }));
            let moved = false;

            if (mode === 'left-right' || mode === 'right-left') {
                boxes.sort((a, b) => a.b.cy - b.b.cy || a.n.order - b.n.order);
                for (let i = 0; i < boxes.length - 1; i++) {
                    const a = boxes[i].b, b = boxes[i + 1].b;
                    const need = a.y + a.h + pad - b.y;
                    if (need > 0) {
                        for (let j = i + 1; j < boxes.length; j++) {
                            shiftSubtree(boxes[j].id, 0, need);
                            boxes[j].b = subtreeBBox(boxes[j].id);
                        }
                        moved = true;
                        break;
                    }
                }
            } else {
                boxes.sort((a, b) => a.b.cx - b.b.cx || a.n.order - b.n.order);
                for (let i = 0; i < boxes.length - 1; i++) {
                    const a = boxes[i].b, b = boxes[i + 1].b;
                    const need = a.x + a.w + pad - b.x;
                    if (need > 0) {
                        for (let j = i + 1; j < boxes.length; j++) {
                            shiftSubtree(boxes[j].id, need, 0);
                            boxes[j].b = subtreeBBox(boxes[j].id);
                        }
                        moved = true;
                        break;
                    }
                }
            }
            if (!moved) break;
        }
    }

    /** Высота (axis=y) или ширина (axis=x) поддерева — как в XMind. */
    function fillSubtreeSpans(id, axis, spans) {
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const self = axis === 'y' ? s.h : s.w;
        const kids = nodes[id]?.collapsed ? [] : sortedChildren(id);
        if (!kids.length) {
            spans[id] = self;
            return self;
        }
        let sum = 0;
        kids.forEach((k, i) => {
            if (i) sum += SIBLING_GAP;
            sum += fillSubtreeSpans(k.id, axis, spans);
        });
        if (layoutOf(id) === 'tree-right') {
            spans[id] = self + TREE_FIRST_GAP + sum;
        } else {
            spans[id] = Math.max(self, sum);
        }
        return spans[id];
    }

    function subtreeHasManual(id) {
        if (!nodes[id]) return false;
        if (nodes[id].manual) return true;
        return sortedChildren(id).some(k => subtreeHasManual(k.id));
    }

    function canTidyChildren(parentId) {
        if (mapMode === 'fixed') return true;
        return sortedChildren(parentId).every(k => !subtreeHasManual(k.id));
    }

    function isMapFixed() {
        return mapMode === 'fixed';
    }

    function setMapMode(mode) {
        if (mode !== 'free' && mode !== 'fixed') return;
        mapMode = mode;
        syncMapModeUI();
        document.body.classList.toggle('map-fixed', mapMode === 'fixed');
        if (mapMode === 'fixed') {
            Object.values(nodes).forEach(n => { delete n.manual; });
            if (getRoot()) {
                layoutMindMap();
                syncCollapseUI();
            }
        }
        commitChange();
    }

    function syncMapModeUI() {
        document.querySelectorAll('[data-map-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.mapMode === mapMode);
        });
        document.body.classList.toggle('map-fixed', mapMode === 'fixed');
    }

    /** Родитель на месте — дети и потомки по layoutOf каждого узла (XMind). */
    function tidyChildrenOf(parentId) {
        if (!nodes[parentId]) return;
        updateSizes();
        layoutTreeMixed(parentId);
    }

    function arrangeKidsVertical(id, dir) {
        const n = nodes[id];
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const kids = sortedChildren(id);
        if (!kids.length) return;
        const gapY = Math.round(LEVEL_GAP * 0.7);
        const boxes = kids.map(k => {
            const b = subtreeBBox(k.id);
            return { id: k.id, b, w: Math.max(b.w, 1), h: Math.max(b.h, 1) };
        });
        let totalW = 0;
        boxes.forEach((box, i) => {
            if (i) totalW += SIBLING_GAP;
            totalW += box.w;
        });
        const cx = n.x + s.w / 2;
        let cursor = cx - totalW / 2;
        boxes.forEach(box => {
            const b = subtreeBBox(box.id);
            const targetX = cursor;
            const targetY = dir === 'down' ? n.y + s.h + gapY : n.y - gapY - b.h;
            shiftSubtree(box.id, targetX - b.x, targetY - b.y);
            cursor += Math.max(subtreeBBox(box.id).w, box.w) + SIBLING_GAP;
        });
        applyNodePos(id);
    }

    function arrangeKidsLogic(id, dir) {
        const n = nodes[id];
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const kids = sortedChildren(id);
        if (!kids.length) return;
        const boxes = kids.map(k => {
            const b = subtreeBBox(k.id);
            return { id: k.id, b, w: Math.max(b.w, 1), h: Math.max(b.h, 1) };
        });
        let totalH = 0;
        boxes.forEach((box, i) => {
            if (i) totalH += SIBLING_GAP;
            totalH += box.h;
        });
        const cy = n.y + s.h / 2;
        let cursor = cy - totalH / 2;
        boxes.forEach(box => {
            const b = subtreeBBox(box.id);
            const targetY = cursor;
            const targetX = dir === 'right'
                ? n.x + s.w + LEVEL_GAP
                : n.x - LEVEL_GAP - b.w;
            shiftSubtree(box.id, targetX - b.x, targetY - b.y);
            cursor += Math.max(subtreeBBox(box.id).h, box.h) + SIBLING_GAP;
        });
        applyNodePos(id);
    }

    function arrangeKidsTreeRight(id) {
        const n = nodes[id];
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const kids = sortedChildren(id);
        if (!kids.length) return;
        const spineX = n.x + Math.min(s.w / 2, 28);
        let cursor = n.y + s.h + TREE_FIRST_GAP;
        kids.forEach(k => {
            const targetX = spineX + TREE_BRANCH_X;
            const targetY = cursor;
            shiftSubtree(k.id, targetX - k.x, targetY - k.y);
            const b = subtreeBBox(k.id);
            cursor = b.y + b.h + SIBLING_GAP;
        });
        applyNodePos(id);
    }

    function arrangeKidsRadial(id) {
        const n = nodes[id];
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const cx = n.x + s.w / 2;
        const cy = n.y + s.h / 2;
        const kids = sortedChildren(id);
        if (!kids.length) return;

        const weights = {};
        const calcW = kidId => {
            const kk = nodes[kidId]?.collapsed ? [] : sortedChildren(kidId);
            if (!kk.length) {
                weights[kidId] = 1;
                return 1;
            }
            let w = 0;
            kk.forEach(k => { w += calcW(k.id); });
            weights[kidId] = Math.max(1, w);
            return weights[kidId];
        };
        kids.forEach(k => calcW(k.id));
        const totalW = kids.reduce((a, k) => a + weights[k.id], 0) || 1;
        const d = CHILD_DIST + 20;
        let sweep, a0;
        if (!n.parentId) {
            sweep = Math.PI * 2;
            a0 = -Math.PI / 2;
        } else {
            const p = nodes[n.parentId];
            const ps = nodeSizes[p.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const dir = Math.atan2(cy - (p.y + ps.h / 2), cx - (p.x + ps.w / 2));
            sweep = Math.min(Math.PI * 1.2, Math.PI * 0.35 + kids.length * 0.22);
            a0 = dir - sweep / 2;
        }
        kids.forEach(k => {
            const ks = nodeSizes[k.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const slice = (weights[k.id] / totalW) * sweep;
            const mid = a0 + slice / 2;
            const tx = cx + Math.cos(mid) * d - ks.w / 2;
            const ty = cy + Math.sin(mid) * d - ks.h / 2;
            shiftSubtree(k.id, tx - k.x, ty - k.y);
            a0 += slice;
        });
        applyNodePos(id);
    }

    /** Рекурсивно: сначала дети, затем расстановка по layoutOf(узла). */
    function layoutTreeMixed(id) {
        const n = nodes[id];
        if (!n) return;
        const kids = n.collapsed ? [] : sortedChildren(id);
        kids.forEach(k => layoutTreeMixed(k.id));
        if (!kids.length) {
            applyNodePos(id);
            return;
        }
        const mode = layoutOf(id);
        if (mode === 'radial') arrangeKidsRadial(id);
        else if (mode === 'tree-right') arrangeKidsTreeRight(id);
        else if (mode === 'left-right') arrangeKidsLogic(id, 'right');
        else if (mode === 'right-left') arrangeKidsLogic(id, 'left');
        else if (mode === 'bottom-up') arrangeKidsVertical(id, 'up');
        else arrangeKidsVertical(id, 'down');
    }

    /** Поднять перекладку до самого верхнего предка без manual-веток. */
    function reflowAround(id) {
        updateSizes();
        if (!nodes[id]) return;
        if (layoutOf(id) === 'radial' && !nodes[id].parentId) return;

        let top = nodes[id].parentId || id;
        while (top && nodes[top] && nodes[top].parentId) {
            const gp = nodes[top].parentId;
            if (!canTidyChildren(gp)) break;
            top = gp;
        }
        if (nodes[top] && canTidyChildren(top)) {
            tidyChildrenOf(top);
        } else if (nodes[id].parentId && canTidyChildren(nodes[id].parentId)) {
            tidyChildrenOf(nodes[id].parentId);
        } else if (!nodes[id].manual) {
            clearPlacement(id);
        }
        syncCollapseUI();
        drawLines();
    }

    function layoutTreeRight(rootId) {
        layoutTreeMixed(rootId);
    }

    /** XMind-подобная раскладка с учётом layout у каждого топика. */
    function layoutDirectionalTidy(rootId) {
        layoutTreeMixed(rootId);
    }

    function layoutRadialTidy(rootId) {
        layoutTreeMixed(rootId);
    }

    function layoutMindMap(opts) {
        updateSizes();
        const root = getRoot();
        if (!root) {
            drawLines();
            return;
        }
        const ax = root.x, ay = root.y;
        if (!opts || opts.reorder !== false) {
            Object.keys(nodes).forEach(nid => ensureChildOrders(nid));
        }

        layoutTreeMixed(root.id);

        const dx = ax - root.x;
        const dy = ay - root.y;
        if (dx || dy) {
            Object.values(nodes).forEach(n => {
                n.x += dx;
                n.y += dy;
                applyNodePos(n.id);
            });
        }
        syncCollapseUI();
        drawLines();
    }

    function layoutSiblings(parentId) {
        if (!nodes[parentId] && !getRoot()) return;
        layoutMindMap();
    }

    function overlaps(a, b) {
        return !(a.x + a.w + NODE_GAP <= b.x || b.x + b.w + NODE_GAP <= a.x ||
                 a.y + a.h + NODE_GAP <= b.y || b.y + b.h + NODE_GAP <= a.y);
    }

    function rectOf(id) {
        const n = nodes[id];
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        return { x: n.x, y: n.y, w: s.w, h: s.h, cx: n.x + s.w / 2, cy: n.y + s.h / 2 };
    }

    function applyNodePos(id) {
        const n = nodes[id];
        if (!n) return;
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        n.x = Math.max(0, Math.min(WORLD - s.w, n.x));
        n.y = Math.max(0, Math.min(WORLD - s.h, n.y));
        const el = world.querySelector(`.node[data-id="${id}"]`);
        if (el) {
            el.style.left = n.x + 'px';
            el.style.top = n.y + 'px';
        }
    }

    function linkControls(parent, child, ps, cs) {
        const x1 = parent.x + ps.w / 2;
        const y1 = parent.y + ps.h / 2;
        const x2 = child.x + cs.w / 2;
        const y2 = child.y + cs.h / 2;
        const dx = x2 - x1, dy = y2 - y1;
        let c1x, c1y, c2x, c2y;
        if (Math.abs(dx) > Math.abs(dy)) {
            c1x = x1 + dx * 0.45; c1y = y1;
            c2x = x2 - dx * 0.45; c2y = y2;
        } else {
            c1x = x1; c1y = y1 + dy * 0.45;
            c2x = x2; c2y = y2 - dy * 0.45;
        }
        return { x1, y1, c1x, c1y, c2x, c2y, x2, y2 };
    }

    function cubicAt(t, c) {
        const u = 1 - t;
        return {
            x: u * u * u * c.x1 + 3 * u * u * t * c.c1x + 3 * u * t * t * c.c2x + t * t * t * c.x2,
            y: u * u * u * c.y1 + 3 * u * u * t * c.c1y + 3 * u * t * t * c.c2y + t * t * t * c.y2
        };
    }

    function pointInPadRect(px, py, r, pad) {
        return px >= r.x - pad && px <= r.x + r.w + pad &&
               py >= r.y - pad && py <= r.y + r.h + pad;
    }

    function segmentsCross(a, b, c, d) {
        const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
        return false;
    }

    function segmentHitsRect(p1, p2, r, pad) {
        if (pointInPadRect(p1.x, p1.y, r, pad) || pointInPadRect(p2.x, p2.y, r, pad)) return true;
        const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
        const corners = [
            { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }
        ];
        for (let i = 0; i < 4; i++) {
            if (segmentsCross(p1, p2, corners[i], corners[(i + 1) % 4])) return true;
        }
        return false;
    }

    function sampleCubic(ctrl, steps) {
        const pts = [];
        const n = steps || 24;
        for (let i = 0; i <= n; i++) pts.push(cubicAt(i / n, ctrl));
        return pts;
    }

    /** Пересечение середин связей (концы у узлов игнорируем — общий родитель и т.п.). */
    function linksProperlyCross(ctrlA, ctrlB) {
        const steps = 24;
        const a = sampleCubic(ctrlA, steps);
        const b = sampleCubic(ctrlB, steps);
        for (let i = 3; i < steps - 3; i++) {
            for (let j = 3; j < steps - 3; j++) {
                if (segmentsCross(a[i], a[i + 1], b[j], b[j + 1])) return true;
            }
        }
        return false;
    }

    function buildLinkCtrlAt(parentId, childId, childX, childY) {
        const parent = nodes[parentId];
        if (!parent || !nodes[childId]) return null;
        const ps = nodeSizes[parentId] || { w: DEFAULT_W, h: DEFAULT_H };
        const cs = nodeSizes[childId] || { w: DEFAULT_W, h: DEFAULT_H };
        return linkControls(parent, { x: childX, y: childY }, ps, cs);
    }

    /** Связь parent→child в позиции (x,y) пересекает чужие связи. */
    function linkCrossesOthers(childId, parentId, childX, childY) {
        const mine = buildLinkCtrlAt(parentId, childId, childX, childY);
        if (!mine) return false;
        for (const n of Object.values(nodes)) {
            if (!n.parentId || n.id === childId) continue;
            if (n.id === parentId || n.parentId === childId) continue;
            const p = nodes[n.parentId];
            if (!p) continue;
            const ps = nodeSizes[p.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const cs = nodeSizes[n.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const other = linkControls(p, n, ps, cs);
            if (linksProperlyCross(mine, other)) return true;
        }
        return false;
    }

    function rectHitsForeignLinks(rect, excludeIds) {
        const skip = new Set(excludeIds || []);
        for (const n of Object.values(nodes)) {
            if (!n.parentId || skip.has(n.id) || skip.has(n.parentId)) continue;
            const parent = nodes[n.parentId];
            if (!parent) continue;
            const ps = nodeSizes[parent.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const cs = nodeSizes[n.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const ctrl = linkControls(parent, n, ps, cs);
            let prev = cubicAt(0, ctrl);
            for (let i = 1; i <= 16; i++) {
                const cur = cubicAt(i / 16, ctrl);
                if (i > 1 && i < 16 && segmentHitsRect(prev, cur, rect, LINE_PAD)) return true;
                prev = cur;
            }
        }
        return false;
    }

    function placementBlocked(rect, exclude, nodeId) {
        for (const n of Object.values(nodes)) {
            if (exclude.includes(n.id)) continue;
            const s = nodeSizes[n.id] || { w: DEFAULT_W, h: DEFAULT_H };
            if (overlaps(rect, { x: n.x, y: n.y, w: s.w, h: s.h })) return true;
        }
        if (rectHitsForeignLinks(rect, exclude)) return true;
        if (nodeId && nodes[nodeId] && nodes[nodeId].parentId) {
            if (linkCrossesOthers(nodeId, nodes[nodeId].parentId, rect.x, rect.y)) return true;
        }
        return false;
    }

    /** Раздвигает топики, если пересекаются (с небольшим зазором NODE_GAP). */
    function resolveCollisions(priorityIds = [], maxIters) {
        const priority = new Set(priorityIds);
        let any = false;
        const limit = maxIters == null ? COLLISION_ITERS : maxIters;
        const preferX = currentLayout === 'top-down' || currentLayout === 'bottom-up' || currentLayout === 'tree-right';
        const preferY = currentLayout === 'left-right' || currentLayout === 'right-left';
        for (let iter = 0; iter < limit; iter++) {
            let moved = false;
            const ids = Object.keys(nodes);
            for (let i = 0; i < ids.length; i++) {
                for (let j = i + 1; j < ids.length; j++) {
                    const aId = ids[i], bId = ids[j];
                    const a = rectOf(aId), b = rectOf(bId);
                    const overlapX = (a.w / 2 + b.w / 2 + NODE_GAP) - Math.abs(a.cx - b.cx);
                    const overlapY = (a.h / 2 + b.h / 2 + NODE_GAP) - Math.abs(a.cy - b.cy);
                    if (overlapX <= 0 || overlapY <= 0) continue;

                    let pushX = 0, pushY = 0;
                    if (preferX) {
                        pushX = (a.cx <= b.cx ? -1 : 1) * (overlapX / 2);
                    } else if (preferY) {
                        pushY = (a.cy <= b.cy ? -1 : 1) * (overlapY / 2);
                    } else if (overlapX < overlapY) {
                        pushX = (a.cx <= b.cx ? -1 : 1) * (overlapX / 2);
                    } else {
                        pushY = (a.cy <= b.cy ? -1 : 1) * (overlapY / 2);
                    }

                    const aPri = priority.has(aId);
                    const bPri = priority.has(bId);
                    if (aPri && !bPri) {
                        nodes[bId].x -= pushX * 2;
                        nodes[bId].y -= pushY * 2;
                        applyNodePos(bId);
                    } else if (bPri && !aPri) {
                        nodes[aId].x += pushX * 2;
                        nodes[aId].y += pushY * 2;
                        applyNodePos(aId);
                    } else {
                        nodes[aId].x += pushX;
                        nodes[aId].y += pushY;
                        nodes[bId].x -= pushX;
                        nodes[bId].y -= pushY;
                        applyNodePos(aId);
                        applyNodePos(bId);
                    }
                    moved = true;
                    any = true;
                }
            }
            if (!moved) break;
        }
        return any;
    }

    function collectCandidatePositions(x, y) {
        const pts = [[x, y]];
        const push = (tx, ty) => pts.push([tx, ty]);
        const maxD = 520;
        if (currentLayout === 'left-right') {
            for (let d = 20; d <= maxD; d += 20) {
                push(x + d, y);
                push(x, y - d); push(x, y + d);
                push(x + d, y - d); push(x + d, y + d);
                push(x + d * 1.4, y - d / 2); push(x + d * 1.4, y + d / 2);
            }
        } else if (currentLayout === 'right-left') {
            for (let d = 20; d <= maxD; d += 20) {
                push(x - d, y);
                push(x, y - d); push(x, y + d);
                push(x - d, y - d); push(x - d, y + d);
            }
        } else if (currentLayout === 'top-down' || currentLayout === 'tree-right') {
            for (let d = 20; d <= maxD; d += 20) {
                push(x, y + d);
                push(x - d, y); push(x + d, y);
                push(x - d, y + d); push(x + d, y + d);
            }
        } else if (currentLayout === 'bottom-up') {
            for (let d = 20; d <= maxD; d += 20) {
                push(x, y - d);
                push(x - d, y); push(x + d, y);
                push(x - d, y - d); push(x + d, y - d);
            }
        } else {
            for (let d = 20; d <= maxD; d += 20) {
                push(x + d, y); push(x - d, y); push(x, y + d); push(x, y - d);
                push(x + d, y + d); push(x + d, y - d); push(x - d, y + d); push(x - d, y - d);
            }
        }
        for (let r = 1; r < 56; r++) {
            const n = r * 10;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                push(x + Math.cos(a) * r * 14, y + Math.sin(a) * r * 14);
            }
        }
        return pts;
    }

    function findFreePosition(x, y, w, h, exclude = [], nodeId = null) {
        let best = null;
        let bestDist = Infinity;
        const candidates = collectCandidatePositions(x, y);
        for (let i = 0; i < candidates.length; i++) {
            const tx = candidates[i][0], ty = candidates[i][1];
            if (placementBlocked({ x: tx, y: ty, w, h }, exclude, nodeId)) continue;
            const dist = (tx - x) * (tx - x) + (ty - y) * (ty - y);
            if (dist < bestDist) {
                bestDist = dist;
                best = { x: tx, y: ty };
                if (dist === 0) break;
            }
        }
        return best || { x, y };
    }

    function clearPlacement(id, excludeExtra = []) {
        const n = nodes[id];
        if (!n) return;
        updateSizes();
        const s = nodeSizes[id] || { w: DEFAULT_W, h: DEFAULT_H };
        const exclude = [id, ...excludeExtra];
        const rect = { x: n.x, y: n.y, w: s.w, h: s.h };
        if (!placementBlocked(rect, exclude, id)) return;
        const free = findFreePosition(n.x, n.y, s.w, s.h, exclude, id);
        n.x = free.x;
        n.y = free.y;
        applyNodePos(id);
    }

    function settleNode(id) {
        if (!nodes[id]) return;
        if (mapMode === 'fixed') {
            reflowAround(nodes[id].parentId || id);
            return;
        }
        const n = nodes[id];
        if (n.parentId && canTidyChildren(n.parentId)) {
            tidyChildrenOf(n.parentId);
            packSiblingBranches(n.parentId);
        } else if (n.parentId) {
            clearPlacement(id, [n.parentId]);
            packSiblingBranches(n.parentId);
        } else {
            clearPlacement(id);
        }
        syncCollapseUI();
        drawLines();
    }

    function placeFreeFirstChild(parent, child, mode) {
        const ps = nodeSizes[parent.id] || { w: DEFAULT_W, h: DEFAULT_H };
        const s = nodeSizes[child.id] || { w: DEFAULT_W, h: DEFAULT_H };
        const gapY = Math.round(LEVEL_GAP * 0.7);
        if (mode === 'left-right') {
            child.x = parent.x + ps.w + LEVEL_GAP;
            child.y = parent.y + (ps.h - s.h) / 2;
        } else if (mode === 'right-left') {
            child.x = parent.x - LEVEL_GAP - s.w;
            child.y = parent.y + (ps.h - s.h) / 2;
        } else if (mode === 'top-down' || mode === 'tree-right') {
            child.x = parent.x + (ps.w - s.w) / 2;
            child.y = parent.y + ps.h + gapY;
        } else if (mode === 'bottom-up') {
            child.x = parent.x + (ps.w - s.w) / 2;
            child.y = parent.y - s.h - gapY;
        } else {
            child.x = parent.x + ps.w + Math.round(CHILD_DIST * 0.7);
            child.y = parent.y + (ps.h - s.h) / 2;
        }
    }

    function placeFreeSiblingAppend(parentId, childId, mode) {
        const parent = nodes[parentId];
        const child = nodes[childId];
        const ps = nodeSizes[parentId] || { w: DEFAULT_W, h: DEFAULT_H };
        const s = nodeSizes[childId] || { w: DEFAULT_W, h: DEFAULT_H };
        const siblings = sortedChildren(parentId).filter(k => k.id !== childId);
        const gapY = Math.round(LEVEL_GAP * 0.7);

        if (!siblings.length) {
            placeFreeFirstChild(parent, child, mode);
            applyNodePos(childId);
            return;
        }

        if (mode === 'top-down' || mode === 'tree-right' || mode === 'bottom-up') {
            let box = subtreeBBox(siblings[0].id);
            siblings.forEach(k => {
                const b = subtreeBBox(k.id);
                if (b.x + b.w > box.x + box.w) box = b;
            });
            child.x = box.x + box.w + SIBLING_GAP;
            child.y = mode === 'bottom-up'
                ? parent.y - s.h - gapY
                : parent.y + ps.h + gapY;
            const avgY = siblings.reduce((sum, k) => sum + k.y, 0) / siblings.length;
            child.y = avgY;
        } else if (mode === 'left-right' || mode === 'right-left') {
            let box = subtreeBBox(siblings[0].id);
            siblings.forEach(k => {
                const b = subtreeBBox(k.id);
                if (b.y + b.h > box.y + box.h) box = b;
            });
            child.y = box.y + box.h + SIBLING_GAP;
            child.x = mode === 'left-right'
                ? parent.x + ps.w + LEVEL_GAP
                : parent.x - LEVEL_GAP - s.w;
            const avgX = siblings.reduce((sum, k) => sum + k.x, 0) / siblings.length;
            child.x = avgX;
        } else {
            const ps2 = nodeSizes[parentId] || { w: DEFAULT_W, h: DEFAULT_H };
            const cx = parent.x + ps2.w / 2;
            const cy = parent.y + ps2.h / 2;
            const angles = siblings.map(k => {
                const ks = nodeSizes[k.id] || { w: DEFAULT_W, h: DEFAULT_H };
                return Math.atan2(k.y + ks.h / 2 - cy, k.x + ks.w / 2 - cx);
            }).sort((a, b) => a - b);
            let bestAngle = angles[angles.length - 1] + (Math.PI * 2) / (siblings.length + 1);
            let bestGap = -1;
            for (let i = 0; i < angles.length; i++) {
                const a0 = angles[i];
                const a1 = angles[(i + 1) % angles.length] + (i + 1 === angles.length ? Math.PI * 2 : 0);
                const gap = a1 - a0;
                if (gap > bestGap) {
                    bestGap = gap;
                    bestAngle = a0 + gap / 2;
                }
            }
            child.x = cx + Math.cos(bestAngle) * CHILD_DIST - s.w / 2;
            child.y = cy + Math.sin(bestAngle) * CHILD_DIST - s.h / 2;
        }
        applyNodePos(childId);
    }

    function placeNewChild(parentId, childId) {
        updateSizes();
        const parent = nodes[parentId];
        const child = nodes[childId];
        if (!parent || !child) return;
        const mode = layoutOf(parentId);

        if (mapMode === 'fixed') {
            reflowAround(parentId);
            return;
        }

        if (mode !== 'radial' && canTidyChildren(parentId)) {
            tidyChildrenOf(parentId);
        } else if (mode === 'radial' && canTidyChildren(parentId) && !parent.parentId) {
            layoutRadialTidy(parentId);
        } else {
            placeFreeSiblingAppend(parentId, childId, mode);
        }
        packSiblingBranches(parentId);
        if (parent.parentId) packSiblingBranches(parent.parentId);
        syncCollapseUI();
        drawLines();
    }

    // —— Добавление топика + автосвязь через parentId ——
    function addChild(parentId) {
        const parent = nodes[parentId];
        if (!parent) return null;
        if (parent.collapsed) {
            parent.collapsed = false;
        }
        updateSizes();
        const id = uid();
        const order = nextSiblingOrder(parentId);
        nodes[id] = {
            id,
            text: 'Новый топик',
            x: parent.x + 120,
            y: parent.y,
            parentId,
            order
        };
        createNodeEl(nodes[id]);
        requestAnimationFrame(() => {
            placeNewChild(parentId, id);
            commitChange();
        });
        selectNode(id, false);
        startEdit(id, { selectAll: true });
        return id;
    }

    function addChildToSelected() {
        if (selectedId && stickers[selectedId]) return;
        if (selectedId && nodes[selectedId]) {
            addChild(selectedId);
            return;
        }
        const root = getRoot();
        if (root) addChild(root.id);
        else addRootNode();
    }

    function addRootNode() {
        if (Object.keys(nodes).length && !confirm('Создать новую карту с текущим шаблоном расположения? Топики будут сброшены.')) return;
        const seed = window.buildMindMapSeed
            ? window.buildMindMapSeed(currentLayout, { world: WORLD, uid })
            : null;
        if (seed && seed.nodes) {
            nodes = seed.nodes;
            if (seed.settings && seed.settings.layout) currentLayout = seed.settings.layout;
        } else {
            nodes = {};
            const id = uid();
            nodes[id] = { id, text: 'Центральная идея', x: WORLD / 2 - 80, y: WORLD / 2 - 20, parentId: null };
        }
        stickers = {};
        renderAll();
        syncLayoutCards();
        requestAnimationFrame(() => {
            updateSizes();
            resolveCollisions();
            drawLines();
            centerView();
        });
        commitChange();
    }

    function createInitialMap() {
        if (window.buildMindMapSeed) {
            const seed = window.buildMindMapSeed(currentLayout);
            nodes = seed.nodes;
            return;
        }
        const rootId = uid();
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: 2900, y: 2900, parentId: null };
        const a = uid(), b = uid(), c = uid();
        nodes[a] = { id: a, text: 'Идея 1', x: 2650, y: 2720, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: 3150, y: 2720, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: 2900, y: 3140, parentId: rootId };
    }

    function createNodeEl(n) {
        const el = document.createElement('div');
        const depth = nodeDepth(n.id);
        let cls = 'node';
        if (depth === 0) cls += ' root';
        else if (depth >= 2) cls += ' level-deep';
        if (hasNote(n)) cls += ' has-note';
        el.className = cls;
        el.dataset.id = n.id;
        el.style.left = n.x + 'px';
        el.style.top = n.y + 'px';

        const text = document.createElement('span');
        text.className = 'node-text';
        text.textContent = n.text;
        el.appendChild(text);

        if (hasNote(n)) {
            const badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'node-note-badge';
            badge.title = 'Открыть заметку';
            badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/></svg>';
            badge.onmousedown = e => e.stopPropagation();
            badge.onclick = e => {
                e.stopPropagation();
                e.preventDefault();
                openNoteView(n.id, badge);
            };
            el.appendChild(badge);
        }

        const actions = document.createElement('div');
        actions.className = 'node-actions';
        const noteBtn = document.createElement('button');
        noteBtn.type = 'button';
        noteBtn.className = 'node-action';
        noteBtn.title = hasNote(n) ? 'Заметка' : 'Добавить заметку';
        noteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/></svg>';
        noteBtn.onmousedown = e => e.stopPropagation();
        noteBtn.onclick = e => {
            e.stopPropagation();
            selectNode(n.id, false);
            if (hasNote(n)) openNoteView(n.id, noteBtn);
            else openNoteEditor(n.id);
        };
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'node-action';
        addBtn.title = 'Дочерний топик';
        addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg>';
        addBtn.onmousedown = e => e.stopPropagation();
        addBtn.onclick = e => { e.stopPropagation(); addChild(n.id); };
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'node-action delete';
        delBtn.title = 'Удалить';
        delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        delBtn.onmousedown = e => e.stopPropagation();
        delBtn.onclick = e => { e.stopPropagation(); deleteNode(n.id); };
        actions.appendChild(noteBtn);
        actions.appendChild(addBtn);
        actions.appendChild(delBtn);
        el.appendChild(actions);

        applyTopicAppearance(el, n);

        el.addEventListener('click', e => {
            e.stopPropagation();
            if (e.target.closest('.node-note-badge') || e.target.closest('.node-action') || e.target.closest('.node-fold')) return;
            if (editingId && editingId !== n.id) return;
            selectNode(n.id, e.shiftKey);
        });
        el.addEventListener('dblclick', e => {
            e.stopPropagation();
            e.preventDefault();
            if (e.target.closest('.node-fold')) return;
            selectNode(n.id, false);
            startEdit(n.id, { clientX: e.clientX, clientY: e.clientY });
        });
        el.addEventListener('mousedown', e => {
            if (e.target.closest('.node-action') || e.target.closest('.node-note-badge') || e.target.closest('.node-fold')) return;
            if (editingId === n.id) return;
            if (editingId) finishEdit(editingId);
            if (currentTool === 'pan' || spaceHeld || e.button === 1) return;
            startNodeDrag(e, n.id);
        });

        world.appendChild(el);
        syncFoldBadge(n.id);
    }

    function stickerSize(s) {
        const el = world.querySelector(`.sticker[data-id="${s.id}"]`);
        if (el) return { w: el.offsetWidth || STICKER_W, h: el.offsetHeight || STICKER_H };
        return { w: STICKER_W, h: Math.max(STICKER_H, 40) };
    }

    function createStickerEl(s) {
        const el = document.createElement('div');
        el.className = 'sticker';
        el.dataset.id = s.id;
        el.style.left = s.x + 'px';
        el.style.top = s.y + 'px';
        el.style.background = s.color || STICKER_COLORS[0];

        const text = document.createElement('div');
        text.className = 'sticker-text';
        text.dataset.placeholder = 'Текст стикера…';
        text.textContent = s.text || '';
        el.appendChild(text);

        const actions = document.createElement('div');
        actions.className = 'sticker-actions';
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'node-action delete';
        delBtn.title = 'Удалить';
        delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        delBtn.onmousedown = e => e.stopPropagation();
        delBtn.onclick = e => { e.stopPropagation(); deleteSticker(s.id); };
        actions.appendChild(delBtn);
        el.appendChild(actions);

        el.addEventListener('click', e => {
            e.stopPropagation();
            if (e.target.closest('.sticker-actions')) return;
            if (editingId && editingId !== s.id) return;
            selectNode(s.id, e.shiftKey);
        });
        el.addEventListener('dblclick', e => {
            e.stopPropagation();
            e.preventDefault();
            selectNode(s.id, false);
            startEdit(s.id, { clientX: e.clientX, clientY: e.clientY });
        });
        el.addEventListener('mousedown', e => {
            if (e.target.closest('.sticker-actions')) return;
            if (editingId === s.id) return;
            if (editingId) finishEdit(editingId);
            if (currentTool === 'pan' || spaceHeld || e.button === 1) return;
            startNodeDrag(e, s.id);
        });

        world.appendChild(el);
    }

    function addSticker() {
        const id = stickerUid();
        const viewW = canvasEl.clientWidth;
        const viewH = canvasEl.clientHeight;
        const x = (viewW / 2 - panX) / currentZoom - STICKER_W / 2;
        const y = (viewH / 2 - panY) / currentZoom - STICKER_H / 2;
        stickers[id] = {
            id,
            text: '',
            x,
            y,
            color: STICKER_COLORS[0]
        };
        createStickerEl(stickers[id]);
        selectNode(id, false);
        startEdit(id, { selectAll: true });
        commitChange();
        return id;
    }

    function deleteSticker(id) {
        if (!stickers[id]) return;
        if (editingId === id) finishEdit(id, false);
        delete stickers[id];
        selectedIds.delete(id);
        boardEl(id)?.remove();
        if (selectedId === id) selectedId = selectedIds.size ? [...selectedIds].pop() : null;
        updateSelectedUI();
        updateSelInfo();
        commitChange();
    }

    function setStickerColor(id, color) {
        const s = stickers[id];
        if (!s) return;
        s.color = color;
        const el = boardEl(id);
        if (el) el.style.background = color;
        commitChange();
        updateSelectedUI();
    }

    function hasNote(n) {
        return !!(n && n.note && String(n.note).trim());
    }

    function isNodeVisible(id) {
        let p = nodes[id] && nodes[id].parentId;
        while (p) {
            if (nodes[p] && nodes[p].collapsed) return false;
            p = nodes[p].parentId;
        }
        return true;
    }

    function descendantCount(id) {
        let c = 0;
        const walk = nid => {
            sortedChildren(nid).forEach(k => {
                c++;
                walk(k.id);
            });
        };
        walk(id);
        return c;
    }

    function foldSide(id) {
        const m = layoutOf(id);
        if (m === 'tree-right' || m === 'top-down') return 'bottom';
        if (m === 'bottom-up') return 'top';
        if (m === 'right-left') return 'left';
        return 'right';
    }

    function syncFoldBadge(id) {
        const n = nodes[id];
        const el = world.querySelector(`.node[data-id="${id}"]`);
        if (!n || !el || !isNodeVisible(id)) return;
        const kids = sortedChildren(id);
        let btn = el.querySelector('.node-fold');
        if (!kids.length) {
            if (btn) btn.remove();
            el.classList.remove('is-collapsed');
            return;
        }
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'node-fold';
            btn.onmousedown = e => e.stopPropagation();
            btn.onclick = e => {
                e.stopPropagation();
                e.preventDefault();
                toggleCollapse(id);
            };
            el.appendChild(btn);
        }
        btn.dataset.side = foldSide(id);
        el.classList.toggle('is-collapsed', !!n.collapsed);
        if (n.collapsed) {
            const count = descendantCount(id);
            btn.textContent = count > 99 ? '99+' : String(count);
            btn.title = 'Развернуть';
            btn.classList.add('collapsed');
        } else {
            btn.textContent = '−';
            btn.title = 'Свернуть';
            btn.classList.remove('collapsed');
        }
    }

    function syncCollapseUI() {
        Object.values(nodes).forEach(n => {
            const el = world.querySelector(`.node[data-id="${n.id}"]`);
            if (!el) return;
            const vis = isNodeVisible(n.id);
            el.style.display = vis ? '' : 'none';
            el.classList.toggle('branch-hidden', !vis);
        });
        Object.values(nodes).forEach(n => {
            if (isNodeVisible(n.id)) syncFoldBadge(n.id);
        });
    }

    function toggleCollapse(id) {
        const n = nodes[id];
        if (!n || !sortedChildren(id).length) return;
        if (n.collapsed) delete n.collapsed;
        else n.collapsed = true;
        // лёгкая раскладка без тяжёлого разведения по линиям
        layoutMindMap({ untangle: false, reorder: false });
        // один быстрый проход разведения веток
        if (n.parentId) separateSiblingBranches(n.parentId, 2);
        else separateSiblingBranches(id, 2);
        syncCollapseUI();
        drawLines();
        commitChange();
    }

    function syncNodeNoteBadge(id) {
        const n = nodes[id];
        const el = world.querySelector(`.node[data-id="${id}"]`);
        if (!n || !el) return;
        el.classList.toggle('has-note', hasNote(n));
        const old = el.querySelector('.node-note-badge');
        if (old) old.remove();
        if (hasNote(n)) {
            const badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'node-note-badge';
            badge.title = 'Открыть заметку';
            badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/></svg>';
            badge.onmousedown = e => e.stopPropagation();
            badge.onclick = e => {
                e.stopPropagation();
                e.preventDefault();
                openNoteView(n.id, badge);
            };
            el.appendChild(badge);
        }
        requestAnimationFrame(() => {
            updateSizes();
            drawLines();
        });
    }

    let noteViewId = null;
    let noteEditId = null;

    function openNoteView(id, anchorEl) {
        const n = nodes[id];
        const pop = document.getElementById('notePopover');
        if (!n || !pop) return;
        noteViewId = id;
        const title = document.getElementById('notePopoverTitle');
        const body = document.getElementById('notePopoverBody');
        title.textContent = n.text || 'Топик';
        const text = (n.note || '').trim();
        body.textContent = text || 'Заметка пуста';
        body.classList.toggle('empty', !text);
        pop.classList.remove('hidden');
        const rect = (anchorEl || world.querySelector(`.node[data-id="${id}"]`))?.getBoundingClientRect();
        const pad = 12;
        let left = rect ? rect.right + 10 : window.innerWidth / 2 - 160;
        let top = rect ? rect.top : 120;
        pop.style.left = '0px';
        pop.style.top = '0px';
        const pr = pop.getBoundingClientRect();
        if (left + pr.width > window.innerWidth - pad) left = (rect ? rect.left : left) - pr.width - 10;
        if (left < pad) left = pad;
        if (top + pr.height > window.innerHeight - pad) top = window.innerHeight - pr.height - pad;
        if (top < pad) top = pad;
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
        if (window.lucide) lucide.createIcons({ nodes: [pop], attrs: { 'stroke-width': 1.75 } });
    }

    function closeNoteView() {
        noteViewId = null;
        document.getElementById('notePopover')?.classList.add('hidden');
    }

    function closeNotePanel() {
        noteEditId = null;
        document.getElementById('notePanel')?.classList.remove('open');
    }

    function openNoteEditor(id) {
        const n = nodes[id];
        if (!n) return;
        selectNode(id, false);
        noteEditId = id;
        closeNoteView();
        document.getElementById('stylePanel')?.classList.remove('open');
        const panel = document.getElementById('notePanel');
        const topic = document.getElementById('notePanelTopic');
        const input = document.getElementById('nodeNoteInput');
        const btnView = document.getElementById('btnViewNote');
        if (topic) topic.textContent = n.text || 'Топик';
        if (input) {
            input.value = n.note || '';
            requestAnimationFrame(() => {
                input.focus();
                const len = input.value.length;
                input.setSelectionRange(len, len);
            });
        }
        if (btnView) btnView.style.display = hasNote(n) ? 'inline-flex' : 'none';
        panel?.classList.add('open');
        if (window.lucide) lucide.createIcons({ nodes: [panel], attrs: { 'stroke-width': 1.75 } });
    }

    function saveNodeNote(value) {
        const id = noteEditId || (selectedNodeIds().length === 1 ? selectedNodeIds()[0] : null);
        if (!id || !nodes[id]) return;
        const n = nodes[id];
        const note = String(value || '');
        if ((n.note || '') === note) return;
        n.note = note;
        if (!note.trim()) delete n.note;
        syncNodeNoteBadge(n.id);
        const btnView = document.getElementById('btnViewNote');
        if (btnView && noteEditId === id) btnView.style.display = hasNote(n) ? 'inline-flex' : 'none';
        scheduleHistory();
        markDirty();
    }

    function applyStyle(el, cs) {
        if (cs.bg) el.style.background = cs.bg;
        if (cs.border) { el.style.borderColor = cs.border; el.style.borderWidth = '1.5px'; el.style.borderStyle = 'solid'; }
        if (cs.text) {
            el.style.color = cs.text;
            const t = el.querySelector('.node-text');
            if (t) t.style.color = cs.text;
        }
    }

    function renderAll() {
        world.querySelectorAll('.node, .sticker').forEach(n => n.remove());
        Object.values(nodes).forEach(n => createNodeEl(n));
        Object.values(stickers).forEach(s => createStickerEl(s));
        requestAnimationFrame(() => {
            updateSizes();
            resolveCollisions();
            syncCollapseUI();
            drawLines();
        });
        selectedIds.forEach(id => {
            const el = boardEl(id);
            if (el) el.classList.add('selected');
        });
        updateSelectedUI();
    }

    function selectNode(id, additive) {
        if (!additive) {
            world.querySelectorAll('.node.selected, .sticker.selected').forEach(n => n.classList.remove('selected'));
            selectedIds.clear();
        }
        if (selectedIds.has(id) && additive) {
            selectedIds.delete(id);
            boardEl(id)?.classList.remove('selected');
        } else {
            selectedIds.add(id);
            boardEl(id)?.classList.add('selected');
        }
        selectedId = selectedIds.size ? id : null;
        updateSelectedUI();
        updateSelInfo();
    }

    function clearSelection() {
        world.querySelectorAll('.node.selected, .sticker.selected').forEach(n => n.classList.remove('selected'));
        selectedIds.clear();
        selectedId = null;
        updateSelectedUI();
        updateSelInfo();
    }

    function updateSelInfo() {
        const info = document.getElementById('selectionInfo');
        document.getElementById('selCount').textContent = selectedIds.size;
        info.classList.toggle('visible', selectedIds.size > 1);
    }

    function deleteNodeInternal(id) {
        const toDel = [];
        const walk = nid => {
            toDel.push(nid);
            childrenOf(nid).forEach(c => walk(c.id));
        };
        walk(id);
        toDel.forEach(nid => {
            delete nodes[nid];
            delete nodeSizes[nid];
            selectedIds.delete(nid);
            const el = world.querySelector(`.node[data-id="${nid}"]`);
            if (el) el.remove();
        });
    }

    function deleteNode(id) {
        const n = nodes[id];
        if (!n) return;
        if (!n.parentId && !confirm('Удалить корень и всю карту?')) return;
        if (editingId === id) finishEdit(id, false);
        if (noteEditId === id) closeNotePanel();
        if (noteViewId === id) closeNoteView();
        deleteNodeInternal(id);
        if (selectedId === id) selectedId = null;
        if (getRoot() && isMapFixed()) layoutMindMap();
        else {
            syncCollapseUI();
            drawLines();
        }
        updateSelectedUI();
        updateSelInfo();
        commitChange();
    }

    function deleteSelected() {
        if (!selectedIds.size) return;
        const ids = [...selectedIds];
        if (ids.some(id => nodes[id] && !nodes[id].parentId) && !confirm('Удалить корень и всю карту?')) return;
        const removedTopics = ids.some(id => nodes[id]);
        ids.forEach(id => {
            if (stickers[id]) {
                if (editingId === id) finishEdit(id, false);
                delete stickers[id];
                boardEl(id)?.remove();
            } else if (nodes[id]) {
                if (editingId === id) finishEdit(id, false);
                if (typeof noteEditId !== 'undefined' && noteEditId === id) closeNotePanel();
                if (typeof noteViewId !== 'undefined' && noteViewId === id) closeNoteView();
                deleteNodeInternal(id);
            }
        });
        clearSelection();
        if (removedTopics && getRoot() && isMapFixed()) layoutMindMap();
        else {
            syncCollapseUI();
            drawLines();
        }
        commitChange();
    }

    function placeTextCaret(textEl, opts = {}) {
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        const range = document.createRange();

        if (opts.selectAll) {
            range.selectNodeContents(textEl);
            sel.addRange(range);
            return;
        }

        if (opts.clientX != null && opts.clientY != null) {
            let caret = null;
            if (document.caretRangeFromPoint) {
                caret = document.caretRangeFromPoint(opts.clientX, opts.clientY);
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(opts.clientX, opts.clientY);
                if (pos) {
                    caret = document.createRange();
                    caret.setStart(pos.offsetNode, pos.offset);
                    caret.collapse(true);
                }
            }
            if (caret && textEl.contains(caret.startContainer)) {
                caret.collapse(true);
                sel.addRange(caret);
                return;
            }
        }

        range.selectNodeContents(textEl);
        range.collapse(!!opts.toStart);
        sel.addRange(range);
    }

    function startEdit(id, opts = {}) {
        if (stickers[id]) {
            startStickerEdit(id, opts);
            return;
        }
        const n = nodes[id];
        const el = world.querySelector(`.node[data-id="${id}"]`);
        if (!n || !el) return;
        if (editingId && editingId !== id) finishEdit(editingId);
        editingId = id;
        el.classList.add('editing');
        const text = el.querySelector('.node-text');
        text.contentEditable = 'true';
        text.spellcheck = false;
        text.focus();
        requestAnimationFrame(() => {
            if (editingId !== id) return;
            text.focus();
            placeTextCaret(text, opts);
        });
        text.onblur = () => finishEdit(id);
        text.onkeydown = e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); text.blur(); }
            if (e.key === 'Escape') { text.textContent = n.text; text.blur(); }
            if (e.key === 'Tab') { e.preventDefault(); text.blur(); addChild(id); }
            e.stopPropagation();
        };
        text.onmousedown = e => e.stopPropagation();
        text.onmouseup = e => e.stopPropagation();
        text.onclick = e => e.stopPropagation();
    }

    function startStickerEdit(id, opts = {}) {
        const s = stickers[id];
        const el = world.querySelector(`.sticker[data-id="${id}"]`);
        if (!s || !el) return;
        if (editingId && editingId !== id) finishEdit(editingId);
        editingId = id;
        el.classList.add('editing');
        const text = el.querySelector('.sticker-text');
        text.contentEditable = 'true';
        text.spellcheck = false;
        text.focus();
        requestAnimationFrame(() => {
            if (editingId !== id) return;
            text.focus();
            placeTextCaret(text, opts);
        });
        text.onblur = () => finishEdit(id);
        text.onkeydown = e => {
            if (e.key === 'Escape') {
                text.textContent = s.text || '';
                text.blur();
            }
            e.stopPropagation();
        };
        text.onmousedown = e => e.stopPropagation();
        text.onmouseup = e => e.stopPropagation();
        text.onclick = e => e.stopPropagation();
    }

    function finishEdit(id, commit = true) {
        if (stickers[id]) {
            finishStickerEdit(id, commit);
            return;
        }
        const el = world.querySelector(`.node[data-id="${id}"]`);
        const n = nodes[id];
        if (!el || !n) { editingId = null; return; }
        const text = el.querySelector('.node-text');
        text.contentEditable = 'false';
        text.onblur = null;
        text.onkeydown = null;
        text.onmousedown = null;
        text.onmouseup = null;
        text.onclick = null;
        el.classList.remove('editing');
        if (commit) {
            const val = (text.textContent || '').replace(/\u00a0/g, ' ').trim() || 'Топик';
            if (val !== n.text) {
                n.text = val;
                text.textContent = val;
                editingId = null;
                requestAnimationFrame(() => {
                    settleNode(id);
                    commitChange();
                });
                updateSelectedUI();
                return;
            }
            text.textContent = val;
        } else {
            text.textContent = n.text;
        }
        editingId = null;
        requestAnimationFrame(() => {
            updateSizes();
            drawLines();
        });
        updateSelectedUI();
    }

    function finishStickerEdit(id, commit = true) {
        const el = world.querySelector(`.sticker[data-id="${id}"]`);
        const s = stickers[id];
        if (!el || !s) { editingId = null; return; }
        const text = el.querySelector('.sticker-text');
        text.contentEditable = 'false';
        text.onblur = null;
        text.onkeydown = null;
        text.onmousedown = null;
        text.onmouseup = null;
        text.onclick = null;
        el.classList.remove('editing');
        if (commit) {
            const val = (text.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+$/,'');
            if (val !== (s.text || '')) {
                s.text = val;
                text.textContent = val;
                editingId = null;
                commitChange();
                updateSelectedUI();
                return;
            }
            text.textContent = val;
        } else {
            text.textContent = s.text || '';
        }
        editingId = null;
        updateSelectedUI();
    }

    function startNodeDrag(e, id) {
        if (e.button !== 0) return;
        if (nodes[id] && isMapFixed()) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selectedIds.has(id)) selectNode(id, e.shiftKey);
        const origins = {};
        selectedIds.forEach(sid => {
            const item = nodes[sid] || stickers[sid];
            if (item) origins[sid] = { x: item.x, y: item.y };
        });
        dragState = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            origins,
            moved: false
        };
        boardEl(id)?.classList.add('dragging');
    }

    function onPointerMove(e) {
        if (panState) {
            panX = panState.ox + (e.clientX - panState.sx);
            panY = panState.oy + (e.clientY - panState.sy);
            applyTransform();
            return;
        }
        if (lassoState) {
            const x = Math.min(lassoState.sx, e.clientX);
            const y = Math.min(lassoState.sy, e.clientY);
            rubberBand.style.left = x + 'px';
            rubberBand.style.top = y + 'px';
            rubberBand.style.width = Math.abs(e.clientX - lassoState.sx) + 'px';
            rubberBand.style.height = Math.abs(e.clientY - lassoState.sy) + 'px';
            return;
        }
        if (dragState) {
            const dx = (e.clientX - dragState.startX) / currentZoom;
            const dy = (e.clientY - dragState.startY) / currentZoom;
            if (!dragState.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) dragState.moved = true;
            if (!dragState.moved) return;
            let movedNode = false;
            selectedIds.forEach(sid => {
                if (nodes[sid] && isMapFixed()) return;
                const item = nodes[sid] || stickers[sid];
                const o = dragState.origins[sid];
                if (!item || !o) return;
                item.x = o.x + dx;
                item.y = o.y + dy;
                const el = boardEl(sid);
                if (el) { el.style.left = item.x + 'px'; el.style.top = item.y + 'px'; }
                if (nodes[sid]) movedNode = true;
            });
            if (movedNode) drawLines();
        }
    }

    function onPointerUp(e) {
        if (panState) {
            endPan();
            return;
        }
        if (lassoState) {
            finishLasso(e);
            return;
        }
        if (dragState) {
            const id = dragState.id;
            const movedIds = isMapFixed() ? [] : [...selectedIds].filter(sid => nodes[sid]);
            boardEl(id)?.classList.remove('dragging');
            if (dragState.moved) {
                if (!isMapFixed()) {
                    selectedIds.forEach(sid => {
                        if (nodes[sid]) nodes[sid].manual = true;
                    });
                }
                if (movedIds.length) {
                    updateSizes();
                    resolveCollisions(movedIds);
                    const parents = new Set();
                    movedIds.forEach(sid => {
                        const p = nodes[sid]?.parentId;
                        if (p) parents.add(p);
                    });
                    parents.forEach(pid => packSiblingBranches(pid));
                    drawLines();
                }
                commitChange();
            }
            dragState = null;
        }
    }

    function finishLasso(e) {
        rubberBand.style.display = 'none';
        if (!lassoState) return;
        const x1 = Math.min(lassoState.sx, e.clientX);
        const y1 = Math.min(lassoState.sy, e.clientY);
        const x2 = Math.max(lassoState.sx, e.clientX);
        const y2 = Math.max(lassoState.sy, e.clientY);
        lassoState = null;
        if (x2 - x1 < 5 && y2 - y1 < 5) {
            clearSelection();
            return;
        }
        if (!e.shiftKey) {
            world.querySelectorAll('.node.selected, .sticker.selected').forEach(n => n.classList.remove('selected'));
            selectedIds.clear();
        }
        const hitTest = el => {
            if (!el) return;
            const r = el.getBoundingClientRect();
            return !(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2);
        };
        Object.values(nodes).forEach(n => {
            const el = world.querySelector(`.node[data-id="${n.id}"]`);
            if (hitTest(el)) {
                selectedIds.add(n.id);
                el.classList.add('selected');
            }
        });
        Object.values(stickers).forEach(s => {
            const el = world.querySelector(`.sticker[data-id="${s.id}"]`);
            if (hitTest(el)) {
                selectedIds.add(s.id);
                el.classList.add('selected');
            }
        });
        selectedId = selectedIds.size ? [...selectedIds].pop() : null;
        updateSelectedUI();
        updateSelInfo();
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('#leftbar .tool-btn[data-tool]').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === tool);
        });
        canvasEl.classList.toggle('cursor-grab', tool === 'pan');
        canvasEl.classList.toggle('cursor-default', tool !== 'pan');
    }

    function zoomBy(f, cx, cy) {
        const rect = canvasEl.getBoundingClientRect();
        const mx = cx ?? rect.width / 2;
        const my = cy ?? rect.height / 2;
        const wx = (mx - panX) / currentZoom;
        const wy = (my - panY) / currentZoom;
        currentZoom = Math.min(2.5, Math.max(0.2, currentZoom * f));
        panX = mx - wx * currentZoom;
        panY = my - wy * currentZoom;
        applyTransform();
        markDirty();
    }

    function resetZoom() {
        currentZoom = 1;
        applyTransform();
    }

    function centerView() {
        updateSizes();
        const list = Object.values(nodes).filter(n => isNodeVisible(n.id));
        const stickerList = Object.values(stickers);
        const viewW = canvasEl.clientWidth;
        const viewH = canvasEl.clientHeight;

        if (!list.length && !stickerList.length) {
            currentZoom = 1;
            panX = viewW / 2;
            panY = viewH / 2;
            applyTransform();
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        list.forEach(n => {
            const el = world.querySelector(`.node[data-id="${n.id}"]`);
            const w = el && el.offsetWidth ? el.offsetWidth : (nodeSizes[n.id]?.w || DEFAULT_W);
            const h = el && el.offsetHeight ? el.offsetHeight : (nodeSizes[n.id]?.h || DEFAULT_H);
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + w);
            maxY = Math.max(maxY, n.y + h);
            nodeSizes[n.id] = { w, h };
        });
        stickerList.forEach(s => {
            const sz = stickerSize(s);
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x + sz.w);
            maxY = Math.max(maxY, s.y + sz.h);
        });
        if (!isFinite(minX)) {
            currentZoom = 1;
            panX = viewW / 2;
            panY = viewH / 2;
            applyTransform();
            return;
        }

        const bw = Math.max(maxX - minX, 40);
        const bh = Math.max(maxY - minY, 40);
        const pad = 72;
        const zoomFit = Math.min(
            (viewW - pad * 2) / bw,
            (viewH - pad * 2) / bh
        );
        // уместить всё; мелкие схемы не раздувать сильнее 150%
        currentZoom = Math.min(Math.max(zoomFit, 0.08), 1.5);

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        panX = viewW / 2 - cx * currentZoom;
        panY = viewH / 2 - cy * currentZoom;
        applyTransform();
    }

    function autoLayout() {
        const root = getRoot();
        if (!root) return;
        updateSizes();

        const rs = nodeSizes[root.id] || { w: DEFAULT_W, h: DEFAULT_H };
        const cx = WORLD / 2;
        const cy = WORLD / 2;
        if (currentLayout === 'top-down' || currentLayout === 'tree-right') {
            root.x = cx - rs.w / 2;
            root.y = cy - 280;
        } else if (currentLayout === 'bottom-up') {
            root.x = cx - rs.w / 2;
            root.y = cy + 200;
        } else if (currentLayout === 'left-right') {
            root.x = cx - 320;
            root.y = cy - rs.h / 2;
        } else if (currentLayout === 'right-left') {
            root.x = cx + 220;
            root.y = cy - rs.h / 2;
        } else {
            root.x = cx - rs.w / 2;
            root.y = cy - rs.h / 2;
        }
        applyNodePos(root.id);

        Object.values(nodes).forEach(n => {
            delete n.layout;
            delete n.manual;
        });
        layoutMindMap();
        syncCollapseUI();
        centerView();
        commitChange();
    }

    function syncLayoutCards() {
        const topics = selectedNodeIds();
        const active = (isMapFixed() && topics.length === 1)
            ? layoutOf(topics[0])
            : currentLayout;
        document.querySelectorAll('#layoutStyles .style-card').forEach(c => {
            c.classList.toggle('active', c.dataset.layout === active);
        });
    }

    function clearSubtreeManual(id) {
        if (!nodes[id]) return;
        delete nodes[id].manual;
        sortedChildren(id).forEach(k => clearSubtreeManual(k.id));
    }

    function applyLayoutToTopic(topicId, layoutId) {
        const n = nodes[topicId];
        if (!n) return;
        if (!n.parentId) {
            currentLayout = layoutId;
            delete n.layout;
            clearDescendantLayouts(topicId);
        } else {
            n.layout = layoutId;
            clearDescendantLayouts(topicId);
        }
        clearSubtreeManual(topicId);
    }

    function applyLayoutChoice(layoutId) {
        const topics = selectedNodeIds();
        if (isMapFixed() && topics.length) {
            topics.forEach(tid => applyLayoutToTopic(tid, layoutId));
            Object.values(nodes).forEach(n => { delete n.manual; });
            if (getRoot()) layoutMindMap();
            else drawLines();
            syncLayoutCards();
            commitChange();
            return;
        }
        currentLayout = layoutId;
        Object.values(nodes).forEach(n => {
            delete n.layout;
            delete n.manual;
        });
        autoLayout();
        syncLayoutCards();
    }

    function applyCurrentLayout() {
        const topics = selectedNodeIds();
        if (isMapFixed() && topics.length) {
            const active = document.querySelector('#layoutStyles .style-card.active');
            const layoutId = (active && active.dataset.layout) || layoutOf(topics[0]);
            applyLayoutChoice(layoutId);
            return;
        }
        applyLayoutChoice(currentLayout);
    }

    function setLayout(id, applyNow) {
        if (applyNow) {
            applyLayoutChoice(id);
            return;
        }
        currentLayout = id;
        syncLayoutCards();
        commitChange();
    }

    // —— Стили ——
    function initPanels() {
        const layoutGrid = document.getElementById('layoutStyles');
        layoutStyles.forEach(l => {
            const card = document.createElement('div');
            card.className = 'style-card' + (l.id === currentLayout ? ' active' : '');
            card.dataset.layout = l.id;
            const preview = window.layoutPreviewHTML ? window.layoutPreviewHTML(l.id) : '';
            card.innerHTML = `${preview}<div class="style-card-name">${l.name}</div><div class="style-card-desc">${l.desc}</div>`;
            card.onclick = () => setLayout(l.id, true);
            layoutGrid.appendChild(card);
        });

        document.querySelectorAll('[data-map-mode]').forEach(btn => {
            btn.onclick = () => setMapMode(btn.dataset.mapMode);
        });
        syncMapModeUI();

        const applyBtn = document.getElementById('btnApplyLayout');
        if (applyBtn) applyBtn.onclick = () => applyCurrentLayout();

        const lineGrid = document.getElementById('lineStyles');
        if (lineGrid) {
            lineStyles.forEach(s => {
                const card = document.createElement('div');
                card.className = 'style-card' + (s.id === currentLineStyle ? ' active' : '');
                card.dataset.lineStyle = s.id;
                card.innerHTML = `<div class="line-style-preview"><svg viewBox="0 0 72 28" fill="none"><path d="${s.preview}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="style-card-name">${s.name}</div>`;
                card.onclick = () => setLineStyle(s.id);
                lineGrid.appendChild(card);
            });
        }

        const shapeGrid = document.getElementById('shapeStyles');
        shapeStyles.forEach(s => {
            const card = document.createElement('div');
            card.className = 'style-card' + (s.id === currentShape ? ' active' : '');
            card.dataset.shape = s.id;
            card.innerHTML = `<div class="style-preview"><span class="block-preview" style="background:var(--miro-text);color:#fff;border-radius:${s.radius}">Узел</span></div><div class="style-card-name">${s.name}</div>`;
            card.onclick = () => setShape(s.id);
            shapeGrid.appendChild(card);
        });

        document.getElementById('nodeBgColor').oninput = e => updateNodeColor('bg', e.target.value);
        document.getElementById('nodeBorderColor').oninput = e => updateNodeColor('border', e.target.value);
        document.getElementById('nodeTextColor').oninput = e => updateNodeColor('text', e.target.value);
        document.getElementById('nodeLineColor').oninput = e => updateNodeLineColor(e.target.value);
        document.getElementById('btnResetLineColor').onclick = resetNodeLineColor;

        const noteInput = document.getElementById('nodeNoteInput');
        if (noteInput) {
            noteInput.addEventListener('input', () => {
                saveNodeNote(noteInput.value);
            });
        }
        document.getElementById('btnViewNote')?.addEventListener('click', () => {
            const id = noteEditId;
            if (id) openNoteView(id);
        });
        document.getElementById('btnDoneNote')?.addEventListener('click', closeNotePanel);
        document.getElementById('btnCloseNotePanel')?.addEventListener('click', closeNotePanel);
        document.getElementById('notePopoverClose')?.addEventListener('click', closeNoteView);
        document.getElementById('notePopoverEdit')?.addEventListener('click', () => {
            if (noteViewId) openNoteEditor(noteViewId);
        });

        initColorControls();
    }

    function initColorControls() {
        const lineRow = document.getElementById('lineColorRow');
        const topicRow = document.getElementById('topicColorRow');
        const bgRow = document.getElementById('bgColorRow');
        lineRow.innerHTML = '';
        topicRow.innerHTML = '';
        bgRow.innerHTML = '';

        PALETTE.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'color-swatch';
            btn.style.background = c;
            btn.title = c;
            btn.onclick = () => {
                lineMode = 'solid';
                lineColor = c;
                syncColorUI();
                drawLines();
                scheduleHistory();
                markDirty();
            };
            lineRow.appendChild(btn);
        });

        PALETTE.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'color-swatch';
            btn.style.background = c;
            btn.title = c;
            btn.onclick = () => {
                topicMode = 'solid';
                topicColor = c;
                syncColorUI();
                refreshTopicColors();
                scheduleHistory();
                markDirty();
            };
            topicRow.appendChild(btn);
        });

        PALETTE.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'color-swatch';
            btn.style.background = c;
            btn.title = c;
            btn.onclick = () => {
                bgMode = 'custom';
                bgColor = c;
                applyBoardBg();
                syncColorUI();
                scheduleHistory();
                markDirty();
            };
            bgRow.appendChild(btn);
        });

        document.querySelectorAll('[data-line-mode]').forEach(btn => {
            btn.onclick = () => {
                lineMode = btn.dataset.lineMode;
                if (lineMode === 'branch') topicMode = 'branch';
                syncColorUI();
                refreshTopicColors();
                drawLines();
                commitChange();
            };
        });
        document.querySelectorAll('[data-topic-mode]').forEach(btn => {
            btn.onclick = () => {
                topicMode = btn.dataset.topicMode;
                if (topicMode === 'branch') lineMode = 'branch';
                syncColorUI();
                refreshTopicColors();
                drawLines();
                commitChange();
            };
        });
        document.querySelectorAll('[data-bg-mode]').forEach(btn => {
            btn.onclick = () => {
                bgMode = btn.dataset.bgMode;
                applyBoardBg();
                syncColorUI();
                commitChange();
            };
        });
        syncColorUI();
    }

    function syncColorUI() {
        document.querySelectorAll('[data-line-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.lineMode === lineMode);
        });
        document.querySelectorAll('[data-topic-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.topicMode === topicMode);
        });
        document.querySelectorAll('[data-bg-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.bgMode === bgMode);
        });
        document.getElementById('lineColorRow').classList.toggle('disabled', lineMode !== 'solid');
        document.getElementById('topicColorRow').classList.toggle('disabled', topicMode !== 'solid');
        document.getElementById('bgColorRow').classList.toggle('disabled', bgMode !== 'custom');
        document.querySelectorAll('#lineColorRow .color-swatch').forEach(sw => {
            sw.classList.toggle('active', lineMode === 'solid' && (sw.title || '').toLowerCase() === lineColor.toLowerCase());
        });
        document.querySelectorAll('#topicColorRow .color-swatch').forEach(sw => {
            sw.classList.toggle('active', topicMode === 'solid' && (sw.title || '').toLowerCase() === topicColor.toLowerCase());
        });
        document.querySelectorAll('#bgColorRow .color-swatch').forEach(sw => {
            sw.classList.toggle('active', bgMode === 'custom' && (sw.title || '').toLowerCase() === bgColor.toLowerCase());
        });
    }

    function refreshTopicColors() {
        Object.values(nodes).forEach(n => {
            const el = world.querySelector(`.node[data-id="${n.id}"]`);
            if (el) applyTopicAppearance(el, n);
        });
        drawLines();
    }

    function refreshSubtreeColors(id) {
        const walk = nid => {
            if (!nodes[nid]) return;
            const el = world.querySelector(`.node[data-id="${nid}"]`);
            if (el) applyTopicAppearance(el, nodes[nid]);
            sortedChildren(nid).forEach(k => walk(k.id));
        };
        walk(id);
        drawLines();
    }

    function applyBoardBg() {
        document.body.classList.remove('bg-miro', 'bg-custom');
        if (bgMode === 'custom') {
            document.body.classList.add('bg-custom');
            document.documentElement.style.setProperty('--miro-bg', bgColor);
            // сетка чуть темнее/светлее фона
            document.documentElement.style.setProperty('--miro-grid', contrastText(bgColor) === '#FFFFFF' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)');
        } else {
            document.body.classList.add('bg-miro');
            document.documentElement.style.setProperty('--miro-bg', MIRO_BG);
            document.documentElement.style.setProperty('--miro-grid', MIRO_GRID);
        }
    }

    function syncLineStyleCards(activeId) {
        document.querySelectorAll('#lineStyles .style-card').forEach(c => {
            c.classList.toggle('active', !!activeId && c.dataset.lineStyle === activeId);
        });
    }

    function setLineStyle(id) {
        const ids = selectedNodeIds();
        if (ids.length) {
            ids.forEach(nid => {
                if (!nodes[nid]) return;
                nodes[nid].lineStyle = id;
            });
            syncLineStyleCards(id);
            drawLines();
            commitChange();
            return;
        }
        currentLineStyle = id;
        Object.values(nodes).forEach(n => { delete n.lineStyle; });
        syncLineStyleCards(id);
        drawLines();
        commitChange();
    }

    function setShape(id) {
        const ids = selectedNodeIds();
        if (!ids.length) return;
        ids.forEach(nid => {
            if (!nodes[nid]) return;
            if (id === 'capsule') delete nodes[nid].shape;
            else nodes[nid].shape = id;
            const el = world.querySelector(`.node[data-id="${nid}"]`);
            if (el) applyNodeShape(el, nodes[nid]);
        });
        syncShapeCards(id);
        commitChange();
    }

    function updateSelectedUI() {
        const section = document.getElementById('selectedNodeSection');
        const title = document.getElementById('selectedNodeTitle');
        const controls = document.getElementById('selectedNodeControls');
        let colorRow = document.getElementById('stickerColorRow');
        if (!colorRow) {
            colorRow = document.createElement('div');
            colorRow.id = 'stickerColorRow';
            colorRow.className = 'sticker-colors';
            colorRow.style.display = 'none';
            section.appendChild(colorRow);
        }

        const ids = selectedIds.size ? [...selectedIds] : (selectedId ? [selectedId] : []);
        const onlyStickers = ids.length && ids.every(id => stickers[id]);
        const lastStick = onlyStickers ? stickers[ids[ids.length - 1]] : null;

        if (lastStick) {
            section.classList.remove('empty');
            title.classList.remove('empty');
            title.textContent = ids.length > 1 ? 'Стикеров: ' + ids.length : 'Стикер';
            controls.style.display = 'none';
            colorRow.style.display = 'flex';
            colorRow.innerHTML = '';
            STICKER_COLORS.forEach(c => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'color-swatch' + ((lastStick.color || STICKER_COLORS[0]).toLowerCase() === c.toLowerCase() ? ' active' : '');
                btn.style.background = c;
                btn.title = c;
                btn.onclick = () => {
                    ids.forEach(id => {
                        if (!stickers[id]) return;
                        stickers[id].color = c;
                        const el = boardEl(id);
                        if (el) el.style.background = c;
                    });
                    commitChange();
                    updateSelectedUI();
                };
                colorRow.appendChild(btn);
            });
            syncShapeCards(null);
            syncLayoutCards();
            syncLineStyleCards(null);
            return;
        }

        colorRow.style.display = 'none';
        colorRow.innerHTML = '';

        if (!selectedIds.size && (!selectedId || !nodes[selectedId])) {
            section.classList.add('empty');
            title.classList.add('empty');
            title.textContent = 'Выделите топик';
            controls.style.display = 'none';
            syncShapeCards(currentShape);
            syncLayoutCards();
            syncLineStyleCards(currentLineStyle);
            return;
        }
        const nodeIds = ids.filter(id => nodes[id]);
        const n = nodes[nodeIds[nodeIds.length - 1]];
        if (!n) {
            section.classList.add('empty');
            title.classList.add('empty');
            title.textContent = 'Выделите топик';
            controls.style.display = 'none';
            syncShapeCards(currentShape);
            syncLayoutCards();
            syncLineStyleCards(currentLineStyle);
            return;
        }
        section.classList.remove('empty');
        title.classList.remove('empty');
        if (nodeIds.length > 1) {
            title.textContent = 'Выделено топиков: ' + nodeIds.length;
        } else {
            const short = n.text.length > 24 ? n.text.slice(0, 24) + '…' : n.text;
            title.textContent = (n.parentId ? 'Топик' : 'Корень') + ': «' + short + '»';
        }
        controls.style.display = 'block';
        const cs = n.customStyle || {};
        document.getElementById('nodeBgColor').value = cs.bg || (n.parentId ? '#ffffff' : '#050038');
        document.getElementById('nodeBorderColor').value = cs.border || '#E5E3DF';
        document.getElementById('nodeTextColor').value = cs.text || (n.parentId ? '#050038' : '#ffffff');
        const lineRow = document.getElementById('nodeLineColorRow');
        if (lineRow) {
            const hasChild = nodeIds.some(id => nodes[id] && nodes[id].parentId);
            lineRow.style.display = hasChild ? 'flex' : 'none';
            if (hasChild) {
                const withLine = nodeIds.map(id => nodes[id]).find(x => x && x.parentId);
                document.getElementById('nodeLineColor').value = (withLine && withLine.lineColor) || lineStrokeFor(withLine.id);
            }
        }
        const shapes = nodeIds.map(id => nodeShapeOf(nodes[id]));
        const commonShape = shapes.every(s => s === shapes[0]) ? shapes[0] : null;
        syncShapeCards(commonShape);
        syncLayoutCards();
        const lineStylesSel = nodeIds.map(id => lineStyleOf(id));
        const commonLine = lineStylesSel.every(s => s === lineStylesSel[0]) ? lineStylesSel[0] : null;
        syncLineStyleCards(commonLine);
    }

    function selectedNodeIds() {
        if (selectedIds.size) return [...selectedIds].filter(id => nodes[id]);
        return selectedId && nodes[selectedId] ? [selectedId] : [];
    }

    function updateNodeLineColor(value) {
        const ids = selectedNodeIds();
        let changed = false;
        ids.forEach(id => {
            const n = nodes[id];
            if (!n || !n.parentId) return;
            n.lineColor = value;
            changed = true;
        });
        if (!changed) return;
        drawLines();
        scheduleHistory();
        markDirty();
    }

    function resetNodeLineColor() {
        selectedNodeIds().forEach(id => {
            if (nodes[id]) delete nodes[id].lineColor;
        });
        updateSelectedUI();
        drawLines();
        commitChange();
    }

    function updateNodeColor(type, value) {
        const ids = selectedNodeIds();
        if (!ids.length) return;
        ids.forEach(id => {
            const n = nodes[id];
            if (!n) return;
            if (!n.customStyle) n.customStyle = {};
            n.customStyle[type] = value;
            if (type === 'bg' && (topicMode === 'branch' || lineMode === 'branch')) {
                n.customStyle.border = value;
            }
            const el = world.querySelector(`.node[data-id="${id}"]`);
            if (el) applyTopicAppearance(el, n);
        });
        drawLines();
        scheduleHistory();
        markDirty();
    }

    function setSaveStatus(text, state) {
        saveStatus.className = 'save-status' + (state ? ' ' + state : '');
        let label = saveStatus.querySelector('.save-text');
        if (!label) {
            label = document.createElement('span');
            label.className = 'save-text';
            saveStatus.appendChild(label);
        }
        label.textContent = text;
        if (window.lucide) {
            saveStatus.querySelectorAll('svg').forEach(el => el.remove());
            const i = document.createElement('i');
            i.setAttribute('data-lucide', state === 'dirty' ? 'cloud-off' : state === 'saving' ? 'loader-circle' : 'cloud-check');
            i.className = 'save-ico';
            saveStatus.insertBefore(i, saveStatus.firstChild);
            lucide.createIcons({ nodes: [saveStatus], attrs: { 'stroke-width': 1.75 } });
        }
    }

    function markDirty(doSave = true) {
        dirty = true;
        saveToken++;
        setSaveStatus('Не сохранено', 'dirty');
        if (!doSave) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveBoard(), 800);
    }

    /** Записать в историю + автосохранение (для дискретных действий). */
    function commitChange() {
        if (applyingHistory) {
            markDirty();
            return;
        }
        clearTimeout(historyTimer);
        recordHistory();
        markDirty();
    }

    /** Отложенная запись истории (палитра, ввод цвета). */
    function scheduleHistory() {
        if (applyingHistory) return;
        clearTimeout(historyTimer);
        historyTimer = setTimeout(() => recordHistory(), 400);
    }

    function historySnapshot() {
        return JSON.stringify({
            nodes,
            stickers,
            currentLayout,
            mapMode,
            currentShape,
            bgMode,
            bgColor,
            lineMode,
            lineColor,
            currentLineStyle,
            topicMode,
            topicColor
        });
    }

    function recordHistory() {
        if (applyingHistory) return;
        const snap = historySnapshot();
        if (history.index >= 0 && history.stack[history.index] === snap) return;
        history.push(snap);
        updateUndoButtons();
    }

    function updateUndoButtons() {
        const u = document.getElementById('btnUndo');
        const r = document.getElementById('btnRedo');
        if (u) u.disabled = !history.canUndo();
        if (r) r.disabled = !history.canRedo();
    }

    function restoreHistory(snap) {
        if (!snap) return;
        applyingHistory = true;
        clearTimeout(historyTimer);
        try {
            const data = JSON.parse(snap);
            nodes = data.nodes || {};
            stickers = data.stickers || {};
            currentLayout = data.currentLayout || 'radial';
            mapMode = data.mapMode === 'fixed' ? 'fixed' : 'free';
            currentShape = 'capsule';
            bgMode = data.bgMode || 'miro';
            bgColor = data.bgColor || '#FFFFFF';
            lineMode = data.lineMode || 'theme';
            lineColor = data.lineColor || '#C8C5BE';
            currentLineStyle = data.currentLineStyle || 'curve';
            topicMode = data.topicMode || 'theme';
            topicColor = data.topicColor || '#FFFFFF';
            clearSelection();
            document.body.className = `theme-classic shape-capsule ${bgMode === 'custom' ? 'bg-custom' : 'bg-miro'}`;
            document.documentElement.style.setProperty('--node-radius', '999px');
            applyBoardBg();
            renderAll();
            syncLayoutCards();
            syncMapModeUI();
            syncColorUI();
            syncLineStyleCards(currentLineStyle);
            syncShapeCards(currentShape);
            markDirty();
        } finally {
            applyingHistory = false;
            updateUndoButtons();
        }
    }

    function undo() {
        const snap = history.undo();
        if (snap) restoreHistory(snap);
    }

    function redo() {
        const snap = history.redo();
        if (snap) restoreHistory(snap);
    }

    function payload() {
        return {
            nodes,
            stickers,
            viewport: { zoom: currentZoom, panX, panY },
            settings: {
                layout: currentLayout,
                mapMode,
                shape: currentShape,
                bgMode,
                bgColor,
                lineMode,
                lineColor,
                lineStyle: currentLineStyle,
                topicMode,
                topicColor
            }
        };
    }

    function escapeXml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function exportFileName(ext) {
        const base = (boardTitle || 'mindmap').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'mindmap';
        return base + '.' + ext;
    }

    function downloadBlob(blob, filename) {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function contentBounds(pad) {
        updateSizes();
        const list = Object.values(nodes);
        const stickerList = Object.values(stickers);
        if (!list.length && !stickerList.length) return { minX: 0, minY: 0, maxX: 400, maxY: 300, w: 400, h: 300 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        list.forEach(n => {
            if (!isNodeVisible(n.id)) return;
            const s = nodeSizes[n.id] || { w: DEFAULT_W, h: DEFAULT_H };
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + s.w);
            maxY = Math.max(maxY, n.y + s.h);
        });
        stickerList.forEach(s => {
            const sz = stickerSize(s);
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x + sz.w);
            maxY = Math.max(maxY, s.y + sz.h);
        });
        if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 400, maxY: 300, w: 400, h: 300 };
        const p = pad == null ? 48 : pad;
        minX -= p; minY -= p; maxX += p; maxY += p;
        return { minX, minY, maxX, maxY, w: Math.max(maxX - minX, 40), h: Math.max(maxY - minY, 40) };
    }

    function nodeExportStyle(n) {
        const radiusRaw = shapeRadius(nodeShapeOf(n));
        const radius = radiusRaw === '999px' ? 999 : (parseFloat(radiusRaw) || 8);
        const isRoot = !n.parentId;
        if (n.customStyle) {
            return {
                bg: n.customStyle.bg || (isRoot ? '#050038' : '#ffffff'),
                border: n.customStyle.border || '#E5E3DF',
                text: n.customStyle.text || (isRoot ? '#ffffff' : '#050038'),
                borderW: 1.5,
                radius
            };
        }
        if (topicMode === 'branch') {
            if (isRoot) return { bg: '#050038', border: '#050038', text: '#ffffff', borderW: 0, radius };
            const bg = branchColorOf(n.id);
            return { bg, border: bg, text: contrastText(bg), borderW: 1.5, radius };
        }
        if (topicMode === 'rainbow') {
            const bg = rainbowColor(n.id);
            return { bg, border: bg, text: contrastText(bg), borderW: isRoot ? 0 : 1.5, radius };
        }
        if (topicMode === 'solid') {
            const bg = topicColor;
            const light = bg === '#FFFFFF' || bg === '#E6E6E6';
            return {
                bg,
                border: light ? '#E5E3DF' : bg,
                text: contrastText(bg),
                borderW: isRoot ? 0 : 1.5,
                radius
            };
        }
        if (isRoot) return { bg: '#050038', border: '#050038', text: '#ffffff', borderW: 0, radius };
        return { bg: '#ffffff', border: '#E5E3DF', text: '#050038', borderW: 1.5, radius };
    }

    function exportBgColor() {
        if (bgMode === 'custom') return bgColor || '#FFFFFF';
        return MIRO_BG;
    }

    function buildExportSvg() {
        const b = contentBounds(56);
        const bg = exportBgColor();
        const parts = [];
        parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}" viewBox="0 0 ${b.w} ${b.h}">`);
        parts.push(`<rect width="100%" height="100%" fill="${escapeXml(bg)}"/>`);

        Object.values(nodes).forEach(n => {
            if (!n.parentId || !isNodeVisible(n.id)) return;
            const parent = nodes[n.parentId];
            if (!parent || !isNodeVisible(parent.id)) return;
            const ps = nodeSizes[parent.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const cs = nodeSizes[n.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const stroke = lineStrokeFor(n.id);
            const anchors = linkAnchors(parent, n, ps, cs);
            // сдвиг в систему координат экспорта
            const a = {
                x1: anchors.x1 - b.minX,
                y1: anchors.y1 - b.minY,
                x2: anchors.x2 - b.minX,
                y2: anchors.y2 - b.minY,
                dir: anchors.dir
            };
            parts.push(`<path d="${buildLinkPath(a, lineStyleOf(parent.id))}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`);
        });

        Object.values(nodes).forEach(n => {
            if (!isNodeVisible(n.id)) return;
            const s = nodeSizes[n.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const st = nodeExportStyle(n);
            const x = n.x - b.minX;
            const y = n.y - b.minY;
            const rx = Math.min(st.radius, s.h / 2, s.w / 2);
            parts.push(`<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="${rx}" ry="${rx}" fill="${escapeXml(st.bg)}" stroke="${escapeXml(st.border)}" stroke-width="${st.borderW}"/>`);
            const tx = x + s.w / 2;
            const ty = y + s.h / 2;
            const depth = nodeDepth(n.id);
            const fontSize = depth === 0 ? 14 : (depth >= 2 ? 12 : 13);
            const weight = depth === 0 ? 600 : 400;
            parts.push(`<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${escapeXml(st.text)}">${escapeXml(n.text || '')}</text>`);
        });

        Object.values(stickers).forEach(s => {
            const sz = stickerSize(s);
            const x = s.x - b.minX;
            const y = s.y - b.minY;
            const fill = s.color || STICKER_COLORS[0];
            parts.push(`<rect x="${x}" y="${y}" width="${sz.w}" height="${sz.h}" rx="2" ry="2" fill="${escapeXml(fill)}" stroke="rgba(5,0,56,0.06)" stroke-width="1"/>`);
            const lines = String(s.text || '').split('\n');
            const lineH = 18;
            const startY = y + 20;
            lines.forEach((line, i) => {
                parts.push(`<text x="${x + 12}" y="${startY + i * lineH}" text-anchor="start" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#050038">${escapeXml(line)}</text>`);
            });
        });

        parts.push('</svg>');
        return { svg: parts.join(''), bounds: b };
    }

    function svgToCanvas(svg, width, height, scale) {
        const sc = scale || 2;
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(width * sc);
                canvas.height = Math.ceil(height * sc);
                const ctx = canvas.getContext('2d');
                ctx.setTransform(sc, 0, 0, sc, 0, 0);
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(canvas);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Не удалось растеризовать SVG'));
            };
            img.src = url;
        });
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(resolve => canvas.toBlob(resolve, type, quality));
    }

    function buildPdfFromJpeg(jpegBytes, imgW, imgH) {
        const maxSide = 842;
        const scale = Math.min(1, maxSide / Math.max(imgW, imgH));
        const pageW = Math.max(1, Math.round(imgW * scale));
        const pageH = Math.max(1, Math.round(imgH * scale));
        const encoder = new TextEncoder();
        const parts = [];
        const offsets = [0];

        const push = str => { parts.push(typeof str === 'string' ? encoder.encode(str) : str); };

        push('%PDF-1.4\n');

        const addObj = (num, bodyBytes) => {
            offsets[num] = parts.reduce((a, p) => a + p.length, 0);
            push(`${num} 0 obj\n`);
            push(bodyBytes);
            push('\nendobj\n');
        };

        addObj(1, encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'));
        addObj(2, encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
        addObj(3, encoder.encode(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`
        ));
        const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
        addObj(4, encoder.encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));

        const imgHeader = encoder.encode(
            `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
        );
        const imgFooter = encoder.encode('\nendstream');
        offsets[5] = parts.reduce((a, p) => a + p.length, 0);
        push('5 0 obj\n');
        push(imgHeader);
        push(jpegBytes);
        push(imgFooter);
        push('\nendobj\n');

        const xrefPos = parts.reduce((a, p) => a + p.length, 0);
        let xref = `xref\n0 6\n0000000000 65535 f \n`;
        for (let i = 1; i <= 5; i++) {
            xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
        }
        push(xref);
        push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

        const total = parts.reduce((a, p) => a + p.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        parts.forEach(p => { out.set(p, off); off += p.length; });
        return out;
    }

    async function exportMap(format) {
        if (!Object.keys(nodes).length) {
            alert('На карте нет топиков');
            return;
        }
        try {
            const { svg, bounds } = buildExportSvg();
            if (format === 'svg') {
                downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), exportFileName('svg'));
                return;
            }
            const canvas = await svgToCanvas(svg, bounds.w, bounds.h, 2);
            if (format === 'png') {
                const blob = await canvasToBlob(canvas, 'image/png');
                if (!blob) throw new Error('PNG не создан');
                downloadBlob(blob, exportFileName('png'));
                return;
            }
            if (format === 'pdf') {
                const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
                if (!jpegBlob) throw new Error('JPEG не создан');
                const buf = new Uint8Array(await jpegBlob.arrayBuffer());
                const pdf = buildPdfFromJpeg(buf, canvas.width, canvas.height);
                downloadBlob(new Blob([pdf], { type: 'application/pdf' }), exportFileName('pdf'));
            }
        } catch (err) {
            alert(err.message || 'Ошибка экспорта');
        }
    }

    function focusNode(id) {
        const n = nodes[id];
        if (!n) return;
        selectNode(id, false);
        updateSizes();
        const s = nodeSizes[id] || measure(id);
        const viewW = canvasEl.clientWidth;
        const viewH = canvasEl.clientHeight;
        panX = viewW / 2 - (n.x + s.w / 2) * currentZoom;
        panY = viewH / 2 - (n.y + s.h / 2) * currentZoom;
        applyTransform();
    }

    function outlineLevelClass(level) {
        if (level <= 0) return 'level-0';
        if (level === 1) return 'level-1';
        if (level === 2) return 'level-2';
        return 'level-deep';
    }

    function renderOutline() {
        const box = document.getElementById('outlineContent');
        if (!box) return;
        box.innerHTML = '';
        const root = getRoot();
        if (!root) {
            box.innerHTML = '<div class="outline-empty">Карта пуста</div>';
            return;
        }

        const walk = (n, level) => {
            const item = document.createElement('div');
            item.className = 'outline-item ' + outlineLevelClass(level);
            item.dataset.id = n.id;
            if (selectedIds.has(n.id) || selectedId === n.id) item.classList.add('selected');
            if (n.collapsed) item.classList.add('collapsed');

            const row = document.createElement('div');
            row.className = 'outline-row';
            const kids = sortedChildren(n.id);
            if (kids.length) {
                const fold = document.createElement('button');
                fold.type = 'button';
                fold.className = 'outline-fold' + (n.collapsed ? ' collapsed' : '');
                fold.textContent = n.collapsed ? '+' : '−';
                fold.title = n.collapsed ? 'Развернуть' : 'Свернуть';
                fold.onclick = e => {
                    e.stopPropagation();
                    toggleCollapse(n.id);
                    renderOutline();
                };
                row.appendChild(fold);
            } else {
                const bullet = document.createElement('span');
                bullet.className = 'outline-bullet';
                row.appendChild(bullet);
            }
            const title = document.createElement('div');
            title.className = 'outline-title';
            title.textContent = n.text || 'Без названия';
            if (n.collapsed && kids.length) {
                title.textContent += ' (' + descendantCount(n.id) + ')';
            }
            row.appendChild(title);
            item.appendChild(row);

            if (hasNote(n)) {
                const note = document.createElement('div');
                note.className = 'outline-note';
                note.textContent = String(n.note).trim();
                item.appendChild(note);
            }

            item.onclick = () => {
                closeOutline();
                focusNode(n.id);
            };
            box.appendChild(item);
            if (!n.collapsed) kids.forEach(c => walk(c, level + 1));
        };

        walk(root, 0);
    }

    function openOutline() {
        closeNotePanel();
        closeNoteView();
        document.getElementById('stylePanel')?.classList.remove('open');
        const view = document.getElementById('outlineView');
        view?.classList.remove('hidden');
        view?.setAttribute('aria-hidden', 'false');
        document.getElementById('btnOutline')?.classList.add('active');
        renderOutline();
        if (window.lucide) lucide.createIcons({ nodes: [view], attrs: { 'stroke-width': 1.75 } });
    }

    function closeOutline() {
        const view = document.getElementById('outlineView');
        view?.classList.add('hidden');
        view?.setAttribute('aria-hidden', 'true');
        document.getElementById('btnOutline')?.classList.remove('active');
    }

    function toggleOutline() {
        const view = document.getElementById('outlineView');
        if (!view || view.classList.contains('hidden')) openOutline();
        else closeOutline();
    }

    async function saveBoard(manual) {
        if (!boardId) return;
        if (saveInFlight) {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => saveBoard(manual), 500);
            return;
        }
        saveInFlight = true;
        const token = saveToken;
        const body = JSON.stringify({ title: boardTitle, data: payload() });
        setSaveStatus('Сохранение…', 'saving');
        try {
            const res = await fetch('api/boards.php?id=' + boardId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.detail || 'Ошибка');
            if (token === saveToken) {
                dirty = false;
                setSaveStatus('Сохранено', '');
            } else {
                dirty = true;
                setSaveStatus('Не сохранено', 'dirty');
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => saveBoard(), 400);
            }
            document.title = boardTitle + ' — Mind';
        } catch (err) {
            dirty = true;
            setSaveStatus('Ошибка', 'dirty');
            if (manual) alert(err.message || 'Ошибка сохранения');
            else {
                clearTimeout(saveTimer);
                saveTimer = setTimeout(() => saveBoard(), 3000);
            }
        } finally {
            saveInFlight = false;
        }
    }

    async function loadBoard() {
        if (!boardId) {
            const res = await fetch('api/boards.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Новая доска' })
            });
            const data = await res.json();
            location.replace('board.php?id=' + data.id);
            return;
        }
        const res = await fetch('api/boards.php?id=' + boardId);
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Не найдено');
            location.href = 'index.php';
            return;
        }
        boardTitle = data.title;
        boardTitleEl.value = data.title;
        document.title = data.title + ' — Mind';
        const d = data.data || {};
        if (d.settings) {
            currentLayout = d.settings.layout || 'radial';
            mapMode = d.settings.mapMode === 'fixed' ? 'fixed' : 'free';
            currentShape = 'capsule';
            // миграция старых настроек фона
            if (d.settings.bgMode) {
                bgMode = d.settings.bgMode;
                bgColor = d.settings.bgColor || '#FFFFFF';
            } else if (d.settings.bg && d.settings.bg !== 'miro') {
                bgMode = 'custom';
                const legacy = {
                    white: '#FFFFFF', blueprint: '#EFF6FF', warm: '#FFFBF0',
                    dark: '#1E1E2E', green: '#F0FDF4', rose: '#FFF1F2', slate: '#F1F5F9'
                };
                bgColor = legacy[d.settings.bg] || '#FFFFFF';
            } else {
                bgMode = 'miro';
                bgColor = '#FFFFFF';
            }
            lineMode = d.settings.lineMode || 'theme';
            lineColor = d.settings.lineColor || '#C8C5BE';
            currentLineStyle = d.settings.lineStyle || 'curve';
            topicMode = d.settings.topicMode || 'theme';
            topicColor = d.settings.topicColor || '#FFFFFF';
        }
        if (d.nodes && typeof d.nodes === 'object' && Object.keys(d.nodes).length) {
            nodes = d.nodes;
        } else {
            createInitialMap();
        }
        stickers = (d.stickers && typeof d.stickers === 'object') ? d.stickers : {};
        if (d.viewport) {
            currentZoom = d.viewport.zoom || 1;
            panX = d.viewport.panX ?? 0;
            panY = d.viewport.panY ?? 0;
        }
        document.body.className = `theme-classic shape-capsule ${bgMode === 'custom' ? 'bg-custom' : 'bg-miro'}`;
        document.documentElement.style.setProperty('--node-radius', '999px');
        applyBoardBg();
        renderAll();
        syncLayoutCards();
        syncMapModeUI();
        syncColorUI();
        syncLineStyleCards(currentLineStyle);
        syncShapeCards('capsule');
        applyTransform();
        recordHistory();
        updateUndoButtons();
        const needCenter = !d.viewport || (Number(d.viewport.panX) === 0 && Number(d.viewport.panY) === 0);
        if (needCenter) requestAnimationFrame(centerView);
    }

    function startPan(e) {
        panState = { sx: e.clientX, sy: e.clientY, ox: panX, oy: panY };
        canvasEl.classList.add('cursor-grab', 'panning');
        document.body.classList.add('is-panning');
        e.preventDefault();
    }

    function endPan() {
        if (!panState) return;
        panState = null;
        canvasEl.classList.remove('panning');
        document.body.classList.remove('is-panning');
        if (currentTool !== 'pan' && !spaceHeld) {
            canvasEl.classList.remove('cursor-grab');
        }
        markDirty();
    }

    // —— Events ——
    canvasEl.addEventListener('mousedown', e => {
        if (!document.getElementById('notePopover')?.classList.contains('hidden')) {
            if (!e.target.closest('#notePopover') && !e.target.closest('.node-note-badge')) closeNoteView();
        }
        if (editingId) finishEdit(editingId);

        // средняя кнопка / рука / пробел — панорама (в т.ч. с топика)
        if (e.button === 1 || currentTool === 'pan' || spaceHeld) {
            startPan(e);
            return;
        }

        if (e.target.closest('.node')) return;

        if (currentTool === 'select' && e.button === 0) {
            lassoState = { sx: e.clientX, sy: e.clientY };
            rubberBand.style.display = 'block';
            rubberBand.style.left = e.clientX + 'px';
            rubberBand.style.top = e.clientY + 'px';
            rubberBand.style.width = '0';
            rubberBand.style.height = '0';
        }
    });

    window.addEventListener('mousemove', onPointerMove);
    // убрать автоскролл браузера по средней кнопке
    canvasEl.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
    window.addEventListener('mouseup', onPointerUp);


    canvasEl.addEventListener('wheel', e => {
        e.preventDefault();
        const rect = canvasEl.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    window.addEventListener('keydown', e => {
        if (e.code === 'Space' && !editingId && !e.target.matches('input,textarea,[contenteditable]')) {
            spaceHeld = true;
            canvasEl.classList.add('cursor-grab');
            e.preventDefault();
        }
        if (editingId || e.target.matches('input,textarea,[contenteditable]')) return;
        if (e.key === 'Tab') { e.preventDefault(); addChildToSelected(); }
        else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
        else if (e.key === 'F2') { e.preventDefault(); if (selectedId) startEdit(selectedId, { selectAll: true }); }
        else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (selectedId && nodes[selectedId]) toggleCollapse(selectedId);
        }
        else if (e.key.toLowerCase() === 'v') setTool('select');
        else if (e.key.toLowerCase() === 'h') setTool('pan');
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveBoard(true); }
        else if (e.key === 'Escape') {
            if (!document.getElementById('notePopover')?.classList.contains('hidden')) {
                closeNoteView();
                return;
            }
            if (document.getElementById('notePanel')?.classList.contains('open')) {
                closeNotePanel();
                return;
            }
            if (!document.getElementById('outlineView')?.classList.contains('hidden')) {
                closeOutline();
                return;
            }
            clearSelection();
        }
    });

    window.addEventListener('keyup', e => {
        if (e.code === 'Space') {
            spaceHeld = false;
            if (currentTool !== 'pan') canvasEl.classList.remove('cursor-grab');
        }
    });

    document.querySelectorAll('#leftbar .tool-btn[data-tool]').forEach(b => {
        b.addEventListener('click', () => setTool(b.dataset.tool));
    });
    document.getElementById('btnUndo').onclick = undo;
    document.getElementById('btnRedo').onclick = redo;
    document.getElementById('btnAddTopic').onclick = addChildToSelected;
    document.getElementById('btnAddSticker').onclick = addSticker;
    document.getElementById('btnEdit').onclick = () => selectedId && startEdit(selectedId, { selectAll: true });
    document.getElementById('btnAddRoot').onclick = addRootNode;
    document.getElementById('btnAutoLayout').onclick = autoLayout;
    document.getElementById('btnCenter').onclick = centerView;
    document.getElementById('btnStyle').onclick = () => {
        closeOutline();
        closeNotePanel();
        document.getElementById('stylePanel').classList.toggle('open');
    };
    document.getElementById('btnClosePanel').onclick = () => document.getElementById('stylePanel').classList.remove('open');
    document.getElementById('btnOutline')?.addEventListener('click', toggleOutline);
    document.getElementById('btnCloseOutline')?.addEventListener('click', closeOutline);

    const exportMenu = document.getElementById('exportMenu');
    document.getElementById('btnExport')?.addEventListener('click', e => {
        e.stopPropagation();
        exportMenu?.classList.toggle('hidden');
        if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    });
    exportMenu?.querySelectorAll('[data-export]').forEach(btn => {
        btn.addEventListener('click', () => {
            exportMenu.classList.add('hidden');
            exportMap(btn.dataset.export);
        });
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('#exportWrap')) exportMenu?.classList.add('hidden');
    });

    document.getElementById('btnDelSel').onclick = deleteSelected;
    document.getElementById('btnClearSel').onclick = clearSelection;
    document.getElementById('btnResetStyle').onclick = () => {
        const ids = selectedNodeIds();
        if (!ids.length) return;
        ids.forEach(id => {
            if (!nodes[id]) return;
            delete nodes[id].customStyle;
            delete nodes[id].lineColor;
            delete nodes[id].shape;
            delete nodes[id].layout;
            delete nodes[id].lineStyle;
            const el = world.querySelector(`.node[data-id="${id}"]`);
            if (el) applyTopicAppearance(el, nodes[id]);
        });
        drawLines();
        updateSelectedUI();
        commitChange();
    };
    document.getElementById('zoomIn').onclick = () => zoomBy(1.15);
    document.getElementById('zoomOut').onclick = () => zoomBy(1 / 1.15);
    document.getElementById('zoomFit').onclick = centerView;
    zoomLevelEl.onclick = resetZoom;
    boardTitleEl.onchange = () => {
        boardTitle = boardTitleEl.value.trim() || 'Безымянная доска';
        markDirty();
        saveBoard(true);
    };
    window.addEventListener('beforeunload', e => {
        if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    setTimeout(() => {
        const h = document.getElementById('help');
        if (h) { h.style.opacity = '0'; setTimeout(() => h.remove(), 500); }
    }, 8000);

    initPanels();
    applyTransform();
    loadBoard().catch(err => alert(err.message));
})();
