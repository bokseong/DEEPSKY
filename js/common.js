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
const API_PRIMARY_BASE_URL = String(
    window.DEEPSKY_API_BASE_URL || "https://hypocrite-depletion-until.ngrok-free.dev"
).replace(/\/+$/, "");
const API_FALLBACK_BASE_URL = String(
    window.DEEPSKY_API_FALLBACK_URL || "https://bs-server.tail886d19.ts.net"
).replace(/\/+$/, "");
let API_BASE_URL = API_PRIMARY_BASE_URL;
const nativeFetch = window.fetch.bind(window);

function getApiRequestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return "";
}

function getApiRequestMethod(input, options) {
    return String(options?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function getKnownApiBase(url) {
    try {
        const origin = new URL(url).origin;
        return [API_PRIMARY_BASE_URL, API_FALLBACK_BASE_URL]
            .find(base => new URL(base).origin === origin) || "";
    } catch {
        return "";
    }
}

function rewriteApiRequest(input, sourceBase, targetBase) {
    const currentUrl = new URL(getApiRequestUrl(input));
    const sourceUrl = new URL(sourceBase);
    const targetUrl = new URL(targetBase);
    currentUrl.protocol = targetUrl.protocol;
    currentUrl.host = targetUrl.host;
    if (sourceUrl.pathname !== "/" && currentUrl.pathname.startsWith(sourceUrl.pathname)) {
        currentUrl.pathname = `${targetUrl.pathname.replace(/\/$/, "")}${currentUrl.pathname.slice(sourceUrl.pathname.length)}`;
    }

    if (input instanceof Request) return new Request(currentUrl.href, input);
    if (input instanceof URL) return currentUrl;
    return currentUrl.href;
}

async function classifyPrimaryApiFailure(response) {
    if ([502, 503, 504].includes(response.status)) return "gateway";
    if (response.status !== 403) return "";

    const errorCode = response.headers.get("x-ngrok-error-code") || "";
    if (/ERR_NGROK_725/i.test(errorCode)) return "ngrok-limit";

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return "";
    const body = await response.clone().text().catch(() => "");
    return /ERR_NGROK_725|reached its network bandwidth limit/i.test(body)
        ? "ngrok-limit"
        : "";
}

function activateFallbackApi() {
    if (API_BASE_URL === API_FALLBACK_BASE_URL) return;
    API_BASE_URL = API_FALLBACK_BASE_URL;
    window.dispatchEvent(new CustomEvent("deepsky-api-endpoint-change", {
        detail: { baseUrl: API_BASE_URL, fallback: true }
    }));
}

window.fetch = async function fetchWithApiFallback(input, options) {
    const requestUrl = getApiRequestUrl(input);
    const sourceBase = getKnownApiBase(requestUrl);
    if (!sourceBase) return nativeFetch(input, options);

    const method = getApiRequestMethod(input, options);
    const safelyRepeatable = ["GET", "HEAD", "OPTIONS"].includes(method);
    const reusableInput = input instanceof Request ? input.clone() : input;
    const activeInput = sourceBase === API_BASE_URL
        ? input
        : rewriteApiRequest(input, sourceBase, API_BASE_URL);

    try {
        const response = await nativeFetch(activeInput, options);
        const failureType = API_BASE_URL === API_PRIMARY_BASE_URL
            ? await classifyPrimaryApiFailure(response)
            : "";
        if (!failureType || (!safelyRepeatable && failureType !== "ngrok-limit")) {
            return response;
        }
    } catch (error) {
        if (API_BASE_URL !== API_PRIMARY_BASE_URL || !safelyRepeatable) throw error;
    }

    activateFallbackApi();
    const retryInput = rewriteApiRequest(reusableInput, sourceBase, API_FALLBACK_BASE_URL);
    return nativeFetch(retryInput, options);
};

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

    const healthController = new AbortController();
    const healthTimeout = setTimeout(() => healthController.abort(), 5000);
    try {
        const healthResponse = await fetch(`${API_BASE_URL}/api/health`, {
            headers: { "ngrok-skip-browser-warning": "69420" },
            cache: "no-store",
            signal: healthController.signal
        });
        if (!healthResponse.ok) {
            throw new Error(`서버 상태 확인에 실패했습니다. (${healthResponse.status})`);
        }
    } finally {
        clearTimeout(healthTimeout);
    }

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
        <button type="button" id="searchPopoverToggle" class="utility-trigger"
                onclick="toggleUtilityPopover('searchPopover', 'searchPopoverToggle')"
                aria-expanded="false" aria-controls="searchPopover">검색</button>
        <a href="mypage.html#activitySection" class="auth-utility hidden" title="내 활동">내 활동</a>
        <button type="button" id="notificationPopoverToggle"
                class="utility-trigger auth-utility hidden notification-link"
                onclick="toggleUtilityPopover('notificationPopover', 'notificationPopoverToggle')"
                aria-expanded="false" aria-controls="notificationPopover">
            알림 <span id="notificationBadge" class="notification-badge hidden">0</span>
        </button>
        <section id="searchPopover" class="utility-popover utility-popover--search hidden"
                 aria-label="통합 검색">
            <div class="utility-popover__header">
                <h2>통합 검색</h2>
            </div>
            <form id="utilitySearchForm" class="utility-search-form" role="search"
                  onsubmit="submitUtilitySearch(event)">
                <input type="search" id="utilitySearchInput" minlength="2" maxlength="100"
                       aria-label="통합 검색어" placeholder="검색어를 입력하세요" required>
                <button type="submit">검색</button>
            </form>
            <p id="utilitySearchStatus" class="utility-popover__status" aria-live="polite">
                게시글, 질문, 자료, 사진을 검색할 수 있습니다.
            </p>
            <div id="utilitySearchResults" class="utility-result-list"></div>
        </section>
        <section id="notificationPopover" class="utility-popover utility-popover--notification hidden"
                 aria-label="알림">
            <div class="utility-popover__header">
                <h2>알림</h2>
                <button type="button" id="utilityReadAllBtn" class="utility-text-button"
                        onclick="readAllUtilityNotifications()">모두 읽음</button>
            </div>
            <div id="utilityNotificationList" class="utility-result-list" aria-live="polite">
                <p class="utility-popover__empty">알림을 불러오는 중...</p>
            </div>
        </section>
    `;
    topBar.insertBefore(utilityNav, authBar);
}

function closeUtilityPopovers() {
    document.querySelectorAll(".utility-popover").forEach(panel => panel.classList.add("hidden"));
    document.querySelectorAll(".utility-trigger[aria-expanded]").forEach(button => {
        button.setAttribute("aria-expanded", "false");
    });
}

function toggleUtilityPopover(panelId, toggleId) {
    const panel = document.getElementById(panelId);
    const toggle = document.getElementById(toggleId);
    if (!panel || !toggle) return;

    const shouldOpen = panel.classList.contains("hidden");
    closeUtilityPopovers();
    if (!shouldOpen) return;

    panel.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    if (panelId === "searchPopover") {
        document.getElementById("utilitySearchInput")?.focus();
    } else {
        loadNotificationPopover();
    }
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

async function loadNotificationPopover() {
    const list = document.getElementById("utilityNotificationList");
    if (!list || !auth.currentUser) return;
    list.innerHTML = '<p class="utility-popover__empty">알림을 불러오는 중...</p>';

    try {
        const data = await requestAuthenticatedApi("/api/notifications");
        const unreadItems = (data.items || []).filter(item => !item.read);
        renderNotificationPopover(unreadItems);
    } catch (error) {
        list.innerHTML = `<p class="utility-popover__empty">${escapeHtml(error.message)}</p>`;
    }
}

function renderNotificationPopover(items) {
    const list = document.getElementById("utilityNotificationList");
    if (!list) return;
    list.replaceChildren();

    if (!items.length) {
        list.innerHTML = '<p class="utility-popover__empty">새 알림이 없습니다.</p>';
        return;
    }

    items.forEach(item => {
        const link = document.createElement("a");
        link.className = "utility-result";
        link.href = item.href || "index.html";
        link.innerHTML = `
            <strong>${escapeHtml(item.title || "알림")}</strong>
            <span>${escapeHtml(item.message || "")}</span>
            <time>${escapeHtml(formatDateTime(item.createdAt))}</time>
        `;
        link.addEventListener("click", event => {
            event.preventDefault();
            openUtilityNotification(item);
        });
        list.appendChild(link);
    });
}

async function openUtilityNotification(item) {
    await requestAuthenticatedApi(`/api/notifications/${encodeURIComponent(item.id)}/read`, {
        method: "PUT"
    }).catch(() => {});
    location.href = item.href || "index.html";
}

async function readAllUtilityNotifications() {
    try {
        await requestAuthenticatedApi("/api/notifications/read-all", { method: "PUT" });
        renderNotificationPopover([]);
        const badge = document.getElementById("notificationBadge");
        badge?.classList.add("hidden");
        if (badge) badge.textContent = "0";
    } catch (error) {
        showToast(error.message, "error");
    }
}

async function searchFromUtilityPopover(query) {
    const status = document.getElementById("utilitySearchStatus");
    const results = document.getElementById("utilitySearchResults");
    if (!status || !results) return;

    status.textContent = "검색 중...";
    results.replaceChildren();
    try {
        const headers = { "ngrok-skip-browser-warning": "69420" };
        if (auth.currentUser) {
            headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
        }
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, { headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "검색에 실패했습니다.");
        renderUtilitySearchResults(data.items || []);
        status.textContent = `검색 결과 ${data.count || 0}건`;
    } catch (error) {
        status.textContent = error.message;
        results.replaceChildren();
    }
}

function submitUtilitySearch(event) {
    event.preventDefault();
    const query = document.getElementById("utilitySearchInput")?.value.trim() || "";
    if (query.length < 2) {
        document.getElementById("utilitySearchStatus").textContent = "검색어를 2자 이상 입력해 주세요.";
        return false;
    }
    searchFromUtilityPopover(query);
    return false;
}

function renderUtilitySearchResults(items) {
    const results = document.getElementById("utilitySearchResults");
    if (!results) return;
    results.replaceChildren();

    if (!items.length) {
        results.innerHTML = '<p class="utility-popover__empty">검색 결과가 없습니다.</p>';
        return;
    }

    const typeNames = {
        post: "자유 게시판",
        question: "질문",
        resource: "자료실",
        photo: "활동 사진"
    };
    items.forEach(item => {
        const link = document.createElement("a");
        link.className = "utility-result";
        link.href = item.href || "#";
        link.innerHTML = `
            <strong>${escapeHtml(item.title || "제목 없음")}</strong>
            <span>${escapeHtml(item.summary || "내용 없음")}</span>
            <time>${escapeHtml(typeNames[item.type] || item.type || "")}${item.date ? ` · ${escapeHtml(formatDateTime(item.date))}` : ""}</time>
        `;
        results.appendChild(link);
    });
}

function initializeUtilityNavigation() {
    enhanceGlobalHeader();
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeUtilityPopovers();
    });

    auth.onAuthStateChanged(user => {
        document.querySelectorAll(".auth-utility").forEach(element => {
            element.classList.toggle("hidden", !user);
        });
        if (user) {
            refreshNotificationBadge();
        }
    });
}

function cleanupLegacyPwa() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
        navigator.serviceWorker.getRegistrations()
            .then(registrations => Promise.all(registrations.map(registration => registration.update())))
            .catch(() => {});
    }
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
    cleanupLegacyPwa();
    checkApiAvailability();
    window.addEventListener("online", checkApiAvailability);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApiStatusMonitor, { once: true });
} else {
    startApiStatusMonitor();
}
