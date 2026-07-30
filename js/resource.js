let currentUser = null;
let currentUserName = "익명";
let currentUserRole = "guest";
let allResources = {};
let resourceDraft = null;
let isResourceUploading = false;

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const status = document.getElementById("userStatus");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    if (user) {
        loginBtn?.classList.add("hidden");
        logoutBtn?.classList.remove("hidden");
        try {
            const userData = await getServerUserProfile(user);
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            currentUserRole = normalizeRole(userData.role);
            if (status) status.innerText = `${currentUserName}님 (${getRoleName(currentUserRole)})`;

            if(currentUserRole === 'admin' || currentUserRole === 'student') {
                setProtectedPageAccess({ allowed: true });
                loadResources();
                document.getElementById("adminUpload")?.classList.toggle("hidden", currentUserRole !== 'admin');
                if (currentUserRole === "admin" && !resourceDraft) {
                    resourceDraft = setupDraftAutosave({
                        key: `deepsky:draft:resource:${currentUser.uid}`,
                        fields: {
                            title: "#fileTitle",
                            description: "#fileDesc",
                            link: "#fileLink"
                        }
                    });
                }
            } else {
                document.getElementById("adminUpload")?.classList.add("hidden");
                setProtectedPageAccess({
                    allowed: false,
                    title: "접근 제한",
                    message: "자료실은 동아리 부원 이상만 접근할 수 있습니다.",
                    action: "role"
                });
            }
        } catch (error) {
            if (status) status.innerText = error.message;
            setProtectedPageAccess({
                allowed: false,
                title: "권한 확인 실패",
                message: "서버에서 권한 정보를 확인하지 못했습니다.",
                action: "retry"
            });
        }
    } else {
        currentUserRole = "guest";
        if (status) status.innerText = "로그인이 필요합니다";
        loginBtn?.classList.remove("hidden");
        logoutBtn?.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "자료실을 이용하려면 로그인해 주세요.",
            action: "login"
        });
    }
});

async function loadResources() {
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/resources`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || "자료 목록을 불러오지 못했습니다.");
        }
        const data = await res.json();
        allResources = data || {};
        renderResources(allResources);
    } catch (err) {
        console.error("자료 로드 실패:", err);
        const list = document.getElementById("resourceList");
        list.innerHTML = `<p style="text-align:center; color:#ff7777; grid-column:1/-1;">${escapeHtml(err.message || "자료 로드 실패")}</p>`;
    }
}

function renderResources(data) {
    const list = document.getElementById("resourceList");
    list.innerHTML = "";

    const keys = Object.keys(data || {}).sort((a, b) => getResourceTime(data[b]) - getResourceTime(data[a]));
    if (keys.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#aaa; grid-column:1/-1;">등록된 자료가 없습니다.</p>`;
        return;
    }

    keys.forEach(key => {
        const item = data[key] || {};
        const div = document.createElement("div");
        div.className = "resource-item";
        div.id = `resource-${key}`;
        div.innerHTML = `
            <div style="margin-bottom:10px;"><strong>${escapeHtml(item.title || '제목 없음')}</strong> (${escapeHtml(formatResourceDate(item.date))})</div>
            <div style="font-size:14px; color:#ddd;">${escapeHtml(item.content || '')}</div>
            <div class="resource-actions" style="margin-top:10px;"></div>
            <hr style="border-top:1px solid #1b2f80; margin-top:15px;">
        `;

        const actions = div.querySelector(".resource-actions");
        getResourceFiles(item).forEach((path, index) => {
            const filename = getResourceFileName(path, index);
            const fileRow = document.createElement("div");
            fileRow.className = "resource-file-row";

            const fileName = document.createElement("span");
            fileName.className = "resource-file-name";
            fileName.textContent = `첨부파일 ${index + 1}: ${filename}`;

            const fileActions = document.createElement("div");
            fileActions.className = "resource-file-actions";

            const downloadButton = document.createElement("button");
            downloadButton.type = "button";
            downloadButton.className = "btn-file btn-download";
            downloadButton.textContent = "다운로드";
            downloadButton.addEventListener("click", () => openResourceFile(path, filename, "download"));

            if (isPreviewableResource(filename)) {
                const previewButton = document.createElement("button");
                previewButton.type = "button";
                previewButton.className = "btn-file btn-preview";
                previewButton.textContent = "미리보기";
                previewButton.addEventListener("click", () => openResourceFile(path, filename, "preview"));
                fileActions.appendChild(previewButton);
            } else {
                const previewUnavailable = document.createElement("span");
                previewUnavailable.className = "resource-preview-unavailable";
                previewUnavailable.textContent = "미리보기 미지원";
                fileActions.appendChild(previewUnavailable);
            }
            fileActions.appendChild(downloadButton);
            fileRow.append(fileName, fileActions);
            actions.appendChild(fileRow);
        });

        const externalUrl = normalizeLink(item.link);
        if (externalUrl) {
            if (actions.childNodes.length) actions.appendChild(document.createElement("br"));
            const link = document.createElement("a");
            link.href = externalUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "[외부 링크]";
            link.style.color = "#7fc7ff";
            actions.appendChild(link);
        }

        if (currentUserRole === 'admin') {
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "[삭제]";
            deleteButton.style.cssText = "margin-left:10px;color:red;background:none;border:none;cursor:pointer;";
            deleteButton.addEventListener("click", () => deleteResource(key));
            actions.appendChild(deleteButton);
        }

        list.appendChild(div);
    });
}

// 파일과 데이터를 자체 서버로 업로드 (multipart/form-data)
async function uploadResource() {
    if (currentUserRole !== 'admin') return showToast("관리자만 업로드할 수 있습니다.", "error");
    if (isResourceUploading) return;

    const title = document.getElementById("fileTitle").value.trim();
    const desc = document.getElementById("fileDesc").value.trim();
    const link = document.getElementById("fileLink").value.trim();
    const fileInput = document.getElementById("fileData");

    if (!title) return showToast("제목을 입력하세요.", "error");
    if (fileInput?.files.length > 10) return showToast("파일은 한 번에 최대 10개까지 선택할 수 있습니다.", "error");

    const formData = new FormData();
    formData.append("title", title);
    formData.append("content", desc);
    formData.append("link", link);
    formData.append("author", currentUserName);
    formData.append("date", new Date().toLocaleDateString('ko-KR'));
    if (fileInput) Array.from(fileInput.files).forEach(file => formData.append("file", file));

    isResourceUploading = true;
    setResourceUploadBusy(true);
    try {
        await uploadAuthenticatedForm("/api/resources", {
            formData,
            onProgress: value => setUploadProgress(
                document.getElementById("resourceUploadProgress"),
                value,
                document.getElementById("resourceUploadLabel")
            )
        });
        showToast("자료를 등록했습니다.", "success");
        document.getElementById("fileTitle").value = "";
        document.getElementById("fileDesc").value = "";
        document.getElementById("fileLink").value = "";
        if (fileInput) fileInput.value = "";
        resourceDraft?.clear();
        await loadResources();
    } catch (err) {
        showToast(err.message || "업로드 에러", "error");
    } finally {
        isResourceUploading = false;
        setResourceUploadBusy(false);
    }
}

function setResourceUploadBusy(isBusy) {
    const uploadPanel = document.getElementById("adminUpload");
    if (!uploadPanel) return;

    uploadPanel.classList.toggle("is-uploading", isBusy);
    uploadPanel.setAttribute("aria-busy", String(isBusy));
    uploadPanel.querySelectorAll("input, textarea, select, button").forEach(control => {
        control.disabled = isBusy;
    });

    const submitButton = uploadPanel.querySelector(".btn-main");
    if (submitButton) {
        submitButton.textContent = isBusy ? "업로드 중..." : "자료 게시하기";
    }
}

async function deleteResource(id) {
    if(!confirm("삭제하시겠습니까?")) return;
    const token = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/api/resources/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${token}`,
            "ngrok-skip-browser-warning": "69420"
        }
    });
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "삭제 실패");
        return;
    }
    loadResources();
}

function filterResources() {
    const term = document.getElementById("searchInput").value.toLowerCase().trim();
    if (!term) {
        renderResources(allResources);
        return;
    }
    const filtered = {};
    Object.keys(allResources).forEach(key => {
        const item = allResources[key] || {};
        const text = `${item.title || ''} ${item.content || ''} ${item.author || ''}`.toLowerCase();
        if (text.includes(term)) filtered[key] = item;
    });
    renderResources(filtered);
}

function getResourceFiles(item) {
    const files = Array.isArray(item.file_paths) && item.file_paths.length > 0
        ? item.file_paths
        : [item.file_path];
    return [...new Set(files.map(path => String(path || "").trim()).filter(Boolean))];
}

function getResourceFileName(path, index) {
    const raw = String(path || "").split("/").pop() || `file-${index + 1}`;
    return raw.replace(/^res_[^_]+_/, "");
}

function normalizeLink(link) {
    const value = String(link || "").trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function openResourceFile(path, filename, mode) {
    const previewWindow = mode === "preview" ? window.open("about:blank", "_blank") : null;
    try {
        if (!String(path || "").startsWith("/uploads/resources/")) {
            throw new Error("허용되지 않는 파일 경로입니다.");
        }
        if (mode !== "preview" && mode !== "download") {
            throw new Error("지원하지 않는 파일 열기 방식입니다.");
        }
        if (mode === "preview" && !previewWindow) {
            throw new Error("팝업이 차단되어 미리보기를 열 수 없습니다.");
        }
        const linkData = await requestAuthenticatedApi("/api/download-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, filename, mode })
        });
        if (!linkData.url) throw new Error("파일 링크를 발급받지 못했습니다.");
        const directUrl = /^https?:\/\//i.test(linkData.url)
            ? linkData.url
            : `${API_BASE_URL}${linkData.url}`;

        if (mode === "preview") {
            previewWindow.opener = null;
            previewWindow.location.replace(directUrl);
        } else {
            const downloadFrame = document.createElement("iframe");
            downloadFrame.hidden = true;
            downloadFrame.title = "파일 다운로드";
            downloadFrame.src = directUrl;
            document.body.appendChild(downloadFrame);
            setTimeout(() => downloadFrame.remove(), 300000);
        }
    } catch (err) {
        if (previewWindow) previewWindow.close();
        alert(err.message || (mode === "preview" ? "미리보기 실패" : "다운로드 실패"));
    }
}

function isPreviewableResource(filename) {
    const extension = String(filename || "").split(".").pop()?.toLowerCase();
    return ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "csv"].includes(extension);
}

function getResourceTime(item) {
    const value = item?.createdAt || item?.date || item?.timestamp;
    if (!value) return 0;
    if (typeof value === "number") return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatResourceDate(value) {
    if (!value) return "";
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleDateString("ko-KR");
    return value;
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
