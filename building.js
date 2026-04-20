// Trạng thái bộ nhớ tạm thời cho Mock Data
const auth = requireAuth({ allowRoles: ['editor', 'admin'], redirectTo: 'login.html' });

const APPS_SCRIPT_UPLOAD_URL = "https://script.google.com/macros/s/AKfycbzVMCrL3TihVkhqUzOOUurYAhTvzjjXhiiwmdepU1kySfMgJC-sCdP87Kp95h24-pvIow/exec";

let buildingsArray = []; // Mảng chứa nhiều Tòa nhà
let buildingData = {
    id: null,
    name: "Tòa A",
    nodes: [], // Danh sách phòng / hành lang
    equipments: [], // Danh sách thiết bị
    photos: [] // Mảng ảnh tòa nhà (MỚI)
};

let currentSelectedNodeId = null;

const buildingsListSection = document.getElementById("buildingsListSection");
const buildingsListContainer = document.getElementById("buildingsListContainer");
const buildingsZeroState = document.getElementById("buildingsZeroState");
const btnShowSetup = document.getElementById("btnShowSetup");
const btnBackToList = document.getElementById("btnBackToList");
const btnBackToMain = document.getElementById("btnBackToMain");

const setupSection = document.getElementById("setupSection");
const mapSection = document.getElementById("mapSection");
const floorsContainer = document.getElementById("floorsContainer");

const roomDrawer = document.getElementById("roomDrawer");
const drawerRoomNameInput = document.getElementById("drawerRoomNameInput");
const roomNotes = document.getElementById("roomNotes");
let lastFocusedQuickTextArea = 'quickLeftRooms';

const roomCompletedToggle = document.getElementById("roomCompletedToggle");
const btnCloseDrawer = document.getElementById("btnCloseDrawer");
const equipmentsList = document.getElementById("equipmentsList");
const equipmentCountBadge = document.getElementById("equipmentCountBadge");

const mainNetworkNotes = document.getElementById("mainNetworkNotes");
const networkNoteSaveStatus = document.getElementById("networkNoteSaveStatus");
let networkNoteTimeout = null;

// Khởi tạo Datalist Gợi ý từ Firebase
let userSuggestions = {
    rooms: [
        "Phòng Kế toán", "Phòng Chủ tịch", "Phòng Phó Chủ tịch",
        "Phòng Tiếp dân", "Phòng Tư pháp", "Phòng Địa chính",
        "Công an xã", "Kho"
    ],
    eqNames: [],
    eqModels: [],
    eqLocations: [],
    eqISPs: []
};

// Cấu hình Firebase 
const firebaseConfig = {
    apiKey: "AIzaSyBxDaIIhmWJOB6w6Jg6Ch6a2-b_5HvJTWw",
    authDomain: "english-fun-1937c.firebaseapp.com",
    databaseURL: "https://english-fun-1937c-default-rtdb.firebaseio.com",
    projectId: "english-fun-1937c",
    storageBucket: "english-fun-1937c.firebasestorage.app",
    messagingSenderId: "236020730818",
    appId: "1:236020730818:web:4ebb378dc7a7005d2fa45b"
};

// Khởi tạo Firebase nếu chưa có
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const suggestionsRef = database.ref('suggestions_ATTT');
const surveysRef = database.ref('surveys_ATTT');

// Lắng nghe dữ liệu Gợi ý từ API tập trung
suggestionsRef.on('value', (snapshot) => {
    if (snapshot.exists()) {
        const val = snapshot.val();
        // Nếu val.rooms undefined (vd trống trên DB), ta không đè bằng [] liền mà có thể dùng mặc định, 
        // nhưng để cho phép user xóa hết, ta lấy val.rooms. 
        // Nếu chưa từng có rooms node, ta khởi tạo lần đầu lên Firebase
        if (val.rooms === undefined && snapshot.child('eqNames').exists()) {
            // Có nhánh khác nhưng mất nhánh rooms (có thể do xóa hết)
            userSuggestions.rooms = [];
        } else if (val.rooms !== undefined) {
            userSuggestions.rooms = val.rooms;
        } else {
            // Mới tinh
            suggestionsRef.child('rooms').set(userSuggestions.rooms);
        }

        userSuggestions.eqNames = val.eqNames || [];
        userSuggestions.eqModels = val.eqModels || [];
        userSuggestions.eqLocations = val.eqLocations || [];
        userSuggestions.eqISPs = val.eqISPs || [];
        localStorage.setItem('CACHED_SUGGESTIONS', JSON.stringify(userSuggestions));
        populateDataLists();
    } else {
        // Firebase suggest completely empty
        suggestionsRef.set(userSuggestions);
    }
});

// ===== GLOBAL EQUIPMENT DICTIONARY =====
let globalEquipmentsDictionary = [];
surveysRef.once('value', snapshot => {
    if (snapshot.exists()) {
        const allCustomers = snapshot.val();
        Object.values(allCustomers).forEach(customerData => {
            const bArr = customerData.buildingsArray;
            if (bArr) {
                const bList = Array.isArray(bArr) ? bArr : Object.values(bArr);
                bList.forEach(b => {
                    if (b.equipments) {
                        const eqList = Array.isArray(b.equipments) ? b.equipments : Object.values(b.equipments);
                        eqList.forEach(eq => {
                            if (eq.model && eq.model.trim()) {
                                globalEquipmentsDictionary.push({
                                    name: (eq.name || '').toLowerCase(),
                                    purpose: (eq.purpose || '').toLowerCase(),
                                    model: eq.model.trim()
                                });
                            }
                        });
                    }
                });
            }
        });
    }
});

// ===== LOGIC OFFLINE =====
let pendingSyncCustomerIds = new Set(JSON.parse(localStorage.getItem('PENDING_BUILDING_SYNC') || '[]'));
let pendingSuggestions = JSON.parse(localStorage.getItem('PENDING_SUGGESTIONS') || '[]');

function updateNetworkStatus() {
    const statusDiv = document.getElementById('networkStatus');
    if (!navigator.onLine) {
        statusDiv.style.display = 'block';
    } else {
        statusDiv.style.display = 'none';
        syncBuildingsOffline(); // Thử sync
        syncSuggestionsOffline();
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

setInterval(() => {
    syncBuildingsOffline();
    syncSuggestionsOffline();
}, 10000);

function addPendingBuildingSync(cId) {
    if (cId && cId !== 'unknown') {
        pendingSyncCustomerIds.add(cId);
        localStorage.setItem('PENDING_BUILDING_SYNC', JSON.stringify(Array.from(pendingSyncCustomerIds)));
    }
}

function syncBuildingsOffline() {
    if (!navigator.onLine || pendingSyncCustomerIds.size === 0) return;

    // Đồng bộ từng ID
    Array.from(pendingSyncCustomerIds).forEach(cId => {
        const localData = localStorage.getItem(`BUILDINGS_LIST_${cId}`);
        if (localData) {
            surveysRef.child(cId).child('buildingsArray').set(JSON.parse(localData)).then(() => {
                pendingSyncCustomerIds.delete(cId);
                localStorage.setItem('PENDING_BUILDING_SYNC', JSON.stringify(Array.from(pendingSyncCustomerIds)));
                console.log(`Đồng bộ tòa nhà thành công: ${cId}`);
            }).catch(console.error);
        } else {
            // Không có dữ liệu local thì bỏ qua
            pendingSyncCustomerIds.delete(cId);
        }
    });
}

function syncSuggestionsOffline() {
    if (!navigator.onLine || pendingSuggestions.length === 0) return;

    let allSuccess = true;
    pendingSuggestions.forEach(item => {
        suggestionsRef.child(item.category).set(item.data).catch(e => {
            allSuccess = false;
        });
    });

    if (allSuccess) {
        pendingSuggestions = [];
        localStorage.setItem('PENDING_SUGGESTIONS', JSON.stringify([]));
    }
}
// ==========================

// Đọc thông số Khách hàng từ URL
const urlParams = new URLSearchParams(window.location.search);
const customerId = urlParams.get('customerId') || 'unknown';
const customerName = urlParams.get('customerName') || 'Khách hàng chưa rõ';
const embedMode = urlParams.get('embed') === '1';
const focusBuildingId = urlParams.get('buildingId');

// Xử lý nút Back trang chính (kèm editId)
btnBackToMain.addEventListener('click', (e) => {
    e.preventDefault();
    if (embedMode) {
        window.parent && window.parent.postMessage({ type: 'BUILDING_EMBED_CLOSE' }, '*');
        return;
    }
    if (customerId !== 'unknown') {
        window.location.href = `index.html?editId=${customerId}`;
    } else {
        window.location.href = 'index.html';
    }
});

document.getElementById('customerNameHeader').innerText = customerName;

// Nút đóng embed
const btnCloseEmbed = document.getElementById('btnCloseEmbed');
if (btnCloseEmbed) {
    btnCloseEmbed.style.display = embedMode ? 'inline-flex' : 'none';
    btnCloseEmbed.addEventListener('click', () => {
        window.parent && window.parent.postMessage({ type: 'BUILDING_EMBED_CLOSE' }, '*');
    });
}

// Khởi tạo Sơ đồ MỚI
document.getElementById("btnGenerateMap").addEventListener("click", () => {
    const name = document.getElementById("buildingName").value || "Tòa A";
    const numFloors = parseInt(document.getElementById("numFloors").value) || 1;
    const numRooms = parseInt(document.getElementById("numRooms").value) || 5;
    const template = document.getElementById("buildingTemplate").value;

    document.getElementById("displayBuildingName").innerText = name;

    // Gán trống giá trị UI
    mainNetworkNotes.value = '';

    // Tạo mảng Dữ liệu Tòa nhà mới
    buildingData = {
        id: 'bldg_' + Date.now(),
        name: name,
        nodes: [],
        equipments: []
    };

    // Tự động sinh danh sách phòng
    let nodeIdCounter = 1;
    for (let f = 1; f <= numFloors; f++) {
        if (template === 'standard') {
            buildingData.nodes.push({ id: `node_${nodeIdCounter++}`, floor: f, type: 'Corridor', name: `Hành lang Tầng ${f}`, status: 0, position: 'center', notes: '' });
            buildingData.nodes.push({ id: `node_${nodeIdCounter++}`, floor: f, type: 'Staircase', name: `Cầu thang Tầng ${f}`, status: 0, position: 'center', notes: '' });
        }

        const centerIdx = Math.ceil(numRooms / 2);
        for (let r = 1; r <= numRooms; r++) {
            let roomNumber = (f * 100) + r;
            let pos = (template === 'standard' && r > centerIdx) ? 'right' : 'left';
            if (template !== 'standard') pos = 'left';
            buildingData.nodes.push({ id: `node_${nodeIdCounter++}`, floor: f, type: 'Room', name: `Phòng ${roomNumber}`, status: 0, position: pos, notes: '' });
        }
    }

    // Push vào Mảng Tòa nhà và Lưu
    buildingsArray.push(buildingData);
    saveBuildingsArrayLocally();

    renderMap();
    showMapSection();
});

// Hàm lưu Mảng Dữ liệu Tòa nhà của Khách Hàng
function saveBuildingsArrayLocally() {
    if (customerId === 'unknown') return;

    // Backup offline
    localStorage.setItem(`BUILDINGS_LIST_${customerId}`, JSON.stringify(buildingsArray));

    if (!navigator.onLine) {
        let pending = new Set(JSON.parse(localStorage.getItem('PENDING_BUILDING_SYNC') || '[]'));
        pending.add(customerId);
        localStorage.setItem('PENDING_BUILDING_SYNC', JSON.stringify(Array.from(pending)));
        showToast("Đã lưu ngoại tuyến", "info");
        return;
    }

    // Lưu chính thức lên Firebase Cloud
    surveysRef.child(customerId).child('buildingsArray').set(buildingsArray).catch(err => {
        console.error("Lỗi đồng bộ Sơ đồ lên Firebase: ", err);
        let pending = new Set(JSON.parse(localStorage.getItem('PENDING_BUILDING_SYNC') || '[]'));
        pending.add(customerId);
        localStorage.setItem('PENDING_BUILDING_SYNC', JSON.stringify(Array.from(pending)));
    });
}

// Cập nhật lưu buildingData (khi sửa/thêm phòng thiết bị)
function saveBuildingDataLocally() {
    if (!buildingData.id) return;
    const index = buildingsArray.findIndex(b => b.id === buildingData.id);
    if (index !== -1) {
        buildingsArray[index] = buildingData;
        saveBuildingsArrayLocally();
    }
}

// Hàm chuyển trang
function showListSection() {
    buildingsListSection.style.display = "block";
    setupSection.style.display = "none";
    mapSection.style.display = "none";
    btnBackToList.style.display = "none";
    document.getElementById("btnSaveBuildingMap").style.display = "none";
    renderBuildingsList();
}

function showSetupSection() {
    buildingsListSection.style.display = "none";
    setupSection.style.display = "block";
    mapSection.style.display = "none";
    btnBackToList.style.display = "block";
    document.getElementById("btnSaveBuildingMap").style.display = "none";
}

function showMapSection() {
    buildingsListSection.style.display = "none";
    setupSection.style.display = "none";
    mapSection.style.display = "block";
    btnBackToList.style.display = "block";
    document.getElementById("btnSaveBuildingMap").style.display = "block";
    renderBuildingImages(); // Render ảnh tòa nhà
}

// Gắn event navigation
btnShowSetup.addEventListener("click", showSetupSection);
btnBackToList.addEventListener("click", showListSection);

// Khôi phục dữ liệu khi load trang
window.addEventListener('DOMContentLoaded', () => {
    populateDataLists();

    if (customerId === 'unknown') {
        showListSection();
        return;
    }

    if (!navigator.onLine) {
        buildingsListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Đang chế độ Ngoại tuyến. Đọc dữ liệu từ máy...</div>';
        const localData = localStorage.getItem(`BUILDINGS_LIST_${customerId}`);
        if (localData) {
            buildingsArray = JSON.parse(localData);
        }
        showListSection();
        return;
    }

    const ql = document.getElementById('quickLeftRooms');
    const qr = document.getElementById('quickRightRooms');
    if (ql) ql.addEventListener('focus', () => lastFocusedQuickTextArea = 'quickLeftRooms');
    if (qr) qr.addEventListener('focus', () => lastFocusedQuickTextArea = 'quickRightRooms');

    buildingsListContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Đang tải dữ liệu từ Đám mây...</div>';

    // Đọc trên Firebase làm Nguồn Chân lý (Source of Truth)
    surveysRef.child(customerId).child('buildingsArray').once('value', snapshot => {
        if (snapshot.exists()) {
            // Đã có dữ liệu trên Cloud -> Lấy xài luôn
            buildingsArray = snapshot.val() || [];
            if (!Array.isArray(buildingsArray)) {
                // Handle cases where array is converted to object with indices by firebase
                buildingsArray = Object.values(buildingsArray);
            }

            // Đảm bảo các node/eq bên trong có mảng, nếu trống firebase hay trả về undefined
            buildingsArray.forEach(bldg => {
                if (!bldg.nodes) bldg.nodes = [];
                if (!bldg.equipments) bldg.equipments = [];
                if (!bldg.photos) bldg.photos = []; // Init photos if missing
            });

            // Backup Local
            localStorage.setItem(`BUILDINGS_LIST_${customerId}`, JSON.stringify(buildingsArray));

        } else {
            // Firebase chưa Có -> Cố gắng Migrate từ dữ liệu cũ (chỉ 1 tòa nhà) ở Local storage đẩy lên
            const oldSaved = localStorage.getItem(`BUILDING_MAP_${customerId}`);
            const newSaved = localStorage.getItem(`BUILDINGS_LIST_${customerId}`);

            if (newSaved) {
                buildingsArray = JSON.parse(newSaved);
                saveBuildingsArrayLocally(); // Push lên Cloud
            } else if (oldSaved) {
                // Migration logic
                let oldData = JSON.parse(oldSaved);
                oldData.id = 'bldg_' + Date.now(); // Gắn ID giả
                buildingsArray = [oldData];
                saveBuildingsArrayLocally(); // Lưu format mới & Đẩy lên Cloud
                localStorage.removeItem(`BUILDING_MAP_${customerId}`); // Xóa cái cũ
            }
        }

        showListSection();

        // Nếu có buildingId -> tự mở đúng tòa nhà và nhảy vào map
        if (focusBuildingId) {
            setTimeout(() => {
                if (typeof window.editBuilding === 'function') {
                    window.editBuilding(focusBuildingId);
                }
            }, 0);
        }
    });
});

// Render Danh sách Tòa nhà
function renderBuildingsList() {
    buildingsListContainer.innerHTML = '';

    if (buildingsArray.length === 0) {
        buildingsZeroState.style.display = 'block';
        return;
    }
    buildingsZeroState.style.display = 'none';

    buildingsArray.forEach(bldg => {
        const floorCount = new Set(bldg.nodes.map(n => n.floor)).size;
        const eqCount = bldg.equipments ? bldg.equipments.length : 0;

        const card = document.createElement('div');
        card.className = 'card';
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';
        card.style.padding = '16px';
        card.style.marginBottom = '0';

        card.innerHTML = `
            <div>
                <h3 style="margin-bottom: 4px; color: var(--primary);">${bldg.name}</h3>
                <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px;">
                    <span>🏢 ${floorCount} Tầng</span>
                    <span>🚪 ${bldg.nodes.length} Khu vực</span>
                    <span>💻 ${eqCount} Thiết bị</span>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="action-btn" onclick="editBuilding('${bldg.id}')" style="background: #0284c7; color: white;">Sửa Sơ đồ</button>
                <button class="action-btn" onclick="deleteBuilding('${bldg.id}')" style="background: #fee2e2; color: #ef4444;">Xóa</button>
            </div>
        `;
        buildingsListContainer.appendChild(card);
    });
}

// Cập nhật cấu trúc nếu Load bản đồ cũ thiếu Pos
function migrateLegacyPositions() {
    let hasChanges = false;
    buildingData.nodes.forEach(n => {
        if (!n.position) {
            hasChanges = true;
            if (n.type === 'Corridor' || n.type === 'Staircase' || n.type === 'Stairs') n.position = 'center';
            else n.position = 'left'; // Placeholder
        }
    });

    if (hasChanges) {
        // Chia đôi tự động cho các tầng
        const floorsMap = {};
        buildingData.nodes.forEach(n => {
            if (!floorsMap[n.floor]) floorsMap[n.floor] = [];
            floorsMap[n.floor].push(n);
        });
        Object.keys(floorsMap).forEach(f => {
            const arr = floorsMap[f];
            const rooms = arr.filter(n => n.type === 'Room');
            const centers = arr.filter(n => n.type !== 'Room');
            if (centers.length > 0) {
                const mid = Math.ceil(rooms.length / 2);
                rooms.forEach((r, idx) => r.position = idx < mid ? 'left' : 'right');
            } else {
                rooms.forEach(r => r.position = 'left');
            }
        });
        saveBuildingDataLocally();
    }
}

// Xử lý Sửa tòa nhà
window.editBuilding = function (id) {
    const target = buildingsArray.find(b => b.id === id);
    if (target) {
        buildingData = target;
        migrateLegacyPositions();
        document.getElementById("displayBuildingName").innerText = buildingData.name;
        // Phục hồi note cũ nếu có
        mainNetworkNotes.value = buildingData.mainNetworkNotes || '';
        renderMap();
        renderBuildingImages();
        showMapSection();
    }
};

// Xử lý Ghi chú Đường Truyền Mạng Chính (Save thủ công qua nút)
window.saveNetworkNotes = function () {
    buildingData.mainNetworkNotes = mainNetworkNotes.value.trim();
    const index = buildingsArray.findIndex(b => b.id === buildingData.id);
    if (index !== -1) {
        buildingsArray[index] = buildingData;
        saveBuildingsArrayLocally();
        networkNoteSaveStatus.style.display = 'inline';
        setTimeout(() => { networkNoteSaveStatus.style.display = 'none'; }, 3000);
    } else {
        showToast("Lỗi: Không tìm thấy Tòa nhà để lưu!", "error");
    }
};

// Xử lý Xóa tòa nhà
window.deleteBuilding = function (id) {
    if (confirm("Xác nhận Xóa Tòa nhà này? Mọi thiết bị bên trong sẽ bị mất!")) {
        buildingsArray = buildingsArray.filter(b => b.id !== id);
        saveBuildingsArrayLocally();
        renderBuildingsList();
        showToast("Đã xóa Tòa nhà!");
    }
};

// Hàm đưa lịch sử gợi ý vào Datalist HTML
function populateDataLists() {
    const listMap = {
        'roomNameSuggestions': userSuggestions.rooms,
        'eqNameSuggestions': userSuggestions.eqNames,
        'eqModelSuggestions': userSuggestions.eqModels,
        'eqLocationSuggestions': userSuggestions.eqLocations,
        'eqISPSuggestions': userSuggestions.eqISPs
    };

    for (let listId in listMap) {
        const dlist = document.getElementById(listId);
        if (dlist) {
            if (listId === 'roomNameSuggestions') {
                dlist.innerHTML = '';
            }
            // Chỉ thêm các mục mới từ user, không xóa các mục hardcode sẵn trong HTML (trừ phòng)
            listMap[listId].forEach(val => {
                if (!Array.from(dlist.options).find(opt => opt.value === val)) {
                    const opt = document.createElement('option');
                    opt.value = val;
                    dlist.appendChild(opt);
                }
            });
        }
    }

    renderQuickRoomChips();
}

function renderQuickRoomChips() {
    const container = document.getElementById('quickRoomSuggestionsBox');
    if (!container) return;
    container.innerHTML = '';

    userSuggestions.rooms.forEach(room => {
        const chip = document.createElement('span');
        chip.style.cssText = 'background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 0.8rem; padding: 4px 10px; border-radius: 12px; cursor: pointer; user-select: none; transition: 0.2s;';
        chip.innerText = '+ ' + room;
        chip.title = "Thêm vào danh sách";

        chip.onmouseover = () => chip.style.background = '#bae6fd';
        chip.onmouseout = () => chip.style.background = '#e0f2fe';

        chip.addEventListener('click', () => {
            const targetArea = document.getElementById(lastFocusedQuickTextArea);
            if (!targetArea) return;
            const currentVal = targetArea.value;
            if (currentVal && !currentVal.endsWith('\n')) {
                targetArea.value += '\n' + room + '\n';
            } else {
                targetArea.value += room + '\n';
            }
            targetArea.focus();
        });

        container.appendChild(chip);
    });
}

// Hàm lưu gợi ý mới đồng bộ lên Firebase
function saveSuggestion(category, value) {
    if (!value) return;
    value = value.trim();
    if (value === "") return;

    // Nếu từ mới tinh chưa có trên cloud
    if (!userSuggestions[category].includes(value)) {
        userSuggestions[category].push(value);
        suggestionsRef.child(category).set(userSuggestions[category]);
        // Bỏ populateDataLists() chạy cục bộ vì Firebase on('value') sẽ tự trigger lại
    }
}

// Hàm Render Ma trận lưới Phòng
function renderMap() {
    floorsContainer.innerHTML = '';

    // Đổ dữ liệu Ghi chú Đường mạng chính ra UI
    if (mainNetworkNotes) {
        mainNetworkNotes.value = buildingData.mainNetworkNotes || '';
    }

    // Gom nhóm theo tầng
    const floorsMap = {};
    buildingData.nodes.forEach(node => {
        if (!floorsMap[node.floor]) floorsMap[node.floor] = [];
        floorsMap[node.floor].push(node);
    });

    // Lặp qua từng tầng và render HTML
    Object.keys(floorsMap).sort((a, b) => b - a).forEach(floorNum => {
        const nodesInFloor = floorsMap[floorNum];

        const floorDiv = document.createElement('div');
        floorDiv.className = 'floor-row';
        floorDiv.innerHTML = `<div class="floor-title" style="display:flex; justify-content:space-between; align-items:center;">
            <span>TẦNG ${floorNum}</span>
            <button onclick="deleteFloor(${floorNum})" style="background:none; border:none; color:#ef4444; font-size:0.9rem; cursor:pointer;" title="Xóa Tầng">&times; Xóa tầng</button>
        </div>`;

        const scrollDiv = document.createElement('div');
        scrollDiv.className = 'floor-horizontal-scroll';

        const leftNodes = nodesInFloor.filter(n => n.position === 'left');
        const centerNodes = nodesInFloor.filter(n => n.position === 'center');
        const rightNodes = nodesInFloor.filter(n => n.position === 'right');

        // Layout cuộn ngang dàn trải 1 dòng (Flexbox)

        // Add Room Button (Left part)
        const btnAddLeft = document.createElement('div');
        btnAddLeft.className = 'add-room-card';
        btnAddLeft.title = "Thêm Phòng bên Trái";
        btnAddLeft.innerHTML = "+";
        btnAddLeft.onclick = () => addRoom(floorNum, 'left');
        scrollDiv.appendChild(btnAddLeft);

        // Chuẩn bị danh sách Node để gắn chung logic
        const displayNodes = [...leftNodes, ...centerNodes, ...rightNodes];

        displayNodes.forEach(node => {
            const nodeEqs = buildingData.equipments.filter(eq => eq.nodeId === node.id);
            const eqCount = nodeEqs.length;
            const hasIsp = nodeEqs.some(eq => eq.isp && eq.isp.trim() !== '');
            const hasMainDev = nodeEqs.some(eq => eq.isMainDevice === true || eq.isMainDevice === "true");

            const card = document.createElement('div');

            let extraClass = '';
            if (node.type === 'Corridor') extraClass = 'corridor-node';
            if (node.type === 'Staircase') extraClass = 'staircase-node';

            if (hasIsp) extraClass += ' has-isp-room';

            card.className = `room-card ${extraClass} status-${node.status}`;

            let icon = '';
            if (node.type === 'Corridor') icon = '🚪 ';
            if (node.type === 'Staircase') icon = '🪜 ';

            let customNameStyle = hasMainDev ? `color: #ef4444 !important; font-weight: 800;` : '';

            const noteText = (node.notes && String(node.notes).trim() !== '') ? `\n📝 ${String(node.notes).trim()}` : '';
            const rightText = (node.rightRooms && String(node.rightRooms).trim() !== '') ? `\n🏢 DS Phòng: ${String(node.rightRooms).replace(/\n/g, ', ')}` : '';
            const tooltip = `${node.name || ''}${noteText}${rightText}`.trim();
            card.title = tooltip;

            let noteHtml = '';
            const noteContent = (node.notes && String(node.notes).trim() !== '') ? `<div style="margin-bottom: 2px;">📝 ${String(node.notes).trim().replace(/\n/g, '<br>')}</div>` : '';
            const rightRoomsContent = (node.rightRooms && String(node.rightRooms).trim() !== '') ? `<div>🏢 ${String(node.rightRooms).trim().replace(/\n/g, '<br>')}</div>` : '';

            if (noteContent || rightRoomsContent) {
                noteHtml = `<div style="font-size: 0.75rem; color: #64748b; margin-top: 8px; padding: 4px; background: rgba(0,0,0,0.02); border-radius: 4px; line-height: 1.3; word-break: break-word; text-align: left; width: 100%;">
                    ${noteContent}
                    ${rightRoomsContent}
                </div>`;
            }

            card.innerHTML = `<div class="room-name" style="${customNameStyle}" title="${tooltip}">${icon}${node.name}</div><div class="room-eq-count" style="margin-bottom: 4px;">💻 ${eqCount}</div>${noteHtml}`;
            card.addEventListener('click', () => openRoomDrawer(node.id));

            scrollDiv.appendChild(card);
        });

        // Add Room Button (Right part)
        const btnAddRight = document.createElement('div');
        btnAddRight.className = 'add-room-card';
        btnAddRight.title = "Thêm Phòng bên Phải";
        btnAddRight.innerHTML = "+";
        btnAddRight.onclick = () => addRoom(floorNum, 'right');
        scrollDiv.appendChild(btnAddRight);

        floorDiv.appendChild(scrollDiv);
        floorsContainer.appendChild(floorDiv);
    });

    // Cập nhật Bảng thống kê cuối trang
    renderEquipmentSummary();
}

// Hàm Xử lý Dữ liệu Bảng Tổng hợp Thiết bị Tòa nhà
function renderEquipmentSummary() {
    const summaryDiv = document.getElementById("buildingEquipmentSummary");
    const tbody = document.getElementById("summaryTableBody");

    if (!summaryDiv || !tbody) return;

    if (!buildingData.equipments || buildingData.equipments.length === 0) {
        summaryDiv.style.display = 'none';
        return;
    }

    // Gom nhóm theo Tên và Model
    const groupedData = {};
    buildingData.equipments.forEach(eq => {
        // Tạo key gộp để nhóm các bản ghi có chung Name và Model
        const key = `${eq.name || 'Không tên'}|||${eq.model || '-'}`;
        if (!groupedData[key]) {
            groupedData[key] = {
                name: eq.name || 'Không tên',
                model: eq.model || '-',
                count: 0
            };
        }
        groupedData[key].count += 1;
    });

    tbody.innerHTML = '';

    // Sort array cho đẹp theo Alphabet
    const sortedKeys = Object.keys(groupedData).sort();

    sortedKeys.forEach(key => {
        const item = groupedData[key];
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';

        tr.innerHTML = `
            <td style="padding: 10px; border-right: 1px solid #e2e8f0; font-weight: 500; color: #334155;">${item.name}</td>
            <td style="padding: 10px; border-right: 1px solid #e2e8f0; color: #475569;">${item.model}</td>
            <td style="padding: 10px; text-align: center; font-weight: 700; color: #0284c7; font-size: 1.1em;">${item.count}</td>
        `;
        tbody.appendChild(tr);
    });

    summaryDiv.style.display = 'block';
}

// Logic Drawer
function openRoomDrawer(nodeId) {
    currentSelectedNodeId = nodeId;
    const node = buildingData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    drawerRoomNameInput.value = node.name;
    roomCompletedToggle.checked = node.status === 2; // Xanh là checked
    if (roomNotes) roomNotes.value = node.notes || '';

    const roomRightList = document.getElementById('roomRightList');
    if (roomRightList) roomRightList.value = node.rightRooms || '';

    const isCenterNode = node.type === 'Corridor' || node.type === 'Staircase' || node.position === 'center';
    const quickCreateSection = document.getElementById("quickCreateRoomsSection");
    if (quickCreateSection) {
        quickCreateSection.style.display = isCenterNode ? 'block' : 'none';
        document.getElementById("quickLeftRooms").value = '';
        document.getElementById("quickRightRooms").value = '';
    }

    // Style toggle area dựa trên trạng thái
    updateToggleUI();

    renderEquipmentsInDrawer(node.id);

    roomDrawer.classList.add('active');
}

const btnQuickCreateRooms = document.getElementById("btnQuickCreateRooms");
if (btnQuickCreateRooms) {
    btnQuickCreateRooms.addEventListener("click", () => {
        const leftText = document.getElementById("quickLeftRooms").value.trim();
        const rightText = document.getElementById("quickRightRooms").value.trim();

        if (!leftText && !rightText) {
            showToast("Vui lòng nhập danh sách phòng cần tạo!", "error");
            return;
        }

        const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
        if (!node) return;
        const floorNum = node.floor;

        if (!confirm(`Xác nhận: Việc này sẽ XÓA TOÀN BỘ CÁC PHÒNG (và thiết bị bên trong phòng) thuộc Tầng ${floorNum} để tạo mới danh sách. Bạn có chắc chắn?`)) {
            return;
        }

        const roomsToDeleteIds = buildingData.nodes.filter(n => n.floor === floorNum && n.type === 'Room').map(n => n.id);
        buildingData.nodes = buildingData.nodes.filter(n => !(n.floor === floorNum && n.type === 'Room'));
        buildingData.equipments = buildingData.equipments.filter(eq => !roomsToDeleteIds.includes(eq.nodeId));

        let createdCount = 0;
        let maxNodeId = 0;
        buildingData.nodes.forEach(n => {
            const idNum = parseInt(n.id.replace('node_', ''));
            if (!isNaN(idNum) && idNum > maxNodeId) maxNodeId = idNum;
        });

        const parseAndCreate = (text, position) => {
            if (!text) return;
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            lines.forEach(name => {
                buildingData.nodes.push({ id: `node_${++maxNodeId}`, floor: floorNum, type: 'Room', name: name, status: 0, position: position, notes: '' });
                createdCount++;
            });
        };

        parseAndCreate(leftText, 'left');
        parseAndCreate(rightText, 'right');

        if (createdCount >= 0) {
            document.getElementById("quickLeftRooms").value = '';
            document.getElementById("quickRightRooms").value = '';
            renderMap();
            saveBuildingDataLocally();
            showToast(`Đã xóa phòng cũ và tạo mới ${createdCount} phòng!`);
        }
    });
}

// Xử lý đổi tên phòng trực tiếp trên Input
drawerRoomNameInput.addEventListener('change', (e) => {
    const newName = e.target.value.trim();
    if (!newName) return;

    const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
    if (node && node.name !== newName) {
        node.name = newName;
        renderMap();
        saveBuildingDataLocally();
        // Không lưu tự động vào danh mục gợi ý nữa để user tự quản lý trong bảng "Danh mục"
        showToast("Đã lưu tên khu vực!");
    }
});

// Lưu ghi chú phòng/khu vực
if (roomNotes) {
    roomNotes.addEventListener('change', (e) => {
        const val = (e.target.value || '').trim();
        const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
        if (node) {
            node.notes = val;
            renderMap();
            saveBuildingDataLocally();
            showToast("Đã lưu ghi chú khu vực!");
        }
    });
}

// Lưu DS phòng
const roomRightListElem = document.getElementById('roomRightList');
if (roomRightListElem) {
    roomRightListElem.addEventListener('change', (e) => {
        const val = (e.target.value || '').trim();
        const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
        if (node) {
            node.rightRooms = val;
            renderMap();
            saveBuildingDataLocally();
            showToast("Đã lưu Danh sách phòng!");
        }
    });
}

function updateToggleUI() {
    const toggleCard = document.querySelector('.status-toggle-card');
    if (roomCompletedToggle.checked) {
        toggleCard.style.background = 'var(--status-green)';
        toggleCard.style.borderColor = 'var(--status-green-border)';
    } else {
        toggleCard.style.background = '#f1f5f9';
        toggleCard.style.borderColor = '#cbd5e1';
    }
}

btnCloseDrawer.addEventListener('click', () => {
    roomDrawer.classList.remove('active');
    currentSelectedNodeId = null;
});

// Xử lý Thay đổi Trạng thái Hoàn thành
roomCompletedToggle.addEventListener('change', (e) => {
    updateToggleUI();
    const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
    if (node) {
        if (e.target.checked) {
            node.status = 2; // Hoàn thành
        } else {
            // Nếu hủy hoàn thành, kiểm tra xem có thiết bị không
            const eqCount = buildingData.equipments.filter(eq => eq.nodeId === node.id).length;
            node.status = eqCount > 0 ? 1 : 0; // 1: Đang làm, 0: Trắng
        }
        renderMap(); // Cập nhật lại màu ngoài lưới
        saveBuildingDataLocally(); // Auto save
        showToast(e.target.checked ? "Đã đánh dấu Hoàn thành!" : "Đã hủy Hoàn thành");
    }
});

// Hiển thị danh sách thiết bị
function renderEquipmentsInDrawer(nodeId) {
    const eqs = buildingData.equipments.filter(e => e.nodeId === nodeId);
    equipmentCountBadge.innerText = eqs.length;

    if (eqs.length === 0) {
        equipmentsList.innerHTML = `<div class="empty-state">Phòng này chưa ghi nhận thiết bị.<br>Bấm "+ Thêm" để khai báo.</div>`;
        return;
    }

    equipmentsList.innerHTML = '';
    eqs.forEach(eq => {
        const isMainHtml = eq.isMainDevice ? `<div class="eq-item-detail" style="color:#9333ea; font-weight:600; background:rgba(147,51,234,0.1); display:inline-block; padding:2px 6px; border-radius:4px; margin-right:4px;">🌟 Mạch chính</div>` : '';
        const ispHtml = eq.isp ? `<div class="eq-item-detail" style="color:#0284c7; font-weight:600; background:rgba(2,132,199,0.1); display:inline-block; padding:2px 6px; border-radius:4px;">🌐 ISP: ${eq.isp}</div>` : '';
        const combinedTags = (isMainHtml || ispHtml) ? `<div style="margin-top:4px;">${isMainHtml}${ispHtml}</div>` : '';

        const div = document.createElement('div');
        div.className = 'eq-item' + (eq.isp ? ' has-isp' : '') + (eq.isMainDevice ? ' has-main-device' : '');
        div.innerHTML = `
            <div class="eq-item-title">${eq.name} ${eq.model ? `(${eq.model})` : ''}</div>
            <div class="eq-item-detail">📍 ${eq.exactLocation || 'Không ghi rõ vị trí'}</div>
            ${combinedTags}
            <div class="eq-item-detail">🎯 ${eq.purpose || 'Không rõ mục đích'}</div>
            <button class="eq-item-delete" onclick="duplicateEquipment('${eq.id}')" style="right: 68px; background:#f0fdf4; color:#16a34a;" title="Nhân bản thiết bị">⎘</button>
            <button class="eq-item-delete" onclick="openEquipmentForEdit('${eq.id}')" style="right: 34px; background:#e0f2fe; color:#0284c7;" title="Sửa thiết bị">✎</button>
            <button class="eq-item-delete" onclick="deleteEquipment('${eq.id}')">&times;</button>
        `;
        div.addEventListener('click', (e) => {
            // tránh click vào nút xóa/sửa bị double
            if (e.target && (e.target.classList.contains('eq-item-delete'))) return;
            openEquipmentForEdit(eq.id);
        });
        equipmentsList.appendChild(div);
    });
}

// Sự kiện hiện/ẩn field Khác cho radio Mục đích
document.querySelectorAll('input[name="eqPurposeRadio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const otherInput = document.getElementById('eqPurposeOther');
        if (e.target.value === 'Khác') {
            otherInput.style.display = 'block';
            otherInput.focus();
        } else {
            otherInput.style.display = 'none';
        }
    });
});

// Logic Form Modal Thêm Thiết Bị
btnAddEquipment.addEventListener('click', () => {
    equipmentForm.reset();
    document.getElementById("eqId").value = '';
    document.getElementById('eqISP').value = ''; // Reset ISP field
    document.getElementById('eqIsMainDevice').checked = false; // Reset Main Device check

    document.querySelectorAll('input[name="eqPurposeRadio"]').forEach(r => r.checked = false);
    document.getElementById('eqPurposeOther').value = '';
    document.getElementById('eqPurposeOther').style.display = 'none';

    document.getElementById('eqModalTitle').innerText = 'Thêm Thiết bị';
    updateModelSuggestions();
    equipmentModal.classList.add('active');
});

btnCloseEqModal.addEventListener('click', () => {
    equipmentModal.classList.remove('active');
});

equipmentForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const eqIdVal = document.getElementById('eqId').value;

    let selectedPurpose = '';
    const checkedRadio = document.querySelector('input[name="eqPurposeRadio"]:checked');
    if (checkedRadio) {
        selectedPurpose = checkedRadio.value;
        if (selectedPurpose === 'Khác') {
            selectedPurpose = document.getElementById('eqPurposeOther').value.trim();
        }
    }

    const payload = {
        id: eqIdVal || ('eq_' + Date.now()),
        nodeId: currentSelectedNodeId,
        name: document.getElementById('eqName').value.trim(),
        model: document.getElementById('eqModel').value.trim().toUpperCase(),
        exactLocation: document.getElementById('eqExactLocation').value.trim(),
        isp: document.getElementById('eqISP').value,
        isMainDevice: document.getElementById('eqIsMainDevice').checked,
        purpose: selectedPurpose,
        notes: document.getElementById('eqNotes').value
    };

    if (eqIdVal) {
        const idx = buildingData.equipments.findIndex(e => e.id === eqIdVal);
        if (idx !== -1) {
            // giữ nodeId theo phòng hiện tại
            buildingData.equipments[idx] = { ...buildingData.equipments[idx], ...payload, nodeId: currentSelectedNodeId };
        } else {
            buildingData.equipments.push(payload);
        }
    } else {
        buildingData.equipments.push(payload);
    }

    // Lưu lịch sử nhập liệu cho lần sau gợi ý
    saveSuggestion('eqNames', payload.name);
    saveSuggestion('eqModels', payload.model);
    saveSuggestion('eqLocations', payload.exactLocation);
    saveSuggestion('eqISPs', payload.isp);

    // Auto-update room status to ORANGE if not green
    const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
    if (node && node.status === 0) {
        node.status = 1; // Đang làm
        roomCompletedToggle.checked = false;
        updateToggleUI();
    }

    renderEquipmentsInDrawer(currentSelectedNodeId);
    renderMap();
    saveBuildingDataLocally(); // Auto save

    equipmentModal.classList.remove('active');
    showToast(eqIdVal ? "Đã cập nhật thiết bị!" : "Đã lưu thiết bị thành công!");
});

// Sửa thiết bị
window.openEquipmentForEdit = function (eqId) {
    const eq = buildingData.equipments.find(e => e.id === eqId);
    if (!eq) return;

    equipmentForm.reset();
    document.getElementById("eqId").value = eq.id;
    document.getElementById("eqName").value = eq.name || '';
    document.getElementById("eqModel").value = eq.model || '';
    document.getElementById("eqExactLocation").value = eq.exactLocation || '';
    document.getElementById("eqISP").value = eq.isp || '';
    document.getElementById("eqNotes").value = eq.notes || '';
    document.getElementById("eqIsMainDevice").checked = eq.isMainDevice === true || eq.isMainDevice === "true";

    const purpose = eq.purpose || '';
    const radios = document.querySelectorAll('input[name="eqPurposeRadio"]');
    let matched = false;
    radios.forEach(r => {
        if (r.value === purpose) {
            r.checked = true;
            matched = true;
        } else {
            r.checked = false;
        }
    });

    if (purpose && !matched) {
        document.querySelector('input[name="eqPurposeRadio"][value="Khác"]').checked = true;
        document.getElementById("eqPurposeOther").value = purpose;
        document.getElementById("eqPurposeOther").style.display = 'block';
    } else {
        document.getElementById("eqPurposeOther").value = '';
        document.getElementById("eqPurposeOther").style.display = 'none';
    }

    document.getElementById('eqModalTitle').innerText = 'Sửa Thiết bị';
    updateModelSuggestions();
    equipmentModal.classList.add('active');
};

// Nhân bản thiết bị
window.duplicateEquipment = function (eqId) {
    const originalEq = buildingData.equipments.find(e => e.id === eqId);
    if (!originalEq) return;

    if (confirm(`Bạn muốn nhân bản thiết bị "${originalEq.name}" trong phòng này?`)) {
        const newEq = { ...originalEq };
        newEq.id = 'eq_' + Date.now() + Math.floor(Math.random() * 1000);

        buildingData.equipments.push(newEq);
        renderEquipmentsInDrawer(currentSelectedNodeId);
        renderMap();
        saveBuildingDataLocally();
        showToast("Đã nhân bản thiết bị!");
    }
};

// Xóa thiết bị (Gắn ở inline window context)
window.deleteEquipment = function (eqId) {
    if (confirm("Xóa thiết bị này?")) {
        buildingData.equipments = buildingData.equipments.filter(e => e.id !== eqId);

        // Kiểm tra hạ cấp trạng thái nếu hết thiết bị
        const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
        if (node && node.status === 1) { // Nếu đang cam
            const eqCount = buildingData.equipments.filter(eq => eq.nodeId === node.id).length;
            if (eqCount === 0) node.status = 0; // Về trắng
        }

        renderEquipmentsInDrawer(currentSelectedNodeId);
        renderMap();
        saveBuildingDataLocally(); // Auto save
        showToast("Đã xóa thiết bị");
    }
}

// Xóa Tòa Nhà Đang Sửa Hiện Cấm Dùng Trực Tiếp Trong Sơ Đồ Vì Đã Có Về Trang List
// Xoá bỏ nút Reset vì đã có màn Danh sách Quản lý

// Toast
function showToast(msg) {
    var toast = document.getElementById("toast");
    toast.innerText = msg;
    toast.className = "toast show";
    setTimeout(function () { toast.className = toast.className.replace("show", ""); }, 3000);
}

// Tính năng thêm Tầng
window.addNewFloor = function () {
    let maxFloor = 0;
    buildingData.nodes.forEach(n => {
        if (n.floor > maxFloor) maxFloor = n.floor;
    });
    const nextFloor = maxFloor + 1;
    let maxNodeId = 0;
    buildingData.nodes.forEach(n => {
        const idNum = parseInt(n.id.replace('node_', ''));
        if (!isNaN(idNum) && idNum > maxNodeId) maxNodeId = idNum;
    });

    buildingData.nodes.push({ id: `node_${++maxNodeId}`, floor: nextFloor, type: 'Corridor', name: `Hành lang Tầng ${nextFloor}`, status: 0, position: 'center', notes: '' });
    buildingData.nodes.push({ id: `node_${++maxNodeId}`, floor: nextFloor, type: 'Staircase', name: `Cầu thang Tầng ${nextFloor}`, status: 0, position: 'center', notes: '' });
    buildingData.nodes.push({ id: `node_${++maxNodeId}`, floor: nextFloor, type: 'Room', name: `P.${nextFloor}01`, status: 0, position: 'left', notes: '' });
    buildingData.nodes.push({ id: `node_${++maxNodeId}`, floor: nextFloor, type: 'Room', name: `P.${nextFloor}02`, status: 0, position: 'right', notes: '' });

    renderMap();
    saveBuildingDataLocally();
    showToast(`Đã thêm Tầng ${nextFloor} Mới!`);
}

// Tính năng xóa Tầng
window.deleteFloor = function (floorNum) {
    if (confirm(`Xác nhận XÓA TOÀN BỘ TẦNG ${floorNum}? Cả thiết bị sẽ bị xóa!`)) {
        const nodesToDelete = buildingData.nodes.filter(n => n.floor === floorNum).map(n => n.id);
        buildingData.nodes = buildingData.nodes.filter(n => n.floor !== floorNum);
        buildingData.equipments = buildingData.equipments.filter(eq => !nodesToDelete.includes(eq.nodeId));

        // Cập nhật currentSelectedNodeId nếu bị xóa
        if (nodesToDelete.includes(currentSelectedNodeId)) {
            roomDrawer.classList.remove('active');
            currentSelectedNodeId = null;
        }

        renderMap();
        saveBuildingDataLocally();
        showToast(`Đã xóa Tầng ${floorNum}!`);
    }
}

// Nút Thêm phòng ở Tầng
window.addRoom = function (floorNum, position) {
    let name = prompt(`Nhập Tên Phòng Mới (Tầng ${floorNum} - Bên ${position === 'left' ? 'Trái' : 'Phải'}):`, 'Phòng Mới');
    if (!name) return;
    name = name.trim();

    let maxNodeId = 0;
    buildingData.nodes.forEach(n => {
        const idNum = parseInt(n.id.replace('node_', ''));
        if (!isNaN(idNum) && idNum > maxNodeId) maxNodeId = idNum;
    });

    buildingData.nodes.push({ id: `node_${++maxNodeId}`, floor: floorNum, type: 'Room', name: name, status: 0, position: position, notes: '' });
    renderMap();
    saveBuildingDataLocally();
    showToast(`Đã thêm ${name}!`);
}

// Nút xóa phòng
window.deleteCurrentRoom = function () {
    if (!currentSelectedNodeId) return;
    const node = buildingData.nodes.find(n => n.id === currentSelectedNodeId);
    if (confirm(`Xác nhận xóa: ${node.name}? Thiết bị ở trong cũng bị xóa.`)) {
        buildingData.nodes = buildingData.nodes.filter(n => n.id !== currentSelectedNodeId);
        buildingData.equipments = buildingData.equipments.filter(e => e.nodeId !== currentSelectedNodeId);

        roomDrawer.classList.remove('active');
        currentSelectedNodeId = null;

        renderMap();
        saveBuildingDataLocally();
        showToast("Đã xóa Khu vực!");
    }
}

/* === Room Directory Modal Logic === */
const roomDirectoryModal = document.getElementById("roomDirectoryModal");
const btnCloseRoomDirModal = document.getElementById("btnCloseRoomDirModal");
const roomDirectoryTableBody = document.getElementById("roomDirectoryTableBody");
const newRoomDirName = document.getElementById("newRoomDirName");

window.openRoomDirectoryModal = function () {
    roomDirectoryModal.classList.add('active');
    renderRoomDirectory();
};

if (btnCloseRoomDirModal) {
    btnCloseRoomDirModal.addEventListener('click', () => {
        roomDirectoryModal.classList.remove('active');
    });
}

function renderRoomDirectory() {
    if (!roomDirectoryTableBody) return;
    roomDirectoryTableBody.innerHTML = '';
    userSuggestions.rooms.forEach((room, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 8px; border-bottom: 1px solid #cbd5e1;">${room}</td>
            <td style="padding: 8px; border-bottom: 1px solid #cbd5e1; text-align: right;">
                <button onclick="deleteRoomFromDirectory(${index})" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" title="Xóa">&times;</button>
            </td>
        `;
        roomDirectoryTableBody.appendChild(tr);
    });
}

window.addRoomToDirectory = function () {
    if (!newRoomDirName) return;
    const val = newRoomDirName.value.trim();
    if (val && !userSuggestions.rooms.includes(val)) {
        userSuggestions.rooms.push(val);
        suggestionsRef.child('rooms').set(userSuggestions.rooms);
        newRoomDirName.value = '';
        renderRoomDirectory();
        populateDataLists();
        showToast("Đã thêm tên phòng vào danh mục");
    }
};

window.deleteRoomFromDirectory = function (index) {
    if (confirm("Bạn có chắc muốn xóa tên phòng này khỏi danh mục gợi ý?")) {
        userSuggestions.rooms.splice(index, 1);
        suggestionsRef.child('rooms').set(userSuggestions.rooms);
        renderRoomDirectory();
        populateDataLists();
        showToast("Đã xóa tên phòng khỏi danh mục");
    }
};

// Tính năng Export (Backup)
document.getElementById('btnExportData').addEventListener('click', () => {
    if (buildingsArray.length === 0) {
        showToast("Không có dữ liệu tòa nhà để tải!");
        return;
    }
    const dataStr = JSON.stringify(buildingsArray, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    let safeName = customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'backup';

    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${safeName}_sodo.json`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);
    showToast("Đã tải tệp Backup thành công!");
});

// Tính năng Import (Restore)
document.getElementById('importDataFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (Array.isArray(importedData)) {
                if (buildingsArray.length > 0) {
                    if (!confirm("Dữ liệu hiện tại sẽ bị xóa và GHÌ ĐÈ bởi tệp bạn vừa up. Bạn có chắc chắn?")) {
                        e.target.value = ''; // Reset
                        return;
                    }
                }
                buildingsArray = importedData;
                saveBuildingsArrayLocally(); // Vừa lưu local vừa update Cloud
                renderBuildingsList();
                showToast("Đã phục hồi dữ liệu thành công!");
            } else {
                alert("Tệp JSON không hợp lệ hoặc sai cấu trúc.");
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi đọc tệp JSON!");
        }
        e.target.value = ''; // Reset input file
    };
    reader.readAsText(file);
});

/* === Building Photos Logic === */
const buildingImageInput = document.getElementById('buildingImageInput');
const btnSelectBuildingImages = document.getElementById('btnSelectBuildingImages');
const buildingImageGrid = document.getElementById('buildingImageGrid');

if (btnSelectBuildingImages) {
    btnSelectBuildingImages.addEventListener('click', () => {
        buildingImageInput.click();
    });
}

if (buildingImageInput) {
    buildingImageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                uploadBuildingImageToDrive(file);
            }
        });
        buildingImageInput.value = ''; // Reset
    });
}

function uploadBuildingImageToDrive(file) {
    // Tên file: [BuildingName]_[Timestamp]_[FileName]
    const bName = buildingData.name || 'Building';
    const cleanBName = bName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");

    const now = new Date();
    const ts = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + "_" + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const newName = `${cleanBName}_${ts}_${file.name}`;

    const tempId = 'bimg_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const reader = new FileReader();

    reader.onload = function (e) {
        const base64 = e.target.result;
        appendBuildingImageToGrid({
            id: tempId,
            urlBase64: base64,
            uploading: true,
            caption: ''
        });

        fetch(APPS_SCRIPT_UPLOAD_URL, {
            method: 'POST',
            body: JSON.stringify({
                base64: base64,
                filename: newName,
                mimeType: file.type
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const newImg = { url: data.url, caption: '' };
                    if (!buildingData.photos) buildingData.photos = [];
                    buildingData.photos.push(newImg);
                    updateBuildingImageInGrid(tempId, data);
                    saveBuildingDataLocally();
                } else {
                    throw new Error(data.error || 'Upload failed');
                }
            })
            .catch(err => {
                console.error(err);
                const item = document.getElementById(tempId);
                if (item) item.remove();
                showToast("Lỗi tải ảnh: " + err.message, "error");
            });
    };
    reader.readAsDataURL(file);
}

function appendBuildingImageToGrid(imgData) {
    const item = document.createElement('div');
    item.className = 'image-item';
    item.id = imgData.id;

    let displayUrl = imgData.url || imgData.urlBase64;
    // Fix Google Drive Link
    if (displayUrl && displayUrl.includes('drive.google.com')) {
        const idMatch = displayUrl.match(/[-\w]{25,}/);
        if (idMatch) displayUrl = `https://lh3.googleusercontent.com/d/${idMatch[0]}`;
    }

    item.innerHTML = `
        <div class="image-preview-wrapper">
            <img src="${displayUrl}" class="img-preview" alt="Building Photo" onclick="openImageLightbox('${displayUrl}')">
            ${imgData.uploading ? '<div class="uploading-overlay" style="position:absolute; inset:0; background:rgba(255,255,255,0.7); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; color:#0284c7;">Đang tải...</div>' : ''}
            <button class="btn-remove-image" onclick="deleteBuildingImageLocally('${imgData.id}', '${imgData.url || ''}')">&times;</button>
        </div>
        <textarea class="image-description" placeholder="Mô tả ảnh..." onchange="updateBuildingImageCaption('${imgData.url || ''}', this.value)">${imgData.caption || ''}</textarea>
    `;

    buildingImageGrid.insertBefore(item, btnSelectBuildingImages);
}

function updateBuildingImageInGrid(tempId, realData) {
    const item = document.getElementById(tempId);
    if (!item) return;

    const img = item.querySelector('img');
    const overlay = item.querySelector('.uploading-overlay');
    const btnDel = item.querySelector('.btn-remove-image');
    const textarea = item.querySelector('.image-description');

    let dUrl = realData.url;
    if (dUrl.includes('drive.google.com')) {
        const idM = dUrl.match(/[-\w]{25,}/);
        if (idM) dUrl = `https://lh3.googleusercontent.com/d/${idM[0]}`;
    }

    if (img) img.src = dUrl;
    if (overlay) overlay.remove();

    if (btnDel) btnDel.setAttribute('onclick', `deleteBuildingImageLocally('${tempId}', '${dUrl}')`);
    if (textarea) textarea.setAttribute('onchange', `updateBuildingImageCaption('${dUrl}', this.value)`);
}

window.updateBuildingImageCaption = function (url, caption) {
    if (!buildingData.photos) return;
    const img = buildingData.photos.find(i => i.url === url);
    if (img) {
        img.caption = caption;
        saveBuildingDataLocally();
    }
};

window.deleteBuildingImageLocally = function (uiId, url) {
    if (confirm("Xóa ảnh này?")) {
        const item = document.getElementById(uiId);
        if (item) item.remove();
        if (buildingData.photos) {
            buildingData.photos = buildingData.photos.filter(i => i.url !== url);
            saveBuildingDataLocally();
        }
    }
};

function renderBuildingImages() {
    // Clear old items
    const items = buildingImageGrid.querySelectorAll('.image-item');
    items.forEach(it => it.remove());

    if (buildingData.photos) {
        buildingData.photos.forEach((img, idx) => {
            appendBuildingImageToGrid({
                id: 'bimg_loaded_' + idx,
                url: img.url,
                caption: img.caption || ''
            });
        });
    }
}

// Image Lightbox zoom functionality
window.openImageLightbox = function (url) {
    const lb = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImage');
    if (lb && img) {
        img.src = url;
        lb.classList.add('active');
    }
}
window.closeImageLightbox = function () {
    const lb = document.getElementById('imageLightbox');
    if (lb) lb.classList.remove('active');
}

// Dynamic Model Suggestions
function updateModelSuggestions() {
    const nameEl = document.getElementById('eqName');
    if (!nameEl) return;
    const currentName = nameEl.value.trim().toLowerCase();

    let currentPurpose = '';
    const checkedRadio = document.querySelector('input[name="eqPurposeRadio"]:checked');
    if (checkedRadio) {
        currentPurpose = checkedRadio.value;
        if (currentPurpose === 'Khác') {
            const otherEl = document.getElementById('eqPurposeOther');
            if (otherEl) currentPurpose = otherEl.value.trim();
        }
    }
    currentPurpose = currentPurpose.toLowerCase();

    const dlist = document.getElementById('eqModelSuggestions');
    if (!dlist) return;
    dlist.innerHTML = '';

    let suggestedModels = new Set();

    // Quét qua toàn bộ từ điển thiết bị trên Cloud để gợi ý chéo
    globalEquipmentsDictionary.forEach(eq => {
        let match = true;
        if (currentName) {
            const eqName = eq.name;
            if (!eqName.includes(currentName) && !currentName.includes(eqName) && eqName !== currentName) {
                match = false;
            }
        }

        if (currentPurpose && eq.purpose !== currentPurpose) {
            match = false;
        }

        if (match) {
            suggestedModels.add(eq.model);
        }
    });

    // Quét thêm dữ liệu local phòng khi có bản ghi mới nạp chưa push
    if (typeof buildingsArray !== 'undefined') {
        buildingsArray.forEach(bldg => {
            if (bldg.equipments) {
                const eqs = Array.isArray(bldg.equipments) ? bldg.equipments : Object.values(bldg.equipments);
                eqs.forEach(eq => {
                    const eqName = (eq.name || '').toLowerCase();
                    const eqPurpose = (eq.purpose || '').toLowerCase();
                    const eqModel = (eq.model || '').trim();
                    if (eqModel !== '') {
                        let match = true;
                        if (currentName && !eqName.includes(currentName) && !currentName.includes(eqName) && eqName !== currentName) match = false;
                        if (currentPurpose && eqPurpose !== currentPurpose) match = false;
                        if (match) suggestedModels.add(eqModel);
                    }
                });
            }
        });
    }

    // Nếu rỗng và user không lọc gì, hiện nguyên list
    if (suggestedModels.size === 0 && !currentName && !currentPurpose && userSuggestions && userSuggestions.eqModels) {
        userSuggestions.eqModels.forEach(m => suggestedModels.add(m));
    }

    suggestedModels.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        dlist.appendChild(opt);
    });
}

// Bind events for auto suggestion
document.addEventListener('DOMContentLoaded', () => {
    // Hiển thị nút Quản trị tài khoản nếu là admin
    const btnManageUsersGlobal = document.getElementById('btnManageUsersGlobal');
    if (btnManageUsersGlobal && auth && auth.role === 'admin') {
        btnManageUsersGlobal.style.display = 'inline-flex';
        btnManageUsersGlobal.addEventListener('click', () => { window.location.href = 'tk.html'; });
    }

    const eqNameInput = document.getElementById('eqName');
    if (eqNameInput) eqNameInput.addEventListener('input', updateModelSuggestions);

    document.querySelectorAll('input[name="eqPurposeRadio"]').forEach(r => {
        r.addEventListener('change', updateModelSuggestions);
    });

    const eqPurposeOtherInput = document.getElementById('eqPurposeOther');
    if (eqPurposeOtherInput) eqPurposeOtherInput.addEventListener('input', updateModelSuggestions);

    // Tự động in hoa Model thiết bị khi gõ
    const eqModelInput = document.getElementById('eqModel');
    if (eqModelInput) {
        eqModelInput.addEventListener('input', function () {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.toUpperCase();
            // Preserve cursor position if possible
            if (this.setSelectionRange) {
                this.setSelectionRange(start, end);
            }
        });
    }
});
