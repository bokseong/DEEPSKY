let activities = [];

const activityTypeNames = {
    post: "게시글",
    comment: "댓글",
    question: "질문",
    reply: "답변",
    suggestion: "건의",
    photo: "사진",
    roleRequest: "권한 요청"
};

auth.onAuthStateChanged(async user => {
    const status = document.getElementById("userStatus");
    document.getElementById("loginBtn")?.classList.toggle("hidden", Boolean(user));
    document.getElementById("logoutBtn")?.classList.toggle("hidden", !user);

    if (!user) {
        if (status) status.textContent = "로그인이 필요합니다";
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "내 활동을 확인하려면 로그인해 주세요.",
            action: "login"
        });
        return;
    }

    if (status) status.textContent = user.email;
    setProtectedPageAccess({ allowed: true });
    await loadActivities();
});

document.getElementById("activityFilter")?.addEventListener("change", renderActivities);

async function loadActivities() {
    const list = document.getElementById("activityList");
    list.innerHTML = '<div class="hub-empty">활동 내역을 불러오는 중...</div>';
    try {
        const data = await requestAuthenticatedApi("/api/me/activity");
        activities = data.items || [];
        renderActivities();
    } catch (error) {
        list.innerHTML = `<div class="hub-empty">${escapeHtml(error.message)}</div>`;
        showToast(error.message, "error");
    }
}

function renderActivities() {
    const list = document.getElementById("activityList");
    const filter = document.getElementById("activityFilter")?.value || "all";
    const filtered = filter === "all" ? activities : activities.filter(item => item.type === filter);
    list.replaceChildren();

    if (!filtered.length) {
        list.innerHTML = '<div class="hub-empty">표시할 활동 내역이 없습니다.</div>';
        return;
    }

    filtered.forEach(item => {
        const link = document.createElement("a");
        link.className = "hub-item";
        link.href = item.href || "#";
        link.innerHTML = `
            <div class="hub-item__top">
                <h2>${escapeHtml(item.title)}</h2>
                <span class="hub-item__meta">${escapeHtml(activityTypeNames[item.type] || item.type)}${item.date ? ` · ${escapeHtml(formatDateTime(item.date))}` : ""}</span>
            </div>
            <p>${escapeHtml(item.summary || "내용 없음")}</p>
        `;
        list.appendChild(link);
    });
}

function logout() {
    auth.signOut().then(() => location.href = "index.html");
}
