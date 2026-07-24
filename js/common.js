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
const API_BASE_URL = String(
    window.DEEPSKY_API_BASE_URL || "https://hypocrite-depletion-until.ngrok-free.dev"
).replace(/\/+$/, "");

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

function setProtectedPageAccess({
    allowed,
    title = "접근 제한",
    message = "이 페이지에 접근할 권한이 없습니다.",
    action = "login"
}) {
    const gate = document.getElementById("lockMessage");
    const content = document.getElementById("mainContent");
    if (!gate || !content) return;

    gate.classList.toggle("hidden", allowed);
    content.classList.toggle("hidden", !allowed);
    if (allowed) return;

    const actionConfig = {
        login: { label: "로그인하러 가기", href: "login.html" },
        role: { label: "등급 조정 요청하기", href: "block.html" },
        home: { label: "홈으로 돌아가기", href: "index.html" },
        retry: { label: "다시 시도", reload: true }
    }[action];

    const heading = document.createElement("h2");
    heading.textContent = title;

    const description = document.createElement("p");
    description.textContent = message;

    gate.replaceChildren(heading, description);
    gate.setAttribute("role", "status");
    gate.setAttribute("aria-live", "polite");

    if (actionConfig) {
        const actions = document.createElement("div");
        actions.className = "access-gate__actions";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "access-gate__action";
        button.textContent = actionConfig.label;
        button.addEventListener("click", () => {
            if (actionConfig.reload) {
                location.reload();
            } else {
                location.href = actionConfig.href;
            }
        });

        actions.appendChild(button);
        gate.appendChild(actions);
    }
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

function getApiStatusBanner() {
    let banner = document.getElementById("api-status-banner");
    if (banner) return banner;
    banner = document.createElement("div");
    banner.id = "api-status-banner";
    banner.className = "api-status-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.hidden = true;

    const message = document.createElement("span");
    message.textContent = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "다시 확인";
    retry.addEventListener("click", checkApiAvailability);
    banner.append(message, retry);
    document.body.prepend(banner);
    return banner;
}

async function checkApiAvailability() {
    const banner = getApiStatusBanner();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
            headers: { "ngrok-skip-browser-warning": "69420" },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Health check failed (${response.status})`);
        banner.hidden = true;
        return true;
    } catch {
        banner.hidden = false;
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

function startApiStatusMonitor() {
    checkApiAvailability();
    window.addEventListener("online", checkApiAvailability);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApiStatusMonitor, { once: true });
} else {
    startApiStatusMonitor();
}
