const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyArvtIZ3QkwUcvz0SLu-AnLRifhkOtQ9CY",
    authDomain: "bokseong-deep-sky.firebaseapp.com",
    databaseURL: "https://bokseong-deep-sky-default-rtdb.asia-southeast1.firebasedatabase.app",
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
const db = firebase.database();
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

function normalizePost(post, id) {
    const normalized = post || {};
    normalized.id = normalized.id || id;
    return normalized;
}
