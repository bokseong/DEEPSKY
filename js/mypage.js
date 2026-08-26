import { apiFetch, apiRequest, auth, authHeaders, getCurrentProfile, updateCurrentProfile } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUser = null;
let currentProfile = null;
const roleMap = {
    admin: "관리자", teacher: "교사",
    student: "동아리 부원", member: "일반 회원"
};

async function logout() {
    await signOut(auth);
    location.href = "index.html";
}

document.getElementById("card-logout-btn").onclick = document.getElementById("logout-btn").onclick = logout;

onAuthStateChanged(auth, async user => {
    if (!user) {
        location.href = "login.html";
        return;
    }
    try {
        currentUser = user;
        currentProfile = await getCurrentProfile(user);
        document.getElementById("login-link").style.display = "none";
        document.getElementById("logout-btn").style.display = "inline";
        document.getElementById("user-name").style.display = "inline";
        document.getElementById("user-name").textContent = currentProfile.name || "User";
        document.getElementById("display-email").value = currentProfile.email || user.email || "";
        document.getElementById("edit-name").value = currentProfile.name || "";
        document.getElementById("display-role").value = roleMap[currentProfile.role] || currentProfile.role;
        await Promise.all([loadBookmarks(), loadRecentViews()]);
    } catch (error) {
        console.error(error);
        location.replace("block.html");
    }
});

document.getElementById("update-profile-btn").onclick = async () => {
    const name = document.getElementById("edit-name").value.trim();
    if (!name) return alert("이름을 입력해 주세요.");
    try {
        await updateCurrentProfile({ name, school: currentProfile?.school || "" }, currentUser);
        alert("프로필이 수정되었습니다.");
        location.reload();
    } catch (error) {
        alert(error.message);
    }
};

async function loadBookmarks() {
    const list = document.getElementById("bookmark-list");
    try {
        const response = await apiRequest("/api/jhimap/bookmarks", {}, currentUser);
        renderPostList(list, await response.json(), "저장한 글이 없습니다.", true);
    } catch (error) {
        list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

async function loadRecentViews() {
    const list = document.getElementById("recent-list");
    try {
        const response = await apiRequest("/api/jhimap/recent-views", {}, currentUser);
        renderPostList(list, await response.json(), "최근 본 글이 없습니다.", false);
    } catch (error) {
        list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

function renderPostList(container, items, emptyMessage, removable) {
    container.innerHTML = "";
    if (!items.length) {
        container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
        return;
    }
    items.forEach(item => {
        const article = document.createElement("article");
        article.className = "feature-item";
        const header = document.createElement("div");
        header.className = "list-item-header";
        const link = document.createElement("a");
        link.href = item.link;
        const title = document.createElement("h3");
        title.textContent = item.title || "제목 없음";
        link.appendChild(title);
        header.appendChild(link);
        if (removable) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn";
            remove.textContent = "삭제";
            remove.addEventListener("click", async () => {
                await apiRequest(`/api/jhimap/bookmarks/${item.collection_name}/${item.id}`, {
                    method: "DELETE"
                }, currentUser);
                await loadBookmarks();
            });
            header.appendChild(remove);
        }
        const meta = document.createElement("div");
        meta.className = "item-meta";
        meta.textContent = `${collectionLabel(item.collection_name)} · ${item.category || "기타"} · ${formatDate(item.bookmarked_at || item.viewed_at)}`;
        article.append(header, meta);
        container.appendChild(article);
    });
}

function collectionLabel(value) {
    return { resources: "공용 자료", "club-board": "동아리 게시판" }[value] || value;
}

function formatDate(value) {
    return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function escapeHtml(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

document.getElementById("delete-account-btn").onclick = async () => {
    if (!currentUser) return alert("로그인이 필요합니다.");
    if (document.getElementById("delete-confirm-input").value.trim() !== "회원탈퇴") {
        return alert("확인 문구를 정확히 입력해 주세요.");
    }
    if (!confirm("정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    const button = document.getElementById("delete-account-btn");
    button.disabled = true;
    button.textContent = "처리 중...";
    try {
        const response = await apiFetch("/api/jhimap/account", {
            method: "DELETE",
            headers: await authHeaders(currentUser)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "회원탈퇴에 실패했습니다.");
        await signOut(auth).catch(() => {});
        alert("회원탈퇴가 완료되었습니다.");
        location.replace("index.html");
    } catch (error) {
        alert(error.message || "회원탈퇴에 실패했습니다.");
        button.disabled = false;
        button.textContent = "회원탈퇴";
    }
};
