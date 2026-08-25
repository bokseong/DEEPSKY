import { API_BASE_URL, apiFetch, auth, authHeaders, getCurrentProfile } from "./common.js";
import { appendCommentReportButton, setupPostTools } from "./post-tools.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
const COLLECTION = "resources";
const postId = new URLSearchParams(window.location.search).get('id');
const encodedPostId = postId ? encodeURIComponent(postId) : '';
let currentUser = null;
    let currentRole = 'guest';
    let currentUserName = '익명';
    let postData = null;

    if (!postId) location.replace('block.html');
    document.getElementById('logoutBtn').addEventListener('click', async () => { if (confirm('로그아웃 하시겠습니까?')) { await signOut(auth); location.reload(); } });

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (!user) {
            setAuthUi(false);
            currentRole = 'guest';
            await loadPost();
            await loadComments();
            return;
        }
        try {
            const userData = await getCurrentProfile(user);
            currentRole = userData.role || 'member';
            currentUserName = userData.name || user.displayName || '사용자';
            setAuthUi(true);
            await loadPost();
            await loadComments();
        } catch (err) {
            console.error(err);
            currentRole = 'member';
            setAuthUi(true);
            await loadPost();
            await loadComments();
        }
    });

    function setAuthUi(isLoggedIn) {
        document.getElementById('loginBtn').classList.toggle('hidden', isLoggedIn);
        document.getElementById('logoutBtn').classList.toggle('hidden', !isLoggedIn);
        document.getElementById('userNameDisplay').classList.toggle('hidden', !isLoggedIn);
        document.getElementById('commentFormArea').classList.toggle('hidden', !isLoggedIn);
        document.getElementById('loginNotice').classList.toggle('hidden', isLoggedIn);
        if (isLoggedIn) document.getElementById('userNameDisplay').innerText = `${currentUserName}님`;
    }

    async function getHeaders(contentType = false) {
        const headers = currentUser ? await authHeaders(currentUser) : { 'ngrok-skip-browser-warning': '69420' };
        if (contentType) headers['Content-Type'] = 'application/json';
        return headers;
    }

    function safeUrl(value) {
        try {
            const raw = String(value || '').trim();
            const base = raw.startsWith('/api/') ? API_BASE_URL : location.href;
            const url = new URL(raw, base);
            if (url.pathname.startsWith('/api/jhimap/uploads/')) {
                const api = new URL(API_BASE_URL);
                return `${api.origin}${url.pathname}${url.search}`;
            }
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch {
            return '';
        }
    }

    function isFileAttachment(link, href) {
        return link?.type === 'file' || href.includes('/api/jhimap/uploads/');
    }

    async function loadPost() {
        const res = await apiFetch(`/api/jhimap/board/${COLLECTION}/${encodedPostId}`, { headers: await getHeaders() });
        if (!res.ok) { alert('자료를 찾을 수 없습니다.'); location.replace('resource.html'); return; }
        postData = await res.json();
        document.getElementById('viewTitle').innerText = postData.title || '제목 없음';
        document.getElementById('viewAuthor').innerText = `BY. ${postData.author_name || postData.author || '익명'}`;
        document.getElementById('viewCategory').innerText = postData.category || 'RESOURCE';
        document.getElementById('viewDate').innerText = formatDate(postData.created_at || postData.createdAt);
        document.getElementById('viewContent').innerText = postData.content || postData.description || '';
        const linksDiv = document.getElementById('linksContainer');
        linksDiv.innerHTML = '';
        (postData.links || []).forEach((link, index) => {
            const href = safeUrl(link.url);
            if (!href) return;
            const isFile = isFileAttachment(link, href);
            if (isFile) {
                const name = link.name || `첨부파일 ${index + 1}`;
                const item = document.createElement('div');
                item.className = 'attachment-item';
                const nameEl = document.createElement('span');
                nameEl.className = 'attachment-name';
                nameEl.textContent = name;
                const actions = document.createElement('div');
                actions.className = 'attachment-actions';
                const previewBtn = document.createElement('button');
                previewBtn.type = 'button';
                previewBtn.className = 'btn-small';
                previewBtn.textContent = '미리보기';
                previewBtn.onclick = () => openAttachment(href, name, 'preview');
                const downloadBtn = document.createElement('button');
                downloadBtn.type = 'button';
                downloadBtn.className = 'btn-small';
                downloadBtn.textContent = '다운로드';
                downloadBtn.onclick = () => openAttachment(href, name, 'download');
                actions.append(previewBtn, downloadBtn);
                item.append(nameEl, actions);
                linksDiv.appendChild(item);
                return;
            }
            const a = document.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.className = 'link-item';
            a.innerHTML = `<span>${escapeHtml(link.name || '첨부 링크')}</span><span style="font-size:12px; opacity:.6;">새 창에서 열기</span>`;
            linksDiv.appendChild(a);
        });
        const isOwner = currentUser && postData.uid === currentUser.uid;
        const canManage = isOwner || ['admin', 'teacher', 'leader'].includes(currentRole);
        document.getElementById('btnEditPost').classList.toggle('hidden', !isOwner && !['admin', 'teacher', 'leader'].includes(currentRole));
        document.getElementById('btnDeletePost').classList.toggle('hidden', !canManage);
        await setupPostTools({
            user: currentUser,
            collection: COLLECTION,
            postId,
            bookmarkButton: document.getElementById('btnBookmarkPost'),
            reportButton: document.getElementById('btnReportPost')
        });
    }

    async function loadComments() {
        const res = await apiFetch(`/api/jhimap/board/${COLLECTION}/${encodedPostId}/comments`, { headers: await getHeaders() });
        if (!res.ok) return;
        const comments = await res.json();
        const list = document.getElementById('commentList');
        list.innerHTML = '';
        if (!comments.length) { list.innerHTML = '<div style="text-align:center; color:#555; padding:20px;">등록된 댓글이 없습니다.</div>'; return; }
        comments.forEach(c => {
            const isCommentOwner = currentUser && c.uid === currentUser.uid;
            const isPostOwner = currentUser && postData && postData.uid === currentUser.uid;
            const canDelete = isCommentOwner || isPostOwner || ['admin', 'teacher', 'leader'].includes(currentRole);
            const item = document.createElement('div');
            item.className = 'comment-item';
            if (isCommentOwner) item.style.border = '1px solid var(--accent)';
            const meta = document.createElement('div');
            meta.className = 'comment-meta';
            const author = document.createElement('span');
            author.className = 'comment-author';
            author.textContent = c.author_name || c.author || '익명';
            const date = document.createElement('span');
            date.textContent = formatDate(c.created_at || c.createdAt);
            meta.append(author, date);

            const content = document.createElement('div');
            content.textContent = c.content || '';
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; justify-content:flex-end; gap:8px; margin-top:10px;';
            if (canDelete) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn-small';
                deleteButton.style.cssText = 'color:#ff4d4d; border-color:#ff4d4d;';
                deleteButton.textContent = '삭제';
                deleteButton.addEventListener('click', () => deleteComment(c.id));
                actions.appendChild(deleteButton);
            }
            appendCommentReportButton(actions, {
                user: currentUser,
                collection: COLLECTION,
                commentId: c.id
            });
            item.append(meta, content, actions);
            list.appendChild(item);
        });
    }

    document.getElementById('btnPostComment').addEventListener('click', async () => {
        const input = document.getElementById('commentInput');
        const content = input.value.trim();
        if (!content || !currentUser) return;
        const btn = document.getElementById('btnPostComment');
        btn.disabled = true;
        btn.innerText = 'SENDING...';
        try {
            const res = await apiFetch(`/api/jhimap/board/${COLLECTION}/${encodedPostId}/comments`, { method:'POST', headers: await getHeaders(true), body: JSON.stringify({ content, authorName: currentUserName }) });
            if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || '댓글 작성 실패'); }
            input.value = '';
            await loadComments();
        } catch (err) { alert(err.message); }
        finally { btn.disabled = false; btn.innerText = 'POST'; }
    });

    function withDownloadParam(url) {
        const downloadUrl = new URL(url);
        downloadUrl.searchParams.set('download', '1');
        return downloadUrl.href;
    }

    function getPreviewMimeType(filename, contentType) {
        const type = String(contentType || '').split(';')[0].trim().toLowerCase();
        const ext = String(filename || '').split('.').pop().toLowerCase();
        const byExt = {
            pdf: 'application/pdf',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            txt: 'text/plain',
            csv: 'text/csv',
            md: 'text/plain',
            json: 'application/json',
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            mp4: 'video/mp4',
            webm: 'video/webm'
        };
        const allowedTypes = new Set(Object.values(byExt));
        if (allowedTypes.has(type)) return type;
        return byExt[ext] || '';
    }

    async function openAttachment(url, filename, mode = 'preview') {
        let previewWindow = null;
        try {
            if (!currentUser) throw new Error('로그인이 필요합니다.');
            if (mode === 'preview') {
                previewWindow = window.open('about:blank', '_blank');
                if (!previewWindow) throw new Error('팝업이 차단되어 미리보기를 열 수 없습니다.');
                previewWindow.opener = null;
                previewWindow.document.title = '파일 미리보기';
                previewWindow.document.body.textContent = '파일을 불러오는 중입니다...';
            }
            const requestUrl = mode === 'download' ? withDownloadParam(url) : url;
            const res = await fetch(requestUrl, { headers: await getHeaders() });
            if (!res.ok) throw new Error('파일을 열 수 없습니다.');
            const blob = await res.blob();
            if (mode === 'download') {
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = filename;
                a.click();
                setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
                return;
            }
            const previewType = getPreviewMimeType(filename, blob.type);
            if (!previewType) throw new Error('이 파일 형식은 미리보기를 지원하지 않습니다. 다운로드 버튼을 사용해 주세요.');
            const previewBlob = blob.type === previewType ? blob : new Blob([blob], { type: previewType });
            const objectUrl = URL.createObjectURL(previewBlob);
            previewWindow.location.href = objectUrl;
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        } catch (err) {
            if (previewWindow && !previewWindow.closed) previewWindow.close();
            alert(err.message || '파일을 열 수 없습니다.');
        }
    }

    async function deleteComment(commentId) {
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        const res = await apiFetch(`/api/jhimap/board/${COLLECTION}/${encodedPostId}/comments/${encodeURIComponent(String(commentId))}`, { method:'DELETE', headers: await getHeaders() });
        if (res.ok) await loadComments(); else alert('댓글 삭제에 실패했습니다.');
    }

    document.getElementById('btnEditPost').onclick = () => { location.href = `write.html?id=${encodedPostId}`; };
    document.getElementById('btnDeletePost').onclick = async () => {
        if (!confirm('자료를 삭제하시겠습니까? 관련 댓글도 함께 삭제됩니다.')) return;
        const res = await apiFetch(`/api/jhimap/board/${COLLECTION}/${encodedPostId}`, { method:'DELETE', headers: await getHeaders() });
        if (res.ok) location.href = 'resource.html'; else alert('삭제 권한이 없거나 오류가 발생했습니다.');
    };

    function formatDate(value) { if (!value) return '-'; if (value.seconds) return new Date(value.seconds * 1000).toLocaleString(); return new Date(value).toLocaleString(); }
    function escapeHtml(value) { return String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
