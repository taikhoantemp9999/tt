// Chỉ admin mới vào được
const auth = requireAuth({ redirectTo: 'login.html' });
if (!auth || auth.role !== 'admin') {
    alert("Chỉ quyền quản trị mới được phép truy cập!");
    window.location.replace('list.html');
}

// Config firebase
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
const danhMucRef = database.ref('danh_muc_vat_tu');

const tableBody = document.getElementById('vattuTableBody');
const modal = document.getElementById('vattuModal');
const form = document.getElementById('vattuForm');
const modalTitle = document.getElementById('modalTitle');
const btnAddNew = document.getElementById('btnAddNew');
const btnCancelModal = document.getElementById('btnCancelModal');

// Mở modal thêm mới
btnAddNew.addEventListener('click', () => {
    form.reset();
    document.getElementById('editId').value = "";
    modalTitle.innerText = "Thêm Vật Tư Mới";
    modal.classList.add('active');
    document.getElementById('tenVattu').focus();
});

// Đóng modal
btnCancelModal.addEventListener('click', () => {
    modal.classList.remove('active');
});

// Submit form (Thêm / Sửa)
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const ten = document.getElementById('tenVattu').value.trim();
    const gia = parseInt(document.getElementById('donGia').value) || 0;

    if (!ten) return alert("Vui lòng nhập tên vật tư!");

    if (id) {
        // Cập nhật
        danhMucRef.child(id).update({ ten_vat_tu: ten, don_gia: gia })
            .then(() => {
                modal.classList.remove('active');
            })
            .catch(err => alert("Lỗi cập nhật: " + err.message));
    } else {
        // Thêm mới
        danhMucRef.push({ ten_vat_tu: ten, don_gia: gia })
            .then(() => {
                modal.classList.remove('active');
            })
            .catch(err => alert("Lỗi thêm mới: " + err.message));
    }
});

// Xóa
window.deleteVattu = function (id, ten) {
    if (confirm(`Bạn có chắc chắn xóa vật tư "${ten}"?`)) {
        danhMucRef.child(id).remove().catch(err => alert("Lỗi khi xóa: " + err.message));
    }
};

// Mở modal sửa
window.editVattu = function (id, ten, gia) {
    document.getElementById('editId').value = id;
    document.getElementById('tenVattu').value = ten;
    document.getElementById('donGia').value = gia;
    modalTitle.innerText = "Sửa Vật Tư";
    modal.classList.add('active');
};

// Render danh sách
danhMucRef.on('value', (snapshot) => {
    tableBody.innerHTML = '';
    const items = [];
    snapshot.forEach((child) => {
        items.push({ id: child.key, ...child.val() });
    });

    if (items.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color:#64748b;">Chưa có vật tư nào trong danh mục.</td></tr>`;
        return;
    }

    // Sắp xếp theo tên
    items.sort((a, b) => (a.ten_vat_tu || '').localeCompare(b.ten_vat_tu || ''));

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #0f172a;">${item.ten_vat_tu}</td>
            <td style="color: #0369a1; font-weight: 700;">${item.don_gia.toLocaleString('vi-VN')}</td>
            <td class="action-cell">
                <button type="button" class="btn" style="background:#e2e8f0; color:#334155; padding:6px 12px; font-size:0.8rem;" onclick="editVattu('${item.id}', '${item.ten_vat_tu.replace(/'/g, "\\'")}', '${item.don_gia}')">Sửa</button>
                <button type="button" class="btn btn-danger" style="margin-left: 6px; padding:6px 12px; font-size:0.8rem;" onclick="deleteVattu('${item.id}', '${item.ten_vat_tu.replace(/'/g, "\\'")}')">Xóa</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
});
