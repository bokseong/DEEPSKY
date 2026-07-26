let currentUser = null;
let currentUserName = "익명";
let currentUserRole = "guest";
let originalPost = null;
let postDraft = null;

const urlParams = new URLSearchParams(window.location.search);
const editPostId = urlParams.get("id");
const isEditMode = Boolean(editPostId);

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const status = document.getElementById("userStatus");
    if (user) {
        try {
            const userData = await getServerUserProfile(user);
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            currentUserRole = normalizeRole(userData.role);
            if (status) status.innerText = `${currentUserName}님 (${currentUserRole==='admin'?'관리자':(currentUserRole==='student'?'부원':'일반')})`;
            if (currentUserRole === "admin" || currentUserRole === "student") {
                setProtectedPageAccess({ allowed: true });
                if (isEditMode && !originalPost) {
                    initEditPage();
                } else if (!isEditMode && !postDraft) {
                    initializePostDraft();
                }
            } else {
                setProtectedPageAccess({
                    allowed: false,
                    title: "접근 제한",
                    message: "게시글 작성은 동아리 부원 이상만 이용할 수 있습니다.",
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
        document.getElementById("loginBtn")?.classList.add("hidden");
        document.getElementById("logoutBtn")?.classList.remove("hidden");
    } else {
        currentUserRole = "guest";
        if (status) status.innerText = "로그인이 필요합니다";
        document.getElementById("loginBtn")?.classList.remove("hidden");
        document.getElementById("logoutBtn")?.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "게시글을 작성하려면 로그인해 주세요.",
            action: "login"
        });
    }
});

async function initEditPage() {
    document.getElementById("pageTitle").innerText = "게시글 수정";
    document.getElementById("submitBtn").innerText = "게시글 수정 완료";

    try {
        const post = await fetchPostForEdit(editPostId);
        if (post.uid !== currentUser.uid && currentUserRole !== "admin") {
            showToast("수정 권한이 없습니다.", "error");
            location.href = "board.html";
            return;
        }

        originalPost = post;
        document.getElementById("postTitle").value = post.title || "";
        document.getElementById("postContent").value = post.content || "";
        document.querySelector(".postFileUrl").value = post.link || "";
        document.querySelector(".postFileName").value = post.linkName || "첨부 링크";

        if (post.fileUrl || post.file_path) {
            const oldFileInfo = document.getElementById("oldFileInfo");
            oldFileInfo.classList.remove("hidden");
            oldFileInfo.innerText = `현재 등록된 파일: ${post.file_name || post.fileName || "파일 존재"}`;
        }
        initializePostDraft(true);
    } catch (err) {
        showToast(err.message || "게시글 정보를 불러오는 중 오류가 발생했습니다.", "error");
        location.href = "board.html";
    }
}

function initializePostDraft(overwrite = false) {
    if (!currentUser || postDraft) return;
    const suffix = isEditMode ? `edit:${editPostId}` : "new";
    postDraft = setupDraftAutosave({
        key: `deepsky:draft:write:${currentUser.uid}:${suffix}`,
        overwrite,
        fields: {
            title: "#postTitle",
            content: "#postContent",
            link: ".postFileUrl",
            linkName: ".postFileName"
        }
    });
}

async function fetchPostForEdit(id) {
    const headers = { "ngrok-skip-browser-warning": "69420" };
    if (currentUser) headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;

    try {
        const detailRes = await fetch(`${API_BASE_URL}/api/freeboard/${encodeURIComponent(String(id))}`, {
            method: "GET",
            headers
        });
        if (detailRes.ok) {
            const detail = await detailRes.json();
            return normalizePost(detail, id);
        }
    } catch (err) {
        console.warn("상세 API 조회 실패, 목록 API로 재시도:", err);
    }

    const listRes = await fetch(`${API_BASE_URL}/api/freeboard`, {
        method: "GET",
        headers
    });
    if (!listRes.ok) throw new Error("게시글을 불러오지 못했습니다.");

    const data = await listRes.json();
    const post = Array.isArray(data)
        ? data.find(item => String(item.id || item.key || item._id) === String(id))
        : data[id];
    if (!post) throw new Error("게시글을 찾을 수 없습니다.");
    return normalizePost(post, id);
}

async function submitPost() {
    const title = document.getElementById("postTitle").value.trim();
    const content = document.getElementById("postContent").value.trim();
    const fileInput = document.getElementById("pFile");
    const linkInput = document.querySelector(".postFileUrl");
    const linkNameInput = document.querySelector(".postFileName");
    let link = linkInput ? linkInput.value.trim() : "";
    const linkName = linkNameInput ? linkNameInput.value.trim() : "";

    if (!title || !content) return showToast("제목과 내용을 입력해 주세요.", "error");
    if (!currentUser) return showToast("인증 오류가 발생했습니다.", "error");
    if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;

    try {
        const formData = new FormData();
        formData.append("title", title);
        formData.append("content", content);
        formData.append("link", link);
        formData.append("linkName", linkName);
        formData.append("author", currentUserName);
        formData.append("email", currentUser.email);
        formData.append("uid", currentUser.uid);
        const now = new Date();
        if (!isEditMode) {
            formData.append("date", now.toISOString());
            formData.append("createdAt", now.toISOString());
            formData.append("updatedAt", now.toISOString());
            formData.append("timestamp", now.getTime());
        } else if (originalPost?.date) {
            formData.append("date", originalPost.date);
            formData.append("createdAt", originalPost.createdAt || originalPost.created_at || originalPost.date);
            formData.append("updatedAt", now.toISOString());
            formData.append("timestamp", originalPost.timestamp || getPostTime(originalPost));
        } else {
            formData.append("updatedAt", now.toISOString());
        }

        if (fileInput && fileInput.files.length > 0) {
            formData.append("file", fileInput.files[0]);
        }

        const path = isEditMode ? `/api/freeboard/${encodeURIComponent(editPostId)}` : "/api/freeboard";
        const method = isEditMode ? "PUT" : "POST";
        const submitButton = document.getElementById("submitBtn");
        submitButton.disabled = true;
        await uploadAuthenticatedForm(path, {
            method,
            formData,
            onProgress: value => setUploadProgress(
                document.getElementById("postUploadProgress"),
                value,
                document.getElementById("postUploadLabel")
            )
        });
        postDraft?.clear();
        showToast(isEditMode ? "게시글을 수정했습니다." : "게시글을 등록했습니다.", "success", 1200);
        await new Promise(resolve => setTimeout(resolve, 350));
        location.href = "board.html";
    } catch (err) {
        console.error(err);
        showToast(err.message || "저장 중 통신 오류가 발생했습니다.", "error");
        document.getElementById("submitBtn").disabled = false;
    }
}

function getPostTime(post) {
    const rawValue = post?.createdAt || post?.created_at || post?.timestamp || post?.date;
    if (!rawValue) return 0;
    if (typeof rawValue === "number") return rawValue;
    const parsed = Date.parse(rawValue);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function addLinkField() {
    showToast("공유 링크는 1개만 첨부할 수 있습니다.", "info");
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.href="board.html"); }
