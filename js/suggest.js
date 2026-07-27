let currentUser = null;
let currentUserRole = "guest";
let currentUserName = "익명";
let suggestionDraft = null;

auth.onAuthStateChanged(async user => {
    const status = document.getElementById("userStatus");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const formCard = document.getElementById("suggestFormCard");
    const adminPanel = document.getElementById("suggestAdminPanel");

    currentUser = user;
    formCard?.classList.add("hidden");
    adminPanel?.classList.add("hidden");

    if (!user) {
        currentUserRole = "guest";
        currentUserName = "익명";
        if (status) status.textContent = "로그인이 필요합니다";
        loginBtn?.classList.remove("hidden");
        logoutBtn?.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "건의함을 이용하려면 로그인해 주세요.",
            action: "login"
        });
        return;
    }

    loginBtn?.classList.add("hidden");
    logoutBtn?.classList.remove("hidden");

    try {
        const userData = await getServerUserProfile(user);
        currentUserRole = normalizeRole(userData.role);
        currentUserName = userData.name || user.displayName || user.email.split("@")[0];
        if (status) status.textContent = `${currentUserName}님 (${getRoleName(currentUserRole)})`;

        if (currentUserRole === "student") {
            setProtectedPageAccess({ allowed: true });
            formCard?.classList.remove("hidden");
            initializeSuggestionDraft();
            return;
        }

        if (currentUserRole === "admin") {
            setProtectedPageAccess({ allowed: true });
            adminPanel?.classList.remove("hidden");
            await loadSuggestions();
            return;
        }

        setProtectedPageAccess({
            allowed: false,
            title: "접근 제한",
            message: "건의사항 작성은 동아리 부원만 이용할 수 있습니다.",
            action: "role"
        });
    } catch (error) {
        if (status) status.textContent = error.message || "권한 확인 실패";
        setProtectedPageAccess({
            allowed: false,
            title: "권한 확인 실패",
            message: "서버에서 권한 정보를 확인하지 못했습니다.",
            action: "retry"
        });
    }
});

document.getElementById("suggestRefreshBtn")?.addEventListener("click", loadSuggestions);

function initializeSuggestionDraft() {
    if (suggestionDraft || !currentUser) return;
    suggestionDraft = setupDraftAutosave({
        key: `deepsky:draft:suggestion:${currentUser.uid}`,
        fields: { content: "#sInput" }
    });
}

async function addSuggestion() {
    if (!currentUser || currentUserRole !== "student") {
        showToast("건의사항 작성은 동아리 부원만 가능합니다.", "error");
        return;
    }

    const input = document.getElementById("sInput");
    const content = input?.value.trim() || "";
    if (!content) {
        showToast("건의 내용을 입력하세요.", "error");
        return;
    }

    const isAnonymous = document.getElementById("sAnon")?.checked;
    try {
        await requestAuthenticatedApi("/api/suggests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "건의사항",
                content,
                author: isAnonymous ? "익명" : currentUserName,
                date: new Date().toISOString()
            })
        });
        input.value = "";
        const anonymousCheckbox = document.getElementById("sAnon");
        if (anonymousCheckbox) anonymousCheckbox.checked = false;
        suggestionDraft?.clear();
        showToast("건의를 접수했습니다.", "success");
    } catch (error) {
        showToast(error.message || "건의 접수에 실패했습니다.", "error");
    }
}

async function loadSuggestions() {
    if (!currentUser || currentUserRole !== "admin") return;

    const list = document.getElementById("suggestList");
    const summary = document.getElementById("suggestSummary");
    const refreshButton = document.getElementById("suggestRefreshBtn");
    if (!list || !summary || !refreshButton) return;

    refreshButton.disabled = true;
    summary.textContent = "목록을 불러오는 중입니다.";
    list.innerHTML = "";

    try {
        const data = await requestAuthenticatedApi("/api/suggests");
        const entries = Object.entries(data || {}).sort(([, a], [, b]) => {
            return getSuggestionTime(b?.date) - getSuggestionTime(a?.date);
        });
        summary.textContent = `접수된 건의사항 ${entries.length}건`;
        renderSuggestions(entries);
    } catch (error) {
        summary.textContent = "목록 조회에 실패했습니다.";
        const message = document.createElement("p");
        message.className = "suggest-empty suggest-error";
        message.textContent = error.message || "건의사항을 불러오지 못했습니다.";
        list.appendChild(message);
    } finally {
        refreshButton.disabled = false;
    }
}

function renderSuggestions(entries) {
    const list = document.getElementById("suggestList");
    if (!list) return;
    list.innerHTML = "";

    if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "suggest-empty";
        empty.textContent = "접수된 건의사항이 없습니다.";
        list.appendChild(empty);
        return;
    }

    entries.forEach(([id, suggestion]) => {
        const item = document.createElement("article");
        item.className = "suggest-item";

        const meta = document.createElement("div");
        meta.className = "suggest-meta";

        const author = document.createElement("span");
        author.textContent = suggestion.author || "익명";

        const date = document.createElement("time");
        date.dateTime = suggestion.date || "";
        date.textContent = formatSuggestionDate(suggestion.date);
        meta.append(author, date);

        const title = document.createElement("h3");
        title.textContent = suggestion.title || "건의사항";

        const content = document.createElement("p");
        content.className = "suggest-text";
        content.textContent = suggestion.content || "";

        const actions = document.createElement("div");
        actions.className = "admin-controls";
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "suggest-delete-btn";
        deleteButton.textContent = "삭제";
        deleteButton.addEventListener("click", () => deleteSuggest(id));
        actions.appendChild(deleteButton);

        item.append(meta, title, content, actions);
        list.appendChild(item);
    });
}

async function deleteSuggest(id) {
    if (currentUserRole !== "admin" || !confirm("이 건의사항을 삭제하시겠습니까?")) return;
    try {
        await requestAuthenticatedApi(`/api/suggests/${encodeURIComponent(String(id))}`, {
            method: "DELETE"
        });
        showToast("건의사항을 삭제했습니다.", "success");
        await loadSuggestions();
    } catch (error) {
        showToast(error.message || "삭제에 실패했습니다.", "error");
    }
}

function getSuggestionTime(value) {
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatSuggestionDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "날짜 정보 없음";
    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function logout() {
    if (confirm("로그아웃 하시겠습니까?")) {
        auth.signOut().then(() => location.reload());
    }
}
