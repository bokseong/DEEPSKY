import { apiRequest, auth, getCurrentProfile } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const roleMap = {
    admin: "관리자", teacher: "교사",
    student: "동아리 부원", member: "일반 회원"
};
const userNameDisplay = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
let currentAdminUser = null;
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
document.getElementById("permission-refresh").addEventListener("click", () => loadRolePermissions());

onAuthStateChanged(auth, async user => {
    if (!user) {
        location.replace("block.html");
        return;
    }
    try {
        const profile = await getCurrentProfile(user);
        if (profile.role !== "admin") {
            location.replace("block.html");
            return;
        }
        currentAdminUser = user;
        userNameDisplay.style.display = "inline";
        userNameDisplay.textContent = `${profile.name || "관리자"}님`;
        logoutBtn.style.display = "inline";
        await Promise.all([
            loadRecentActivity(),
            loadUsers(),
            loadRolePermissions(),
            loadSuggestions(),
            loadRequests(),
            loadReports(),
            loadAuditLogs()
        ]);
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
        const response = await apiRequest("/api/jhimap/admin/activity", {}, currentAdminUser);
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
        const response = await apiRequest("/api/jhimap/admin/users", {}, currentAdminUser);
        const users = await response.json();
        userList.innerHTML = "";
        if (!users.length) {
            userList.innerHTML = '<tr><td colspan="5" style="text-align:center;">등록된 사용자가 없습니다.</td></tr>';
            return;
        }
        users.forEach(user => {
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

async function loadRolePermissions() {
    const container = document.getElementById("role-permission-matrix");
    const refreshButton = document.getElementById("permission-refresh");
    container.innerHTML = '<p class="permission-status">권한 설정을 불러오는 중입니다.</p>';
    refreshButton.disabled = true;
    try {
        const response = await apiRequest("/api/jhimap/admin/role-permissions", {}, currentAdminUser);
        renderRolePermissions(await response.json());
    } catch (error) {
        container.innerHTML = `<p class="permission-status permission-error">${escapeHtml(error.message)}</p>`;
    } finally {
        refreshButton.disabled = false;
    }
}

function renderRolePermissions(payload) {
    const container = document.getElementById("role-permission-matrix");
    const definitions = Array.isArray(payload.definitions) ? payload.definitions : [];
    const lockedRoles = new Set(payload.lockedRoles || []);
    container.replaceChildren();
    Object.entries(payload.roles || {}).forEach(([role, permissions]) => {
        const locked = lockedRoles.has(role);
        const card = document.createElement("article");
        card.className = "role-permission-card";

        const heading = document.createElement("div");
        heading.className = "role-permission-heading";
        const title = document.createElement("h3");
        title.textContent = payload.roleLabels?.[role] || roleMap[role] || role;
        const badge = document.createElement("span");
        badge.className = locked ? "permission-badge locked" : "permission-badge";
        badge.textContent = locked ? "고정" : role;
        heading.append(title, badge);
        card.appendChild(heading);

        const list = document.createElement("div");
        list.className = "permission-check-list";
        definitions.forEach(definition => {
            const label = document.createElement("label");
            label.className = "permission-check";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.dataset.permission = definition.key;
            checkbox.checked = Boolean(permissions?.[definition.key]);
            checkbox.disabled = locked;
            const text = document.createElement("span");
            const strong = document.createElement("strong");
            strong.textContent = definition.label;
            const small = document.createElement("small");
            small.textContent = definition.description;
            text.append(strong, small);
            label.append(checkbox, text);
            list.appendChild(label);
        });
        card.appendChild(list);

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "btn-update permission-save";
        saveButton.textContent = locked ? "보안상 변경 불가" : "이 등급 권한 저장";
        saveButton.disabled = locked;
        saveButton.addEventListener("click", () => saveRolePermissions(role, definitions, card, saveButton));
        card.appendChild(saveButton);
        container.appendChild(card);
    });
}

async function saveRolePermissions(role, definitions, card, button) {
    const permissions = Object.fromEntries(definitions.map(definition => [
        definition.key,
        Boolean(card.querySelector(`[data-permission="${CSS.escape(definition.key)}"]`)?.checked)
    ]));
    if (!confirm(`${roleMap[role] || role} 등급의 기능 권한을 저장하시겠습니까?`)) return;
    button.disabled = true;
    button.textContent = "저장 중...";
    try {
        await apiRequest("/api/jhimap/admin/role-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, permissions })
        }, currentAdminUser);
        await loadRolePermissions();
        alert("등급별 기능 권한이 저장되었습니다.");
    } catch (error) {
        button.disabled = false;
        button.textContent = "이 등급 권한 저장";
        alert(error.message);
    }
}

async function loadSuggestions() {
    const list = document.getElementById("suggestion-list");
    try {
        const response = await apiRequest("/api/jhimap/suggestions", {}, currentAdminUser);
        const suggestions = await response.json();
        list.innerHTML = "";
        if (!suggestions.length) {
            list.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;">접수된 건의 사항이 없습니다.</td></tr>';
            return;
        }
        suggestions.forEach(suggestion => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${formatDate(suggestion.created_at)}</td><td><span style="color:var(--accent)">[${escapeHtml(suggestion.category || "-")}]</span></td><td><strong>${escapeHtml(suggestion.subject || "제목 없음")}</strong><br><small style="color:#ccc">${escapeHtml(suggestion.content || "")}</small></td><td>${escapeHtml(suggestion.author_name || "익명")}</td><td><button class="btn-update btn-danger">해결 완료</button></td>`;
            row.querySelector("button").onclick = () => deleteSuggestion(suggestion.id);
            list.appendChild(row);
        });
    } catch (error) {
        console.error(error);
        list.innerHTML = '<tr><td colspan="5" style="text-align:center;">건의사항을 불러올 수 없습니다.</td></tr>';
    }
}

async function loadRequests() {
    const list = document.getElementById("request-list");
    try {
        const response = await apiRequest("/api/jhimap/authority-requests", {}, currentAdminUser);
        const requests = await response.json();
        list.innerHTML = "";
        if (!requests.length) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;">접수된 요청이 없습니다.</td></tr>';
            return;
        }
        requests.forEach(authorityRequest => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${formatDate(authorityRequest.created_at)}</td><td>${escapeHtml(authorityRequest.name || "이름 없음")}</td><td>${escapeHtml(authorityRequest.school || "-")}</td><td><span style="color:var(--accent)">${escapeHtml(roleMap[authorityRequest.requested_role] || authorityRequest.requested_role)}</span></td><td><small style="color:#ccc">${escapeHtml(authorityRequest.reason || "-")}</small></td><td><button class="btn-update" data-action="approve">승인</button><button class="btn-update btn-danger" data-action="reject">거절</button></td>`;
            row.querySelector('[data-action="approve"]').onclick = () => handleRequest(authorityRequest.uid, "approve");
            row.querySelector('[data-action="reject"]').onclick = () => handleRequest(authorityRequest.uid, "reject");
            list.appendChild(row);
        });
    } catch (error) {
        console.error(error);
        list.innerHTML = `<tr><td colspan="6" style="text-align:center;">요청 목록을 불러올 수 없습니다: ${escapeHtml(error.message)}</td></tr>`;
    }
}

async function updateUserRole(uid) {
    const role = document.getElementById(`role-${uid}`).value;
    if (!confirm(`해당 사용자의 등급을 ${roleMap[role] || role}(으)로 변경하시겠습니까?`)) return;
    try {
        await apiRequest(`/api/jhimap/admin/users/${encodeURIComponent(uid)}/role`, {
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
        await apiRequest(`/api/jhimap/authority-requests/${encodeURIComponent(uid)}`, {
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
        await apiRequest(`/api/jhimap/suggestions/${encodeURIComponent(String(id))}`, { method: "DELETE" }, currentAdminUser);
        alert("삭제되었습니다.");
        await loadSuggestions();
    } catch (error) {
        alert(error.message);
    }
}

async function loadReports() {
    const list = document.getElementById("report-list");
    try {
        const response = await apiRequest("/api/jhimap/admin/reports", {}, currentAdminUser);
        const reports = await response.json();
        list.innerHTML = "";
        if (!reports.length) {
            list.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;">접수된 신고가 없습니다.</td></tr>';
            return;
        }
        reports.forEach(report => {
            const row = document.createElement("tr");
            const targetLink = postLink(report.collection_name, report.target_post_id || report.target_id);
            row.innerHTML = `<td>${formatDate(report.created_at)}</td><td><a class="text-link" href="${escapeHtml(targetLink)}">${escapeHtml(report.target_type)} #${report.target_id}</a></td><td>${escapeHtml(report.reason)}<br><small>${escapeHtml(report.details || "")}</small></td><td>${escapeHtml(report.reporter_name || "-")}</td><td>${escapeHtml(report.status)}</td><td></td>`;
            const actionCell = row.lastElementChild;
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
    await apiRequest(`/api/jhimap/admin/reports/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    }, currentAdminUser);
    await Promise.all([loadReports(), loadAuditLogs()]);
}

async function loadAuditLogs() {
    const list = document.getElementById("audit-list");
    try {
        const response = await apiRequest("/api/jhimap/admin/audit-logs", {}, currentAdminUser);
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
    return "search.html";
}

function collectionLabel(value) {
    return {
        resources: "공용 자료",
        "club-board": "동아리 게시판"
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
