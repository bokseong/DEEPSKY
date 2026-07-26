let notifications = [];

auth.onAuthStateChanged(async user => {
    const status = document.getElementById("userStatus");
    document.getElementById("loginBtn")?.classList.toggle("hidden", Boolean(user));
    document.getElementById("logoutBtn")?.classList.toggle("hidden", !user);

    if (!user) {
        if (status) status.textContent = "로그인이 필요합니다";
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "알림을 확인하려면 로그인해 주세요.",
            action: "login"
        });
        return;
    }

    if (status) status.textContent = user.email;
    setProtectedPageAccess({ allowed: true });
    await loadNotifications();
});

document.getElementById("readAllBtn")?.addEventListener("click", async () => {
    try {
        await requestAuthenticatedApi("/api/notifications/read-all", { method: "PUT" });
        notifications.forEach(item => {
            item.read = true;
        });
        renderNotifications();
        refreshNotificationBadge();
        showToast("모든 알림을 읽음 처리했습니다.", "success");
    } catch (error) {
        showToast(error.message, "error");
    }
});

async function loadNotifications() {
    const list = document.getElementById("notificationList");
    list.innerHTML = '<div class="hub-empty">알림을 불러오는 중...</div>';
    try {
        const data = await requestAuthenticatedApi("/api/notifications");
        notifications = data.items || [];
        renderNotifications();
    } catch (error) {
        list.innerHTML = `<div class="hub-empty">${escapeHtml(error.message)}</div>`;
        showToast(error.message, "error");
    }
}

function renderNotifications() {
    const list = document.getElementById("notificationList");
    list.replaceChildren();
    if (!notifications.length) {
        list.innerHTML = '<div class="hub-empty">새 알림이 없습니다.</div>';
        return;
    }

    notifications.forEach(item => {
        const article = document.createElement("article");
        article.className = `hub-item${item.read ? "" : " hub-item--unread"}`;
        article.tabIndex = 0;
        article.setAttribute("role", "link");
        article.innerHTML = `
            <div class="hub-item__top">
                <h2>${escapeHtml(item.title)}</h2>
                <span class="hub-item__meta">${escapeHtml(formatDateTime(item.createdAt))}</span>
            </div>
            <p>${escapeHtml(item.message || "")}</p>
            <div class="hub-item__actions">
                <button type="button" data-delete="${escapeAttr(item.id)}" aria-label="알림 삭제">삭제</button>
            </div>
        `;
        article.addEventListener("click", async event => {
            if (event.target.closest("[data-delete]")) return;
            await openNotification(item);
        });
        article.addEventListener("keydown", event => {
            if (event.key === "Enter") openNotification(item);
        });
        article.querySelector("[data-delete]").addEventListener("click", () => deleteNotification(item.id));
        list.appendChild(article);
    });
}

async function openNotification(item) {
    if (!item.read) {
        await requestAuthenticatedApi(`/api/notifications/${encodeURIComponent(item.id)}/read`, {
            method: "PUT"
        }).catch(() => {});
    }
    location.href = item.href || "index.html";
}

async function deleteNotification(id) {
    try {
        await requestAuthenticatedApi(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
        notifications = notifications.filter(item => item.id !== id);
        renderNotifications();
        refreshNotificationBadge();
    } catch (error) {
        showToast(error.message, "error");
    }
}

function logout() {
    auth.signOut().then(() => location.href = "index.html");
}
