const searchTypeNames = {
    post: "자유 게시판",
    question: "질문",
    resource: "자료실",
    photo: "활동 사진"
};

auth.onAuthStateChanged(user => {
    const status = document.getElementById("userStatus");
    document.getElementById("loginBtn")?.classList.toggle("hidden", Boolean(user));
    document.getElementById("logoutBtn")?.classList.toggle("hidden", !user);
    if (status) status.textContent = user ? user.email : "로그인하지 않음";
});

document.getElementById("searchForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const query = document.getElementById("searchQuery").value.trim();
    runSearch(query);
});

async function runSearch(query) {
    const summary = document.getElementById("searchSummary");
    const results = document.getElementById("searchResults");
    if (query.length < 2) {
        showToast("검색어를 2자 이상 입력해 주세요.", "error");
        return;
    }

    summary.textContent = "검색 중...";
    results.replaceChildren();

    try {
        const headers = { "ngrok-skip-browser-warning": "69420" };
        if (auth.currentUser) {
            headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
        }
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`, { headers });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "검색에 실패했습니다.");

        summary.textContent = `"${data.query}" 검색 결과 ${data.count}건`;
        if (!data.items?.length) {
            results.innerHTML = '<div class="hub-empty">검색 결과가 없습니다.</div>';
            return;
        }
        data.items.forEach(item => results.appendChild(createSearchResult(item)));
    } catch (error) {
        summary.textContent = "";
        results.innerHTML = `<div class="hub-empty">${escapeHtml(error.message)}</div>`;
        showToast(error.message, "error");
    }
}

function createSearchResult(item) {
    const link = document.createElement("a");
    link.className = "hub-item";
    link.href = item.href || "#";
    link.innerHTML = `
        <div class="hub-item__top">
            <h2>${escapeHtml(item.title)}</h2>
            <span class="hub-item__meta">${escapeHtml(searchTypeNames[item.type] || item.type)}${item.date ? ` · ${escapeHtml(formatDateTime(item.date))}` : ""}</span>
        </div>
        <p>${escapeHtml(item.summary || "내용 없음")}</p>
        ${item.author ? `<span class="hub-item__meta">작성자 ${escapeHtml(item.author)}</span>` : ""}
    `;
    return link;
}

function logout() {
    auth.signOut().then(() => location.reload());
}

const initialQuery = new URLSearchParams(location.search).get("q") || "";
if (initialQuery) {
    document.getElementById("searchQuery").value = initialQuery;
    auth.authStateReady?.().finally(() => runSearch(initialQuery)) || runSearch(initialQuery);
}
