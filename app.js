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
const productRef = database.ref('tiktok_products');

// === CONFIG APPS SCRIPT URL TẠI ĐÂY ===
// Sử dụng URL apps script user cung cấp
const APPS_SCRIPT_UPLOAD_VIDEO_URL = "https://script.google.com/macros/s/AKfycbwJYH4spkYPD_ZZvVFBQ4rZS05USsOqyoJrZMFRMsxK7dgH8km8h9JwiSGwmOcel6RYoA/exec";
// ======================================

// Data nội bộ
let videoList = [];
let productList = [];
let isUploading = false; // Cờ theo dõi trạng thái upload

document.addEventListener('DOMContentLoaded', () => {
    // Nút Bật Form
    document.getElementById('btnAddNew').addEventListener('click', () => openModal());
    document.getElementById('btnAddNewFab').addEventListener('click', () => openModal());

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
    document.getElementById('productFilter').addEventListener('change', renderList);
    document.getElementById('dateFilter').addEventListener('change', renderList);

    // Xử lý upload UI
    const btnSelectVideo = document.getElementById('btnSelectVideo');
    const videoInput = document.getElementById('videoInput');
    const btnRemoveVideo = document.getElementById('btnRemoveVideo');

    btnSelectVideo.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', handleFileSelection);
    btnRemoveVideo.addEventListener('click', removeUploadedVideo);

    // Xử lý Quay Video
    document.getElementById('btnRecordVideoOpen').addEventListener('click', openRecordingModal);
    document.getElementById('btnCloseRecordingModal').addEventListener('click', closeRecordingModal);
    document.getElementById('btnStartRecording').addEventListener('click', startRecording);
    document.getElementById('btnStopRecording').addEventListener('click', stopRecording);

    // Set Default ngày đăng
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('ngay_dang').value = today;

    // Quản lý sản phẩm
    document.getElementById('btnManageProducts').addEventListener('click', openProductModal);
    document.getElementById('btnCloseProductModal').addEventListener('click', closeProductModal);
    document.getElementById('productForm').addEventListener('submit', handleAddProduct);
    document.getElementById('btnCancelProductEdit').addEventListener('click', resetProductForm);

    // Tải dữ liệu
    fetchProducts();
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
    const productVal = document.getElementById('productFilter').value;
    const dateVal = document.getElementById('dateFilter').value;

    container.innerHTML = '';
    let count = 0;

    videoList.forEach(item => {
        // Lọc
        if (searchVal && !item.tieu_de.toLowerCase().includes(searchVal)) return;
        if (statusVal && item.trang_thai !== statusVal) return;
        if (productVal && item.san_pham !== productVal) return;
        
        if (dateVal && item.ngay_dang !== dateVal) return;

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

        let productStr = '';
        if (item.san_pham) {
            const p = productList.find(x => x.id === item.san_pham);
            if (p) {
                productStr = `<div style="font-size:0.8rem; color:#0369a1; background:#e0f2fe; display:inline-block; padding:4px 10px; border-radius:12px; margin-bottom:12px; font-weight:600;">📦 ${p.name}</div>`;
            }
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
            ${productStr}
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
    document.getElementById('san_pham').value = '';

    // Set Default ngày: Ưu tiên lấy từ bộ lọc nếu có
    const filterDate = document.getElementById('dateFilter').value;
    document.getElementById('ngay_dang').value = filterDate || new Date().toISOString().split('T')[0];
    
    // Set Default Sản phẩm: Ưu tiên lấy từ bộ lọc
    const filterProduct = document.getElementById('productFilter').value;
    document.getElementById('san_pham').value = filterProduct || '';

    if (item) {
        document.getElementById('modalTitle').innerText = 'Cập nhật Video';
        document.getElementById('editId').value = item.id;
        document.getElementById('tieu_de').value = item.tieu_de || '';
        document.getElementById('ngay_dang').value = item.ngay_dang || '';
        document.getElementById('trang_thai').value = item.trang_thai || 'Video gốc';
        document.getElementById('ghi_chu').value = item.ghi_chu || '';
        document.getElementById('san_pham').value = item.san_pham || '';

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
        // Chú ý: Gỡ bỏ phần tiền tố "data:video/mp4;base64," trước khi gửi sang Apps Script
        const base64 = event.target.result.split(',')[1];

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

// --- LOGIC QUAY VIDEO TRỰC TIẾP ---
let mediaRecorder;
let recordedChunks = [];
let stream;
let recordingStartTime;
let recordingTimerInterval;

async function openRecordingModal() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
        document.getElementById('recordPreview').srcObject = stream;
        document.getElementById('recordingModal').classList.add('show');
        resetRecordingUI();
    } catch (err) {
        console.error(err);
        alert("Không thể truy cập camera: " + err.message);
    }
}

function closeRecordingModal() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        if (!confirm("Đang quay video, bạn có chắc muốn thoát?")) return;
        stopRecording();
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('recordingModal').classList.remove('show');
}

function resetRecordingUI() {
    document.getElementById('btnStartRecording').style.display = 'flex';
    document.getElementById('btnStopRecording').style.display = 'none';
    document.getElementById('recordingIndicator').style.display = 'none';
    document.getElementById('recordingTimer').innerText = '00:00';
    document.getElementById('recordingStatusText').innerText = 'Sẵn sàng quay (Tối thiểu 20s, Tối đa 30s)';
}

function startRecording() {
    recordedChunks = [];
    const options = { mimeType: getSupportedMimeType() };
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = handleRecordingStopped;

    mediaRecorder.start();
    recordingStartTime = Date.now();
    
    document.getElementById('btnStartRecording').style.display = 'none';
    document.getElementById('btnStopRecording').style.display = 'flex';
    document.getElementById('btnStopRecording').style.opacity = '0.5'; // Mờ đi khi chưa đủ 20s
    document.getElementById('btnStopRecording').disabled = true;
    document.getElementById('recordingIndicator').style.display = 'flex';
    
    recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
}

function getSupportedMimeType() {
    const types = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (let t of types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
}

function updateRecordingTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('recordingTimer').innerText = `${mins}:${secs}`;

    if (elapsed >= 20) {
        document.getElementById('btnStopRecording').style.opacity = '1';
        document.getElementById('btnStopRecording').disabled = false;
        document.getElementById('recordingStatusText').innerText = 'Có thể dừng quay ngay bây giờ';
    } else {
        document.getElementById('recordingStatusText').innerText = `Quay thêm ${20 - elapsed}s nữa để có thể dừng`;
    }

    if (elapsed >= 30) {
        stopRecording();
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        clearInterval(recordingTimerInterval);
    }
}

function handleRecordingStopped() {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
    const file = new File([blob], `recorded_video_${Date.now()}.mp4`, { type: mediaRecorder.mimeType });
    
    // Tự động đóng modal quay và chuyển sang luồng upload
    if (stream) stream.getTracks().forEach(track => track.stop());
    document.getElementById('recordingModal').classList.remove('show');
    
    // Giả lập việc chọn file cho handleFileSelection (nhưng dùng Blob trực tiếp)
    uploadRecordedFile(file);
}

function uploadRecordedFile(file) {
    // Hiển thị thanh Upload
    document.getElementById('uploadDropZone').style.display = 'none';
    document.getElementById('uploadProgressContainer').style.display = 'block';
    const progressBar = document.getElementById('uploadProgressBar');
    progressBar.style.width = '10%';
    isUploading = true;

    const reader = new FileReader();
    reader.onload = function(e) {
        // Chú ý: Gỡ bỏ phần tiền tố "data:video/mp4;base64," trước khi gửi sang Apps Script
        const base64 = e.target.result.split(',')[1];
        progressBar.style.width = '40%';

        fetch(APPS_SCRIPT_UPLOAD_VIDEO_URL, {
            method: 'POST',
            body: JSON.stringify({
                base64: base64,
                filename: file.name,
                mimeType: file.type
            })
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                progressBar.style.width = '100%';
                setTimeout(() => {
                    document.getElementById('uploadProgressContainer').style.display = 'none';
                    document.getElementById('videoPreviewContainer').style.display = 'block';
                    document.getElementById('link_video').value = result.url;
                    document.getElementById('link_video_download').value = result.downloadUrl || '';
                    document.getElementById('previewFileName').innerText = "Video vừa quay";
                    document.getElementById('previewFileLink').href = result.url;
                    document.getElementById('previewFileDownload').style.display = result.downloadUrl ? 'inline' : 'none';
                    if(result.downloadUrl) document.getElementById('previewFileDownload').href = result.downloadUrl;
                    showToast("Tải video thành công!");
                    isUploading = false;
                }, 500);
            } else throw new Error(result.error);
        })
        .catch(err => {
            console.error(err);
            alert("Lỗi upload video vừa quay: " + err.message);
            removeUploadedVideo();
            isUploading = false;
        });
    };
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

    let tieuDeStr = document.getElementById('tieu_de').value.trim();
    if (!tieuDeStr) {
        const now = new Date();
        const timeStr = `${now.getHours()}h${now.getMinutes()}`;
        const dateParts = document.getElementById('ngay_dang').value.split('-');
        const dateStr = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';
        tieuDeStr = `Video ${dateStr} ${timeStr}`;
    }

    const payload = {
        tieu_de: tieuDeStr,
        san_pham: document.getElementById('san_pham').value,
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

// Logic Products
function fetchProducts() {
    productRef.on('value', snap => {
        productList = [];
        snap.forEach(child => {
            productList.push({ id: child.key, ...child.val() });
        });
        renderProductSelect();
        if (document.getElementById('productModal').classList.contains('show')) {
            renderProductList();
        }
        renderList(); // Re-render videos
    });
}

function renderProductSelect() {
    const select = document.getElementById('san_pham');
    const currentValue = select.value;
    let html = '<option value="">-- Không đính kèm sản phẩm --</option>';
    
    // Sort by name
    const sorted = [...productList].sort((a,b) => a.name.localeCompare(b.name));
    
    sorted.forEach(p => {
        if (p.is_active || currentValue === p.id) {
            html += `<option value="${p.id}">${p.name} ${p.is_active ? '' : '(Ngừng bán)'}</option>`;
        }
    });
    select.innerHTML = html;
    select.value = currentValue;

    // Cập nhật cả dropdown lọc (không reset value nếu đang chọn)
    const filterSelect = document.getElementById('productFilter');
    const currentFilterVal = filterSelect.value;
    let filterHtml = '<option value="">-- Tất cả Sản phẩm --</option>';
    sorted.forEach(p => {
        filterHtml += `<option value="${p.id}">${p.name}</option>`;
    });
    filterSelect.innerHTML = filterHtml;
    filterSelect.value = currentFilterVal;
}

function openProductModal() {
    renderProductList();
    document.getElementById('productModal').classList.add('show');
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
}

function handleAddProduct(e) {
    e.preventDefault();
    const idInput = document.getElementById('edit_product_id');
    const nameInput = document.getElementById('new_product_name');
    const activeInput = document.getElementById('new_product_active');
    
    if (!nameInput.value.trim()) return;
    
    const productData = {
        name: nameInput.value.trim(),
        is_active: activeInput.checked
    };

    if (idInput.value) {
        // Cập nhật sản phẩm đã có
        productRef.child(idInput.value).update(productData).then(() => {
            resetProductForm();
            showToast("Đã cập nhật sản phẩm!");
        });
    } else {
        // Thêm sản phẩm mới
        productRef.push(productData).then(() => {
            resetProductForm();
            showToast("Đã thêm sản phẩm!");
        });
    }
}

function resetProductForm() {
    document.getElementById('edit_product_id').value = '';
    document.getElementById('new_product_name').value = '';
    document.getElementById('new_product_active').checked = true;
    document.getElementById('btnSaveProduct').innerText = 'Thêm';
    document.getElementById('btnCancelProductEdit').style.display = 'none';
}

window.editProduct = function(id) {
    const p = productList.find(x => x.id === id);
    if (p) {
        document.getElementById('edit_product_id').value = p.id;
        document.getElementById('new_product_name').value = p.name;
        document.getElementById('new_product_active').checked = p.is_active;
        document.getElementById('btnSaveProduct').innerText = 'Lưu';
        document.getElementById('btnCancelProductEdit').style.display = 'inline-block';
        document.getElementById('new_product_name').focus();
    }
}

window.toggleProductActive = function(id, currentStatus) {
    productRef.child(id).update({ is_active: !currentStatus });
}

window.deleteProduct = function(id) {
    if (confirm("Xóa sản phẩm này sẽ ảnh hưởng tới các video đã chọn sản phẩm này. Bạn có chắc không?")) {
        productRef.child(id).remove();
    }
}

function renderProductList() {
    const container = document.getElementById('productListContainer');
    if (productList.length === 0) {
        container.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b;">Chưa có sản phẩm nào.</div>';
        return;
    }
    
    const sorted = [...productList].sort((a,b) => a.name.localeCompare(b.name));
    let html = '<table style="width:100%; border-collapse: collapse;">';
    sorted.forEach(p => {
        html += `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${p.is_active ? '#fff' : '#f8fafc'};">
                <td style="padding:12px; font-weight: 500; ${!p.is_active ? 'color:#94a3b8; text-decoration:line-through;' : ''}">${p.name}</td>
                <td style="padding:12px; text-align:center; width:80px;">
                    <span style="font-size: 0.8rem; padding: 4px 8px; border-radius: 4px; background: ${p.is_active ? '#dcfce3' : '#fee2e2'}; color: ${p.is_active ? '#166534' : '#991b1b'}; cursor: pointer; user-select: none;" title="Bấm vào nút Đổi TT bên cạnh">
                        ${p.is_active ? 'Bật' : 'Tắt'}
                    </span>
                </td>
                <td style="padding:12px; text-align:right; width:140px;">
                    <button type="button" onclick="editProduct('${p.id}')" style="padding:4px 8px; font-size:0.8rem; background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; border-radius:4px; font-weight:bold; cursor:pointer;">Sửa</button>
                    <button type="button" onclick="toggleProductActive('${p.id}', ${p.is_active})" style="padding:4px 8px; font-size:0.8rem; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; cursor:pointer;">Bật/Tắt</button>
                    <button type="button" onclick="deleteProduct('${p.id}')" style="padding:4px 8px; font-size:0.8rem; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; border-radius:4px; font-weight:bold; cursor:pointer;">Xóa</button>
                </td>
            </tr>
        `;
    });
    html += '</table>';
    container.innerHTML = html;
}

