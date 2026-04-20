// Cấu hình Firebase Database
const firebaseConfig = {
    apiKey: "AIzaSyBxDaIIhmWJOB6w6Jg6Ch6a2-b_5HvJTWw",
    authDomain: "english-fun-1937c.firebaseapp.com",
    databaseURL: "https://english-fun-1937c-default-rtdb.firebaseio.com",
    projectId: "english-fun-1937c",
    storageBucket: "english-fun-1937c.firebasestorage.app",
    messagingSenderId: "236020730818",
    appId: "1:236020730818:web:4ebb378dc7a7005d2fa45b"
};

// Khởi tạo Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const tiktokRef = database.ref('tiktok_videos');

// === CONFIG APPS SCRIPT URL TẠI ĐÂY ===
// Sử dụng URL apps script user cung cấp
const APPS_SCRIPT_UPLOAD_VIDEO_URL = "https://script.google.com/macros/s/AKfycbwJYH4spkYPD_ZZvVFBQ4rZS05USsOqyoJrZMFRMsxK7dgH8km8h9JwiSGwmOcel6RYoA/exec";
// ======================================

// Data nội bộ
let videoList = [];
let isUploading = false; // Cờ theo dõi trạng thái upload

document.addEventListener('DOMContentLoaded', () => {
    // Nút Bật Form
    document.getElementById('btnAddNew').addEventListener('click', () => {
        openModal();
    });

    // Nút Đóng Form
    document.getElementById('btnCloseModal').addEventListener('click', closeModal);
    document.getElementById('btnCancelForm').addEventListener('click', closeModal);

    // Form Submit
    document.getElementById('videoForm').addEventListener('submit', handleSaveVideo);

    // Xóa record
    document.getElementById('btnDeleteRecord').addEventListener('click', handleDeleteRecord);

    // Tìm kiếm và lọc
    document.getElementById('searchInput').addEventListener('input', renderList);
    document.getElementById('statusFilter').addEventListener('change', renderList);

    // Xử lý upload UI
    const btnSelectVideo = document.getElementById('btnSelectVideo');
    const videoInput = document.getElementById('videoInput');
    const btnRemoveVideo = document.getElementById('btnRemoveVideo');

    btnSelectVideo.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', handleFileSelection);
    btnRemoveVideo.addEventListener('click', removeUploadedVideo);

    // Set Default ngày đăng
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ngay_dang').value = today;

    // Tải dữ liệu
    fetchData();
});

function fetchData() {
    document.getElementById('loadingState').style.display = 'block';

    tiktokRef.on('value', snap => {
        videoList = [];
        snap.forEach(child => {
            videoList.push({ id: child.key, ...child.val() });
        });

        // Sort descending ngày đăng (mới nhất lên đầu)
        videoList.sort((a, b) => new Date(b.ngay_dang) - new Date(a.ngay_dang));

        document.getElementById('loadingState').style.display = 'none';
        renderList();
    });
}

function renderList() {
    const container = document.getElementById('videoListContainer');
    const noData = document.getElementById('noDataState');
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    const statusVal = document.getElementById('statusFilter').value;

    container.innerHTML = '';
    let count = 0;

    videoList.forEach(item => {
        // Lọc
        if (searchVal && !item.tieu_de.toLowerCase().includes(searchVal)) return;
        if (statusVal && item.trang_thai !== statusVal) return;

        count++;

        // Xác định class cho status badge
        let badgeClass = '';
        switch (item.trang_thai) {
            case 'Video gốc': badgeClass = 'status-goc'; break;
            case 'Đã ghép text': badgeClass = 'status-text'; break;
            case 'Đã ghép lồng tiếng': badgeClass = 'status-audio'; break;
            case 'Chờ đăng': badgeClass = 'status-waiting'; break;
            case 'Đã đăng': badgeClass = 'status-posted'; break;
            default: badgeClass = 'status-cancel';
        }

        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${item.tieu_de}</div>
                <div class="status-badge ${badgeClass}">${item.trang_thai}</div>
            </div>
            <div class="card-meta">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Dự kiến: ${formatDate(item.ngay_dang)}
            </div>
            ${item.ghi_chu ? `<div class="card-note">${item.ghi_chu}</div>` : ''}
            <div class="card-footer">
                ${item.link_video ? `<a href="${item.link_video}" target="_blank" style="font-size: 0.85rem; color:#4f46e5; font-weight:600; text-decoration:none; display:flex; align-items:center; gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>Xem File Drive</a>` : `<span style="font-size: 0.85rem; color:#94a3b8;">Chưa đính kèm video</span>`}
                <button type="button" class="secondary-btn" style="padding: 6px 12px; font-size: 0.85rem;" onclick="editRecord('${item.id}')">✏️ Sửa</button>
            </div>
        `;
        container.appendChild(card);
    });

    if (count > 0) {
        container.style.display = 'grid';
        noData.style.display = 'none';
    } else {
        container.style.display = 'none';
        noData.style.display = 'block';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function openModal(item = null) {
    removeUploadedVideo(); // Reset file
    const form = document.getElementById('videoForm');
    form.reset();

    document.getElementById('editId').value = '';
    document.getElementById('modalTitle').innerText = 'Thêm Video Mới';
    document.getElementById('btnDeleteRecord').style.display = 'none';

    // Set Default ngày
    document.getElementById('ngay_dang').value = new Date().toISOString().split('T')[0];

    if (item) {
        document.getElementById('modalTitle').innerText = 'Cập nhật Video';
        document.getElementById('editId').value = item.id;
        document.getElementById('tieu_de').value = item.tieu_de || '';
        document.getElementById('ngay_dang').value = item.ngay_dang || '';
        document.getElementById('trang_thai').value = item.trang_thai || 'Video gốc';
        document.getElementById('ghi_chu').value = item.ghi_chu || '';

        if (item.link_video) {
            document.getElementById('link_video').value = item.link_video;
            document.getElementById('link_video_download').value = item.link_video_download || '';
            document.getElementById('uploadDropZone').style.display = 'none';
            document.getElementById('videoPreviewContainer').style.display = 'block';
            document.getElementById('previewFileLink').href = item.link_video;

            if (item.link_video_download) {
                document.getElementById('previewFileDownload').href = item.link_video_download;
                document.getElementById('previewFileDownload').style.display = 'inline';
            } else {
                document.getElementById('previewFileDownload').style.display = 'none';
            }

            // Lấy tên file từ ghi chú để làm mầu, nếu không có để default
            document.getElementById('previewFileName').innerText = "Video đính kèm";
        }

        document.getElementById('btnDeleteRecord').style.display = 'inline-block';
    }

    document.getElementById('formModal').classList.add('show');
}

function closeModal() {
    if (isUploading) {
        if (!confirm("Video đang tải lên, bạn có chắc chắn muốn hủy?")) return;
    }
    document.getElementById('formModal').classList.remove('show');
}

window.editRecord = function (id) {
    const item = videoList.find(i => i.id === id);
    if (item) openModal(item);
}

// Xử lý File Input và Upload
function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Kiểm tra dung lượng (~35MB là an toàn cho Apps Script Base64)
    if (file.size > 36000000) {
        alert("File này lớn hơn 35MB. Ứng dụng Google Apps Script cơ bản có thể gặp quá tải. Vui lòng thử nén video lại!");
        // Vẫn cho up tiếp nếu người dùng muốn rủi ro, nhưng khuyến nghị dừng
        // return; 
    }

    // Hiển thị thanh Upload
    document.getElementById('uploadDropZone').style.display = 'none';
    document.getElementById('uploadProgressContainer').style.display = 'block';
    const progressBar = document.getElementById('uploadProgressBar');
    progressBar.style.width = '10%';
    isUploading = true;

    // Chuyển đổi file -> base64
    const reader = new FileReader();
    reader.onload = function (event) {
        const base64 = event.target.result;

        // Cập nhật progress giả (read local ok)
        progressBar.style.width = '40%';

        // Bắt đầu đẩy lên Google Drive thông qua Web App
        fetch(APPS_SCRIPT_UPLOAD_VIDEO_URL, {
            method: 'POST',
            body: JSON.stringify({
                base64: base64,
                filename: file.name,
                mimeType: file.type
            }),
            // mode: 'no-cors' -> Không thể dùng vì ta cần JSON response
        })
            .then(response => {
                progressBar.style.width = '80%';
                return response.json();
            })
            .then(result => {
                if (result.success) {
                    progressBar.style.width = '100%';

                    // Trễ nhẹ để mượt UI
                    setTimeout(() => {
                        // Cập nhật View
                        document.getElementById('uploadProgressContainer').style.display = 'none';
                        document.getElementById('videoPreviewContainer').style.display = 'block';

                        document.getElementById('link_video').value = result.url;
                        document.getElementById('link_video_download').value = result.downloadUrl || '';

                        document.getElementById('previewFileName').innerText = file.name;
                        document.getElementById('previewFileLink').href = result.url;

                        if (result.downloadUrl) {
                            document.getElementById('previewFileDownload').href = result.downloadUrl;
                            document.getElementById('previewFileDownload').style.display = 'inline';
                        } else {
                            document.getElementById('previewFileDownload').style.display = 'none';
                        }

                        showToast("Tải video thành công!");
                        isUploading = false;
                    }, 500);
                } else {
                    throw new Error(result.error);
                }
            })
            .catch(err => {
                console.error(err);
                alert("Lỗi upload: Có thể video quá nặng (>35MB) làm crash kết nối. Hoặc do Apps Script chưa xuất bản đúng.");
                removeUploadedVideo();
                isUploading = false;
            });
    };
    reader.onerror = () => {
        alert("Lỗi khi đọc file local!");
        removeUploadedVideo();
        isUploading = false;
    }

    progressBar.style.width = '20%';
    reader.readAsDataURL(file);
}

function removeUploadedVideo() {
    document.getElementById('videoInput').value = '';
    document.getElementById('link_video').value = '';
    document.getElementById('link_video_download').value = '';

    document.getElementById('uploadDropZone').style.display = 'block';
    document.getElementById('videoPreviewContainer').style.display = 'none';
    document.getElementById('uploadProgressContainer').style.display = 'none';
    // isUploading = false; // Note: do not set here if called while fetching
}

// Lưu dữ liệu vào Firebase
function handleSaveVideo(e) {
    e.preventDefault();
    if (isUploading) {
        alert("Vui lòng chờ video upload xong!");
        return;
    }

    const id = document.getElementById('editId').value;

    const payload = {
        tieu_de: document.getElementById('tieu_de').value.trim(),
        ngay_dang: document.getElementById('ngay_dang').value,
        trang_thai: document.getElementById('trang_thai').value,
        ghi_chu: document.getElementById('ghi_chu').value.trim(),
        link_video: document.getElementById('link_video').value,
        link_video_download: document.getElementById('link_video_download').value,
        cap_nhat_cuoi: new Date().toISOString()
    };

    const submitBtn = document.getElementById('btnSaveForm');
    submitBtn.innerHTML = 'Đang lưu...';
    submitBtn.disabled = true;

    if (id) {
        // Cập nhật
        tiktokRef.child(id).update(payload)
            .then(() => {
                showToast("Đã cập nhật!");
                closeModal();
            }).finally(() => {
                submitBtn.innerHTML = '💾 Lưu lại';
                submitBtn.disabled = false;
            });
    } else {
        // Thêm mới
        tiktokRef.push(payload)
            .then(() => {
                showToast("Đã tạo mới!");
                closeModal();
            }).finally(() => {
                submitBtn.innerHTML = '💾 Lưu lại';
                submitBtn.disabled = false;
            });
    }
}

function handleDeleteRecord() {
    const id = document.getElementById('editId').value;
    if (!id) return;

    if (confirm("Bạn có chắc chắn muốn xóa lịch video này vĩnh viễn không?")) {
        tiktokRef.child(id).remove().then(() => {
            showToast("Đã xóa tin!");
            closeModal();
        });
    }
}

// Utils
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}
