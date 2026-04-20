document.addEventListener('DOMContentLoaded', () => {
    // Nếu đã có local session thì về list.html hoặc trang redirect
    const existing = authGet();
    if (existing) {
        const urlParams = new URLSearchParams(window.location.search);
        const redirectUrl = urlParams.get('redirect');
        if (redirectUrl) {
            window.location.href = decodeURIComponent(redirectUrl);
        } else {
            window.location.href = 'list.html';
        }
        return;
    }

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

    // Mồi tài khoản mặc định nếu DB trống
    usersRef.once('value').then(snap => {
        if (!snap.exists()) {
            const defaultUsers = {
                khaosat: { password: "Vnpt@2026", role: "editor", displayName: "Khảo sát" },
                xem: { password: "Vnpt!1468", role: "viewer", displayName: "Xem" },
                ngoc: { password: "Tngoc250790", role: "admin", displayName: "Quản trị" }
            };
            usersRef.set(defaultUsers);
        }
    });

    const form = document.getElementById('loginForm');
    const btn = document.getElementById('btnLogin');
    const err = document.getElementById('loginError');
    const username = document.getElementById('username');
    const password = document.getElementById('password');

    const showError = (msg) => {
        if (!err) return;
        err.style.display = 'block';
        err.innerText = msg;
    };

    const clearError = () => {
        if (!err) return;
        err.style.display = 'none';
        err.innerText = '';
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();
        btn.disabled = true;

        const u = username.value.trim();
        const p = password.value;

        try {
            const snapshot = await usersRef.child(u).once('value');
            if (snapshot.exists() && snapshot.val().password === p) {
                const record = snapshot.val();
                authSet(u, record.role);
                
                // Check for redirect parameter
                const urlParams = new URLSearchParams(window.location.search);
                const redirectUrl = urlParams.get('redirect');
                if (redirectUrl) {
                    window.location.href = decodeURIComponent(redirectUrl);
                } else {
                    window.location.href = 'list.html';
                }
            } else {
                showError('Sai tài khoản hoặc mật khẩu.');
                btn.disabled = false;
            }
        } catch (error) {
            console.error(error);
            showError('Lỗi kết nối máy chủ.');
            btn.disabled = false;
        }
    });
});
