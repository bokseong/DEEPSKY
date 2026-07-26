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

async function uploadAuthenticatedForm(path, {
    method = "POST",
    formData,
    onProgress = () => {}
} = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error("로그인이 필요합니다.");
    const token = await user.getIdToken();

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, `${API_BASE_URL}${path}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("ngrok-skip-browser-warning", "69420");
        xhr.responseType = "json";

        xhr.upload.addEventListener("progress", event => {
            if (!event.lengthComputable) return;
            onProgress(Math.round((event.loaded / event.total) * 100));
        });
        xhr.addEventListener("load", () => {
            const data = xhr.response || {};
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress(100);
                resolve(data);
                return;
            }
            reject(new Error(data.error || `서버 요청에 실패했습니다. (${xhr.status})`));
        });
        xhr.addEventListener("error", () => reject(new Error("서버에 연결할 수 없습니다.")));
        xhr.addEventListener("abort", () => reject(new Error("업로드가 취소되었습니다.")));
        xhr.send(formData);
    });
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

function showToast(message, type = "info", duration = 3200) {
    let region = document.getElementById("toast-region");
    if (!region) {
        region = document.createElement("div");
        region.id = "toast-region";
        region.className = "toast-region";
        region.setAttribute("aria-live", "polite");
        region.setAttribute("aria-atomic", "true");
        document.body.appendChild(region);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = String(message || "");
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast--visible"));

    window.setTimeout(() => {
        toast.classList.remove("toast--visible");
        window.setTimeout(() => toast.remove(), 180);
    }, duration);
    return toast;
}

function setupDraftAutosave({ key, fields, restore = true, overwrite = false }) {
    const entries = Object.entries(fields || {})
        .map(([name, target]) => [
            name,
            typeof target === "string" ? document.querySelector(target) : target
        ])
        .filter(([, element]) => element);
    let timer = null;

    const save = () => {
        const values = Object.fromEntries(entries.map(([name, element]) => [name, element.value]));
        if (Object.values(values).every(value => !String(value || "").trim())) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify({ values, savedAt: new Date().toISOString() }));
        }
    };

    const scheduleSave = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(save, 500);
    };

    entries.forEach(([, element]) => element.addEventListener("input", scheduleSave));

    if (restore) {
        try {
            const saved = JSON.parse(localStorage.getItem(key) || "null");
            let restored = false;
            entries.forEach(([name, element]) => {
                const value = saved?.values?.[name];
                if ((overwrite || !element.value) && typeof value === "string" && value) {
                    element.value = value;
                    restored = true;
                }
            });
            if (restored) showToast("임시 저장된 내용을 복원했습니다.", "info");
        } catch {
            localStorage.removeItem(key);
        }
    }

    return {
        clear() {
            window.clearTimeout(timer);
            localStorage.removeItem(key);
        },
        save
    };
}

function setUploadProgress(progressElement, value, labelElement = null) {
    const progress = Math.max(0, Math.min(100, Number(value) || 0));
    if (progressElement) {
        progressElement.hidden = false;
        progressElement.value = progress;
    }
    if (labelElement) labelElement.textContent = `업로드 ${progress}%`;
}

function formatDateTime(value) {
    if (!value) return "";
    const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    const date = new Date(numeric);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(date);
}

function enhanceGlobalHeader() {
    const topBar = document.querySelector(".top-bar");
    const authBar = topBar?.querySelector(".auth-bar");
    if (!topBar || !authBar || document.getElementById("utility-nav")) return;

    const utilityNav = document.createElement("div");
    utilityNav.id = "utility-nav";
    utilityNav.className = "utility-nav";
    utilityNav.setAttribute("aria-label", "사용자 도구");
    utilityNav.innerHTML = `
        <a href="search.html" title="통합 검색">검색</a>
        <a href="activity.html" class="auth-utility hidden" title="내 활동">내 활동</a>
        <a href="notifications.html" class="auth-utility hidden notification-link" title="알림">
            알림 <span id="notificationBadge" class="notification-badge hidden">0</span>
        </a>
        <button type="button" id="installAppBtn" class="install-app-btn hidden">앱 설치</button>
    `;
    topBar.insertBefore(utilityNav, authBar);
}

async function refreshNotificationBadge() {
    const badge = document.getElementById("notificationBadge");
    if (!badge || !auth.currentUser) return;
    try {
        const data = await requestAuthenticatedApi("/api/notifications");
        const count = Number(data.unreadCount) || 0;
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.toggle("hidden", count === 0);
    } catch {
        badge.classList.add("hidden");
    }
}

function initializeUtilityNavigation() {
    enhanceGlobalHeader();
    auth.onAuthStateChanged(user => {
        document.querySelectorAll(".auth-utility").forEach(element => {
            element.classList.toggle("hidden", !user);
        });
        if (user) refreshNotificationBadge();
    });
}

let deferredInstallPrompt = null;

function initializePwa() {
    if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement("link");
        manifest.rel = "manifest";
        manifest.href = "manifest.webmanifest";
        document.head.appendChild(manifest);
    }
    if (!document.querySelector('meta[name="theme-color"]')) {
        const themeColor = document.createElement("meta");
        themeColor.name = "theme-color";
        themeColor.content = "#070a1d";
        document.head.appendChild(themeColor);
    }

    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
        navigator.serviceWorker.register("./sw.js").catch(error => {
            console.warn("서비스 워커 등록 실패:", error);
        });
    }

    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        deferredInstallPrompt = event;
        document.getElementById("installAppBtn")?.classList.remove("hidden");
    });

    document.getElementById("installAppBtn")?.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        document.getElementById("installAppBtn")?.classList.add("hidden");
    });
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
    initializeUtilityNavigation();
    initializePwa();
    checkApiAvailability();
    window.addEventListener("online", checkApiAvailability);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApiStatusMonitor, { once: true });
} else {
    startApiStatusMonitor();
}
