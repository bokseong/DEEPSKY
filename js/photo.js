let currentUser = null;
let currentUserRole = "guest";
let allPhotos = {};
let photoDraft = null;
let photoRenderGeneration = 0;
let photoFilterTimer = null;
const photoPreviewObjectUrls = new Set();

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
            if (currentUserRole === "student" || currentUserRole === "admin") {
                photoDraft = setupDraftAutosave({
                    key: `deepsky:draft:photo:${currentUser.uid}`,
                    fields: { title: "#pTitle" }
                });
            }
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
    return requestPhotoUserProfile(false).catch(async error => {
        if (error.status !== 401) throw error;
        return requestPhotoUserProfile(true);
    });
}

async function requestPhotoUserProfile(forceRefresh) {
    const user = auth.currentUser;
    if (!user) throw new Error("로그인이 필요합니다.");
    if (forceRefresh) await user.getIdToken(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        return await getServerUserProfile(user, { signal: controller.signal });
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("권한 정보 응답이 지연되고 있습니다. 다시 시도해 주세요.");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
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
        await renderPhotos(allPhotos, token);
    } catch (err) {
        console.error(err);
        document.getElementById("photoGrid").innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#ff7777;">${escapeHtml(err.message || "사진 로드 실패")}</p>`;
    }
}

async function renderPhotos(data, token = null) {
    const gallery = document.getElementById("photoGrid");
    const generation = ++photoRenderGeneration;
    clearPhotoPreviewObjectUrls();
    gallery.innerHTML = "";

    const keys = Object.keys(data || {}).reverse();
    if (keys.length === 0) {
        gallery.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#aaa;">등록된 사진이 없습니다.</p>`;
        return;
    }

    const previewTasks = keys.map(async key => {
        const p = data[key] || {};
        const urls = getPhotoUrls(p);
        const firstUrl = urls[0] || "";
        const div = document.createElement("div");
        const canDelete = currentUserRole === 'admin' || currentUser.uid === p.uid;
        div.className = "photo-card";
        div.id = `photo-${key}`;
        div.innerHTML = `
            <div class="photo-preview">
                <img alt="${escapeAttr(p.title || '활동 사진')}" hidden>
                <span class="photo-preview-status">이미지를 불러오는 중...</span>
                <button type="button" class="photo-preview-retry" hidden>다시 시도</button>
            </div>
            <div class="photo-info">
                <span class="owner-tag">${escapeHtml(p.author || '익명')}</span>
                <div class="photo-title">${escapeHtml(p.title || '제목 없음')}</div>
            </div>
            <div class="btn-group">
                <button type="button" class="btn-view" disabled>보기</button>
                ${canDelete ? `<button type="button" class="btn-del">삭제</button>` : ""}
            </div>
        `;
        const image = div.querySelector("img");
        const status = div.querySelector(".photo-preview-status");
        const retryButton = div.querySelector(".photo-preview-retry");
        const viewButton = div.querySelector(".btn-view");
        let previewUrl = "";

        const openPreview = () => {
            if (previewUrl) openPhotoModal(previewUrl);
        };
        const showPreviewError = message => {
            if (generation !== photoRenderGeneration) return;
            if (previewUrl && photoPreviewObjectUrls.has(previewUrl)) {
                URL.revokeObjectURL(previewUrl);
                photoPreviewObjectUrls.delete(previewUrl);
            }
            previewUrl = "";
            image.hidden = true;
            image.removeAttribute("src");
            status.hidden = false;
            status.textContent = message || "이미지를 불러오지 못했습니다.";
            retryButton.hidden = false;
            viewButton.disabled = true;
        };
        image.addEventListener("click", openPreview);
        image.addEventListener("load", () => {
            if (generation !== photoRenderGeneration) return;
            status.hidden = true;
            retryButton.hidden = true;
            viewButton.disabled = false;
        });
        image.addEventListener("error", () => showPreviewError("이미지 형식을 표시하지 못했습니다."));
        viewButton.addEventListener("click", openPreview);
        div.querySelector(".btn-del")?.addEventListener("click", () => deletePhoto(key));
        gallery.appendChild(div);

        const loadPreview = async () => {
            status.hidden = false;
            status.textContent = "이미지를 불러오는 중...";
            retryButton.hidden = true;
            viewButton.disabled = true;
            image.hidden = true;
            if (previewUrl && photoPreviewObjectUrls.has(previewUrl)) {
                URL.revokeObjectURL(previewUrl);
                photoPreviewObjectUrls.delete(previewUrl);
            }
            previewUrl = "";

            try {
                const result = await loadPhotoPreview(firstUrl, token);
                if (generation !== photoRenderGeneration) {
                    if (result.objectUrl) URL.revokeObjectURL(result.url);
                    return;
                }
                previewUrl = result.url;
                if (result.objectUrl) photoPreviewObjectUrls.add(result.url);
                image.src = result.url;
                image.hidden = false;
            } catch (error) {
                showPreviewError(error.message);
            }
        };

        retryButton.addEventListener("click", loadPreview);
        await loadPreview();
    });
    await Promise.allSettled(previewTasks);
}

async function uploadPhoto() {
    const title = document.getElementById("pTitle").value;
    const fileInput = document.getElementById("pFile");
    if (!title || fileInput.files.length === 0) return showToast("제목과 사진을 모두 선택해 주세요.", "error");
    if (fileInput.files.length > 10) return showToast("사진은 한 번에 최대 10개까지 선택할 수 있습니다.", "error");

    const formData = new FormData();
    formData.append("title", title);
    formData.append("uid", currentUser.uid);
    formData.append("author", currentUser.displayName || currentUser.email.split('@')[0]);
    formData.append("date", new Date().toISOString());
    Array.from(fileInput.files).forEach(file => formData.append("file", file));

    try {
        const button = document.querySelector(".btn-upload");
        button.disabled = true;
        await uploadAuthenticatedForm("/api/photos", {
            formData,
            onProgress: value => setUploadProgress(
                document.getElementById("photoUploadProgress"),
                value,
                document.getElementById("photoUploadLabel")
            )
        });
        showToast("사진을 등록했습니다.", "success");
        document.getElementById("pTitle").value = "";
        fileInput.value = "";
        photoDraft?.clear();
        await loadPhotos();
        button.disabled = false;
    } catch (err) {
        document.querySelector(".btn-upload").disabled = false;
        showToast(err.message || "업로드 실패", "error");
    }
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
    clearTimeout(photoFilterTimer);
    photoFilterTimer = setTimeout(applyPhotoFilter, 180);
}

function applyPhotoFilter() {
    const term = document.getElementById("photoSearch").value.toLowerCase().trim();
    if (!term) {
        void renderPhotos(allPhotos);
        return;
    }
    const filtered = {};
    Object.keys(allPhotos).forEach(key => {
        const p = allPhotos[key] || {};
        const text = `${p.title || ''} ${p.author || ''}`.toLowerCase();
        if (text.includes(term)) filtered[key] = p;
    });
    void renderPhotos(filtered);
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

async function loadPhotoPreview(path, token = null) {
    const value = String(path || "").trim();
    if (!value) throw new Error("이미지 경로가 없습니다.");

    if (/^https?:\/\//i.test(value) && !getKnownApiBase(value)) {
        return { url: value, objectUrl: false };
    }

    const requestUrl = normalizePhotoUrl(value);
    let activeToken = token || await currentUser.getIdToken();
    let response = await fetchPhotoPreview(requestUrl, activeToken);
    if (response.status === 401) {
        activeToken = await currentUser.getIdToken(true);
        response = await fetchPhotoPreview(requestUrl, activeToken);
    }
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.error || `이미지를 불러오지 못했습니다. (${response.status})`);
        error.status = response.status;
        throw error;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
        throw new Error("서버가 올바른 이미지 형식으로 응답하지 않았습니다.");
    }
    const blob = await response.blob();
    return { url: URL.createObjectURL(blob), objectUrl: true };
}

function fetchPhotoPreview(url, token) {
    return fetch(url, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "ngrok-skip-browser-warning": "69420"
        },
        cache: "no-store"
    });
}

function clearPhotoPreviewObjectUrls() {
    photoPreviewObjectUrls.forEach(url => URL.revokeObjectURL(url));
    photoPreviewObjectUrls.clear();
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

window.addEventListener("beforeunload", clearPhotoPreviewObjectUrls);

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
