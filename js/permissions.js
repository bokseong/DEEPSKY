import { apiRequest, auth, blockedAccessUrl, getCurrentProfile } from "./common.js?v=20261007-return-after-login";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const state = {
    user: null,
    payload: null,
    query: "",
    group: ""
};

const userName = document.getElementById("user-name");
const logoutButton = document.getElementById("logout-btn");
const refreshButton = document.getElementById("permission-refresh");
const searchInput = document.getElementById("permission-search");
const groupFilter = document.getElementById("group-filter");
const status = document.getElementById("permission-status");
const matrixHost = document.getElementById("role-permission-matrix");
const groupOverview = document.getElementById("permission-group-overview");
const resultCount = document.getElementById("permission-result-count");

const pageLabels = {
    "admin.html": "관리자",
    "resource.html": "자료실",
    "view.html": "자료 상세",
    "write.html": "자료 작성",
    "talk.html": "동아리 게시판",
    "school-view.html?school=b": "동아리 글 상세",
    "school-write.html?school=b": "동아리 글 작성",
    "question.html": "질문 게시판",
    "school-view.html?school=q": "질문 상세",
    "school-write.html?school=q": "질문 작성",
    "suggest.html": "건의",
    "photo.html": "사진 게시판",
    "index.html": "홈"
};

const permissionGroups = [
    {
        key: "operations",
        label: "운영 및 관리",
        description: "관리자 영역과 홈의 일정·공지·업데이트 관리",
        matches: key => key === "admin.access" || key === "schedule.manage"
    },
    {
        key: "boards",
        label: "자료실·동아리 게시판",
        description: "자료와 동아리 글의 열람, 작성, 댓글 및 관리",
        matches: key => key.startsWith("boards.")
    },
    {
        key: "questions",
        label: "질문 및 답변",
        description: "질문 게시판의 열람, 질문 작성과 답변",
        matches: key => key.startsWith("questions.")
    },
    {
        key: "gallery",
        label: "사진 및 활동 공유",
        description: "활동 사진의 열람, 등록 및 관리",
        matches: key => key.startsWith("gallery.")
    },
    {
        key: "suggestions",
        label: "건의 및 의견",
        description: "건의사항 제출과 관리자 열람",
        matches: key => key.startsWith("suggestions.")
    },
    {
        key: "other",
        label: "기타 기능",
        description: "새로 추가되어 아직 별도 분류되지 않은 기능",
        matches: () => true
    }
];

logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    location.replace(blockedAccessUrl());
});

refreshButton.addEventListener("click", () => loadPermissions());
searchInput.addEventListener("input", () => {
    state.query = searchInput.value.trim().toLocaleLowerCase("ko");
    renderAll();
});
groupFilter.addEventListener("change", () => {
    state.group = groupFilter.value;
    renderAll();
});

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
        state.user = user;
        userName.hidden = false;
        userName.textContent = `${profile.name || "관리자"}님`;
        logoutButton.hidden = false;
        document.body.classList.remove("secure-loading");
        await loadPermissions();
    } catch (error) {
        console.error("권한 관리 인증 실패:", error);
        location.replace("block.html");
    }
});

async function loadPermissions() {
    if (!state.user) return;
    refreshButton.disabled = true;
    setStatus("권한 설정을 불러오는 중입니다.");
    try {
        const response = await apiRequest("/api/deepsky/admin/role-permissions", {}, state.user);
        state.payload = await response.json();
        populateGroupFilter();
        renderAll();
        setStatus("변경할 등급의 권한을 조정한 뒤 해당 열 아래의 저장 버튼을 누르세요.");
    } catch (error) {
        state.payload = null;
        matrixHost.replaceChildren();
        groupOverview.replaceChildren();
        setStatus(error.message, true);
    } finally {
        refreshButton.disabled = false;
    }
}

function renderAll() {
    if (!state.payload) return;
    renderGroupOverview();
    renderPermissionMatrix();
}

function groupForDefinition(definition) {
    return permissionGroups.find(group => group.matches(definition.key)) || permissionGroups.at(-1);
}

function activeGroups() {
    const definitions = state.payload?.definitions || [];
    return permissionGroups.filter(group => definitions.some(definition => groupForDefinition(definition).key === group.key));
}

function populateGroupFilter() {
    const selected = state.group;
    groupFilter.replaceChildren(new Option("전체 기능", ""));
    activeGroups().forEach(group => groupFilter.add(new Option(group.label, group.key)));
    if ([...groupFilter.options].some(option => option.value === selected)) groupFilter.value = selected;
    else state.group = "";
}

function renderGroupOverview() {
    groupOverview.replaceChildren();
    activeGroups().forEach(group => {
        const definitions = (state.payload.definitions || []).filter(definition => groupForDefinition(definition).key === group.key);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "permission-group-card";
        button.classList.toggle("active", state.group === group.key);
        const title = document.createElement("strong");
        title.textContent = group.label;
        const summary = document.createElement("small");
        summary.textContent = group.description;
        const count = document.createElement("span");
        count.className = "group-count";
        count.textContent = `${definitions.length}개 권한`;
        button.append(title, summary, count);
        button.addEventListener("click", () => {
            state.group = state.group === group.key ? "" : group.key;
            groupFilter.value = state.group;
            renderAll();
            document.getElementById("permission-matrix-title").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        groupOverview.appendChild(button);
    });
}

function filteredDefinitions() {
    return (state.payload?.definitions || []).filter(definition => {
        const pages = definition.pages || [];
        const group = groupForDefinition(definition);
        if (state.group && group.key !== state.group) return false;
        if (!state.query) return true;
        const haystack = [group.label, group.description, definition.key, definition.label, definition.description, ...pages, ...pages.map(pageName)]
            .join(" ")
            .toLocaleLowerCase("ko");
        return haystack.includes(state.query);
    }).sort((left, right) => {
        const groupDifference = permissionGroups.indexOf(groupForDefinition(left)) - permissionGroups.indexOf(groupForDefinition(right));
        return groupDifference || left.label.localeCompare(right.label, "ko");
    });
}

function renderPermissionMatrix() {
    const definitions = filteredDefinitions();
    const allDefinitions = state.payload.definitions || [];
    const roles = Object.entries(state.payload.roles || {});
    const lockedRoles = new Set(state.payload.lockedRoles || []);
    matrixHost.replaceChildren();
    resultCount.textContent = `${definitions.length} / ${allDefinitions.length}개 권한`;
    if (!definitions.length) {
        const empty = document.createElement("p");
        empty.className = "permission-status";
        empty.textContent = "검색 조건에 맞는 권한이 없습니다.";
        matrixHost.appendChild(empty);
        return;
    }

    const table = document.createElement("table");
    table.className = "permission-table";
    const thead = document.createElement("thead");
    const headingRow = document.createElement("tr");
    const featureHeading = document.createElement("th");
    featureHeading.scope = "col";
    featureHeading.textContent = "기능";
    headingRow.appendChild(featureHeading);
    roles.forEach(([role]) => {
        const heading = document.createElement("th");
        heading.scope = "col";
        const label = document.createElement("span");
        label.className = "permission-role-label";
        label.textContent = state.payload.roleLabels?.[role] || role;
        heading.appendChild(label);
        if (lockedRoles.has(role)) {
            const fixed = document.createElement("small");
            fixed.className = "permission-role-status";
            fixed.textContent = "고정";
            heading.appendChild(fixed);
        }
        headingRow.appendChild(heading);
    });
    thead.appendChild(headingRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let currentGroup = "";
    definitions.forEach(definition => {
        const group = groupForDefinition(definition);
        if (group.key !== currentGroup) {
            const groupRow = document.createElement("tr");
            groupRow.className = "permission-group-row";
            const groupCell = document.createElement("th");
            groupCell.colSpan = roles.length + 1;
            groupCell.scope = "colgroup";
            groupCell.textContent = `${group.label} · ${group.description}`;
            groupRow.appendChild(groupCell);
            tbody.appendChild(groupRow);
            currentGroup = group.key;
        }
        const row = document.createElement("tr");
        row.appendChild(createFeatureCell(definition));
        roles.forEach(([role, permissions]) => row.appendChild(createPermissionCell(role, definition, permissions, lockedRoles)));
        tbody.appendChild(row);
    });
    table.appendChild(tbody);

    const tfoot = document.createElement("tfoot");
    const actionRow = document.createElement("tr");
    const actionHeading = document.createElement("th");
    actionHeading.scope = "row";
    actionHeading.textContent = "등급별 전체 설정 저장";
    actionRow.appendChild(actionHeading);
    roles.forEach(([role]) => {
        const cell = document.createElement("td");
        cell.className = "permission-cell";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "permission-save";
        button.disabled = lockedRoles.has(role);
        button.textContent = lockedRoles.has(role) ? "고정" : "저장";
        button.addEventListener("click", () => saveRole(role, button));
        cell.appendChild(button);
        actionRow.appendChild(cell);
    });
    tfoot.appendChild(actionRow);
    table.appendChild(tfoot);
    matrixHost.appendChild(table);
}

function createFeatureCell(definition) {
    const feature = document.createElement("th");
    feature.scope = "row";
    feature.className = "permission-feature";
    const title = document.createElement("strong");
    title.textContent = definition.label;
    const code = document.createElement("code");
    code.className = "permission-code";
    code.textContent = definition.key;
    const description = document.createElement("p");
    description.textContent = definition.description;
    const badges = document.createElement("div");
    badges.className = "page-badges";
    (definition.pages || []).forEach(page => {
        const badge = document.createElement("a");
        badge.className = "page-badge";
        badge.href = page;
        badge.textContent = pageName(page);
        badge.title = `${pageName(page)} 화면 열기`;
        badges.appendChild(badge);
    });
    feature.append(title, code, description, badges);
    return feature;
}

function createPermissionCell(role, definition, permissions, lockedRoles) {
    const cell = document.createElement("td");
    cell.className = "permission-cell";
    const label = document.createElement("label");
    label.className = "permission-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(permissions?.[definition.key]);
    checkbox.disabled = lockedRoles.has(role);
    checkbox.setAttribute("aria-label", `${state.payload.roleLabels?.[role] || role}: ${definition.label}`);
    const visible = document.createElement("span");
    visible.textContent = checkbox.checked ? "허용" : "차단";
    checkbox.addEventListener("change", () => {
        state.payload.roles[role][definition.key] = checkbox.checked;
        visible.textContent = checkbox.checked ? "허용" : "차단";
    });
    label.append(checkbox, visible);
    cell.appendChild(label);
    return cell;
}

async function saveRole(role, button) {
    const label = state.payload.roleLabels?.[role] || role;
    if (!confirm(`${label} 등급의 전체 기능 권한을 저장하시겠습니까?`)) return;
    const permissionKeys = (state.payload.definitions || []).map(definition => definition.key);
    const permissions = Object.fromEntries(permissionKeys.map(key => [key, Boolean(state.payload.roles[role]?.[key])]));
    button.disabled = true;
    button.textContent = "저장 중";
    try {
        const response = await apiRequest("/api/deepsky/admin/role-permissions", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, permissions })
        }, state.user);
        const result = await response.json();
        state.payload.roles[role] = result.permissions;
        setStatus(`${label} 등급 권한을 저장했습니다.`);
        renderAll();
    } catch (error) {
        setStatus(error.message, true);
        button.disabled = false;
        button.textContent = "저장";
    }
}

function pageName(page) {
    return pageLabels[page] || page;
}

function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
}
