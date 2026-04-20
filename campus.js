requireAuth({ allowRoles: ['editor', 'admin'], redirectTo: 'login.html' });

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBxDaIIhmWJOB6w6Jg6Ch6a2-b_5HvJTWw",
    authDomain: "english-fun-1937c.firebaseapp.com",
    databaseURL: "https://english-fun-1937c-default-rtdb.firebaseio.com",
    projectId: "english-fun-1937c",
    storageBucket: "english-fun-1937c.firebasestorage.app",
    messagingSenderId: "236020730818",
    appId: "1:236020730818:web:4ebb378dc7a7005d2fa45b"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const surveysRef = database.ref('surveys_ATTT');

const urlParams = new URLSearchParams(window.location.search);
const customerId = urlParams.get('customerId') || 'unknown';
const customerName = urlParams.get('customerName') || 'Khách hàng chưa rõ';

const customerLabel = document.getElementById('customerLabel');
customerLabel.innerText = `Khách hàng: ${customerName}`;

const surveyNoteCard = document.getElementById('surveyNoteCard');
const surveyNoteInput = document.getElementById('surveyNoteInput');
const btnSaveSurveyNote = document.getElementById('btnSaveSurveyNote');
const surveyNoteSaveStatus = document.getElementById('surveyNoteSaveStatus');

const canvas = document.getElementById('canvas');
const gate = document.getElementById('gate');
const linkLayer = document.getElementById('linkLayer');
const btnBack = document.getElementById('btnBack');
const btnSave = document.getElementById('btnSave');
const btnReset = document.getElementById('btnReset');

const embedOverlay = document.getElementById('embedOverlay');
const embedFrame = document.getElementById('embedFrame');
const embedTitle = document.getElementById('embedTitle');
const btnCloseEmbed = document.getElementById('btnCloseEmbed');

const btnAddISP = document.getElementById('btnAddISP');
const btnAddLB = document.getElementById('btnAddLB');
const btnDrawLink = document.getElementById('btnDrawLink');
const btnDeleteLink = document.getElementById('btnDeleteLink');
const btnClearLinks = document.getElementById('btnClearLinks');

btnBack.addEventListener('click', () => window.location.href = 'list.html');

let buildingsArray = [];
let layout = { buildings: {}, buildingSizes: {}, gate: null, network: { nodes: [], links: [] } };

let drawMode = false;
let deleteLinkMode = false;
let pendingLinkFrom = null; // { type: 'net'|'building'|'gate', id: string }

let currentEmbedBuildingId = null;

let noteSaveTimeout = null;

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function snap(val, step = 12) {
    return Math.round(val / step) * step;
}

function getCanvasRect() {
    return canvas.getBoundingClientRect();
}

function getDefaultPosition(idx) {
    // spread from top-left
    const padding = 16;
    const perRow = Math.max(1, Math.floor((getCanvasRect().width - padding * 2) / 180));
    const row = Math.floor(idx / perRow);
    const col = idx % perRow;
    return { x: padding + col * 180, y: padding + row * 120 };
}

function getDefaultNetPosition() {
    const padding = 16;
    return { x: padding, y: padding };
}

function buildBlock(bldg, idx) {
    const div = document.createElement('div');
    div.className = 'building-block';
    div.dataset.id = bldg.id;
    const eqs = Array.isArray(bldg.equipments) ? bldg.equipments : [];
    const nodes = Array.isArray(bldg.nodes) ? bldg.nodes : [];
    const floorCount = new Set(nodes.map(n => n && n.floor !== undefined ? Number(n.floor) : null).filter(v => v !== null && !Number.isNaN(v))).size;
    const ispLines = eqs
        .map(e => (e && e.isp ? String(e.isp).trim() : ''))
        .filter(v => v !== '');

    // Đếm số "đường" theo số thiết bị có ISP (line thực tế)
    const ispCount = ispLines.length;

    // Danh sách nhà mạng unique (không phân biệt hoa/thường), nhưng giữ label gốc
    const providerMap = new Map(); // lower -> original
    ispLines.forEach(v => {
        const key = v.toLowerCase();
        if (!providerMap.has(key)) providerMap.set(key, v);
    });
    const ispProviders = Array.from(providerMap.values());

    const ispText = ispCount > 0
        ? `🌐 ISP: ${ispCount} (${ispProviders.join(', ')})`
        : `🌐 ISP: 0`;

    const note = bldg.mainNetworkNotes ? String(bldg.mainNetworkNotes).trim() : '';
    const noteShort = note ? note : 'Không có ghi chú tòa nhà';
    const tooltip = `${bldg.name || 'Tòa nhà'}\n${ispText}${note ? `\n📝 ${note}` : ''}`.trim();

    div.title = tooltip;
    div.innerHTML = `
        <div class="edit-btn" title="Sửa tòa nhà">✎</div>
        <div class="resize-handle" title="Kéo để đổi kích thước">↘</div>
        <div class="building-name">🏢 ${bldg.name || 'Tòa nhà'}</div>
        <div class="building-sub">🏬 ${floorCount} tầng • ${(nodes || []).length} khu vực • ${eqs.length} thiết bị</div>
        <div class="building-sub" style="margin-top:6px;">${ispText}</div>
        <div class="building-note" title="${tooltip}">📝 ${noteShort}</div>
    `;

    // Apply saved size if any
    if (layout.buildingSizes && layout.buildingSizes[bldg.id]) {
        const s = layout.buildingSizes[bldg.id];
        if (s && s.w) div.style.width = `${s.w}px`;
        if (s && s.h) div.style.height = `${s.h}px`;
    }

    const pos = layout.buildings[bldg.id] || getDefaultPosition(idx);
    setBlockPos(div, pos.x, pos.y);

    makeDraggable(div, (x, y) => setBlockPos(div, x, y));

    // Resize handle
    const handle = div.querySelector('.resize-handle');
    if (handle) {
        handle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            startResizeBuilding(div, bldg.id, e);
        });
    }
    return div;
}

function startResizeBuilding(el, buildingId, startEvent) {
    if (!el) return;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const minW = 140;
    const minH = 80;
    const rect = getCanvasRect();

    const move = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const nextW = clamp(snap(startW + dx, 6), minW, rect.width - 12);
        const nextH = clamp(snap(startH + dy, 6), minH, rect.height - 12);
        el.style.width = `${nextW}px`;
        el.style.height = `${nextH}px`;
        if (!layout.buildingSizes) layout.buildingSizes = {};
        layout.buildingSizes[buildingId] = { w: nextW, h: nextH };
        renderLinks();
    };

    const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        saveToLocal();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
}

function openBuildingEmbed(buildingId, buildingName) {
    if (!embedOverlay || !embedFrame) return;
    currentEmbedBuildingId = buildingId;
    if (embedTitle) embedTitle.innerText = `Chỉnh sửa: ${buildingName || 'Tòa nhà'}`;
    // Load building editor in embed mode and focus buildingId
    embedFrame.src = `building.html?customerId=${encodeURIComponent(customerId)}&customerName=${encodeURIComponent(customerName)}&embed=1&buildingId=${encodeURIComponent(buildingId)}`;
    embedOverlay.classList.add('active');
}

function closeBuildingEmbed() {
    if (!embedOverlay || !embedFrame) return;
    embedOverlay.classList.remove('active');
    embedFrame.src = 'about:blank';
    currentEmbedBuildingId = null;
    // Reload data to refresh counts/notes after edits
    loadData();
}

if (btnCloseEmbed) {
    btnCloseEmbed.addEventListener('click', closeBuildingEmbed);
}
if (embedOverlay) {
    embedOverlay.addEventListener('click', (e) => {
        if (e.target === embedOverlay) closeBuildingEmbed();
    });
}
window.addEventListener('message', (e) => {
    if (!e || !e.data) return;
    if (e.data.type === 'BUILDING_EMBED_CLOSE') {
        closeBuildingEmbed();
    }
});

function setBlockPos(el, x, y) {
    // Keep inside canvas (leave small margin)
    const rect = getCanvasRect();
    const maxX = rect.width - el.offsetWidth - 12;
    const maxY = rect.height - el.offsetHeight - 12;

    const nx = clamp(snap(x), 12, Math.max(12, maxX));
    const ny = clamp(snap(y), 12, Math.max(12, maxY));

    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;

    layout.buildings[el.dataset.id] = { x: nx, y: ny };
}

function setGatePos(x, y) {
    if (!gate) return;
    const rect = getCanvasRect();
    const maxX = rect.width - gate.offsetWidth - 12;
    const maxY = rect.height - gate.offsetHeight - 12;
    const nx = clamp(snap(x), 12, Math.max(12, maxX));
    const ny = clamp(snap(y), 12, Math.max(12, maxY));
    gate.style.left = `${nx}px`;
    gate.style.top = `${ny}px`;
    gate.style.bottom = ''; // switch to top/left positioning
    layout.gate = { x: nx, y: ny };
}

function makeDraggable(el, onDrag) {
    let dragging = false;
    let startX = 0, startY = 0;
    let baseLeft = 0, baseTop = 0;

    const onDown = (e) => {
        // Nếu click vào nút xóa thì không kích hoạt kéo
        if (e.target && e.target.closest && e.target.closest('.delete-x')) {
            return;
        }
        dragging = true;
        el.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        baseLeft = parseFloat(el.style.left || '0');
        baseTop = parseFloat(el.style.top || '0');
    };

    const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (typeof onDrag === 'function') onDrag(baseLeft + dx, baseTop + dy);
    };

    const onUp = () => {
        dragging = false;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
}

function ensureNetwork() {
    if (!layout.network) layout.network = { nodes: [], links: [] };
    if (!Array.isArray(layout.network.nodes)) layout.network.nodes = [];
    if (!Array.isArray(layout.network.links)) layout.network.links = [];

    // Migrate legacy links: {from:'nodeId', to:'nodeId'} -> {from:{type:'net',id}, to:{type:'net',id}}
    layout.network.links = layout.network.links
        .map(l => {
            if (l && typeof l.from === 'string' && typeof l.to === 'string') {
                return { id: l.id || genId('lnk'), from: { type: 'net', id: l.from }, to: { type: 'net', id: l.to } };
            }
            return l;
        })
        .filter(l => l && l.from && l.to && l.from.id && l.to.id);
}

function genId(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function getCenter(el) {
    const r = el.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    return { x: (r.left - cr.left) + r.width / 2, y: (r.top - cr.top) + r.height / 2 };
}

function setNetNodePos(nodeId, x, y) {
    const el = canvas.querySelector(`.net-node[data-id="${nodeId}"]`);
    if (!el) return;
    const rect = getCanvasRect();
    const maxX = rect.width - el.offsetWidth - 12;
    const maxY = rect.height - el.offsetHeight - 12;
    const nx = clamp(snap(x), 12, Math.max(12, maxX));
    const ny = clamp(snap(y), 12, Math.max(12, maxY));
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
    const node = layout.network.nodes.find(n => n.id === nodeId);
    if (node) { node.x = nx; node.y = ny; }
    renderLinks();
}

function buildNetNode(node) {
    const el = document.createElement('div');
    el.className = `net-node ${node.kind}`;
    el.dataset.id = node.id;
    el.dataset.type = 'net';
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.innerHTML = `
        <div class="delete-x" title="Xóa node này">×</div>
        <div class="net-title">${node.title}</div>
        <div class="net-kind">${node.subtitle}</div>
    `;

    makeDraggable(el, (x, y) => setNetNodePos(node.id, x, y));

    const del = el.querySelector('.delete-x');
    if (del) {
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteNetworkNode(node.id);
        });
    }

    el.addEventListener('click', (e) => {
        // In draw mode: create link by clicking two items
        if (!drawMode) return;
        e.stopPropagation();
        handleItemClickForLink({ type: 'net', id: node.id });
    });

    return el;
}

function deleteNetworkNode(nodeId) {
    ensureNetwork();
    const node = layout.network.nodes.find(n => n.id === nodeId);
    const name = node ? node.title : 'node';
    if (!confirm(`Xóa ${name}? Các dây nối liên quan cũng sẽ bị xóa.`)) return;

    layout.network.nodes = layout.network.nodes.filter(n => n.id !== nodeId);
    layout.network.links = layout.network.links.filter(l =>
        !(l.from.type === 'net' && l.from.id === nodeId) &&
        !(l.to.type === 'net' && l.to.id === nodeId)
    );
    pendingLinkFrom = null;
    saveToLocal();
    render();
}

function handleItemClickForLink(item) {
    ensureNetwork();
    const clearSelected = () => {
        Array.from(canvas.querySelectorAll('.selected')).forEach(n => n.classList.remove('selected'));
    };

    const getEl = (it) => {
        if (!it) return null;
        if (it.type === 'net') return canvas.querySelector(`.net-node[data-id="${it.id}"]`);
        if (it.type === 'building') return canvas.querySelector(`.building-block[data-id="${it.id}"]`);
        if (it.type === 'gate') return gate;
        return null;
    };

    if (!pendingLinkFrom) {
        pendingLinkFrom = item;
        clearSelected();
        const el = getEl(item);
        if (el) el.classList.add('selected');
        return;
    }

    if (pendingLinkFrom.type === item.type && pendingLinkFrom.id === item.id) {
        pendingLinkFrom = null;
        clearSelected();
        return;
    }

    const from = pendingLinkFrom;
    const to = item;

    // Prevent duplicates (undirected)
    const exists = layout.network.links.some(l =>
        (l.from.type === from.type && l.from.id === from.id && l.to.type === to.type && l.to.id === to.id) ||
        (l.from.type === to.type && l.from.id === to.id && l.to.type === from.type && l.to.id === from.id)
    );
    if (!exists) {
        layout.network.links.push({ id: genId('lnk'), from, to });
        saveToLocal();
    }

    pendingLinkFrom = null;
    clearSelected();
    renderLinks();
}

function renderLinks() {
    if (!linkLayer) return;
    ensureNetwork();
    // Clear
    linkLayer.innerHTML = '';
    // Ensure correct viewBox
    const rect = getCanvasRect();
    linkLayer.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

    layout.network.links.forEach(l => {
        const resolveEl = (it) => {
            if (!it) return null;
            if (it.type === 'net') return canvas.querySelector(`.net-node[data-id="${it.id}"]`);
            if (it.type === 'building') return canvas.querySelector(`.building-block[data-id="${it.id}"]`);
            if (it.type === 'gate') return gate;
            return null;
        };
        const a = resolveEl(l.from);
        const b = resolveEl(l.to);
        if (!a || !b) return;
        const ca = getCenter(a);
        const cb = getCenter(b);

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.dataset.id = l.id;
        line.setAttribute('x1', String(ca.x));
        line.setAttribute('y1', String(ca.y));
        line.setAttribute('x2', String(cb.x));
        line.setAttribute('y2', String(cb.y));
        line.setAttribute('stroke', deleteLinkMode ? 'rgba(239, 68, 68, 0.75)' : 'rgba(15, 23, 42, 0.55)');
        line.setAttribute('stroke-width', deleteLinkMode ? '6' : '3');
        line.setAttribute('stroke-linecap', 'round');
        if (deleteLinkMode) {
            line.style.pointerEvents = 'stroke';
            line.style.cursor = 'pointer';
            line.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteLinkById(l.id);
            });
        }
        linkLayer.appendChild(line);
    });
}

function deleteLinkById(linkId) {
    ensureNetwork();
    const link = layout.network.links.find(l => l.id === linkId);
    if (!link) return;
    if (!confirm('Xóa dây nối này?')) return;
    layout.network.links = layout.network.links.filter(l => l.id !== linkId);
    saveToLocal();
    renderLinks();
}

function render() {
    // Remove old blocks (keep gate)
    Array.from(canvas.querySelectorAll('.building-block')).forEach(n => n.remove());
    Array.from(canvas.querySelectorAll('.net-node')).forEach(n => n.remove());

    buildingsArray.forEach((b, idx) => {
        // Ensure stable id
        if (!b.id) b.id = `bldg_${idx}`;
        const block = buildBlock(b, idx);
        block.dataset.type = 'building';
        // Click behavior:
        // - drawMode: click block to link
        // - normal: do NOT open modal (to allow drag). Open modal via edit button or long-press.
        block.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteLinkMode) return;
            if (drawMode) {
                handleItemClickForLink({ type: 'building', id: b.id });
            }
        });

        // Edit button: open modal
        const editBtn = block.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (drawMode || deleteLinkMode) return;
                openBuildingEmbed(b.id, b.name);
            });
            // prevent drag start from edit button
            editBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
            });
        }

        // Long-press anywhere on block (mobile friendly) to open modal
        let lpTimer = null;
        let lpStart = null;
        const clearLP = () => {
            if (lpTimer) clearTimeout(lpTimer);
            lpTimer = null;
            lpStart = null;
        };
        block.addEventListener('pointerdown', (e) => {
            if (drawMode || deleteLinkMode) return;
            if (e.target && e.target.closest && e.target.closest('.edit-btn')) return;
            lpStart = { x: e.clientX, y: e.clientY };
            lpTimer = setTimeout(() => {
                openBuildingEmbed(b.id, b.name);
                clearLP();
            }, 550);
        });
        block.addEventListener('pointermove', (e) => {
            if (!lpTimer || !lpStart) return;
            const dx = e.clientX - lpStart.x;
            const dy = e.clientY - lpStart.y;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
                clearLP(); // user is dragging
            }
        });
        block.addEventListener('pointerup', clearLP);
        block.addEventListener('pointercancel', clearLP);

        canvas.appendChild(block);
    });

    // Gate position
    if (gate) {
        makeDraggable(gate, (x, y) => setGatePos(x, y));
        gate.addEventListener('click', (e) => {
            if (!drawMode) return;
            e.stopPropagation();
            handleItemClickForLink({ type: 'gate', id: 'gate' });
        });
        const rect = getCanvasRect();
        const defaultGate = { x: 12, y: rect.height - 12 - 64 };
        const pos = layout.gate || defaultGate;
        // ensure gate has dimensions computed
        requestAnimationFrame(() => setGatePos(pos.x, pos.y));
    }

    // Network nodes
    ensureNetwork();
    layout.network.nodes.forEach(n => {
        const nodeEl = buildNetNode(n);
        canvas.appendChild(nodeEl);
    });

    renderLinks();
}

function loadFromLocal() {
    const local = localStorage.getItem(`CAMPUS_LAYOUT_${customerId}`);
    if (local) {
        try { layout = JSON.parse(local) || { buildings: {}, buildingSizes: {}, gate: null, network: { nodes: [], links: [] } }; } catch { /* ignore */ }
    }
}

function saveToLocal() {
    localStorage.setItem(`CAMPUS_LAYOUT_${customerId}`, JSON.stringify(layout));
}

async function loadData() {
    if (customerId === 'unknown') {
        alert('Thiếu customerId.');
        window.location.href = 'list.html';
        return;
    }

    loadFromLocal();

    const snap = await surveysRef.child(customerId).once('value');
    const survey = snap.val();
    if (!survey) {
        alert('Không tìm thấy khảo sát.');
        window.location.href = 'list.html';
        return;
    }

    // Hiển thị ghi chú khảo sát (Mục V trên index)
    const localNote = localStorage.getItem(`CAMPUS_SURVEY_NOTE_${customerId}`);
    const note = (survey.de_xuat !== undefined && survey.de_xuat !== null)
        ? String(survey.de_xuat).trim()
        : (localNote ? String(localNote).trim() : '');
    if (surveyNoteCard && surveyNoteInput) {
        surveyNoteCard.style.display = 'block';
        surveyNoteInput.value = note || '';
    }

    buildingsArray = Array.isArray(survey.buildingsArray) ? survey.buildingsArray : [];
    if (!buildingsArray) buildingsArray = [];

    // Load remote layout if exists
    if (survey.campusLayout && typeof survey.campusLayout === 'object') {
        layout = survey.campusLayout;
        if (!layout.buildings) layout.buildings = {};
        if (!layout.buildingSizes) layout.buildingSizes = {};
        if (!layout.gate) layout.gate = null;
        ensureNetwork();
        saveToLocal();
    } else {
        if (!layout.buildings) layout.buildings = {};
        if (!layout.buildingSizes) layout.buildingSizes = {};
        if (!layout.gate) layout.gate = null;
        ensureNetwork();
    }

    render();
}

async function saveSurveyNote() {
    if (customerId === 'unknown' || !surveyNoteInput) return;
    const val = String(surveyNoteInput.value || '').trim();

    // Local backup for offline
    localStorage.setItem(`CAMPUS_SURVEY_NOTE_${customerId}`, val);

    if (!navigator.onLine) {
        alert('Đang offline: đã lưu ghi chú tạm vào máy. Khi có mạng hãy mở lại để đồng bộ.');
        return;
    }
    try {
        await surveysRef.child(customerId).child('de_xuat').set(val);
        if (surveyNoteSaveStatus) {
            surveyNoteSaveStatus.style.display = 'inline';
            clearTimeout(noteSaveTimeout);
            noteSaveTimeout = setTimeout(() => { surveyNoteSaveStatus.style.display = 'none'; }, 2500);
        }
    } catch (e) {
        alert('Lỗi lưu ghi chú: ' + (e && e.message ? e.message : e));
    }
}

if (btnSaveSurveyNote) {
    btnSaveSurveyNote.addEventListener('click', saveSurveyNote);
}

btnReset.addEventListener('click', () => {
    if (!confirm('Reset bố trí về mặc định?')) return;
    layout = { buildings: {}, buildingSizes: {}, gate: null, network: { nodes: [], links: [] } };
    saveToLocal();
    render();
});

btnSave.addEventListener('click', async () => {
    if (customerId === 'unknown') return;
    saveToLocal();

    if (!navigator.onLine) {
        alert('Đang offline: đã lưu tạm vào máy. Khi có mạng hãy mở lại để đồng bộ.');
        return;
    }
    try {
        await surveysRef.child(customerId).child('campusLayout').set(layout);
        alert('Đã lưu bố trí thành công!');
    } catch (e) {
        alert('Lỗi lưu: ' + (e && e.message ? e.message : e));
    }
});

// Re-render on resize to keep within bounds
window.addEventListener('resize', () => {
    // clamp all blocks into current canvas
    Array.from(canvas.querySelectorAll('.building-block')).forEach(el => {
        const id = el.dataset.id;
        const pos = layout.buildings[id] || { x: 12, y: 12 };
        setBlockPos(el, pos.x, pos.y);
    });

    if (gate) {
        const rect = getCanvasRect();
        const defaultGate = { x: 12, y: rect.height - 12 - gate.offsetHeight };
        const pos = layout.gate || defaultGate;
        setGatePos(pos.x, pos.y);
    }

    renderLinks();
});

// ===== Toolbar actions =====
function addNetworkNode(kind) {
    ensureNetwork();
    const id = genId('n');
    const base = getDefaultNetPosition();
    const node = {
        id,
        kind,
        title: kind === 'isp' ? '🌐 Internet' : '⚖️ CBT',
        subtitle: '',
        x: base.x + layout.network.nodes.length * 18,
        y: base.y + layout.network.nodes.length * 18
    };
    layout.network.nodes.push(node);
    saveToLocal();
    const nodeEl = buildNetNode(node);
    canvas.appendChild(nodeEl);
    renderLinks();
}

btnAddISP.addEventListener('click', () => addNetworkNode('isp'));
btnAddLB.addEventListener('click', () => addNetworkNode('lb'));

btnDrawLink.addEventListener('click', () => {
    drawMode = !drawMode;
    if (drawMode) deleteLinkMode = false;
    pendingLinkFrom = null;
    Array.from(canvas.querySelectorAll('.selected')).forEach(n => n.classList.remove('selected'));
    btnDrawLink.innerText = `Chế độ vẽ dây: ${drawMode ? 'BẬT' : 'TẮT'}`;
    btnDrawLink.classList.toggle('active', drawMode);
    if (btnDeleteLink) {
        btnDeleteLink.innerText = `Chế độ xóa dây: ${deleteLinkMode ? 'BẬT' : 'TẮT'}`;
        btnDeleteLink.classList.toggle('active', deleteLinkMode);
    }
    renderLinks();
});

if (btnDeleteLink) {
    btnDeleteLink.addEventListener('click', () => {
        deleteLinkMode = !deleteLinkMode;
        if (deleteLinkMode) drawMode = false;
        pendingLinkFrom = null;
        Array.from(canvas.querySelectorAll('.selected')).forEach(n => n.classList.remove('selected'));
        btnDeleteLink.innerText = `Chế độ xóa dây: ${deleteLinkMode ? 'BẬT' : 'TẮT'}`;
        btnDeleteLink.classList.toggle('active', deleteLinkMode);
        if (btnDrawLink) {
            btnDrawLink.innerText = `Chế độ vẽ dây: ${drawMode ? 'BẬT' : 'TẮT'}`;
            btnDrawLink.classList.toggle('active', drawMode);
        }
        renderLinks();
    });
}

btnClearLinks.addEventListener('click', () => {
    ensureNetwork();
    if (!confirm('Xóa tất cả dây nối?')) return;
    layout.network.links = [];
    saveToLocal();
    renderLinks();
});

// Click canvas to cancel pending
canvas.addEventListener('click', () => {
    if (!drawMode) return;
    pendingLinkFrom = null;
    Array.from(canvas.querySelectorAll('.selected')).forEach(n => n.classList.remove('selected'));
});

loadData();

