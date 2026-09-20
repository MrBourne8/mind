const API = 'api/boards.php';

const grid = document.getElementById('boardsGrid');
const empty = document.getElementById('boardsEmpty');
const renameModal = document.getElementById('renameModal');
const renameInput = document.getElementById('renameInput');
const templateModal = document.getElementById('templateModal');
const templateGrid = document.getElementById('templateGrid');

let renameId = null;
let selectedLayout = 'radial';

async function api(url, opts = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
}

function fmtDate(s) {
    try {
        return new Date(s.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return s;
    }
}

function openTemplateModal() {
    selectedLayout = 'radial';
    renderTemplateCards();
    templateModal.classList.remove('hidden');
}

function renderTemplateCards() {
    templateGrid.innerHTML = '';
    (window.MIND_LAYOUTS || []).forEach(l => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'template-card' + (l.id === selectedLayout ? ' active' : '');
        card.innerHTML = `
            ${window.layoutPreviewHTML(l.id)}
            <div class="name">${l.name}</div>
            <div class="desc">${l.desc}</div>`;
        card.addEventListener('click', () => {
            selectedLayout = l.id;
            renderTemplateCards();
        });
        templateGrid.appendChild(card);
    });
}

async function createBoard() {
    const seed = window.buildMindMapSeed(selectedLayout);
    const title = (window.MIND_LAYOUTS.find(l => l.id === selectedLayout) || {}).name;
    const data = await api(API, {
        method: 'POST',
        body: JSON.stringify({
            title: 'Карта · ' + (title || 'Новая'),
            data: seed
        })
    });
    templateModal.classList.add('hidden');
    location.href = 'board.php?id=' + data.id;
}

async function loadBoards() {
    const { boards } = await api(API);
    grid.querySelectorAll('.board-card').forEach(el => el.remove());
    empty.style.display = boards.length ? 'none' : 'block';

    boards.forEach(b => {
        const a = document.createElement('a');
        a.className = 'board-card';
        a.href = 'board.php?id=' + b.id;
        a.innerHTML = `
            <div class="board-preview"></div>
            <div class="board-meta">
                <h3>${escapeHtml(b.title)}</h3>
                <time>${fmtDate(b.updated_at)}</time>
                <div class="board-card-actions">
                    <button type="button" data-rename="${b.id}">Переименовать</button>
                    <button type="button" class="danger" data-del="${b.id}">Удалить</button>
                </div>
            </div>`;
        a.querySelector('[data-rename]').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            renameId = b.id;
            renameInput.value = b.title;
            renameModal.classList.remove('hidden');
            renameInput.focus();
        });
        a.querySelector('[data-del]').addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            if (!confirm('Удалить доску «' + b.title + '»?')) return;
            await api(API + '?id=' + b.id, { method: 'DELETE' });
            loadBoards();
        });
        grid.appendChild(a);
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

document.getElementById('btnNew').addEventListener('click', openTemplateModal);
document.getElementById('btnNewHero').addEventListener('click', openTemplateModal);
document.getElementById('templateCancel').addEventListener('click', () => templateModal.classList.add('hidden'));
document.getElementById('templateCreate').addEventListener('click', () => {
    createBoard().catch(err => alert(err.message));
});
document.getElementById('renameCancel').addEventListener('click', () => renameModal.classList.add('hidden'));
document.getElementById('renameSave').addEventListener('click', async () => {
    if (!renameId) return;
    await api(API + '?id=' + renameId, {
        method: 'PUT',
        body: JSON.stringify({ title: renameInput.value.trim() || 'Безымянная доска' })
    });
    renameModal.classList.add('hidden');
    loadBoards();
});

loadBoards().catch(err => {
    empty.textContent = 'Ошибка загрузки: ' + err.message;
    empty.style.display = 'block';
});
