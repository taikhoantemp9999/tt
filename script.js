const HTTT_LIST = [
    "Hệ thống Thư điện tử công vụ",
    "Hệ thống Quản lý Văn bản tỉnh Phú Thọ (iOffice)",
    "Hệ thống Trang thông tin điện tử",
    "Hệ thống Một cửa điện tử",
    "Hệ thống Cổng dịch vụ Quốc gia, Cổng dịch vụ công tỉnh",
    "Phần mềm Hộ tịch, Thi đua khen thưởng",
    "Quản lý cán bộ, công chức",
    "Hệ thống quản lý hộ nghèo",
    "Hệ thống quản lý tài sản công",
    "Hệ thống quản lý lao động việc làm",
    "Phần mềm báo cáo Cải cách hành chính",
    "Kiểm soát thủ tục hành chính"
];

// Lấy danh sách từ Firebase thay vì hardcode
let danhmucNguoiViet = [];
let danhmucVnpt = [];

const COMPLETED_STATUSES = [
    "Đã gửi cho quản lý địa bàn",
    "Đã gửi lại hồ sơ cho VNPT Khu Vực",
    "Đã gửi cho CA",
    "Công an đã phê duyệt",
    "Công an trả lại"
];

// Biến lưu trữ danh sách Hệ thống do người quản trị cấu hình
let dynamicHtttList = JSON.parse(localStorage.getItem('CUSTOM_HTTT_MANAGER')) || [...HTTT_LIST];

const firebaseConfig = {
    apiKey: "AIzaSyBxDaIIhmWJOB6w6Jg6Ch6a2-b_5HvJTWw",
    authDomain: "english-fun-1937c.firebaseapp.com",
    databaseURL: "https://english-fun-1937c-default-rtdb.firebaseio.com",
    projectId: "english-fun-1937c",
    storageBucket: "english-fun-1937c.firebasestorage.app",
    messagingSenderId: "236020730818",
    appId: "1:236020730818:web:4ebb378dc7a7005d2fa45b"
};

// Khởi tạo Firebase (Compat mode cho script.js cũ)
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const surveysRef = database.ref('surveys_ATTT');
const vnptRef = database.ref('danh_muc_vnpt');
const writersRef = database.ref('danh_muc_nguoi_viet');

// Khởi tạo các danh mục nếu trống
vnptRef.once('value', snap => {
    if (!snap.exists()) {
        const defaultVnpt = ["Việt Trì", "Thanh Ba", "Thanh Thủy", "Cẩm Khê", "Thanh Sơn", "Tân Sơn", "Hạ Hòa", "Sở Ban Ngành", "Y tế"];
        defaultVnpt.forEach(name => vnptRef.push({ ten: name }));
    }
});
writersRef.once('value', snap => {
    if (!snap.exists()) {
        const defaultWriters = ["Vũ Trường Giang", "Tạ Anh Tuấn", "Nguyễn Quyết Thắng", "Trần Đại Dương", "Ngô Tuấn Ngọc", "Nguyễn Đức Hoàng", "Lê Công Minh"];
        defaultWriters.forEach(name => writersRef.push({ ten: name }));
    }
});

// Lắng nghe danh mục động
vnptRef.on('value', snap => {
    danhmucVnpt = [];
    snap.forEach(c => { danhmucVnpt.push({ id: c.key, ...c.val() }); });
    renderVnptSelect();
});
writersRef.on('value', snap => {
    danhmucNguoiViet = [];
    snap.forEach(c => { danhmucNguoiViet.push({ id: c.key, ...c.val() }); });
    renderWriterSelect();
    renderSurveyorSelect();
});

// ===== Simple login guard (role-based) =====
const auth = (typeof requireAuth === 'function') ? requireAuth({ redirectTo: 'login.html' }) : null;
// Allow Viewer to stay on index.html if they are editing (to update notes)
if (auth && auth.role !== 'editor' && auth.role !== 'admin' && !(preloadEditId)) {
    window.location.href = 'list.html';
}

// Biến lưu trữ tại client
let localSurveys = [];
const urlParams = new URLSearchParams(window.location.search);
const preloadEditId = urlParams.get('editId');
const pageMode = urlParams.get('mode'); // 'new' to stay on index for add-new
let hasAutoLoadedPreload = false;

// Cấu hình Google Apps Script Upload
const APPS_SCRIPT_UPLOAD_URL = "https://script.google.com/macros/s/AKfycbzVMCrL3TihVkhqUzOOUurYAhTvzjjXhiiwmdepU1kySfMgJC-sCdP87Kp95h24-pvIow/exec";
let uploadedImages = []; // Mảng chứa { url: '', caption: '' }

let buildingPreviewVisible = false;

let danhMucVatTuList = [];
database.ref('danh_muc_vat_tu').on('value', snap => {
    danhMucVatTuList = [];
    snap.forEach(c => {
        danhMucVatTuList.push({ id: c.key, ...c.val() });
    });
    // Re-render bảng dự toán nếu đang có dữ liệu để update danh sách dropdown (tùy chọn)
    if (typeof renderEstimateTable === 'function') renderEstimateTable();
});

let estimateItems = []; // Lưu trữ dự toán

// Lắng nghe dữ liệu realtime từ Firebase
surveysRef.on('value', (snapshot) => {
    localSurveys = [];
    snapshot.forEach((childSnapshot) => {
        let data = childSnapshot.val();
        data.id = childSnapshot.key; // Gắn ID thật trên cloud vào
        localSurveys.push(data);
    });
    // Lưu ý: data này sẽ được cached ra localstorage để phòng khi offline
    localStorage.setItem('CACHED_SURVEYS', JSON.stringify(localSurveys));

    renderWriterSelect();
    updateCountBadge();

    // Nếu modal đang mở thì cập nhật luôn giao diện
    const modal = document.getElementById('listModal');
    if (modal && modal.classList.contains('show')) {
        renderListModal();
    }

    // Auto load edit nếu có param chuyển về từ trang Tòa nhà
    if (preloadEditId && !hasAutoLoadedPreload && localSurveys.length > 0) {
        hasAutoLoadedPreload = true;
        setTimeout(() => {
            loadSurveyToForm(preloadEditId);
            // Dọn dẹp URL để không bị dính param khi refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 300);
    }
});

// Nếu refresh/visit index không ở chế độ sửa hoặc tạo mới -> về danh sách
if (!preloadEditId && pageMode !== 'new') {
    window.location.replace('list.html');
}

// Khởi tạo
document.addEventListener('DOMContentLoaded', () => {
    renderHtttCheckboxes(false); 
    renderDeXuatSuggestions();

    const form = document.getElementById('surveyForm');
    if (form) form.addEventListener('submit', handleFormSubmit);

    const btnExport = document.getElementById('btnExport');
    if (btnExport) btnExport.addEventListener('click', exportToExcel);
    
    const btnExportWord = document.getElementById('btnExportWord');
    if (btnExportWord) btnExportWord.addEventListener('click', exportToWord);

    const btnAddEstimate = document.getElementById('btnAddEstimate');
    if (btnAddEstimate) {
        btnAddEstimate.addEventListener('click', () => {
            estimateItems.push({ ten: '', sl: 1, don_gia: 0 });
            renderEstimateTable();
        });
    }
});

function renderWriterSelect() {
    const select = document.getElementById('nguoi_viet_ho_so');
    if (!select) return;

    const currentValue = select.value;
    const writerStats = {};
    danhmucNguoiViet.forEach(w => {
        writerStats[w.ten] = { pending: 0, missingInfo: 0 };
    });

    localSurveys.forEach(s => {
        const ql = s.quan_ly_ho_so || {};
        const writer = ql.nguoi_viet_ho_so;
        const status = ql.tinh_trang || "Mới khảo sát chưa phân công";

        if (writer && writerStats[writer]) {
            if (!COMPLETED_STATUSES.includes(status)) {
                writerStats[writer].pending++;
                if (status === "Hồ sơ thiếu thông tin không viết được" || status === "Chờ bộ mẫu, sẽ viết sau") {
                    writerStats[writer].missingInfo++;
                }
            }
        }
    });

    const sortedWriters = [...danhmucNguoiViet].sort((a, b) => {
        const activeA = (writerStats[a.ten]?.pending || 0) - (writerStats[a.ten]?.missingInfo || 0);
        const activeB = (writerStats[b.ten]?.pending || 0) - (writerStats[b.ten]?.missingInfo || 0);
        return activeA - activeB;
    });

    let html = '<option value="">-- Chọn người viết hồ sơ --</option>';
    sortedWriters.forEach(w => {
        const name = w.ten;
        const activeCount = writerStats[name].pending - writerStats[name].missingInfo;
        const missingCount = writerStats[name].missingInfo;
        html += `<option value="${name}">${name} (Đang viết: ${activeCount}, thiếu TT: ${missingCount})</option>`;
    });

    select.innerHTML = html;
    if (currentValue) select.value = currentValue;
}

function renderSurveyorSelect() {
    const select = document.getElementById('nguoi_khao_sat');
    if (!select) return;

    const currentValue = select.value;
    let html = '<option value="">-- Chọn người khảo sát --</option>';
    
    // Tạo danh sách đã sort (chỉ lấy tên)
    const sortedWriters = [...danhmucNguoiViet].sort((a,b) => a.ten.localeCompare(b.ten));
    
    sortedWriters.forEach(w => {
        html += `<option value="${w.ten}">${w.ten}</option>`;
    });

    select.innerHTML = html;
    if (currentValue) select.value = currentValue;
}

function renderVnptSelect() {
    const select = document.getElementById('vnpt_khu_vuc');
    if (!select) return;
    const currentValue = select.value;
    let html = '<option value="">-- Chọn VNPT Khu Vực --</option>';
    danhmucVnpt.sort((a,b) => a.ten.localeCompare(b.ten)).forEach(v => {
        html += `<option value="${v.ten}">${v.ten}</option>`;
    });
    select.innerHTML = html;
    if (currentValue) select.value = currentValue;
}

document.addEventListener('DOMContentLoaded', () => {
    const btnToggleBuildingPreview = document.getElementById('btnToggleBuildingPreview');
    if (btnToggleBuildingPreview) {
        btnToggleBuildingPreview.addEventListener('click', () => {
            buildingPreviewVisible = !buildingPreviewVisible;
            updateBuildingPreviewVisibility();
        });
    }

    // Nút danh sách và Modal
    document.getElementById('btnViewList').addEventListener('click', openListModal);
    document.getElementById('btnCloseModal').addEventListener('click', closeListModal);
    document.getElementById('btnClearData').addEventListener('click', clearAllData);
    document.getElementById('btnCancelEdit').addEventListener('click', cancelEdit);
    const btnBackToCustomerList = document.getElementById('btnBackToCustomerList');
    if (btnBackToCustomerList) {
        btnBackToCustomerList.addEventListener('click', () => {
            window.location.href = 'list.html';
        });
    }

    const btnBackToListGlobal = document.getElementById('btnBackToListGlobal');
    if (btnBackToListGlobal) {
        btnBackToListGlobal.addEventListener('click', () => {
            window.location.href = 'list.html';
        });
    }

    // Nút Quản lý hệ thống TT
    document.getElementById('btnManageHttt').addEventListener('click', openManageHtttModal);
    document.getElementById('btnCloseHtttModal').addEventListener('click', closeManageHtttModal);
    document.getElementById('btnAddHtttBtn').addEventListener('click', addNewHttt);

    // Đóng modal khi bấm ra ngoài
    window.onclick = function (event) {
        const modal = document.getElementById('listModal');
        const manageModal = document.getElementById('manageHtttModal');
        if (event.target == modal) {
            closeListModal();
        }
        if (event.target == manageModal) {
            closeManageHtttModal();
        }
    }

    // Logic Offline/Online
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    // Hiển thị nút Quản trị tài khoản nếu là admin
    const btnManageUsersGlobal = document.getElementById('btnManageUsersGlobal');
    if (btnManageUsersGlobal && auth && auth.role === 'admin') {
        btnManageUsersGlobal.style.display = 'inline-flex';
        btnManageUsersGlobal.addEventListener('click', () => { window.location.href = 'tk.html'; });
    }

    // Thử đồng bộ dữ liệu Offline định kỳ (10s/lần)
    setInterval(syncOfflineData, 10000);

    // Logic Ẩn hiện ô nhập thiết bị tường lửa
    const tuongLuaCheckbox = document.getElementById('co_trien_khai_tuong_lua');
    const firewallWrapper = document.getElementById('firewallDeviceWrapper');

    if (tuongLuaCheckbox) {
        tuongLuaCheckbox.addEventListener('change', function () {
            if (this.checked) {
                firewallWrapper.style.display = 'flex';
                firewallWrapper.style.flexDirection = 'column'; // Hoặc block tùy CSS
            } else {
                firewallWrapper.style.display = 'none';
                document.getElementById('thiet_bi_tuong_lua').value = '';
            }
        });
    }

    // Logic Upload Ảnh
    const btnSelectImages = document.getElementById('btnSelectImages');
    const imageInput = document.getElementById('imageInput');

    if (btnSelectImages && imageInput) {
        btnSelectImages.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', handleImageSelection);
    }

    // Set default value for ngay_khao_sat and han_viet_ho_so
    const ngayKhaoSatInput = document.getElementById('ngay_khao_sat');
    const hanVietHoSoInput = document.getElementById('han_viet_ho_so');
    
    if (ngayKhaoSatInput && !ngayKhaoSatInput.value) {
        ngayKhaoSatInput.value = new Date().toISOString().split('T')[0];
    }
    if (hanVietHoSoInput && !hanVietHoSoInput.value) {
        // Default deadline is +1 day from now
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        hanVietHoSoInput.value = tomorrow.toISOString().split('T')[0];
    }

    // Tự động phân công người viết hồ sơ và chỉnh trạng thái
    const nguoiKhaoSatSelect = document.getElementById('nguoi_khao_sat');
    const nguoiVietHoSoSelect = document.getElementById('nguoi_viet_ho_so');
    const tinhTrangSelect = document.getElementById('tinh_trang');

    if (nguoiKhaoSatSelect) {
        nguoiKhaoSatSelect.addEventListener('change', function() {
            if (this.value) {
                if (nguoiVietHoSoSelect) nguoiVietHoSoSelect.value = this.value;
                if (tinhTrangSelect) tinhTrangSelect.value = 'Đã phân công';
            }
        });
    }
});

function handleImageSelection(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    files.forEach(file => {
        uploadImageToDrive(file);
    });

    // Reset input để có thể chọn lại cùng file nếu muốn
    e.target.value = '';
}

function uploadImageToDrive(file) {
    // Lấy tên đơn vị để đặt tên file
    const unitName = document.getElementsByName('don_vi_khao_sat')[0]?.value || 'KhaoSat';
    const cleanName = unitName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");

    const now = new Date();
    const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + "_" +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    const newFileName = `${cleanName}_${timestamp}_${file.name}`;

    // Tạo preview tạm thời với trạng thái đang upload
    const tempId = 'img_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const reader = new FileReader();

    reader.onload = function (event) {
        const base64 = event.target.result;

        // Thêm vào UI trạng thái chờ
        appendImageToGrid({
            id: tempId,
            urlBase64: base64, // Dùng base64 để xem trước ngay lập tức
            uploading: true,
            caption: ''
        });

        // Gửi lên Google Apps Script
        fetch(APPS_SCRIPT_UPLOAD_URL, {
            method: 'POST',
            body: JSON.stringify({
                base64: base64,
                filename: newFileName,
                mimeType: file.type
            })
        })
            .then(response => {
                // Apps Script hay redirect (302), fetch sẽ tự follow.
                // Nếu chết ở đây với lỗi CORS, khả năng cao là do Apps Script chưa 'Deploy' đúng 'Anyone'.
                return response.json();
            })
            .then(result => {
                if (result.success) {
                    // Cập nhật mảng dữ liệu thật
                    const newImg = { url: result.url, previewUrl: result.previewUrl, caption: '' };
                    uploadedImages.push(newImg);

                    // Cập nhật UI: Bỏ trạng thái uploading, gán URL thật
                    updateImageInGrid(tempId, newImg);
                    showToast("Đã tải lên ảnh thành công!");
                } else {
                    removeImageFromGrid(tempId);
                    showToast("Lỗi tải ảnh: " + result.error, "error");
                }
            })
            .catch(err => {
                removeImageFromGrid(tempId);
                showToast("Lỗi kết nối khi tải ảnh!", "error");
                console.error(err);
            });
    };
    reader.readAsDataURL(file);
}

function appendImageToGrid(imgData) {
    const grid = document.getElementById('imageGrid');
    const btnAdd = document.getElementById('btnSelectImages');

    const item = document.createElement('div');
    item.className = 'image-item';
    item.id = imgData.id || '';

    item.innerHTML = `
        <div class="image-preview-wrapper text-center">
            <img src="${imgData.url || imgData.urlBase64}" alt="Preview">
            ${imgData.uploading ? '<div class="uploading-overlay">Đang tải...</div>' : ''}
            <button type="button" class="btn-remove-image" onclick="deleteImageLocally('${imgData.id || ''}', '${imgData.url || ''}')">&times;</button>
        </div>
        <textarea class="image-description" placeholder="Mô tả ảnh..." onchange="updateImageCaption('${imgData.url || ''}', this.value)">${imgData.caption || ''}</textarea>
    `;

    grid.insertBefore(item, btnAdd);
}

function updateImageInGrid(tempId, realData) {
    const item = document.getElementById(tempId);
    if (!item) return;

    const img = item.querySelector('img');
    const overlay = item.querySelector('.uploading-overlay');
    const btnDel = item.querySelector('.btn-remove-image');
    const textarea = item.querySelector('.image-description');

    // Xử lý link Google Drive để hiển thị được trực tiếp
    let displayUrl = realData.url;
    if (displayUrl.includes('drive.google.com')) {
        // Chuyển đổi link sang định dạng lh3 (ổn định hơn cho việc hiển thị ảnh công khai)
        const fileIdMatch = displayUrl.match(/[-\w]{25,}/);
        if (fileIdMatch) {
            displayUrl = `https://lh3.googleusercontent.com/d/${fileIdMatch[0]}`;
        }
    }

    if (img) img.src = displayUrl;
    if (overlay) overlay.remove();

    // Cập nhật tham số cho các hàm xử lý
    const finalUrl = displayUrl;
    if (btnDel) {
        btnDel.setAttribute('onclick', `deleteImageLocally('${tempId}', '${finalUrl}')`);
    }
    if (textarea) {
        textarea.setAttribute('onchange', `updateImageCaption('${finalUrl}', this.value)`);
    }

    // Cật nhật lại URL trong mảng dữ liệu
    const imgInArray = uploadedImages.find(i => i.url === realData.url);
    if (imgInArray) {
        imgInArray.url = finalUrl;
    }
}

function removeImageFromGrid(id) {
    const item = document.getElementById(id);
    if (item) item.remove();
}

window.updateImageCaption = function (url, caption) {
    const img = uploadedImages.find(i => i.url === url);
    if (img) img.caption = caption;
}

window.deleteImageLocally = function (uiId, url) {
    if (!confirm("Xóa ảnh này khỏi phiếu khảo sát?")) return;

    // Xóa khỏi mảng dữ liệu
    uploadedImages = uploadedImages.filter(i => i.url !== url);

    // Xóa khỏi UI
    const item = document.getElementById(uiId);
    if (item) item.remove();
}

function renderUploadedImages() {
    // Chỉ dùng khi Load từ Firebase về
    const grid = document.getElementById('imageGrid');
    const btnAdd = document.getElementById('btnSelectImages');

    // Giữ lại nút thêm
    const items = grid.querySelectorAll('.image-item');
    items.forEach(it => it.remove());

    uploadedImages.forEach((img, index) => {
        const id = 'img_loaded_' + index;

        let displayUrl = img.url;
        if (displayUrl.includes('drive.google.com')) {
            const fileIdMatch = displayUrl.match(/[-\w]{25,}/);
            if (fileIdMatch) {
                displayUrl = `https://lh3.googleusercontent.com/d/${fileIdMatch[0]}`;
            }
        }

        appendImageToGrid({
            id: id,
            url: displayUrl,
            caption: img.caption || ''
        });
    });
}

// ===== LOGIC OFFLINE =====
function updateNetworkStatus() {
    const statusDiv = document.getElementById('networkStatus');
    if (!navigator.onLine) {
        statusDiv.style.display = 'block';
    } else {
        statusDiv.style.display = 'none';
        syncOfflineData(); // Thử sync ngay khi có mạng
    }
}

function getOfflineSurveys() {
    return JSON.parse(localStorage.getItem('OFFLINE_SURVEYS')) || [];
}

function saveOfflineSurvey(data, actionStr) {
    const offlineList = getOfflineSurveys();
    data._offlineAction = actionStr; // 'add' hoặc 'update' hoặc 'delete'
    data._offlineTimestamp = Date.now();

    if (!data.id) data.id = 'offline_' + Date.now();

    // Nếu là update/delete, tìm xem đã có trong offline list chưa thì đè
    const existingIndex = offlineList.findIndex(s => s.id === data.id);
    if (existingIndex >= 0) {
        offlineList[existingIndex] = data;
    } else {
        offlineList.push(data);
    }

    localStorage.setItem('OFFLINE_SURVEYS', JSON.stringify(offlineList));
    showToast("Đã lưu ngoại tuyến. Đang chờ mạng để đồng bộ...", "info");

    if (actionStr !== 'delete') {
        // Render tạm vào localSurveys màn hình
        const idx = localSurveys.findIndex(s => s.id === data.id);
        if (idx >= 0) localSurveys[idx] = data;
        else localSurveys.push(data);
        updateCountBadge();
        if (document.getElementById('listModal').classList.contains('show')) renderListModal();
    }
}

function syncOfflineData() {
    if (!navigator.onLine) return;

    let offlineList = getOfflineSurveys();
    if (offlineList.length === 0) return;

    const statusText = document.getElementById('submitText');
    const original = statusText ? statusText.innerText : 'Lưu';
    if (statusText) statusText.innerText = `Đang đồng bộ (${offlineList.length})...`;

    // Lấy 1 record ra sync
    const record = offlineList.shift();
    const action = record._offlineAction;
    const recordId = record.id;

    // Xóa metadata offline
    delete record._offlineAction;
    delete record._offlineTimestamp;

    let promise;
    if (action === 'delete') {
        promise = surveysRef.child(recordId).remove();
    } else if (action === 'update') {
        delete record.id;
        promise = surveysRef.child(recordId).update(record);
    } else { // add
        delete record.id;
        if (recordId.startsWith('offline_')) {
            promise = surveysRef.push(record);
        } else {
            promise = surveysRef.child(recordId).set(record);
        }
    }

    promise.then(() => {
        // Thành công 1 cái -> Lưu phần còn lại và gọi lại hàm (để xử lý cái tiếp theo)
        localStorage.setItem('OFFLINE_SURVEYS', JSON.stringify(offlineList));
        syncOfflineData();
    }).catch(e => {
        console.error("Lỗi sync: ", e);
        // Lỗi thì trả lại vào mảng
        record._offlineAction = action;
        record.id = recordId;
        offlineList.unshift(record);
        localStorage.setItem('OFFLINE_SURVEYS', JSON.stringify(offlineList));
        if (statusText) statusText.innerText = original;
    });

    if (offlineList.length === 0 && statusText) {
        showToast("Đã đồng bộ xong dữ liệu ngoại tuyến!");
        statusText.innerText = original;
    }
}
// ==========================

function getSurveys() {
    // Nếu rớt mạng và firebase chưa đổ về, lấy cache
    if (localSurveys.length === 0) {
        const cached = localStorage.getItem('CACHED_SURVEYS');
        if (cached) localSurveys = JSON.parse(cached);
    }
    return localSurveys;
}

// Render checkboxes HTTT
function renderHtttCheckboxes(forceCheckAll = false, newlyAddedItem = null) {
    const container = document.getElementById('htttList');

    // Ghi nhớ lại những ô nào đang được check trên màn hình (để khi vẽ lại không bị mất)
    const checkedValues = new Set();
    const existingCheckboxes = container.querySelectorAll('input[type="checkbox"]');

    // Nếu màn hình đã có checkbox (tức là đang sửa/thêm dở), ta lưu lại trạng thái của những ô đang tick
    if (existingCheckboxes.length > 0 && !forceCheckAll) {
        existingCheckboxes.forEach(cb => {
            if (cb.checked) checkedValues.add(cb.value);
        });
    }

    container.innerHTML = ''; // Làm sạch để vẽ lại danh sách mới nhất

    dynamicHtttList.forEach((item) => {
        const label = document.createElement('label');
        label.className = 'custom-checkbox';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = `he_thong_thong_tin`;
        input.value = item;

        // Tick ô này khi:
        // 1. Lần đầu mở form hoặc Reset form (forceCheckAll = true)
        // 2. Ô này vừa được user bấm Thêm mới (newlyAddedItem)
        // 3. Trong trường hợp đang vẽ lại list (do thêm mới/xoá), nếu ô này TRƯỚC ĐÓ ĐANG ĐƯỢC TICK thì tick lại.
        //     * Ngoại lệ: Nếu màn hình chưa có gì (existingCheckboxes.length === 0) thì mặc định tick hết như lần đầu.
        if (
            forceCheckAll ||
            item === newlyAddedItem ||
            (existingCheckboxes.length > 0 && checkedValues.has(item)) ||
            (existingCheckboxes.length === 0)
        ) {
            input.checked = true;
        }

        const span = document.createElement('span');
        span.className = 'checkmark';

        label.appendChild(input);
        label.appendChild(span);

        // Highlight đỏ nếu không phải hệ thống mặc định
        if (!HTTT_LIST.includes(item)) {
            const customText = document.createElement('span');
            customText.style.color = '#ef4444';
            customText.style.fontWeight = '500';
            customText.textContent = ' ' + item;
            label.appendChild(customText);
        } else {
            const text = document.createTextNode(' ' + item);
            label.appendChild(text);
        }

        container.appendChild(label);
    });
}

const DE_XUAT_SUGGESTIONS = [
    "Bổ sung thiết bị cân bằng tải",
    "Convert quang điện số lượng: ",
    "Dây lan quang số lượng: ",
    "Dây lan thường số lượng: ",
    "Đi lan quang từ: ",
    "Bổ sung switch loại có lượng port là: ",
    "Tủ rack: ",
    "Số công: "
];

function renderDeXuatSuggestions() {
    const container = document.getElementById('quickDeXuatSuggestionsBox');
    const textarea = document.getElementById('de_xuat_textarea');
    if (!container || !textarea) return;

    container.innerHTML = '';
    DE_XUAT_SUGGESTIONS.forEach(text => {
        const chip = document.createElement('span');
        chip.style.cssText = 'background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 0.8rem; padding: 6px 10px; border-radius: 12px; cursor: pointer; user-select: none; transition: 0.2s;';
        chip.innerText = '+ ' + text.replace(': ', '');
        chip.title = "Thêm vào Đề xuất";

        chip.onmouseover = () => chip.style.background = '#bae6fd';
        chip.onmouseout = () => chip.style.background = '#e0f2fe';

        chip.addEventListener('click', () => {
            const currentVal = textarea.value;
            if (currentVal && !currentVal.endsWith('\n')) {
                textarea.value += '\n- ' + text;
            } else {
                textarea.value += '- ' + text;
            }
            textarea.focus();
        });

        container.appendChild(chip);
    });
}

// Gom thông tin từ form
function getFormData() {
    const form = document.getElementById('surveyForm');
    const formData = new FormData(form);

    const htttArray = formData.getAll('he_thong_thong_tin');

    // Nếu đang sửa thì sẽ có editId, nếu mới thì id sẽ trống và Firebase sẽ tự tạo
    const id = document.getElementById('editId').value;

    return {
        id: id,
        ten_khao_sat: "Bảng khảo sát ATTT Cấp độ 2",
        don_vi_khao_sat: formData.get('don_vi_khao_sat'),
        de_xuat: formData.get('de_xuat') || "",
        thoi_gian_nhap: new Date().toISOString(),
        ha_tang_thiet_bi: {
            tong_may_ban: parseInt(formData.get('ha_tang_thiet_bi.tong_may_ban')) || 0,
            tong_laptop: parseInt(formData.get('ha_tang_thiet_bi.tong_laptop')) || 0,
            so_may_ram_lon_hon_4G: parseInt(formData.get('ha_tang_thiet_bi.so_may_ram_lon_hon_4G')) || 0,
            so_duong_internet: parseInt(formData.get('ha_tang_thiet_bi.so_duong_internet')) || 0,
            so_camera: formData.get('ha_tang_thiet_bi.so_camera') || "0",
            cai_phan_mem_antivirus: formData.get('ha_tang_thiet_bi.cai_phan_mem_antivirus') || "",
            so_luong_cai_smartIR: parseInt(formData.get('ha_tang_thiet_bi.so_luong_cai_smartIR')) || 0,
            he_thong_mang_lan: formData.get('ha_tang_thiet_bi.he_thong_mang_lan') ? true : false,
            co_thi_cong_mang_lan: formData.get('ha_tang_thiet_bi.co_thi_cong_mang_lan') ? true : false,
            tuong_lua: formData.get('ha_tang_thiet_bi.tuong_lua') ? true : false,
            co_trien_khai_tuong_lua: formData.get('ha_tang_thiet_bi.co_trien_khai_tuong_lua') ? true : false,
            thiet_bi_tuong_lua: formData.get('ha_tang_thiet_bi.thiet_bi_tuong_lua') || ""
        },
        he_thong_thong_tin: htttArray,
        thong_tin_lien_he: {
            dau_moi_cung_cap: {
                ho_ten: formData.get('thong_tin_lien_he.dau_moi_cung_cap.ho_ten'),
                so_dien_thoai: formData.get('thong_tin_lien_he.dau_moi_cung_cap.so_dien_thoai'),
                don_vi: formData.get('thong_tin_lien_he.dau_moi_cung_cap.don_vi')
            },
            don_vi_van_hanh: {
                nguoi_dai_dien: formData.get('thong_tin_lien_he.don_vi_van_hanh.nguoi_dai_dien'),
                chuc_vu: formData.get('thong_tin_lien_he.don_vi_van_hanh.chuc_vu'),
                dia_chi: formData.get('thong_tin_lien_he.don_vi_van_hanh.dia_chi'),
                so_dien_thoai: formData.get('thong_tin_lien_he.don_vi_van_hanh.so_dien_thoai'),
                thu_dien_tu: formData.get('thong_tin_lien_he.don_vi_van_hanh.thu_dien_tu')
            },
            cong_an_xa: {
                ho_ten: formData.get('thong_tin_lien_he.cong_an_xa.ho_ten'),
                so_dien_thoai: formData.get('thong_tin_lien_he.cong_an_xa.so_dien_thoai')
            }
        },
        hinh_anh_hien_truong: uploadedImages,
        du_toan_thiet_bi: estimateItems,
        quan_ly_ho_so: {
            ngay_khao_sat: formData.get('quan_ly_ho_so.ngay_khao_sat') || "",
            nguoi_khao_sat: formData.get('quan_ly_ho_so.nguoi_khao_sat') || "",
            nguoi_viet_ho_so: formData.get('quan_ly_ho_so.nguoi_viet_ho_so') || "",
            han_viet_ho_so: formData.get('quan_ly_ho_so.han_viet_ho_so') || "",
            site: formData.get('quan_ly_ho_so.site') || "",
            vnpt_khu_vuc: formData.get('quan_ly_ho_so.vnpt_khu_vuc') || "",
            tinh_trang: formData.get('quan_ly_ho_so.tinh_trang') || "Mới khảo sát chưa phân công",
            ghi_chu_viet_ho_so: formData.get('quan_ly_ho_so.ghi_chu_viet_ho_so') || ""
        }
    };
}

// Xử lý Submit
function handleFormSubmit(e) {
    e.preventDefault();
    if (!auth || (auth.role !== 'editor' && auth.role !== 'admin')) {
        showToast("Tài khoản hiện tại chỉ có quyền xem.", "error");
        return;
    }
    const data = getFormData();

    const currentUser = auth ? auth.user : "Khách";

    // Vô hiệu hóa nút lưu tạm thời
    const btnSubmit = document.getElementById('btnSubmit');
    const submitText = document.getElementById('submitText');
    const originalText = submitText.innerText;

    btnSubmit.disabled = true;
    submitText.innerText = "Đang lưu...";
    btnSubmit.style.opacity = 0.7;

    const isEdit = document.getElementById('editId').value !== "";

    if (!navigator.onLine) {
        // OFFLINE MODE
        if (isEdit) {
            data.nguoi_cap_nhat = currentUser;
            data.thoi_gian_cap_nhat = new Date().toISOString();
            saveOfflineSurvey(data, 'update');
        } else {
            data.nguoi_tao = currentUser;
            saveOfflineSurvey(data, 'add');
            e.target.reset();
            document.getElementById('firewallDeviceWrapper').style.display = 'none';
            document.getElementById('don_vi_khao_sat').focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        btnSubmit.disabled = false;
        submitText.innerText = originalText;
        btnSubmit.style.opacity = 1;
        return;
    }

    // ONLINE MODE
    if (isEdit) {
        // Cập nhật lên Firebase
        const recordId = data.id;
        delete data.id; // Không cần lưu id vào trong nội dung do nó là key rồi

        data.nguoi_cap_nhat = currentUser;
        data.thoi_gian_cap_nhat = new Date().toISOString();

        surveysRef.child(recordId).update(data)
            .then(() => {
                showToast('Cập nhật dữ liệu thành công!');
                // Đã bỏ dòng cancelEdit() để form giữ nguyên trạng thái sửa
            })
            .catch((error) => {
                showToast('Lỗi khi cập nhật: ' + error.message, 'error');
            })
            .finally(() => {
                btnSubmit.disabled = false;
                submitText.innerText = originalText;
                btnSubmit.style.opacity = 1;
            });
    } else {
        // Thêm mới lên Firebase
        delete data.id;
        data.nguoi_tao = currentUser;

        surveysRef.push(data)
            .then(() => {
                showToast('Đã thêm mới thành công!');
                e.target.reset();
                document.getElementById('firewallDeviceWrapper').style.display = 'none'; // Ẩn ô tường lửa sau khi submit
                document.getElementById('don_vi_khao_sat').focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            })
            .catch((error) => {
                showToast('Lỗi khi thêm mới: ' + error.message, 'error');
            })
            .finally(() => {
                btnSubmit.disabled = false;
                submitText.innerText = originalText;
                btnSubmit.style.opacity = 1;
            });
    }
}

// Tính năng Load dữ liệu vào form để sửa
function loadSurveyToForm(id) {
    if (!auth) return;
    const isViewer = (auth.role === 'viewer');
    
    // Viewer can only load for editing, not for general access if guard didn't block
    if (isViewer && !id) {
        showToast("Tài khoản hiện tại chỉ có quyền xem.", "error");
        return;
    }

    const surveys = getSurveys();
    const survey = surveys.find(s => s.id === id);
    if (!survey) return;

    // Chuẩn hóa cấu trúc để tránh lỗi khi bản ghi mới chỉ có tên
    if (!survey.ha_tang_thiet_bi) survey.ha_tang_thiet_bi = {};
    if (!survey.thong_tin_lien_he) survey.thong_tin_lien_he = {};
    if (!survey.thong_tin_lien_he.dau_moi_cung_cap) survey.thong_tin_lien_he.dau_moi_cung_cap = {};
    if (!survey.thong_tin_lien_he.don_vi_van_hanh) survey.thong_tin_lien_he.don_vi_van_hanh = {};
    if (!survey.thong_tin_lien_he.cong_an_xa) survey.thong_tin_lien_he.cong_an_xa = {};
    if (!Array.isArray(survey.he_thong_thong_tin)) survey.he_thong_thong_tin = [];
    if (!survey.quan_ly_ho_so) survey.quan_ly_ho_so = {};

    const form = document.getElementById('surveyForm');
    form.reset(); // clear cũ

    // Set hidden id
    document.getElementById('editId').value = survey.id;

    // Điền trường cơ bản
    form.elements['don_vi_khao_sat'].value = survey.don_vi_khao_sat || "";
    if (form.elements['de_xuat']) {
        form.elements['de_xuat'].value = survey.de_xuat || "";
    }
    form.elements['ha_tang_thiet_bi.tong_may_ban'].value = survey.ha_tang_thiet_bi.tong_may_ban || "";
    form.elements['ha_tang_thiet_bi.tong_laptop'].value = survey.ha_tang_thiet_bi.tong_laptop || "";
    form.elements['ha_tang_thiet_bi.so_may_ram_lon_hon_4G'].value = survey.ha_tang_thiet_bi.so_may_ram_lon_hon_4G || "";
    form.elements['ha_tang_thiet_bi.so_duong_internet'].value = survey.ha_tang_thiet_bi.so_duong_internet || "";
    form.elements['ha_tang_thiet_bi.so_camera'].value = survey.ha_tang_thiet_bi.so_camera || "";
    form.elements['ha_tang_thiet_bi.cai_phan_mem_antivirus'].value = survey.ha_tang_thiet_bi.cai_phan_mem_antivirus || "";
    form.elements['ha_tang_thiet_bi.so_luong_cai_smartIR'].value = survey.ha_tang_thiet_bi.so_luong_cai_smartIR || "";

    // Checkbox hạ tầng
    form.elements['ha_tang_thiet_bi.he_thong_mang_lan'].checked = survey.ha_tang_thiet_bi.he_thong_mang_lan;
    form.elements['ha_tang_thiet_bi.co_thi_cong_mang_lan'].checked = survey.ha_tang_thiet_bi.co_thi_cong_mang_lan;
    form.elements['ha_tang_thiet_bi.tuong_lua'].checked = survey.ha_tang_thiet_bi.tuong_lua;

    const tuongLuaCheckbox = document.getElementById('co_trien_khai_tuong_lua');
    tuongLuaCheckbox.checked = survey.ha_tang_thiet_bi.co_trien_khai_tuong_lua;

    // Tên thiết bị tường lửa
    const tbTuongLua = document.getElementById('thiet_bi_tuong_lua');
    if (tbTuongLua) tbTuongLua.value = survey.ha_tang_thiet_bi.thiet_bi_tuong_lua || "";

    // Trigger sự kiện thay đổi để hiện ô nhập
    tuongLuaCheckbox.dispatchEvent(new Event('change'));

    // Checkbox HTTT
    const httts = form.elements['he_thong_thong_tin'];
    if (httts && httts.length && Array.isArray(survey.he_thong_thong_tin)) {
        for (let i = 0; i < httts.length; i++) {
            if (survey.he_thong_thong_tin.includes(httts[i].value)) {
                httts[i].checked = true;
            }
        }
    }

    // Liên hệ
    form.elements['thong_tin_lien_he.dau_moi_cung_cap.ho_ten'].value = survey.thong_tin_lien_he.dau_moi_cung_cap.ho_ten || "";
    form.elements['thong_tin_lien_he.dau_moi_cung_cap.so_dien_thoai'].value = survey.thong_tin_lien_he.dau_moi_cung_cap.so_dien_thoai || "";
    form.elements['thong_tin_lien_he.dau_moi_cung_cap.don_vi'].value = survey.thong_tin_lien_he.dau_moi_cung_cap.don_vi || "";

    form.elements['thong_tin_lien_he.don_vi_van_hanh.nguoi_dai_dien'].value = survey.thong_tin_lien_he.don_vi_van_hanh.nguoi_dai_dien || "";
    form.elements['thong_tin_lien_he.don_vi_van_hanh.chuc_vu'].value = survey.thong_tin_lien_he.don_vi_van_hanh.chuc_vu || "";
    form.elements['thong_tin_lien_he.don_vi_van_hanh.dia_chi'].value = survey.thong_tin_lien_he.don_vi_van_hanh.dia_chi || "";
    form.elements['thong_tin_lien_he.don_vi_van_hanh.so_dien_thoai'].value = survey.thong_tin_lien_he.don_vi_van_hanh.so_dien_thoai || "";
    form.elements['thong_tin_lien_he.don_vi_van_hanh.thu_dien_tu'].value = survey.thong_tin_lien_he.don_vi_van_hanh.thu_dien_tu || "";

    form.elements['thong_tin_lien_he.cong_an_xa.ho_ten'].value = survey.thong_tin_lien_he.cong_an_xa.ho_ten || "";
    form.elements['thong_tin_lien_he.cong_an_xa.so_dien_thoai'].value = survey.thong_tin_lien_he.cong_an_xa.so_dien_thoai || "";

    // Quản lý hồ sơ
    form.elements['quan_ly_ho_so.ngay_khao_sat'].value = survey.quan_ly_ho_so.ngay_khao_sat || new Date().toISOString().split('T')[0];
    form.elements['quan_ly_ho_so.nguoi_khao_sat'].value = survey.quan_ly_ho_so.nguoi_khao_sat || "";
    form.elements['quan_ly_ho_so.nguoi_viet_ho_so'].value = survey.quan_ly_ho_so.nguoi_viet_ho_so || "";
    form.elements['quan_ly_ho_so.han_viet_ho_so'].value = survey.quan_ly_ho_so.han_viet_ho_so || "";
    form.elements['quan_ly_ho_so.site'].value = survey.quan_ly_ho_so.site || "";
    form.elements['quan_ly_ho_so.vnpt_khu_vuc'].value = survey.quan_ly_ho_so.vnpt_khu_vuc || "";
    form.elements['quan_ly_ho_so.tinh_trang'].value = survey.quan_ly_ho_so.tinh_trang || "Mới khảo sát chưa phân công";
    if (form.elements['quan_ly_ho_so.ghi_chu_viet_ho_so']) {
        form.elements['quan_ly_ho_so.ghi_chu_viet_ho_so'].value = survey.quan_ly_ho_so.ghi_chu_viet_ho_so || "";
    }

    // Hình ảnh
    uploadedImages = Array.isArray(survey.hinh_anh_hien_truong) ? survey.hinh_anh_hien_truong : [];
    renderUploadedImages();

    // Dự toán
    estimateItems = Array.isArray(survey.du_toan_thiet_bi) ? [...survey.du_toan_thiet_bi] : [];
    renderEstimateTable();

    // Bật hiệu ứng chế độ sửa
    document.getElementById('editAlert').style.display = 'flex';
    document.getElementById('editingName').innerText = survey.don_vi_khao_sat;

    // Hiển thị nút Khảo sát Tòa nhà & gán link
    document.getElementById('buildingSurveyWrapper').style.display = 'block';
    document.getElementById('btnOpenBuildingSurvey').onclick = () => {
        window.location.href = `building.html?customerId=${survey.id}&customerName=${encodeURIComponent(survey.don_vi_khao_sat)}`;
    };
    const btnOpenCampusLayout = document.getElementById('btnOpenCampusLayout');
    if (btnOpenCampusLayout) {
        btnOpenCampusLayout.onclick = () => {
            window.location.href = `campus.html?customerId=${survey.id}&customerName=${encodeURIComponent(survey.don_vi_khao_sat)}`;
        };
    }

    // Preview sơ đồ ngay trong index (read-only, group từng tòa nhà)
    renderBuildingsPreview(survey.buildingsArray, survey.id, survey.don_vi_khao_sat);

    // Nếu là Viewer, vô hiệu hóa các field khác ngoài ghi chú viết hồ sơ
    if (auth.role === 'viewer') {
        const form = document.getElementById('surveyForm');
        Array.from(form.elements).forEach(el => {
            if (el.id !== 'ghi_chu_viet_ho_so' && el.id !== 'editId') {
                el.disabled = true;
            }
        });
        // Ẩn các nút thêm tòa nhà
        const bldgWrapper = document.getElementById('buildingSurveyWrapper');
        if (bldgWrapper) bldgWrapper.style.display = 'none';
        
        // Thay đổi label nút submit cho rõ ràng
        const btnSubmit = document.getElementById('btnSubmit');
        const submitText = document.getElementById('submitText');
        if (submitText) submitText.innerText = 'Chỉ cập nhật ghi chú';
    }
    buildingPreviewVisible = false; // mặc định ẩn, bấm "Xem nhanh" mới hiện
    updateBuildingPreviewVisibility();

    // Nút xem chi tiết ở thanh Edit Alert
    const btnViewDetailCurrent = document.getElementById('btnViewDetailCurrent');
    if (btnViewDetailCurrent) {
        btnViewDetailCurrent.onclick = () => {
            viewDetail(survey.id);
        };
    }

    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.classList.add('edit-mode');
    document.getElementById('submitText').innerText = "Cập Nhật Khảo Sát";

    closeListModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Đang sửa: ${survey.don_vi_khao_sat}`, 'info');
}

// Hủy chế độ chỉnh sửa
function cancelEdit() {
    document.getElementById('surveyForm').reset();
    document.getElementById('editId').value = "";

    // Ẩn wrapper firewall
    document.getElementById('firewallDeviceWrapper').style.display = 'none';

    // Reset lại checkbox (false: không tick sẵn cái nào) khi về form thêm mới
    renderHtttCheckboxes(false);

    document.getElementById('editAlert').style.display = 'none';

    // Ẩn nút Sơ đồ tòa nhà
    document.getElementById('buildingSurveyWrapper').style.display = 'none';
    buildingPreviewVisible = false;
    updateBuildingPreviewVisibility();

    // Xóa ảnh
    uploadedImages = [];
    renderUploadedImages();
    
    estimateItems = [];
    renderEstimateTable();

    const btnSubmit = document.getElementById('btnSubmit');
    btnSubmit.classList.remove('edit-mode');
    document.getElementById('submitText').innerText = "Lưu Khảo Sát Mới";
}

function updateBuildingPreviewVisibility() {
    const container = document.getElementById('buildingPreviewContainer');
    const btn = document.getElementById('btnToggleBuildingPreview');
    if (!container || !btn) return;
    container.style.display = buildingPreviewVisible ? 'block' : 'none';
    btn.innerText = buildingPreviewVisible ? 'Ẩn xem nhanh' : 'Xem nhanh';
}

function renderBuildingsPreview(buildingsArray, customerIdForLink, customerNameForLink) {
    const container = document.getElementById('buildingPreviewContainer');
    if (!container) return;

    if (!buildingsArray || !Array.isArray(buildingsArray) || buildingsArray.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding:10px;">Chưa có dữ liệu sơ đồ tòa nhà.</div>`;
        return;
    }

    const safeStr = (v) => (v === null || v === undefined) ? '' : String(v);

    let html = '';
    buildingsArray.forEach((bldg, idx) => {
        const nodes = Array.isArray(bldg.nodes) ? bldg.nodes : [];
        const eqs = Array.isArray(bldg.equipments) ? bldg.equipments : [];

        const floorCount = new Set(
            nodes
                .map(n => (n && n.floor !== undefined) ? Number(n.floor) : null)
                .filter(v => v !== null && !Number.isNaN(v))
        ).size;

        const ispLines = eqs
            .map(e => (e && e.isp ? String(e.isp).trim() : ''))
            .filter(v => v !== '');
        const ispCount = ispLines.length;
        const providerMap = new Map();
        ispLines.forEach(v => {
            const key = v.toLowerCase();
            if (!providerMap.has(key)) providerMap.set(key, v);
        });
        const ispProviders = Array.from(providerMap.values());

        const note = bldg.mainNetworkNotes ? String(bldg.mainNetworkNotes).trim() : '';
        const noteText = note || 'Không có ghi chú tòa nhà';
        const ispText = ispCount > 0 ? `ISP: ${ispCount} (${ispProviders.join(', ')})` : `ISP: 0`;

        const bldgId = bldg.id || `bldg_${idx}`;
        const link = `building.html?customerId=${encodeURIComponent(customerIdForLink || '')}&customerName=${encodeURIComponent(customerNameForLink || '')}&buildingId=${encodeURIComponent(bldgId)}`;

        html += `
            <a class="quick-bldg" href="${link}" title="Bấm để sửa tòa nhà">
                <div class="quick-bldg-actions">
                    <span class="qbtn" title="Sửa">✎</span>
                    <span class="qbtn" title="Mở trang sửa">↗</span>
                </div>
                <div class="quick-bldg-name">🏢 ${safeStr(bldg.name) || '-'}</div>
                <div class="quick-bldg-meta">🏬 ${floorCount} tầng • ${nodes.length} khu vực • ${eqs.length} thiết bị</div>
                <div class="quick-bldg-isp">🌐 ${ispText}</div>
                <div class="quick-bldg-note">📝 ${safeStr(noteText)}</div>
            </a>
        `;
    });

    container.innerHTML = html;
}

// Xóa một survey
function deleteSurvey(id) {
    if (!auth || auth.role !== 'editor' && auth.role !== 'admin') {
        showToast("Tài khoản hiện tại chỉ có quyền xem.", "error");
        return;
    }
    if (confirm("Bạn có chắc chắn xóa bản ghi này?")) {
        if (!navigator.onLine) {
            saveOfflineSurvey({ id: id }, 'delete');
            localSurveys = localSurveys.filter(s => s.id !== id);
            renderListModal();
            updateCountBadge();
        } else {
            surveysRef.child(id).remove()
                .then(() => {
                    // Nếu đang sửa thằng này thì hủy sửa
                    if (document.getElementById('editId').value === id) {
                        cancelEdit();
                    }
                    showToast("Đã xóa bản ghi!");
                })
                .catch((error) => {
                    showToast("Lỗi khi xóa: " + error.message, 'error');
                });
        }
    }
}

// Xóa tất cả
function clearAllData() {
    const surveys = getSurveys();
    if (surveys.length === 0) return;

    if (confirm(`Bạn có chắc muốn xóa TẤT CẢ ${surveys.length} bản ghi trên Cơ sở dữ liệu? Hành động này không thể hoàn tác!`)) {
        if (!auth || auth.role !== 'editor' && auth.role !== 'admin') {
            showToast("Tài khoản hiện tại chỉ có quyền xem.", "error");
            return;
        }
        surveysRef.remove()
            .then(() => {
                cancelEdit();
                showToast('Đã xóa tất cả dữ liệu từ Firebase!');
            })
            .catch((error) => {
                showToast("Lỗi khi xóa: " + error.message, 'error');
            });
    }
}

// Giao diện Modal List
function updateCountBadge() {
    const surveys = getSurveys();
    document.getElementById('countBadge').innerText = surveys.length;

    const modalCount = document.getElementById('modalCount');
    if (modalCount) modalCount.innerText = surveys.length;
}

function openListModal() {
    renderListModal();
    document.getElementById('listModal').classList.add('show');
}

function closeListModal() {
    document.getElementById('listModal').classList.remove('show');
}

function renderListModal() {
    const listContainer = document.getElementById('listContainer');
    const surveys = getSurveys();

    if (surveys.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">Chưa có khách hàng/đơn vị nào.</div>`;
        return;
    }

    listContainer.innerHTML = '';
    // Xếp cái mới nhất lên đầu
    surveys.slice().reverse().forEach(survey => {
        const date = new Date(survey.thoi_gian_nhap).toLocaleString('vi-VN');

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-info">
                <strong>${survey.don_vi_khao_sat}</strong>
                <span>Nhập lúc: ${date}</span>
            </div>
            <div class="list-item-actions">
                <button type="button" class="view-item-btn" onclick="viewDetail('${survey.id}')">Chi tiết</button>
                <button type="button" class="edit-item-btn" onclick="loadSurveyToForm('${survey.id}')">Sửa</button>
                <button type="button" class="del-item-btn" onclick="deleteSurvey('${survey.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

function viewDetail(id) {
    window.open(`detail.html?id=${id}`, '_blank');
}

// Hiển thị thông báo (toast)
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = message;

    if (type === 'info') {
        toast.style.backgroundColor = 'var(--primary)';
    } else {
        toast.style.backgroundColor = 'var(--success)';
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Flat object để xuất ra Excel
function flattenSurvey(survey) {
    return {
        "Ngày Nhập": new Date(survey.thoi_gian_nhap).toLocaleString('vi-VN'),
        "Tên Khảo Sát": survey.ten_khao_sat,
        "Site": survey.quan_ly_ho_so.site || "",
        "Đơn vị khảo sát": survey.don_vi_khao_sat,

        "Tổng máy bàn": survey.ha_tang_thiet_bi.tong_may_ban,
        "Tổng laptop": survey.ha_tang_thiet_bi.tong_laptop,
        "Số máy RAM > 4G": survey.ha_tang_thiet_bi.so_may_ram_lon_hon_4G,
        "Số đường internet": survey.ha_tang_thiet_bi.so_duong_internet,
        "Số camera": survey.ha_tang_thiet_bi.so_camera,
        "Cài PM Antivirus": survey.ha_tang_thiet_bi.cai_phan_mem_antivirus,
        "Số lượng cài SmartIR": survey.ha_tang_thiet_bi.so_luong_cai_smartIR,
        "HT Mạng Lan": survey.ha_tang_thiet_bi.he_thong_mang_lan ? "Có" : "Không",
        "Đã thi công Mạng Lan": survey.ha_tang_thiet_bi.co_thi_cong_mang_lan ? "Có" : "Không",
        "Tường lửa": survey.ha_tang_thiet_bi.tuong_lua ? "Có" : "Không",
        "Đã triển khai tường lửa": survey.ha_tang_thiet_bi.co_trien_khai_tuong_lua ? "Có" : "Không",
        "Tên TB Tường lửa": survey.ha_tang_thiet_bi.thiet_bi_tuong_lua || "",

        "Hệ thống thông tin (đã chọn)": (survey.he_thong_thong_tin || []).join("\n"),

        "ĐM - Họ tên": survey.thong_tin_lien_he.dau_moi_cung_cap.ho_ten,
        "ĐM - SĐT": survey.thong_tin_lien_he.dau_moi_cung_cap.so_dien_thoai,
        "ĐM - Đơn vị": survey.thong_tin_lien_he.dau_moi_cung_cap.don_vi,

        "UBND - Đại diện": survey.thong_tin_lien_he.don_vi_van_hanh.nguoi_dai_dien,
        "UBND - Chức vụ": survey.thong_tin_lien_he.don_vi_van_hanh.chuc_vu,
        "UBND - Địa chỉ": survey.thong_tin_lien_he.don_vi_van_hanh.dia_chi,
        "UBND - SĐT": survey.thong_tin_lien_he.don_vi_van_hanh.so_dien_thoai,
        "UBND - Email": survey.thong_tin_lien_he.don_vi_van_hanh.thu_dien_tu,

        "Công An - Trưởng CA": survey.thong_tin_lien_he.cong_an_xa.ho_ten,
        "Công An - SĐT": survey.thong_tin_lien_he.cong_an_xa.so_dien_thoai
    };
}

// Xuất Excel
function exportToExcel() {
    const surveys = getSurveys();
    if (surveys.length === 0) {
        alert("Chưa có dữ liệu nào để xuất!");
        return;
    }

    const flatData = surveys.map(flattenSurvey);
    const worksheet = XLSX.utils.json_to_sheet(flatData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DuLieuKhaoSat");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `KhaoSatATTT_${dateStr}.xlsx`);
}

// ==========================
// CÁC HÀM QUẢN LÝ HTTT Modal
// ==========================
function openManageHtttModal() {
    renderManageHtttList();
    document.getElementById('manageHtttModal').classList.add('show');
}

function closeManageHtttModal() {
    document.getElementById('manageHtttModal').classList.remove('show');
    document.getElementById('newHtttInput').value = "";
}

function renderManageHtttList() {
    const container = document.getElementById('manageHtttListContainer');
    container.innerHTML = '';

    dynamicHtttList.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.padding = '8px';
        div.style.background = '#f9f9f9';
        div.style.border = '1px solid #eee';
        div.style.borderRadius = '4px';

        const text = document.createElement('span');
        text.innerText = item;
        text.style.wordBreak = 'break-word';

        const delBtn = document.createElement('button');
        delBtn.innerText = 'Xóa';
        delBtn.type = 'button';
        delBtn.className = 'del-item-btn';
        delBtn.style.padding = '4px 8px';
        delBtn.onclick = () => {
            if (confirm(`Bạn có chắc chắn xóa hệ thống "${item}" khỏi danh mục? Các form đang mở sẽ bị ảnh hưởng!`)) {
                dynamicHtttList.splice(index, 1);
                saveDynamicHtttList();
                renderManageHtttList();
            }
        };

        div.appendChild(text);
        div.appendChild(delBtn);
        container.appendChild(div);
    });
}

function addNewHttt() {
    const input = document.getElementById('newHtttInput');
    const val = input.value.trim();
    if (!val) {
        alert("Vui lòng nhập tên hệ thống.");
        return;
    }
    if (dynamicHtttList.includes(val)) {
        alert("Hệ thống này đã có trong danh sách!");
        return;
    }
    dynamicHtttList.push(val);
    saveDynamicHtttList(val); // Pass giá trị vừa tạo vào để ép tick
    input.value = '';
    renderManageHtttList();
    showToast('Đã thêm HTTT mới!');
}

function saveDynamicHtttList(newlyAddedItem = null) {
    localStorage.setItem('CUSTOM_HTTT_MANAGER', JSON.stringify(dynamicHtttList));
    renderHtttCheckboxes(false, newlyAddedItem); // Render lại form chính, nhưng giữ nguyên các ô đang check, + tick ô mới
}

// ==========================
// DỰ TOÁN & XUẤT WORD
// ==========================
function renderEstimateTable() {
    const estimateTableBody = document.getElementById('estimateTableBody');
    const estimateTotalAmount = document.getElementById('estimateTotalAmount');
    if (!estimateTableBody) return;
    
    estimateTableBody.innerHTML = '';
    let total = 0;

    if (estimateItems.length === 0) {
        estimateTableBody.innerHTML = '<tr id="emptyEstimateRow"><td colspan="5" style="text-align:center; padding: 16px; color:#94a3b8; font-size:0.9rem;">Chưa có thiết bị nào.</td></tr>';
    }

    estimateItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #f1f5f9";
        
        let optionsHtml = '<option value="">-- Chọn vật tư --</option>';
        let found = danhMucVatTuList.find(d => d.ten_vat_tu === item.ten);
        if (!found && item.ten) {
            optionsHtml += `<option value="${item.ten.replace(/"/g, '&quot;')}" selected>${item.ten}</option>`;
        }
        
        danhMucVatTuList.forEach(d => {
            const selected = (d.ten_vat_tu === item.ten) ? "selected" : "";
            optionsHtml += `<option value="${d.ten_vat_tu.replace(/"/g, '&quot;')}" data-price="${d.don_gia}" ${selected}>${d.ten_vat_tu}</option>`;
        });

        const thanhTien = item.sl * item.don_gia;
        total += thanhTien;

        tr.innerHTML = `
            <td style="padding: 8px;">
                <select style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.9rem;" onchange="updateEstItem(${index}, 'ten', this)">
                    ${optionsHtml}
                </select>
            </td>
            <td style="padding: 8px;">
                <input type="number" min="1" value="${item.sl}" style="width:100%; text-align:center; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.9rem;" onchange="updateEstItem(${index}, 'sl', this.value)">
            </td>
            <td style="padding: 8px;">
                <input type="number" min="0" value="${item.don_gia}" style="width:100%; text-align:right; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:0.9rem;" onchange="updateEstItem(${index}, 'don_gia', this.value)">
            </td>
            <td style="padding: 8px; text-align:right; font-weight:600; color:#334155;">
                ${thanhTien.toLocaleString('vi-VN')}
            </td>
            <td style="padding: 8px; text-align:center;">
                <button type="button" onclick="removeEstItem(${index})" style="background:transparent; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer;" title="Xóa">&times;</button>
            </td>
        `;
        estimateTableBody.appendChild(tr);
    });

    if (estimateTotalAmount) estimateTotalAmount.innerText = total.toLocaleString('vi-VN');
}

window.updateEstItem = function(index, field, valueOrEl) {
    if (field === 'ten') {
        const opt = valueOrEl.options[valueOrEl.selectedIndex];
        estimateItems[index].ten = valueOrEl.value;
        if (opt && opt.dataset.price) {
            estimateItems[index].don_gia = parseInt(opt.dataset.price);
        }
    } else if (field === 'sl') {
        estimateItems[index].sl = parseInt(valueOrEl) || 1;
    } else if (field === 'don_gia') {
        estimateItems[index].don_gia = parseInt(valueOrEl) || 0;
    }
    renderEstimateTable();
};

window.removeEstItem = function(index) {
    estimateItems.splice(index, 1);
    renderEstimateTable();
};

function exportToWord() {
    const unitName = document.getElementsByName('don_vi_khao_sat')[0]?.value || 'Khach_Hang';
    const cleanName = unitName.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
    
    const style = "<style>table { border-collapse: collapse; width: 100%; margin-top: 10px; } th, td { border: 1px solid black; padding: 8px; text-align: left; } th { border-bottom: 2px solid black; background: #f0f0f0; }</style>";
    
    const deXuatContent = document.getElementById('de_xuat_textarea').value.replace(/\\n/g, '<br>');
    
    let tableHtml = "";
    if (estimateItems.length > 0) {
        let total = 0;
        let rows = "";
        estimateItems.forEach((item, idx) => {
            const tt = item.sl * item.don_gia;
            total += tt;
            rows += "<tr><td style='text-align:center;'>" + (idx + 1) + "</td><td>" + item.ten + "</td><td style='text-align:center;'>" + item.sl + "</td><td style='text-align:right;'>" + item.don_gia.toLocaleString('vi-VN') + "</td><td style='text-align:right;'>" + tt.toLocaleString('vi-VN') + "</td></tr>";
        });
        tableHtml = "<h3>Dự toán vật tư / thiết bị đề xuất</h3><table><tr><th>STT</th><th>Thiết bị / Vật tư</th><th>Số lượng</th><th>Đơn giá (VNĐ)</th><th>Thành tiền (VNĐ)</th></tr>" + rows + "<tr><td colspan='4' style='text-align:right; font-weight:bold;'>Tổng cộng:</td><td style='text-align:right; font-weight:bold; color:red;'>" + total.toLocaleString('vi-VN') + "</td></tr></table>";
    }

    const htmlContent = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'>" + style + "</head><body><h2>Phần V. Đề xuất giải pháp / Ghi chú</h2><p><strong>Khách hàng: </strong>" + unitName + "</p><h3>Chi tiết Đề xuất:</h3><p>" + deXuatContent + "</p>" + tableHtml + "</body></html>";

    const blob = new Blob(['\\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = "DeXuat_" + cleanName + ".doc";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
