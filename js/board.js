// 1. 파이어베이스 초기화 및 기본 설정
const firebaseConfig = {
    apiKey: "AIzaSyArvtIZ3QkwUcvz0SLu-AnLRifhkOtQ9CY",
    authDomain: "bokseong-deep-sky.firebaseapp.com",
    databaseURL: "https://bokseong-deep-sky-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bokseong-deep-sky",
    storageBucket: "bokseong-deep-sky.firebasestorage.app",
    messagingSenderId: "800777151311",
    appId: "1:800777151311:web:8c901fcf0ded04b1941b3a"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

const API_BASE_URL = "https://hypocrite-depletion-until.ngrok-free.dev";
const ADMIN_EMAIL = "leader.deepsky@gmail.com";

let currentUser = null;
let currentUserRole = "guest";
let allPosts = [];
let displayPosts = [];
let currentPage = 1;
const postsPerPage = 10;

// 인증 상태 감시 및 회원 정보 등급 동기화
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const status = document.getElementById("userStatus");
    if (user) {
        db.ref('users/' + user.uid).on('value', (snapshot) => {
            const userData = snapshot.val() || {};
            const currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            currentUserRole = (user.email === ADMIN_EMAIL) ? 'admin' : (userData.role || 'member');
            if (status) status.innerText = `${currentUserName}님 (${currentUserRole==='admin'?'관리자':(currentUserRole==='student'?'부원':'일반')})`;
            renderPage();
        });
        document.getElementById("loginBtn")?.classList.add("hidden");
        document.getElementById("logoutBtn")?.classList.remove("hidden");
    } else {
        currentUserRole = "guest";
        if (status) status.innerText = "로그인 해주세요";
        document.getElementById("loginBtn")?.classList.remove("hidden");
        document.getElementById("logoutBtn")?.classList.add("hidden");
        renderPage();
    }
    loadBoardPosts();
});

async function loadBoardPosts() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/freeboard`, {
            method: "GET",
            headers: { "ngrok-skip-browser-warning": "69420" }
        });
        if (!res.ok) throw new Error("서버 응답 오류");
        const data = await res.json();

        allPosts = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        allPosts.sort((a, b) => getPostTime(b) - getPostTime(a));
        displayPosts = [...allPosts];

        renderPage();
    } catch (err) {
        console.error("게시판 로드 실패:", err);
        const list = document.getElementById("postList");
        if (list) list.innerHTML = `<p style="text-align:center; padding:50px; color:#ff4d4d;">서버 연결에 실패했습니다.</p>`;
    }
}

function renderPage() {
    const list = document.getElementById("postList");
    if (!list) return;
    list.innerHTML = "";

    const startIndex = (currentPage - 1) * postsPerPage;
    const endIndex = startIndex + postsPerPage;
    const paginatedPosts = displayPosts.slice(startIndex, endIndex);

    if (paginatedPosts.length === 0) {
        list.innerHTML = `<p style="text-align:center; padding:50px; color:#888;">등록된 게시글이 없습니다.</p>`;
        return;
    }

    paginatedPosts.forEach((p, idx) => {
        const item = document.createElement("div");
        item.className = "post-item";
        item.onclick = () => location.href = `view.html?id=${p.id}`;

        const fileIcon = hasAttachment(p) ? " 📎" : "";
        const postNumber = displayPosts.length - (startIndex + idx);

        item.innerHTML = `
            <div class="post-info-area">
                <span class="post-title">${postNumber}. ${escapeHtml(p.title || '제목 없음')}${fileIcon}</span>
                <span class="post-meta">작성자: ${escapeHtml(p.author || '익명')} | ${escapeHtml(formatPostDate(p.date || p.createdAt || p.timestamp))}</span>
            </div>
            <div class="post-action-area"></div>
        `;

        const canDelete = currentUserRole === "admin" || (currentUser && p.uid === currentUser.uid);
        if (canDelete) {
            const delBtn = document.createElement("button");
            delBtn.className = "del-btn";
            delBtn.innerText = "삭제";
            delBtn.onclick = async (event) => {
                event.stopPropagation();
                await deletePost(p.id);
            };
            item.querySelector(".post-action-area").appendChild(delBtn);
        }

        list.appendChild(item);
    });

    renderPagination();
}

// 페이지네이션 제어
function renderPagination() {
    const paginArea = document.getElementById("pagination");
    if (!paginArea) return;
    paginArea.innerHTML = "";
    const totalPages = Math.ceil(displayPosts.length / postsPerPage);
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.innerText = i;
        btn.className = `page-num ${i === currentPage ? 'active' : ''}`;
        btn.onclick = () => {
            currentPage = i;
            renderPage();
            window.scrollTo(0, 0);
        };
        paginArea.appendChild(btn);
    }
}

async function deletePost(postId) {
    if (!currentUser) return alert("로그인이 필요합니다.");
    if (!confirm("정말로 이 게시글을 삭제하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/freeboard/${postId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) throw new Error("삭제 실패");
        await loadBoardPosts();
    } catch (err) {
        alert("삭제 권한이 없거나 처리에 실패했습니다.");
    }
}

function checkWriteAuth() {
    if (!currentUser) {
        alert("로그인이 필요합니다.");
        return;
    }
    location.href = "write.html";
}

function filterPosts() {
    const term = document.getElementById("searchInput").value.toLowerCase().trim();
    if (!term) {
        displayPosts = [...allPosts];
    } else {
        displayPosts = allPosts.filter(p =>
            (p.title && p.title.toLowerCase().includes(term)) ||
            (p.author && p.author.toLowerCase().includes(term))
        );
    }
    currentPage = 1;
    renderPage();
}

function getPostTime(post) {
    const rawValue = post?.createdAt || post?.created_at || post?.timestamp || post?.date;
    if (!rawValue) return 0;
    if (typeof rawValue === "number") return rawValue;
    if (rawValue.seconds) return rawValue.seconds * 1000;

    const parsed = Date.parse(rawValue);
    if (!Number.isNaN(parsed)) return parsed;

    const match = String(rawValue).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2})\D+(\d{1,2}))?/);
    if (!match) return 0;
    const [, year, month, day, hour = "0", minute = "0"] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)).getTime();
}

function formatPostDate(value) {
    if (!value) return "시간 미지정";
    const time = getPostTime({ date: value });
    if (!time) return value;
    return new Date(time).toLocaleString("ko-KR");
}

function hasAttachment(post) {
    return Boolean(
        post.fileUrl ||
        post.file_url ||
        post.file_path ||
        post.filePath ||
        post.downloadUrl ||
        post.download_url ||
        post.link
    );
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
