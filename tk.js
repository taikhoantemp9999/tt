// Bảo vệ: Chỉ người dùng có role admin (như ngoc) mới được phép vào
const auth = (typeof requireAuth === 'function') ? requireAuth({ allowRoles: ['admin'] }) : null;

// Firebase Config
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
const usersRef = database.ref('users_ATTT');

const accountTableBody = document.getElementById('accountTableBody');
const accountModal = document.getElementById('accountModal');
const accountForm = document.getElementById('accountForm');
const modalTitle = document.getElementById('modalTitle');

// Lắng nghe dữ liệu
usersRef.on('value', (snapshot) => {
    accountTableBody.innerHTML = '';
    if (!snapshot.exists()) {
        accountTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:#64748b;">Chưa có dữ liệu</td></tr>';
        return;
    }

    const data = snapshot.val();
    Object.keys(data).forEach(username => {
        const user = data[username];
        const tr = document.createElement('tr');

        let roleClass = 'role-viewer';
        let roleName = 'Chỉ xem';
        if (user.role === 'editor') { roleClass = 'role-editor'; roleName = 'Khai báo'; }
        if (user.role === 'admin') { roleClass = 'role-admin'; roleName = 'Quản trị'; }

        tr.innerHTML = `
            <td style="font-weight: 600; color: #0f172a;">${username}</td>
            <td style="font-family: monospace; font-size: 1.1em; color: #475569;">${user.password}</td>
            <td><span class="role-badge ${roleClass}">${roleName}</span></td>
            <td class="action-cell">
                <button onclick="editAccount('${username}')" class="btn btn-action" style="padding:6px 10px; font-size:0.8rem; margin-right:6px;">Sửa</button>
                <button onclick="deleteAccount('${username}')" class="btn btn-danger" style="padding:6px 10px; font-size:0.8rem;">Xóa</button>
            </td>
        `;
        accountTableBody.appendChild(tr);
    });
});

document.getElementById('btnAddNewAccount').addEventListener('click', () => {
    accountForm.reset();
    document.getElementById('editOriginalUsername').value = '';
    document.getElementById('accUsername').readOnly = false;
    document.getElementById('accUsername').style.background = '#fff';
    modalTitle.innerText = 'Thêm Tài khoản';
    accountModal.classList.add('active');
});

document.getElementById('btnCancelModal').addEventListener('click', () => {
    accountModal.classList.remove('active');
});

accountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const originalU = document.getElementById('editOriginalUsername').value;
    const u = document.getElementById('accUsername').value.trim();
    const p = document.getElementById('accPassword').value.trim();
    const r = document.getElementById('accRole').value;

    if (!u) return;

    if (originalU && originalU !== u) {
        // Đổi tên tài khoản: Xóa cũ
        usersRef.child(originalU).remove();
    }

    // Lưu mới/Cập nhật
    usersRef.child(u).set({
        password: p,
        role: r,
        displayName: u
    }).then(() => {
        accountModal.classList.remove('active');
    }).catch(err => {
        alert("Lỗi lưu tài khoản: " + err.message);
    });
});

window.editAccount = (username) => {
    usersRef.child(username).once('value').then(snap => {
        if (!snap.exists()) return;
        const u = snap.val();
        document.getElementById('editOriginalUsername').value = username;
        document.getElementById('accUsername').value = username;
        document.getElementById('accUsername').readOnly = true;
        document.getElementById('accUsername').style.background = '#f1f5f9'; // Làm xám ô tài khoản tránh người dùng tưởng sửa được tên
        document.getElementById('accPassword').value = u.password;
        document.getElementById('accRole').value = u.role;
        modalTitle.innerText = 'Sửa Tài khoản';
        accountModal.classList.add('active');
    });
};

window.deleteAccount = (username) => {
    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}" không? Việc này không thể hoàn tác.`)) {
        usersRef.child(username).remove();
    }
};
