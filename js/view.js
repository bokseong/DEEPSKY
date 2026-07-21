const params = new URLSearchParams(location.search);
const postId = params.get("id");

let currentUser = null;
let currentUserName = "익명";
let currentUserRole = "guest";
let postAuthorUid = "";

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const status = document.getElementById("userStatus");
    if (user) {
        db.ref('users/' + user.uid).on('value', (snapshot) => {
            const userData = snapshot.val() || {};
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            currentUserRole = (user.email === ADMIN_EMAIL) ? 'admin' : (userData.role || 'member');
            if (status) status.innerText = `${currentUserName}님 (${currentUserRole==='admin'?'관리자':(currentUserRole==='student'?'부원':'일반')})`;
            loadPostDetail();
        });
        document.getElementById("loginBtn")?.classList.add("hidden");
        document.getElementById("logoutBtn")?.classList.remove("hidden");
    } else {
        currentUserRole = "guest";
        if (status) status.innerText = "로그인 해주세요";
        document.getElementById("loginBtn")?.classList.remove("hidden");
        document.getElementById("logoutBtn")?.classList.add("hidden");
        loadPostDetail();
    }
});

// 상세조회 바인딩 및 다운로드 링크 세팅
async function loadPostDetail() {
    if (!postId) return alert("비정상적인 접근 경로입니다.");
    try {
        const post = await fetchPostDetail(postId);

        postAuthorUid = post.uid;

        document.getElementById("postArea")?.classList.remove("hidden");
        document.getElementById("viewTitle").innerText = post.title || "제목 없음";
        document.getElementById("viewAuthor").innerText = `작성자: ${post.author || '익명'}`;
        document.getElementById("viewDate").innerText = `날짜: ${formatPostDate(post.date || post.createdAt || post.timestamp)}`;
        document.getElementById("viewContent").innerText = post.content || "";

        const linkArea = document.getElementById("linkArea");
        const viewFileLink = document.getElementById("viewFileLink");
        if (isSafeExternalUrl(post.link)) {
            viewFileLink.href = post.link;
            viewFileLink.innerText = post.linkName || "링크 열기";
            linkArea.classList.remove("hidden");
        } else {
            linkArea.classList.add("hidden");
        }

        const fileContainer = document.getElementById("vFileContainer");
        const fileName = document.getElementById("vFileName");
        const previewBtn = document.getElementById("vFilePreviewBtn");
        const downloadBtn = document.getElementById("vFileDownloadBtn");
        const attachment = getAttachmentInfo(post);
        if (attachment && fileContainer && fileName && previewBtn && downloadBtn) {
            fileName.innerText = `첨부 파일: ${attachment.name}`;
            previewBtn.href = attachment.previewUrl;
            downloadBtn.href = attachment.downloadUrl;
            downloadBtn.setAttribute("download", attachment.name);
            fileContainer.classList.remove("hidden");
        } else if (fileContainer) {
            fileContainer.classList.add("hidden");
        }

        const editBtn = document.getElementById("editBtn");
        const deleteBtn = document.getElementById("deleteBtn");
        if (currentUser && (currentUser.uid === post.uid || currentUserRole === 'admin')) {
            editBtn?.classList.remove("hidden");
            deleteBtn?.classList.remove("hidden");
            if (editBtn) editBtn.onclick = () => location.href = `write.html?id=${postId}`;
        } else {
            editBtn?.classList.add("hidden");
            deleteBtn?.classList.add("hidden");
        }

        document.getElementById("commentFormArea")?.classList.toggle("hidden", !currentUser);
        document.getElementById("commentLoginNotice")?.classList.toggle("hidden", Boolean(currentUser));
        renderComments(post.comments || {});
    } catch (err) {
        console.error("게시글 상세 조회 실패:", err);
        alert(err.message || "데이터 수신 오류가 발생했습니다.");
    }
}

async function fetchPostDetail(id) {
    const headers = { "ngrok-skip-browser-warning": "69420" };
    if (currentUser) headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;

    try {
        const detailRes = await fetch(`${API_BASE_URL}/api/freeboard/${id}`, {
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
    if (!listRes.ok) throw new Error("게시글 목록을 불러오지 못했습니다.");

    const data = await listRes.json();
    const post = Array.isArray(data)
        ? data.find(item => String(item.id || item.key || item._id) === String(id))
        : data[id];
    if (!post) throw new Error("게시글을 찾을 수 없습니다.");
    return normalizePost(post, id);
}

// 댓글 컴포넌트 렌더링
function renderComments(comments) {
    const box = document.getElementById("commentList");
    if (!box) return;
    box.innerHTML = "";
    if (!comments || Object.keys(comments).length === 0) {
        box.innerHTML = `<p style="color:#888; font-size:14px; text-align:center; padding:15px 0;">첫 댓글을 남겨보세요!</p>`;
        return;
    }

    Object.keys(comments).forEach(cKey => {
        const c = comments[cKey];
        const item = document.createElement("div");
        item.className = "comment-item";
        item.style.borderBottom = "1px solid #1b2f80";
        item.style.padding = "10px 0";

        // 파이어베이스 보안 가이드라인 일치화 (댓글작성자, 원글작성자, 어드민 삭제 승인)
        const isCommentAuthor = currentUser && currentUser.uid === c.uid;
        const isPostAuthor = currentUser && currentUser.uid === postAuthorUid;
        const isAdmin = currentUserRole === 'admin';
        const canDelete = isCommentAuthor || isPostAuthor || isAdmin;

        item.innerHTML = `
            <div style="font-size:12px; color:#7fc7ff;">${escapeHtml(c.author || '익명')} (${escapeHtml(formatPostDate(c.date))})</div>
            <div style="margin:5px 0; font-size:14px;">${escapeHtml(c.text || '')}</div>
            ${canDelete ? `<button onclick="deleteComment('${cKey}')" style="background:none; border:none; color:#ff4d4d; font-size:11px; cursor:pointer; padding:0;">[삭제]</button>` : ""}
        `;
        box.appendChild(item);
    });
}

// 자체 서버 댓글 등록 연동
async function addComment() {
    if (!currentUser) return alert("로그인 후 작성 가능합니다.");
    const input = document.getElementById("commentInput");
    const text = input.value.trim();
    if (!text) return alert("내용을 채워주세요.");

    try {
        const commentData = {
            text: text,
            author: currentUserName,
            uid: currentUser.uid,
            date: new Date().toISOString()
        };
        const token = await currentUser.getIdToken();

        const res = await fetch(`${API_BASE_URL}/api/freeboard/${postId}/comment`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            },
            body: JSON.stringify(commentData)
        });

        if (!res.ok) throw new Error();
        input.value = "";
        loadPostDetail();
    } catch (err) {
        alert("댓글 작성 실패");
    }
}

function getAttachmentInfo(post) {
    const rawUrl = post.fileUrl || post.file_url || post.downloadUrl || post.download_url || post.url;
    const rawPath = post.file_path || post.filePath || post.path;
    const filename = post.file_name || post.fileName || post.originalName || post.originalname || post.name || "첨부 파일";
    const source = rawUrl || rawPath;

    if (!source) return null;
    return {
        name: filename,
        previewUrl: normalizeFileUrl(source, "preview"),
        downloadUrl: normalizeFileUrl(source, "download")
    };
}

function normalizeFileUrl(value, mode = "preview") {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";
    if (/^https?:\/\//i.test(rawValue)) {
        if (!rawValue.includes("/api/download")) return rawValue;
        return withQueryParam(rawValue, "mode", mode);
    }
    if (rawValue.startsWith("/api/download")) {
        return withQueryParam(`${API_BASE_URL}${rawValue}`, "mode", mode);
    }
    if (rawValue.startsWith("/uploads/")) {
        if (mode === "preview") return `${API_BASE_URL}${rawValue}`;
        return `${API_BASE_URL}/api/download?path=${encodeURIComponent(rawValue)}&mode=download`;
    }
    if (rawValue.startsWith("/")) return `${API_BASE_URL}${rawValue}`;

    const downloadPath = rawValue.includes("/uploads/") ? rawValue : `/uploads/${rawValue.replace(/^uploads\//, "")}`;
    return `${API_BASE_URL}/api/download?path=${encodeURIComponent(downloadPath)}&mode=${encodeURIComponent(mode)}`;
}

function withQueryParam(url, key, value) {
    const parsed = new URL(url, location.href);
    parsed.searchParams.set(key, value);
    return parsed.toString();
}

// 자체 서버 본문 제거 연동
async function deletePost() {
    if (!confirm("정말로 이 글을 삭제하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/freeboard/${postId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) throw new Error();
        alert("삭제 완료되었습니다.");
        location.href = "board.html";
    } catch (err) {
        alert("삭제 권한이 없거나 처리에 실패했습니다.");
    }
}

// 자체 서버 댓글 삭제 연동
async function deleteComment(cKey) {
    if (!confirm("댓글을 제거하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/freeboard/${postId}/comment/${cKey}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) throw new Error();
        loadPostDetail();
    } catch (err) {
        alert("삭제 처리에 실패했습니다.");
    }
}

function formatPostDate(value) {
    if (!value) return "";
    if (typeof value === "number") return new Date(value).toLocaleString("ko-KR");
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleString("ko-KR");
    return value;
}

function isSafeExternalUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
