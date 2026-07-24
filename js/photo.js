let currentUser = null;
let currentUserRole = "guest";
let allPhotos = {};

auth.onAuthStateChanged(async (user) => {
    const status = document.getElementById("userStatus");
    if (user) {
        currentUser = user;
        document.getElementById("loginBtn")?.classList.add("hidden");
        document.getElementById("logoutBtn")?.classList.remove("hidden");

        try {
            const userData = await getUserProfile();
            currentUserRole = normalizeRole(userData.role);
            if (status) status.innerText = `${userData.name || user.displayName || '사용자'}님 (${getRoleName(currentUserRole)})`;
            setProtectedPageAccess({ allowed: true });
            updateUploadAccess();
            await loadPhotos();
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
        currentUser = null;
        currentUserRole = "guest";
        if (status) status.innerText = "로그인이 필요합니다";
        document.getElementById("loginBtn")?.classList.remove("hidden");
        document.getElementById("logoutBtn")?.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "활동 사진을 보려면 로그인해 주세요.",
            action: "login"
        });
    }
});

function getUserProfile() {
    const roleRequest = getServerUserProfile(auth.currentUser);
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("권한 정보 응답 지연")), 3000);
    });
    return Promise.race([roleRequest, timeout]);
}

function updateUploadAccess() {
    const canUpload = currentUserRole === 'student' || currentUserRole === 'admin';
    document.getElementById("uploadSection")?.classList.toggle("hidden", !canUpload);
}

async function loadPhotos() {
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/photos`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || "사진 목록을 불러오지 못했습니다.");
        }
        const data = await res.json();
        allPhotos = data || {};
        renderPhotos(allPhotos);
    } catch (err) {
        console.error(err);
        document.getElementById("photoGrid").innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#ff7777;">${escapeHtml(err.message || "사진 로드 실패")}</p>`;
    }
}

function renderPhotos(data) {
    const gallery = document.getElementById("photoGrid");
    gallery.innerHTML = "";

    const keys = Object.keys(data || {}).reverse();
    if (keys.length === 0) {
        gallery.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#aaa;">등록된 사진이 없습니다.</p>`;
        return;
    }

    keys.forEach(key => {
        const p = data[key] || {};
        const urls = getPhotoUrls(p);
        const firstUrl = urls[0] || "";
        const imageUrl = normalizePhotoUrl(firstUrl);
        const div = document.createElement("div");
        const canDelete = currentUserRole === 'admin' || currentUser.uid === p.uid;
        div.className = "photo-card";
        div.innerHTML = `
            <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(p.title || '활동 사진')}" loading="lazy">
            <div class="photo-info">
                <span class="owner-tag">${escapeHtml(p.author || '익명')}</span>
                <div class="photo-title">${escapeHtml(p.title || '제목 없음')}</div>
            </div>
            <div class="btn-group">
                <button type="button" class="btn-view">보기</button>
                ${canDelete ? `<button type="button" class="btn-del">삭제</button>` : ""}
            </div>
        `;
        div.querySelector("img").addEventListener("click", () => openPhotoModal(imageUrl));
        div.querySelector(".btn-view").addEventListener("click", () => openPhotoModal(imageUrl));
        div.querySelector(".btn-del")?.addEventListener("click", () => deletePhoto(key));
        gallery.appendChild(div);
    });
}

async function uploadPhoto() {
    const title = document.getElementById("pTitle").value;
    const fileInput = document.getElementById("pFile");
    if (!title || fileInput.files.length === 0) return alert("제목과 사진을 모두 선택해주세요.");

    const formData = new FormData();
    formData.append("title", title);
    formData.append("uid", currentUser.uid);
    formData.append("author", currentUser.displayName || currentUser.email.split('@')[0]);
    formData.append("file", fileInput.files[0]);

    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/photos`, {
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
        alert("사진이 등록되었습니다!");
        document.getElementById("pTitle").value = "";
        fileInput.value = "";
        loadPhotos();
    } catch (err) { alert(err.message || "업로드 실패"); }
}

async function deletePhoto(id) {
    if(!confirm("사진을 삭제하시겠습니까?")) return;
    const token = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/api/photos/${encodeURIComponent(String(id))}`, {
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
    loadPhotos();
}

function filterPhotos() {
    const term = document.getElementById("photoSearch").value.toLowerCase().trim();
    if (!term) {
        renderPhotos(allPhotos);
        return;
    }
    const filtered = {};
    Object.keys(allPhotos).forEach(key => {
        const p = allPhotos[key] || {};
        const text = `${p.title || ''} ${p.author || ''}`.toLowerCase();
        if (text.includes(term)) filtered[key] = p;
    });
    renderPhotos(filtered);
}

function getPhotoUrls(photo) {
    if (Array.isArray(photo.urls)) return photo.urls.filter(Boolean);
    if (photo.url) return [photo.url];
    if (photo.file_path) return [photo.file_path];
    return [];
}

function normalizePhotoUrl(path) {
    const value = String(path || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/uploads/")) return `${API_BASE_URL}${value}`;
    if (value.startsWith("/")) return `${API_BASE_URL}${value}`;
    return `${API_BASE_URL}/uploads/photos/${value}`;
}

function openPhotoModal(url) {
    if (!url) return;
    document.getElementById("modalPhoto").src = url;
    document.getElementById("photoModal").classList.remove("hidden");
}

function closePhotoModal() {
    document.getElementById("photoModal").classList.add("hidden");
    document.getElementById("modalPhoto").src = "";
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
