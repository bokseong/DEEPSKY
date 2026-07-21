let currentUser = null;
let currentUserName = "익명";
let currentUserRole = "guest";
let allResources = {};

auth.onAuthStateChanged((user) => {
    currentUser = user;
    const status = document.getElementById("userStatus");
    if (user) {
        db.ref('users/' + user.uid).on('value', (snapshot) => {
            const userData = snapshot.val() || {};
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            currentUserRole = (user.email === ADMIN_EMAIL) ? 'admin' : (userData.role || 'member');
            if (status) status.innerText = `${currentUserName}님 (${currentUserRole})`;

            document.getElementById("lockMessage")?.classList.add("hidden");
            document.getElementById("mainContent")?.classList.remove("hidden");

            if(currentUserRole === 'admin' || currentUserRole === 'student') {
                loadResources();
                document.getElementById("adminUpload")?.classList.toggle("hidden", currentUserRole !== 'admin');
            } else {
                document.getElementById("resourceList").innerHTML = "<p style='text-align:center; grid-column:1/-1;'>자료실 열람 권한이 없습니다 (student 이상).</p>";
                document.getElementById("adminUpload")?.classList.add("hidden");
            }
        });
    } else {
        document.getElementById("mainContent")?.classList.add("hidden");
        document.getElementById("lockMessage")?.classList.remove("hidden");
        if (status) status.innerText = "로그인이 필요합니다";
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
        list.innerHTML = `<p style="text-align:center; color:#ff7777; grid-column:1/-1;">${err.message || "자료 로드 실패"}</p>`;
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
        div.innerHTML = `
            <div style="margin-bottom:10px;"><strong>${escapeHtml(item.title || '제목 없음')}</strong> (${escapeHtml(formatResourceDate(item.date))})</div>
            <div style="font-size:14px; color:#ddd;">${escapeHtml(item.content || '')}</div>
            <div class="resource-actions" style="margin-top:10px;"></div>
            <hr style="border-top:1px solid #1b2f80; margin-top:15px;">
        `;

        const actions = div.querySelector(".resource-actions");
        getResourceFiles(item).forEach((path, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = `[첨부파일 ${index + 1}]`;
            button.style.cssText = "color:#7fc7ff;background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;";
            button.addEventListener("click", () => openResourceFile(path, getResourceFileName(path, index)));
            if (actions.childNodes.length) actions.appendChild(document.createElement("br"));
            actions.appendChild(button);
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
if (currentUserRole !== 'admin') return alert("관리자만 업로드할 수 있습니다.");

     const title = document.getElementById("fileTitle").value.trim();
     const desc = document.getElementById("fileDesc").value.trim();
     const link = document.getElementById("fileLink").value.trim();
     const fileInput = document.getElementById("fileData"); // 수정된 ID 매칭

     if (!title) return alert("제목을 입력하세요.");

     const formData = new FormData();
     formData.append("title", title);
     formData.append("content", desc);
     formData.append("link", link);
     formData.append("author", currentUserName);
     formData.append("date", new Date().toLocaleDateString('ko-KR'));
     if (fileInput && fileInput.files.length > 0) formData.append("file", fileInput.files[0]);

     try {
         const token = await currentUser.getIdToken();
         const res = await fetch(`${API_BASE_URL}/api/resources`, {
             method: "POST",
             headers: {
                 "Authorization": `Bearer ${token}`,
                 "ngrok-skip-browser-warning": "69420"
             },
             body: formData
         });
         if (!res.ok) {
             const errorData = await res.json().catch(() => ({}));
             throw new Error(errorData.error || "업로드 실패");
         }
         alert("자료 등록 완료");
         document.getElementById("fileTitle").value = "";
         document.getElementById("fileDesc").value = "";
         document.getElementById("fileLink").value = "";
         if(fileInput) fileInput.value = "";
         loadResources();
    } catch (err) { alert(err.message || "업로드 에러"); }
}

async function deleteResource(id) {
    if(!confirm("삭제하시겠습니까?")) return;
    const token = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/api/resources/${id}`, {
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
    const files = [];
    if (Array.isArray(item.file_paths)) files.push(...item.file_paths);
    if (item.file_path) files.push(item.file_path);
    return files.filter(Boolean);
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

async function openResourceFile(path, filename) {
    try {
        if (!String(path || "").startsWith("/uploads/resources/")) {
            throw new Error("허용되지 않는 파일 경로입니다.");
        }
        const token = await currentUser.getIdToken();
        const url = `${API_BASE_URL}/api/download?path=${encodeURIComponent(path)}`;
        const res = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) throw new Error("파일을 불러오지 못했습니다.");
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err) {
        alert(err.message || "파일 열기 실패");
    }
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
