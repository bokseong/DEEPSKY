import { apiRequest, auth, getCurrentProfile } from "./common.js?v=20260920-guest-permissions";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const roleMap = {
    admin: "관리자", teacher: "교사",
    deputy: "차장", student: "동아리 부원", member: "일반 회원"
};
const userNameDisplay = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
let currentAdminUser = null;
let currentAdminRole = "guest";
let recentActivity = [];
let activityFilter = "all";

document.querySelectorAll("[data-activity-filter]").forEach(button => {
    button.addEventListener("click", () => {
        activityFilter = button.dataset.activityFilter;
        document.querySelectorAll("[data-activity-filter]").forEach(item => {
            const active = item === button;
            item.classList.toggle("active", active);
            item.setAttribute("aria-pressed", String(active));
        });
        renderRecentActivity();
    });
});

document.getElementById("activity-refresh").addEventListener("click", () => loadRecentActivity());

onAuthStateChanged(auth, async user => {
    if (!user) {
        location.replace("block.html");
        return;
    }
    try {
        const [profile, permissions] = await Promise.all([
            getCurrentProfile(user),
            apiRequest("/api/deepsky/me/permissions", {}, user).then(response => response.json())
        ]);
        if (!permissions["admin.access"]) {
            location.replace("block.html");
            return;
        }
        currentAdminUser = user;
        currentAdminRole = profile.role || "member";
        document.getElementById("permission-page-link").hidden = currentAdminRole !== "admin";
        userNameDisplay.style.display = "inline";
        userNameDisplay.textContent = `${profile.name || "관리자"}님`;
        logoutBtn.style.display = "inline";
        const tasks = [
            loadRecentActivity(),
            loadUsers(),
            loadSuggestions(),
            loadRequests(),
            loadReports(),
            loadAuditLogs()
        ];
        await Promise.all(tasks);
    } catch (error) {
        console.error("권한 확인 실패:", error);
        location.replace("block.html");
    }
});

async function loadRecentActivity() {
    const list = document.getElementById("activity-list");
    const refreshButton = document.getElementById("activity-refresh");
    refreshButton.disabled = true;
    refreshButton.textContent = "불러오는 중";
    list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;">최근 활동을 불러오는 중...</td></tr>';
    try {
        const response = await apiRequest("/api/deepsky/admin/activity", {}, currentAdminUser);
        const data = await response.json();
        recentActivity = Array.isArray(data.items) ? data.items : [];
        document.getElementById("activity-total").textContent = String(data.count || 0);
        document.getElementById("activity-posts").textContent = String(data.posts || 0);
        document.getElementById("activity-comments").textContent = String(data.comments || 0);
        renderRecentActivity();
    } catch (error) {
        recentActivity = [];
        list.innerHTML = `<tr><td colspan="5" style="text-align:center;">최근 활동을 불러올 수 없습니다: ${escapeHtml(error.message)}</td></tr>`;
    } finally {
        refreshButton.disabled = false;
        refreshButton.textContent = "새로고침";
    }
}

function renderRecentActivity() {
    const list = document.getElementById("activity-list");
    const items = activityFilter === "all"
        ? recentActivity
        : recentActivity.filter(item => item.kind === activityFilter);
    list.innerHTML = "";
    if (!items.length) {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;">조건에 맞는 최근 활동이 없습니다.</td></tr>';
        return;
    }
    items.forEach(item => {
        const row = document.createElement("tr");
        const kindLabel = item.kind === "comment" ? "댓글 작성" : "게시글 작성";
        const actorRole = roleMap[item.actor_role] || item.actor_role || "탈퇴 사용자";
        row.innerHTML = `
            <td class="activity-time">${formatDateTime(item.created_at)}</td>
            <td>
                <strong>${escapeHtml(item.actor_name || "사용자")}</strong>
                <small class="activity-user-meta">${escapeHtml(actorRole)} · ${escapeHtml(item.actor_email || item.actor_uid || "-")}</small>
            </td>
            <td><span class="activity-kind ${escapeHtml(item.kind)}">${kindLabel}</span></td>
            <td>${escapeHtml(collectionLabel(item.collection_name))}</td>
            <td>
                <a class="text-link activity-target" href="${escapeHtml(item.link || "#")}">${escapeHtml(item.target_title || "제목 없음")}</a>
                <small class="activity-content">${escapeHtml(item.content || "내용 없음")}</small>
            </td>
        `;
        list.appendChild(row);
    });
}

async function loadUsers() {
    const userList = document.getElementById("user-list");
    try {
        const response = await apiRequest("/api/deepsky/admin/users", {}, currentAdminUser);
        const users = await response.json();
        userList.innerHTML = "";
        if (!users.length) {
            userList.innerHTML = '<tr><td colspan="5" style="text-align:center;">등록된 사용자가 없습니다.</td></tr>';
            return;
        }
        users.forEach(user => {
            if (currentAdminRole === "deputy") {
                const row = document.createElement("tr");
                const action = user.role === "member"
                    ? `<button class="btn-update" data-promote>부원으로 변경</button>`
                    : "<span>변경 불가</span>";
                row.innerHTML = `<td>${escapeHtml(user.name || "이름 없음")}</td><td>${escapeHtml(user.school || "-")}</td><td>${escapeHtml(user.email || "-")}</td><td><span style="color:var(--accent)">${escapeHtml(roleMap[user.role] || user.role || "member")}</span></td><td>${action}</td>`;
                row.querySelector("[data-promote]")?.addEventListener("click", () => updateUserRole(user.uid, "student"));
                userList.appendChild(row);
                return;
            }
            const options = Object.entries(roleMap).map(([value, label]) =>
                `<option value="${value}" ${user.role === value ? "selected" : ""}>${label}</option>`
            ).join("");
            const row = document.createElement("tr");
            row.innerHTML = `<td>${escapeHtml(user.name || "이름 없음")}</td><td>${escapeHtml(user.school || "-")}</td><td>${escapeHtml(user.email || "-")}</td><td><span style="color:var(--accent)">${escapeHtml(roleMap[user.role] || user.role || "member")}</span></td><td><select id="role-${user.uid}" class="role-select">${options}</select><button class="btn-update">변경</button></td>`;
            row.querySelector("button").onclick = () => updateUserRole(user.uid);
            userList.appendChild(row);
        });
    } catch (error) {
        console.error(error);
        userList.innerHTML = '<tr><td colspan="5" style="text-align:center;">사용자 목록을 불러올 수 없습니다.</td></tr>';
    }
}

async function loadSuggestions() {
    const list = document.getElementById("suggestion-list");
    try {
        const response = await apiRequest("/api/deepsky/suggestions", {}, currentAdminUser);
        const suggestions = await response.json();
        clearSuggestionAttachmentUrls();
        list.innerHTML = "";
        if (!suggestions.length) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;">접수된 건의 사항이 없습니다.</td></tr>';
            return;
        }
        suggestions.forEach(suggestion => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${formatDate(suggestion.created_at)}</td><td><span style="color:var(--accent)">[${escapeHtml(suggestion.category || "-")}]</span></td><td><strong>${escapeHtml(suggestion.subject || "제목 없음")}</strong><br><small style="color:#ccc">${escapeHtml(suggestion.content || "")}</small></td><td>${escapeHtml(suggestion.author_name || "익명")}</td><td><button class="btn-update btn-danger">해결 완료</button></td>`;
            const attachments = document.createElement("div");
            attachments.className = "suggestion-attachments";
            row.children[2].appendChild(attachments);
            void renderSuggestionAttachments(attachments, suggestion.attachments || []);
            row.querySelector("button").onclick = () => deleteSuggestion(suggestion.id);
            list.appendChild(row);
        });
    } catch (error) {
        console.error(error);
        list.innerHTML = '<tr><td colspan="5" style="text-align:center;">건의사항을 불러올 수 없습니다.</td></tr>';
    }
}

const suggestionAttachmentUrls = new Set();

function clearSuggestionAttachmentUrls() {
    suggestionAttachmentUrls.forEach(url => URL.revokeObjectURL(url));
    suggestionAttachmentUrls.clear();
}

async function renderSuggestionAttachments(container, attachments) {
    if (!attachments.length) return;
    for (const [index, attachment] of attachments.entries()) {
        const link = document.createElement("a");
        link.className = "suggestion-attachment";
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = `첨부 이미지 ${index + 1} 불러오는 중`;
        container.appendChild(link);
        try {
            const response = await apiRequest(attachment.url, {}, currentAdminUser);
            const blob = await response.blob();
            if (!blob.type.startsWith("image/")) throw new Error("이미지 형식이 아닙니다.");
            const objectUrl = URL.createObjectURL(blob);
            suggestionAttachmentUrls.add(objectUrl);
            link.href = objectUrl;
            link.replaceChildren();
            const image = document.createElement("img");
            image.src = objectUrl;
            image.alt = attachment.name || `첨부 이미지 ${index + 1}`;
            link.appendChild(image);
        } catch (error) {
            link.removeAttribute("href");
            link.textContent = `첨부 이미지 ${index + 1} 로드 실패`;
            link.title = error.message;
        }
    }
}

window.addEventListener("beforeunload", clearSuggestionAttachmentUrls);

async function loadRequests() {
    const list = document.getElementById("request-list");
    try {
        const response = await apiRequest("/api/deepsky/authority-requests", {}, currentAdminUser);
        const requests = await response.json();
        list.innerHTML = "";
        if (!requests.length) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;">접수된 요청이 없습니다.</td></tr>';
            return;
        }
        requests.forEach(authorityRequest => {
            const row = document.createElement("tr");
            const actions = currentAdminRole === "deputy"
                ? '<button class="btn-update" data-action="approve">부원 승격 승인</button>'
                : '<button class="btn-update" data-action="approve">승인</button><button class="btn-update btn-danger" data-action="reject">거절</button>';
            row.innerHTML = `<td>${formatDate(authorityRequest.created_at)}</td><td>${escapeHtml(authorityRequest.name || "이름 없음")}</td><td>${escapeHtml(authorityRequest.school || "-")}</td><td><span style="color:var(--accent)">${escapeHtml(roleMap[authorityRequest.requested_role] || authorityRequest.requested_role)}</span></td><td><small style="color:#ccc">${escapeHtml(authorityRequest.reason || "-")}</small></td><td>${actions}</td>`;
            row.querySelector('[data-action="approve"]').onclick = () => handleRequest(authorityRequest.uid, "approve");
            const rejectButton = row.querySelector('[data-action="reject"]');
            if (rejectButton) rejectButton.onclick = () => handleRequest(authorityRequest.uid, "reject");
            list.appendChild(row);
        });
    } catch (error) {
        console.error(error);
        list.innerHTML = `<tr><td colspan="6" style="text-align:center;">요청 목록을 불러올 수 없습니다: ${escapeHtml(error.message)}</td></tr>`;
    }
}

async function updateUserRole(uid, requestedRole = "") {
    const role = requestedRole || document.getElementById(`role-${uid}`).value;
    if (!confirm(`해당 사용자의 등급을 ${roleMap[role] || role}(으)로 변경하시겠습니까?`)) return;
    try {
        await apiRequest(`/api/deepsky/admin/users/${encodeURIComponent(uid)}/role`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role })
        }, currentAdminUser);
        alert("등급이 변경되었습니다.");
        await loadUsers();
    } catch (error) {
        alert(error.message);
    }
}

async function handleRequest(uid, action) {
    if (!confirm(`이 요청을 ${action === "approve" ? "승인" : "거절"}하시겠습니까?`)) return;
    try {
        await apiRequest(`/api/deepsky/authority-requests/${encodeURIComponent(uid)}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action })
        }, currentAdminUser);
        alert(action === "approve" ? "요청이 승인되었습니다." : "요청이 거절되었습니다.");
        await Promise.all([loadRequests(), loadUsers()]);
    } catch (error) {
        alert(error.message);
    }
}

async function deleteSuggestion(id) {
    if (!confirm("이 건의 사항을 해결 완료 처리하고 삭제하시겠습니까?")) return;
    try {
        await apiRequest(`/api/deepsky/suggestions/${encodeURIComponent(String(id))}`, { method: "DELETE" }, currentAdminUser);
        alert("삭제되었습니다.");
        await loadSuggestions();
    } catch (error) {
        alert(error.message);
    }
}

async function loadReports() {
    const list = document.getElementById("report-list");
    try {
        const response = await apiRequest("/api/deepsky/admin/reports", {}, currentAdminUser);
        const reports = await response.json();
        list.innerHTML = "";
        if (!reports.length) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;">접수된 신고가 없습니다.</td></tr>';
            return;
        }
        reports.forEach(report => {
            const row = document.createElement("tr");
            const targetLink = report.target_url || postLink(report.collection_name, report.target_post_id || report.target_id);
            const targetLabel = report.target_type === "comment" ? "댓글" : "게시글";
            const targetTitle = report.target_title ? `<br><small>${escapeHtml(report.target_title)}</small>` : "";
            row.innerHTML = `<td>${formatDate(report.created_at)}</td><td>${escapeHtml(targetLabel)} #${report.target_id}${targetTitle}</td><td>${escapeHtml(report.reason)}<br><small>${escapeHtml(report.details || "")}</small></td><td>${escapeHtml(report.reporter_name || "-")}</td><td>${escapeHtml(report.status)}</td><td></td>`;
            const actionCell = row.lastElementChild;
            if (report.target_exists !== false && targetLink) {
                const openTarget = document.createElement("a");
                openTarget.className = "btn-update";
                openTarget.href = targetLink;
                openTarget.textContent = "바로가기";
                actionCell.appendChild(openTarget);
            } else {
                const missing = document.createElement("span");
                missing.className = "muted";
                missing.textContent = "삭제된 대상";
                actionCell.appendChild(missing);
            }
            if (report.status === "pending") {
                const resolve = document.createElement("button");
                resolve.className = "btn-update";
                resolve.textContent = "처리";
                resolve.onclick = () => updateReport(report.id, "resolved");
                const dismiss = document.createElement("button");
                dismiss.className = "btn-update btn-danger";
                dismiss.textContent = "기각";
                dismiss.onclick = () => updateReport(report.id, "dismissed");
                actionCell.append(resolve, dismiss);
            }
            list.appendChild(row);
        });
    } catch (error) {
        list.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function updateReport(id, status) {
    const action = status === "resolved" ? "처리" : "기각";
    if (!confirm(`이 신고를 ${action}하고 신고 기록을 삭제하시겠습니까?`)) return;
    try {
        await apiRequest(`/api/deepsky/admin/reports/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status })
        }, currentAdminUser);
        await Promise.all([loadReports(), loadAuditLogs()]);
        alert(`신고가 ${action}되었으며 신고 기록이 삭제되었습니다.`);
    } catch (error) {
        alert(error.message);
    }
}

async function loadAuditLogs() {
    const list = document.getElementById("audit-list");
    try {
        const response = await apiRequest("/api/deepsky/admin/audit-logs", {}, currentAdminUser);
        const logs = await response.json();
        list.innerHTML = "";
        if (!logs.length) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;">기록된 운영 작업이 없습니다.</td></tr>';
            return;
        }
        logs.forEach(log => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${formatDate(log.created_at)}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.target_type)} ${escapeHtml(log.target_id)}</td><td>${escapeHtml(log.actor_email || log.actor_uid)}</td><td><small>${escapeHtml(JSON.stringify(log.details || {}))}</small></td>`;
            list.appendChild(row);
        });
    } catch (error) {
        list.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    }
}

function postLink(collection, id) {
    if (collection === "resources") return `view.html?id=${id}`;
    if (collection === "club-board") return `school-view.html?school=b&id=${id}`;
    if (collection === "questions") return `school-view.html?school=q&id=${id}`;
    return "search.html";
}

function collectionLabel(value) {
    return {
        resources: "공용 자료",
        "club-board": "동아리 게시판",
        questions: "질문 게시판"
    }[value] || value || "-";
}

logoutBtn.onclick = async () => {
    if (confirm("로그아웃 하시겠습니까?")) {
        await signOut(auth);
        location.href = "index.html";
    }
};

function formatDate(value) {
    return value ? new Date(value).toLocaleDateString() : "-";
}

function formatDateTime(value) {
    return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function escapeHtml(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
