const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyArvtIZ3QkwUcvz0SLu-AnLRifhkOtQ9CY",
    authDomain: "bokseong-deep-sky.firebaseapp.com",
    projectId: "bokseong-deep-sky",
    storageBucket: "bokseong-deep-sky.firebasestorage.app",
    messagingSenderId: "800777151311",
    appId: "1:800777151311:web:8c901fcf0ded04b1941b3a",
    measurementId: "G-LNZFCW099Z"
});

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const API_BASE_URL = "https://hypocrite-depletion-until.ngrok-free.dev";
const ADMIN_EMAIL = "leader.deepsky@gmail.com";

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
}

function normalizeRole(role) {
    if (role === "관리자") return "admin";
    if (role === "부원" || role === "동아리 부원") return "student";
    return role || "member";
}

function getRoleName(role) {
    if (role === "admin") return "관리자";
    if (role === "student") return "동아리 부원";
    return "일반 회원";
}

async function requestAuthenticatedApi(path, options = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("로그인이 필요합니다.");

    const token = await user.getIdToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("ngrok-skip-browser-warning", "69420");

    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || `서버 요청에 실패했습니다. (${response.status})`);
    }
    return data;
}

async function getServerUserProfile(user = auth.currentUser) {
    if (!user) throw new Error("로그인이 필요합니다.");
    return requestAuthenticatedApi("/api/me");
}

async function syncServerUserProfile(user, name) {
    return requestAuthenticatedApi("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: name || user.displayName || user.email?.split("@")[0] || "사용자",
            lastLogin: new Date().toISOString()
        })
    });
}

function normalizePost(post, id) {
    const normalized = post || {};
    normalized.id = normalized.id || id;
    return normalized;
}
