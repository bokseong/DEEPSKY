import { API_BASE_URL, apiFetch, auth, getCurrentPermissions, getCurrentProfile, normalizeSafeLinkUrl, optionalAuthHeaders } from "./common.js?v=20261007-stream-download";
import { appendCommentReportButton, setupPostTools } from "./post-tools.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
const SCHOOLS = {
        b: { collection:"club-board", roles:["admin", "teacher", "deputy", "student"], boardUrl:"talk.html", writeUrl:"school-write.html?school=b" },
        q: { collection:"questions", roles:["admin", "teacher", "deputy", "student", "member", "guest"], boardUrl:"question.html", writeUrl:"school-write.html?school=q" }
    };
    const params = new URLSearchParams(location.search);
    const school = SCHOOLS[params.get("school")];
    const postId = params.get("id");
    if (!school || !postId) {
        location.replace("talk.html");
        throw new Error("게시판 또는 글 번호가 올바르지 않습니다.");
    }
    const encodedPostId = encodeURIComponent(postId);
let currentUser = null;
    let currentRole = "guest";
    let currentUserName = "익명";
    let currentPermissions = {};
    let post = null;

    const readPermissionKey = school.collection === "questions" ? "questions.read" : "boards.read.school";
    const canManagePost = () => post && currentUser && (post.uid === currentUser.uid || currentPermissions["boards.manage.school"]);
    const headers = async () => optionalAuthHeaders(currentUser);
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
    const isFileAttachment = (link, href) => link?.type === "file" || href.includes("/api/deepsky/uploads/");
    const commentPermissionKey = school.collection === "questions" ? "questions.answer" : "boards.comment";

    document.getElementById("logout-btn").onclick = async () => { if (confirm("로그아웃 하시겠습니까?")) { await signOut(auth); location.href = "index.html"; } };
    document.getElementById("btn-list").onclick = () => location.href = school.boardUrl;
    document.getElementById("btn-edit").onclick = () => location.href = `${school.writeUrl}&id=${encodedPostId}`;
    document.getElementById("btn-delete").onclick = deletePost;
    document.getElementById("comment-submit").onclick = createComment;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            currentUser = null;
            currentRole = "guest";
            document.getElementById("user-name").style.display = "none";
            document.getElementById("logout-btn").style.display = "none";
            document.getElementById("login-link").style.display = "inline";
            try {
                currentPermissions = await getCurrentPermissions(null);
                if (!currentPermissions[readPermissionKey]) { location.replace("block.html"); return; }
                configureCommentAccess();
                await loadPost();
                await loadComments();
            } catch (err) {
                console.error(err);
                location.replace("block.html");
            }
            return;
        }
        try {
            const [data, permissionData] = await Promise.all([
                getCurrentProfile(user),
                getCurrentPermissions(user)
            ]);
            const role = data.role || "member";
            if (!permissionData[readPermissionKey]) { location.replace("block.html"); return; }
            currentUser = user;
            currentRole = role;
            currentUserName = data.name || "익명";
            currentPermissions = permissionData;
            document.getElementById("user-name").style.display = "inline";
            document.getElementById("user-name").textContent = `${currentUserName}님`;
            document.getElementById("logout-btn").style.display = "inline";
            document.getElementById("login-link").style.display = "none";
            configureCommentAccess();
            await loadPost();
            await loadComments();
        } catch (err) {
            console.error(err);
            location.replace("block.html");
        }
    });

    async function loadPost() {
        const res = await apiFetch(`/api/deepsky/board/${school.collection}/${encodedPostId}`, { headers: await headers() });
        if (!res.ok) { location.replace("block.html"); return; }
        post = await res.json();
        document.title = `DEEP SKY | ${post.title || "게시글"}`;
        document.getElementById("post-category").textContent = post.category || "기타";
        document.getElementById("post-author").textContent = post.author_name || "익명";
        document.getElementById("post-date").textContent = post.created_at ? new Date(post.created_at).toLocaleString() : "-";
        document.getElementById("post-title").textContent = post.title || "제목 없음";
        document.getElementById("post-content").textContent = post.content || "";
        const linksEl = document.getElementById("post-links");
        linksEl.innerHTML = "";
        (post.links || []).forEach((link, index) => {
            const href = normalizeSafeLinkUrl(link.url, { allowUpload: true, resolveUpload: true });
            if (!href) return;
            const isFile = isFileAttachment(link, href);
            if (isFile) {
                const name = link.name || `첨부파일 ${index + 1}`;
                const item = document.createElement("div");
                item.className = "attachment-item";
                const nameEl = document.createElement("span");
                nameEl.className = "attachment-name";
                nameEl.textContent = name;
                const actions = document.createElement("div");
                actions.className = "attachment-actions";
                const previewBtn = document.createElement("button");
                previewBtn.type = "button";
                previewBtn.className = "btn-small";
                previewBtn.textContent = "미리보기";
                previewBtn.onclick = () => openAttachment(href, name, "preview");
                const downloadBtn = document.createElement("button");
                downloadBtn.type = "button";
                downloadBtn.className = "btn-small";
                downloadBtn.textContent = "다운로드";
                downloadBtn.onclick = () => openAttachment(href, name, "download");
                actions.append(previewBtn, downloadBtn);
                item.append(nameEl, actions);
                linksEl.appendChild(item);
                return;
            }
            const a = document.createElement("a");
            a.href = href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = link.name || href;
            linksEl.appendChild(a);
        });
        document.getElementById("btn-edit").classList.toggle("hidden", !canManagePost());
        document.getElementById("btn-delete").classList.toggle("hidden", !canManagePost());
        await setupPostTools({
            user: currentUser,
            collection: school.collection,
            postId,
            bookmarkButton: document.getElementById("btn-bookmark"),
            reportButton: document.getElementById("btn-report")
        });
    }

    async function loadComments() {
        const res = await apiFetch(`/api/deepsky/board/${school.collection}/${encodedPostId}/comments`, { headers: await headers() });
        const list = document.getElementById("comment-list");
        if (!res.ok) { list.innerHTML = ""; return; }
        const comments = await res.json();
        if (comments.length === 0) {
            list.innerHTML = `<p style="color:#777; text-align:center;">첫 ${school.collection === "questions" ? "답변" : "댓글"}을 남겨보세요.</p>`;
            return;
        }
        list.replaceChildren();
        comments.forEach(comment => {
            const item = document.createElement("div");
            item.className = "comment";
            item.id = `comment-${comment.id}`;
            const meta = document.createElement("div");
            meta.className = "comment-meta";
            const author = document.createElement("strong");
            author.textContent = comment.author_name || "익명";
            const date = document.createElement("span");
            date.textContent = comment.created_at ? new Date(comment.created_at).toLocaleString() : "";
            meta.append(author, date);

            const canDelete = Boolean(currentUser) && (comment.uid === currentUser.uid || canManagePost());
            if (canDelete) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "btn-small btn-danger";
                deleteButton.textContent = "삭제";
                deleteButton.addEventListener("click", () => deleteComment(comment.id));
                meta.appendChild(deleteButton);
            }
            appendCommentReportButton(meta, {
                user: currentUser,
                collection: school.collection,
                commentId: comment.id
            });

            const content = document.createElement("div");
            content.textContent = comment.content || "";
            item.append(meta, content);
            list.appendChild(item);
        });
        const targetComment = location.hash ? document.getElementById(location.hash.slice(1)) : null;
        if (targetComment) requestAnimationFrame(() => targetComment.scrollIntoView({ block: "center" }));
    }

    function normalizeUploadPath(url) {
        const attachmentUrl = new URL(url);
        if (attachmentUrl.pathname === "/api/download") {
            const legacyPath = attachmentUrl.searchParams.get("path") || "";
            const match = legacyPath.match(/^\/uploads\/([^/]+)\/(.+)$/);
            if (!match) throw new Error("첨부파일 경로가 올바르지 않습니다.");
            return `/api/deepsky/uploads/${match[1]}/${match[2]}`;
        }
        if (!attachmentUrl.pathname.startsWith("/api/deepsky/uploads/")) {
            throw new Error("첨부파일 경로가 올바르지 않습니다.");
        }
        return attachmentUrl.pathname;
    }

    async function createAttachmentAccessUrl(url, filename, mode) {
        const response = await apiFetch("/api/deepsky/uploads/download-link", {
            method: "POST",
            headers: { ...(await headers()), "Content-Type": "application/json" },
            body: JSON.stringify({ url: normalizeUploadPath(url), filename, mode })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) {
            throw new Error(data.error || "파일 열기 주소를 만들 수 없습니다.");
        }
        return new URL(data.url, API_BASE_URL).href;
    }

    function getPreviewMimeType(filename, contentType) {
        const type = String(contentType || "").split(";")[0].trim().toLowerCase();
        const ext = String(filename || "").split(".").pop().toLowerCase();
        const byExt = {
            pdf: "application/pdf",
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
            txt: "text/plain",
            csv: "text/csv",
            md: "text/plain",
            json: "application/json",
            mp3: "audio/mpeg",
            wav: "audio/wav",
            mp4: "video/mp4",
            webm: "video/webm"
        };
        const allowedTypes = new Set(Object.values(byExt));
        if (allowedTypes.has(type)) return type;
        return byExt[ext] || "";
    }

    async function openAttachment(url, filename, mode = "preview") {
        let previewWindow = null;
        try {
            if (mode === "preview") {
                if (!getPreviewMimeType(filename, "")) {
                    throw new Error("이 파일 형식은 미리보기를 지원하지 않습니다. 다운로드 버튼을 사용해 주세요.");
                }
                previewWindow = window.open("about:blank", "_blank");
                if (!previewWindow) throw new Error("팝업이 차단되어 미리보기를 열 수 없습니다.");
                previewWindow.opener = null;
                previewWindow.document.title = "파일 미리보기";
                previewWindow.document.body.textContent = "파일을 불러오는 중입니다...";
            }
            const requestUrl = await createAttachmentAccessUrl(url, filename, mode);
            if (mode === "download") {
                const a = document.createElement("a");
                a.href = requestUrl;
                a.download = filename;
                a.rel = "noopener";
                document.body.appendChild(a);
                a.click();
                a.remove();
                return;
            }
            previewWindow.location.replace(requestUrl);
        } catch (err) {
            if (previewWindow && !previewWindow.closed) previewWindow.close();
            alert(err.message || "파일을 열 수 없습니다.");
        }
    }

    async function createComment() {
        const itemLabel = school.collection === "questions" ? "답변" : "댓글";
        if (!currentUser) { alert(`${itemLabel}을 작성하려면 로그인해 주세요.`); return; }
        if (!currentPermissions[commentPermissionKey]) { alert(`${itemLabel} 작성 권한이 없습니다.`); return; }
        const input = document.getElementById("comment-input");
        const content = input.value.trim();
        if (!content) return;
        const res = await apiFetch(`/api/deepsky/board/${school.collection}/${encodedPostId}/comments`, { method:"POST", headers:{ ...(await headers()), "Content-Type":"application/json" }, body:JSON.stringify({ content, authorName:currentUserName }) });
        if (res.ok) { input.value = ""; await loadComments(); }
        else alert(`${itemLabel} 등록 권한이 없거나 오류가 발생했습니다.`);
    }

    function configureCommentAccess() {
        const isQuestion = school.collection === "questions";
        const itemLabel = isQuestion ? "답변" : "댓글";
        const canRespond = Boolean(currentUser) && Boolean(currentPermissions[commentPermissionKey]);
        const form = document.getElementById("comment-form");
        const message = document.getElementById("comment-permission-message");
        document.getElementById("comment-heading").textContent = itemLabel;
        document.getElementById("comment-input").setAttribute("aria-label", itemLabel);
        document.getElementById("comment-input").placeholder = isQuestion ? "질문에 대한 답변을 작성하세요." : "의견을 남겨보세요.";
        document.getElementById("comment-submit").textContent = isQuestion ? "답변 등록" : "등록";
        form.hidden = !canRespond;
        message.hidden = canRespond;
        message.textContent = currentUser
            ? `${itemLabel} 작성 권한이 없습니다.`
            : `${itemLabel}을 작성하려면 로그인해 주세요.`;
    }

    async function deleteComment(commentId) {
        if (!confirm("댓글을 삭제하시겠습니까?")) return;
        const res = await apiFetch(`/api/deepsky/board/${school.collection}/${encodedPostId}/comments/${encodeURIComponent(String(commentId))}`, { method:"DELETE", headers: await headers() });
        if (res.ok) await loadComments();
        else alert("댓글 삭제 권한이 없거나 오류가 발생했습니다.");
    }

    async function deletePost() {
        if (!confirm("게시글을 삭제하시겠습니까?")) return;
        const res = await apiFetch(`/api/deepsky/board/${school.collection}/${encodedPostId}`, { method:"DELETE", headers: await headers() });
        if (res.ok) location.href = school.boardUrl;
        else alert("삭제 권한이 없거나 오류가 발생했습니다.");
    }
