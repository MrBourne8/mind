window.MIND_LAYOUTS = [
    {
        id: 'radial',
        name: 'Радиальный',
        desc: 'Центр в середине, топики вокруг',
        hint: 'Классическая ментальная карта'
    },
    {
        id: 'top-down',
        name: 'Сверху вниз',
        desc: 'Центр вверху, дочерние ниже',
        hint: 'Как оглавление или оргструктура'
    },
    {
        id: 'bottom-up',
        name: 'Снизу вверх',
        desc: 'Центр внизу, дочерние выше',
        hint: 'Идеи сходятся к итогу'
    },
    {
        id: 'left-right',
        name: 'Слева направо',
        desc: 'Центр слева, дочерние справа',
        hint: 'Как таймлайн или процесс'
    },
    {
        id: 'right-left',
        name: 'Справа налево',
        desc: 'Центр справа, дочерние слева',
        hint: 'Зеркальный процесс'
    },
    {
        id: 'tree-right',
        name: 'Дерево вниз',
        desc: 'Родитель сверху, дети списком снизу',
        hint: 'Как логическая схема XMind'
    }
];

window.buildMindMapSeed = function (layoutId) {
    const layout = layoutId || 'radial';
    const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rootId = uid();
    const a = uid(), b = uid(), c = uid();
    const CX = 3000, CY = 3000;
    let nodes = {};

    if (layout === 'top-down') {
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: CX - 70, y: CY - 220, parentId: null };
        nodes[a] = { id: a, text: 'Идея 1', x: CX - 220, y: CY - 40, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: CX - 40, y: CY - 40, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: CX + 140, y: CY - 40, parentId: rootId };
    } else if (layout === 'bottom-up') {
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: CX - 70, y: CY + 140, parentId: null };
        nodes[a] = { id: a, text: 'Идея 1', x: CX - 220, y: CY - 40, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: CX - 40, y: CY - 40, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: CX + 140, y: CY - 40, parentId: rootId };
    } else if (layout === 'left-right') {
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: CX - 260, y: CY - 20, parentId: null };
        nodes[a] = { id: a, text: 'Идея 1', x: CX + 40, y: CY - 120, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: CX + 40, y: CY - 20, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: CX + 40, y: CY + 80, parentId: rootId };
    } else if (layout === 'right-left') {
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: CX + 160, y: CY - 20, parentId: null };
        nodes[a] = { id: a, text: 'Идея 1', x: CX - 200, y: CY - 120, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: CX - 200, y: CY - 20, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: CX - 200, y: CY + 80, parentId: rootId };
    } else if (layout === 'tree-right') {
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: CX - 80, y: CY - 180, parentId: null };
        nodes[a] = { id: a, text: 'Идея 1', x: CX + 40, y: CY - 100, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: CX + 40, y: CY - 40, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: CX + 40, y: CY + 20, parentId: rootId };
    } else {
        // radial
        nodes[rootId] = { id: rootId, text: 'Центральная идея', x: CX - 70, y: CY - 20, parentId: null };
        nodes[a] = { id: a, text: 'Идея 1', x: CX - 250, y: CY - 160, parentId: rootId };
        nodes[b] = { id: b, text: 'Идея 2', x: CX + 140, y: CY - 160, parentId: rootId };
        nodes[c] = { id: c, text: 'Идея 3', x: CX - 40, y: CY + 140, parentId: rootId };
    }

    nodes[a].order = 0;
    nodes[b].order = 1;
    nodes[c].order = 2;

    return {
        nodes,
        viewport: { zoom: 1, panX: 0, panY: 0 },
        settings: {
            layout,
            shape: 'capsule',
            bgMode: 'miro',
            bgColor: '#FFFFFF'
        }
    };
};

window.layoutPreviewHTML = function (id) {
    if (id === 'top-down') {
        return `<div class="layout-preview">
            <span class="lp-node lp-root" style="left:50%;top:14%;transform:translateX(-50%)"></span>
            <span class="lp-line" style="left:50%;top:28%;width:2px;height:18%;transform:translateX(-50%)"></span>
            <span class="lp-node" style="left:22%;top:55%"></span>
            <span class="lp-node" style="left:50%;top:55%;transform:translateX(-50%)"></span>
            <span class="lp-node" style="left:78%;top:55%;transform:translateX(-50%)"></span>
        </div>`;
    }
    if (id === 'bottom-up') {
        return `<div class="layout-preview">
            <span class="lp-node" style="left:22%;top:22%"></span>
            <span class="lp-node" style="left:50%;top:22%;transform:translateX(-50%)"></span>
            <span class="lp-node" style="left:78%;top:22%;transform:translateX(-50%)"></span>
            <span class="lp-line" style="left:50%;top:40%;width:2px;height:18%;transform:translateX(-50%)"></span>
            <span class="lp-node lp-root" style="left:50%;top:68%;transform:translateX(-50%)"></span>
        </div>`;
    }
    if (id === 'left-right') {
        return `<div class="layout-preview">
            <span class="lp-node lp-root" style="left:18%;top:50%;transform:translateY(-50%)"></span>
            <span class="lp-line" style="left:38%;top:50%;width:16%;height:2px;transform:translateY(-50%)"></span>
            <span class="lp-node" style="left:68%;top:22%"></span>
            <span class="lp-node" style="left:68%;top:50%;transform:translateY(-50%)"></span>
            <span class="lp-node" style="left:68%;top:72%"></span>
        </div>`;
    }
    if (id === 'right-left') {
        return `<div class="layout-preview">
            <span class="lp-node" style="left:18%;top:22%"></span>
            <span class="lp-node" style="left:18%;top:50%;transform:translateY(-50%)"></span>
            <span class="lp-node" style="left:18%;top:72%"></span>
            <span class="lp-line" style="left:42%;top:50%;width:16%;height:2px;transform:translateY(-50%)"></span>
            <span class="lp-node lp-root" style="left:72%;top:50%;transform:translateY(-50%)"></span>
        </div>`;
    }
    if (id === 'tree-right') {
        return `<div class="layout-preview">
            <span class="lp-node lp-root" style="left:28%;top:12%;transform:translateX(-50%)"></span>
            <span class="lp-line" style="left:28%;top:28%;width:2px;height:52%;transform:translateX(-50%)"></span>
            <span class="lp-line" style="left:28%;top:40%;width:28%;height:2px"></span>
            <span class="lp-line" style="left:28%;top:58%;width:28%;height:2px"></span>
            <span class="lp-line" style="left:28%;top:76%;width:28%;height:2px"></span>
            <span class="lp-node" style="left:62%;top:34%"></span>
            <span class="lp-node" style="left:62%;top:52%"></span>
            <span class="lp-node" style="left:62%;top:70%"></span>
        </div>`;
    }
    // radial
    return `<div class="layout-preview">
        <span class="lp-node lp-root" style="left:50%;top:50%;transform:translate(-50%,-50%)"></span>
        <span class="lp-node" style="left:22%;top:22%"></span>
        <span class="lp-node" style="left:72%;top:22%"></span>
        <span class="lp-node" style="left:22%;top:72%"></span>
        <span class="lp-node" style="left:72%;top:72%"></span>
    </div>`;
};
