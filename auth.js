// Simple client-side auth (via Firebase mapping)
// Roles: admin (quản trị) / editor (khảo sát) / viewer (chỉ xem)

const AUTH_KEYS = {
    user: "AUTH_USER",
    role: "AUTH_ROLE",
    at: "AUTH_AT"
};

function authGet() {
    const user = localStorage.getItem(AUTH_KEYS.user);
    const role = localStorage.getItem(AUTH_KEYS.role);
    const at = localStorage.getItem(AUTH_KEYS.at);
    if (!user || !role) return null;
    return { user, role, at };
}

function authSet(username, role) {
    localStorage.setItem(AUTH_KEYS.user, username);
    localStorage.setItem(AUTH_KEYS.role, role);
    localStorage.setItem(AUTH_KEYS.at, String(Date.now()));
    return { ok: true, role: role, user: username };
}

function authLogout() {
    localStorage.removeItem(AUTH_KEYS.user);
    localStorage.removeItem(AUTH_KEYS.role);
    localStorage.removeItem(AUTH_KEYS.at);
    localStorage.removeItem("EDIT_PASS_OK"); // legacy
    window.location.href = "login.html";
}

function requireAuth(options = {}) {
    const auth = authGet();
    const { allowRoles = null, redirectTo = "login.html" } = options;

    if (!auth) {
        const currentUrl = encodeURIComponent(window.location.href);
        window.location.href = `${redirectTo}?redirect=${currentUrl}`;
        return null;
    }
    if (Array.isArray(allowRoles) && allowRoles.length > 0 && !allowRoles.includes(auth.role)) {
        window.location.href = "list.html";
        return null;
    }
    return auth;
}

