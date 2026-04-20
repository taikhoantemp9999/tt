// Require login for this page
const auth = requireAuth({ redirectTo: 'login.html' });

// Firebase config (same as other pages)
const firebaseConfig = {
    apiKey: "AIzaSyBxDaIIhmWJOB6w6Jg6Ch6a2-b_5HvJTWw",
    authDomain: "english-fun-1937c.firebaseapp.com",
    databaseURL: "https://english-fun-1937c-default-rtdb.firebaseio.com",
    projectId: "english-fun-1937c",
    storageBucket: "english-fun-1937c.firebasestorage.app",
    messagingSenderId: "236020730818",
    appId: "1:236020730818:web:4ebb378dc7a7005d2fa45b"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const surveysRef = database.ref('surveys_ATTT');

const roleBadge = document.getElementById('roleBadge');
const btnLogout = document.getElementById('btnLogout');
const editorActions = document.getElementById('editorActions');
const btnAddNew = document.getElementById('btnAddNew');
const listContainer = document.getElementById('listContainer');
const searchInput = document.getElementById('searchInput');

let allSurveys = []; // Store original data

btnLogout.addEventListener('click', authLogout);

const isEditor = auth && (auth.role === 'editor' || auth.role === 'admin');
const isAdmin = auth && auth.role === 'admin';

if (roleBadge) {
    let roleText = 'Xem';
    if (auth.role === 'editor') roleText = 'Khảo sát';
    if (auth.role === 'admin') roleText = 'Quản trị';
    roleBadge.innerText = `Tài khoản: ${auth.user} • Quyền: ${roleText}`;
}

if (btnAddNew) {
    btnAddNew.style.display = isEditor ? 'inline-flex' : 'none';
}

if (isAdmin) {
    const btnManageUsers = document.getElementById('btnManageUsers');
    if (btnManageUsers) {
        btnManageUsers.style.display = 'inline-flex';
        btnManageUsers.addEventListener('click', () => {
            window.location.href = 'tk.html';
        });
    }
    
    const btnManageMaterials = document.getElementById('btnManageMaterials');
    if (btnManageMaterials) {
        btnManageMaterials.style.display = 'inline-flex';
        btnManageMaterials.addEventListener('click', () => {
            window.location.href = 'danhmucvattu.html';
        });
    }

    const btnBackup = document.getElementById('btnBackup');
    if (btnBackup) {
        btnBackup.style.display = 'inline-flex';
        btnBackup.addEventListener('click', () => {
            const originalText = btnBackup.innerHTML;
            btnBackup.disabled = true;
            btnBackup.innerHTML = '⌛ Đang tạo file...';

            database.ref().once('value').then(snap => {
                const data = snap.val();
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const now = new Date();
                const timestamp = now.getFullYear() + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getDate()).padStart(2, '0') + '_' + 
                    String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0') + 
                    String(now.getSeconds()).padStart(2, '0');
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup_ksattt_${timestamp}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                btnBackup.disabled = false;
                btnBackup.innerHTML = originalText;
                alert('Backup thành công!');
            }).catch(err => {
                console.error("Backup error:", err);
                btnBackup.disabled = false;
                btnBackup.innerHTML = originalText;
                alert('Lỗi backup: ' + err.message);
            });
        });
    }
}

// Ensure editorActions container itself is visible if it contains something visible
if (editorActions) {
    editorActions.style.display = 'flex';
}
if (btnAddNew) {
    btnAddNew.addEventListener('click', () => {
        if (!isEditor) return;
        window.location.href = 'index.html?mode=new';
    });
}


function isDeadlineNear(deadlineStr) {
    if (!deadlineStr) return false;
    try {
        const deadline = new Date(deadlineStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadline.setHours(0, 0, 0, 0);

        // Return true if today or overdue
        return deadline <= today;
    } catch (e) {
        return false;
    }
}

function renderList(items) {
    if (!items || items.length === 0) {
        listContainer.innerHTML = `<div class="empty-state">Chưa có khách hàng nào.</div>`;
        return;
    }

    // Sort newest first (if thoi_gian_nhap exists)
    items.sort((a, b) => {
        const ta = a.thoi_gian_nhap ? new Date(a.thoi_gian_nhap).getTime() : 0;
        const tb = b.thoi_gian_nhap ? new Date(b.thoi_gian_nhap).getTime() : 0;
        return tb - ta;
    });

    listContainer.innerHTML = '';
    items.forEach(survey => {
        const card = document.createElement('div');
        card.className = 'survey-card'; // New class name for specific styling
        card.style.background = '#ffffff';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        card.style.marginBottom = '16px';
        card.style.transition = 'all 0.2s ease';
        
        // Add hover effect
        card.onmouseover = () => {
            card.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';
            card.style.borderColor = '#cbd5e1';
        };
        card.onmouseout = () => {
            card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            card.style.borderColor = '#e2e8f0';
        };

        const name = survey.don_vi_khao_sat || '(Chưa đặt tên)';
        const time = survey.thoi_gian_nhap ? new Date(survey.thoi_gian_nhap).toLocaleString('vi-VN') : (survey.nguoi_nhap || 'N/A');

        card.innerHTML = `
            <div class="card-body" style="padding: 12px;">
                <!-- Top Section: 3 Columns -->
                <div style="display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 12px; margin-bottom: 12px; align-items: start;">
                    <!-- Column 1: Client & Surveyor -->
                    <div style="min-width: 0;">
                        <div style="font-weight: 900; color: #0f172a; font-size: 1rem; margin-bottom: 4px; line-height: 1.2;">${name}</div>
                        <div style="font-size: 0.8rem; color: #64748b;">
                            <i class="fas fa-user-edit" style="font-size: 0.75rem; width: 14px;"></i> 
                            ${survey.quan_ly_ho_so?.nguoi_khao_sat || 'N/A'}
                        </div>
                    </div>

                    <!-- Column 2: Dates -->
                    <div style="font-size: 0.8rem; color: #475569; display: flex; flex-direction: column; gap: 4px;">
                        <div>
                            <i class="fas fa-calendar-day" style="width: 14px; color: #94a3b8;"></i> 
                            KS: ${survey.quan_ly_ho_so?.ngay_khao_sat || 'N/A'}
                        </div>
                        <div style="${isDeadlineNear(survey.quan_ly_ho_so?.han_viet_ho_so) ? 'color: #ef4444; font-weight: bold;' : ''}">
                            <i class="fas fa-clock" style="width: 14px; ${isDeadlineNear(survey.quan_ly_ho_so?.han_viet_ho_so) ? 'color: #ef4444;' : 'color: #94a3b8;'}"></i> 
                            Hạn: ${survey.quan_ly_ho_so?.han_viet_ho_so || 'N/A'}
                        </div>
                    </div>

                    <!-- Column 3: Status & Profile Writer -->
                    <div style="text-align: right; display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                        <span class="status-badge-small" style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; white-space: nowrap; border: 1px solid #bae6fd;">
                            ${(survey.quan_ly_ho_so && survey.quan_ly_ho_so.tinh_trang) || "Mới khảo sát"}
                        </span>
                        <div style="font-size: 0.75rem; font-weight: 600; color: #64748b;">
                             ${survey.quan_ly_ho_so?.nguoi_viet_ho_so || 'Chưa phân công'}
                        </div>
                    </div>
                </div>

                <!-- Middle Section: Note (if exists) -->
                ${(survey.quan_ly_ho_so && survey.quan_ly_ho_so.ghi_chu_viet_ho_so) ? `
                <div style="margin-top: 8px; padding: 8px 12px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 0.85rem; color: #475569; line-height: 1.4;">
                    <i class="fas fa-sticky-note" style="color: #94a3b8; margin-right: 6px;"></i>
                    ${survey.quan_ly_ho_so.ghi_chu_viet_ho_so}
                </div>
                ` : ''}

                <!-- Bottom Section: Buttons in one row -->
                <div class="btns" style="display: flex; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 10px; justify-content: flex-end;">
                    <button class="mini-btn primary" type="button" data-action="detail" style="flex: 1; max-width: 100px;">Chi tiết</button>
                    ${isEditor ? `<a href="index.html?editId=${survey.id}" class="mini-btn" style="flex: 1; max-width: 80px; text-decoration: none; text-align: center; display: flex; align-items: center; justify-content: center;">Sửa</a>` : ``}
                    ${isEditor ? `<button class="mini-btn danger" type="button" data-action="delete" style="flex: 1; max-width: 80px;">Xóa</button>` : ``}
                </div>
            </div>
        `;

        card.querySelector('[data-action="detail"]').addEventListener('click', () => {
            window.open(`detail.html?id=${survey.id}`, '_blank');
        });

        if (isEditor) {
            const btnDel = card.querySelector('[data-action="delete"]');
            btnDel.addEventListener('click', () => {
                if (confirm(`Xác nhận xóa khảo sát: ${name}?`)) {
                    surveysRef.child(survey.id).remove().catch(err => {
                        alert('Lỗi khi xóa: ' + err.message);
                    });
                }
            });
        }

        listContainer.appendChild(card);
    });
}

const EXCLUDED_OVERDUE_STATUSES = [
    "Đã gửi lại hồ sơ cho VNPT Khu Vực",
    "Đã gửi cho CA",
    "Công an đã phê duyệt"
];

const COMPLETED_STATUSES = [
    "Đã gửi cho quản lý địa bàn",
    "Đã gửi lại hồ sơ cho VNPT Khu Vực",
    "Đã gửi cho CA",
    "Công an đã phê duyệt",
    "Công an trả lại"
];

const vnptFilter = document.getElementById('vnptFilter');
const writerFilter = document.getElementById('writerFilter');
const surveyorFilter = document.getElementById('surveyorFilter');
const statusFilter = document.getElementById('statusFilter');
const specificStatusGroup = document.getElementById('specificStatusGroup');

function applyFilters() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const vnptSelected = vnptFilter ? vnptFilter.value : '';
    const writerSelected = writerFilter ? writerFilter.value : '';
    const surveyorSelected = surveyorFilter ? surveyorFilter.value : '';
    const statusSelected = statusFilter ? statusFilter.value : '';

    const filtered = allSurveys.filter(s => {
        const ql = s.quan_ly_ho_so || {};
        
        // Filter by Search Input (Name)
        const name = (s.don_vi_khao_sat || "").toLowerCase();
        if (query && !name.includes(query)) return false;

        // Filter by VNPT
        const region = ql.vnpt_khu_vuc || "Chưa xác định";
        if (vnptSelected) {
            if (vnptSelected === 'Khối UBND/ĐU') {
                if (region === 'Sở Ban Ngành' || region === 'Y tế') return false;
            } else {
                if (region !== vnptSelected) return false;
            }
        }

        // Filter by Writer
        const writer = ql.nguoi_viet_ho_so || "Chưa phân công";
        if (writerSelected && writer !== writerSelected) return false;

        // Filter by Surveyor
        const surveyorItem = ql.nguoi_khao_sat || "N/A";
        if (surveyorSelected && surveyorItem !== surveyorSelected) return false;

        // Filter by Status
        const status = ql.tinh_trang || "Mới khảo sát chưa phân công";
        
        if (statusSelected) {
            if (statusSelected === 'group_overdue') {
                const isNear = isDeadlineNear(ql.han_viet_ho_so) && !EXCLUDED_OVERDUE_STATUSES.includes(status);
                if (!isNear) return false;
            } else if (statusSelected === 'group_pending') {
                const isPending = !COMPLETED_STATUSES.includes(status) && status !== 'Hồ sơ thiếu thông tin không viết được';
                if (!isPending) return false;
            } else if (statusSelected === 'group_completed') {
                const isCompleted = COMPLETED_STATUSES.includes(status);
                if (!isCompleted) return false;
            } else if (statusSelected === 'group_missing') {
                const isMissing = status === 'Hồ sơ thiếu thông tin không viết được';
                if (!isMissing) return false;
            } else {
                // Specific Status
                if (status !== statusSelected) return false;
            }
        }

        return true;
    });

    const summaryEl = document.getElementById('listSummary');
    if (summaryEl) {
        summaryEl.style.display = 'flex';
        summaryEl.innerHTML = `<div>Đang hiển thị: <span style="font-weight: 800; color: #0f172a; font-size: 1.1rem;">${filtered.length}</span> / ${allSurveys.length} khách hàng</div>`;
    }

    renderList(filtered);
}

surveysRef.on('value', (snapshot) => {
    allSurveys = [];
    const uniqueVNPT = new Set();
    const uniqueWriters = new Set();
    const uniqueSurveyors = new Set();
    const uniqueStatuses = new Set();
    
    snapshot.forEach((child) => {
        const data = child.val() || {};
        data.id = child.key;
        allSurveys.push(data);
        
        const ql = data.quan_ly_ho_so || {};
        if (ql.vnpt_khu_vuc) uniqueVNPT.add(ql.vnpt_khu_vuc);
        const writer = ql.nguoi_viet_ho_so || "Chưa phân công";
        uniqueWriters.add(writer);

        const surveyorItem = ql.nguoi_khao_sat || "N/A";
        uniqueSurveyors.add(surveyorItem);

        const status = ql.tinh_trang || "Mới khảo sát chưa phân công";
        uniqueStatuses.add(status);
    });

    // Populate VNPT filter
    if (vnptFilter) {
        const currentSelected = vnptFilter.value;
        vnptFilter.innerHTML = '<option value="">Tất cả VNPT</option>';
        vnptFilter.innerHTML += '<option value="Khối UBND/ĐU">Khối UBND/ĐU</option>';
        Array.from(uniqueVNPT).sort().forEach(vnpt => {
            if (vnpt === 'Chưa xác định' || vnpt === 'Khối UBND/ĐU') return;
            vnptFilter.innerHTML += `<option value="${vnpt}">${vnpt}</option>`;
        });
        vnptFilter.value = currentSelected;
    }

    // Populate Writer filter
    if (writerFilter) {
        const currentSelected = writerFilter.value;
        writerFilter.innerHTML = '<option value="">Tất cả Người viết</option>';
        Array.from(uniqueWriters).sort().forEach(w => {
            writerFilter.innerHTML += `<option value="${w}">${w}</option>`;
        });
        writerFilter.value = currentSelected;
    }

    // Populate Surveyor filter
    if (surveyorFilter) {
        const currentSelected = surveyorFilter.value;
        surveyorFilter.innerHTML = '<option value="">Tất cả Người KS</option>';
        Array.from(uniqueSurveyors).sort().forEach(s => {
            surveyorFilter.innerHTML += `<option value="${s}">${s}</option>`;
        });
        surveyorFilter.value = currentSelected;
    }

    // Populate Specific Statuses filter
    if (statusFilter && specificStatusGroup) {
        const currentSelected = statusFilter.value;
        specificStatusGroup.innerHTML = '';
        Array.from(uniqueStatuses).sort().forEach(status => {
            specificStatusGroup.innerHTML += `<option value="${status}">${status}</option>`;
        });
        statusFilter.value = currentSelected;
    }

    // Apply filters instead of raw renderList
    applyFilters();
});

// Listeners
if (searchInput) searchInput.addEventListener('input', applyFilters);
if (vnptFilter) vnptFilter.addEventListener('change', applyFilters);
if (writerFilter) writerFilter.addEventListener('change', applyFilters);
if (surveyorFilter) surveyorFilter.addEventListener('change', applyFilters);
if (statusFilter) statusFilter.addEventListener('change', applyFilters);

// Refresh button
const btnRefresh = document.getElementById('btnRefresh');
if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
        // Show spinning/loading effect
        const originalHtml = btnRefresh.innerHTML;
        btnRefresh.disabled = true;
        btnRefresh.innerHTML = '⌛ Đang tải...';
        
        // Re-fetch from Firebase (this will trigger the .on('value') listener)
        surveysRef.once('value').then(() => {
            applyFilters(); // Re-apply current selections
            setTimeout(() => {
                btnRefresh.disabled = false;
                btnRefresh.innerHTML = originalHtml;
            }, 500);
        }).catch(err => {
            console.error("Refresh error:", err);
            btnRefresh.disabled = false;
            btnRefresh.innerHTML = originalHtml;
        });
    });
}

