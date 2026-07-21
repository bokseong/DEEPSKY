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

function normalizeRole(role) {
    if (role === '관리자') return 'admin';
    if (role === '부원' || role === '동아리 부원') return 'student';
    return role || 'member';
}

// 관리자 권한 검증 및 초기화 데이터 로드
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        db.ref('users/' + user.uid).once('value').then(snap => {
            const userData = snap.val() || {};
            currentUserRole = (user.email === ADMIN_EMAIL) ? 'admin' : normalizeRole(userData.role);

            // 보안 규칙 상 admin 권한이 아니면 강제 퇴장 처리
            if (currentUserRole !== 'admin') {
                alert("관리자 전용 페이지입니다.");
                location.href = "index.html";
            } else {
                document.getElementById("authMsg")?.classList.add("hidden");
                document.getElementById("adminContent")?.classList.remove("hidden");
                document.getElementById("loginBtn")?.classList.add("hidden");
                document.getElementById("logoutBtn")?.classList.remove("hidden");
                document.getElementById("userStatus").innerText = `${userData.name || user.displayName || '관리자'}님 (admin)`;
                loadAllUsers();
                loadRoleRequests();
                loadServerSuggestions();
            }
        });
    } else {
        alert("로그인이 필요합니다.");
        location.href = "login.html";
    }
});

// ==========================================
// [기능 1] 전체 회원 목록 및 등급 관리 (Firebase RTDB)
// ==========================================
function loadAllUsers() {
    db.ref('users').on('value', snapshot => {
        const list = document.getElementById("userList");
        if (!list) return;
        list.innerHTML = "";

        snapshot.forEach(child => {
            const uid = child.key;
            const data = child.val();
            const currentRole = normalizeRole(data.role);

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${escapeHtml(data.name || '이름없음')}</td>
                <td>${escapeHtml(data.email || '이메일없음')}</td>
                <td>${escapeHtml(currentRole)}</td>
                <td>
                    <select id="role_${uid}" style="padding:5px; background:#0b0f2b; color:white; border:1px solid #1b2f80; border-radius:4px;">
                        <option value="member" ${currentRole === 'member' ? 'selected' : ''}>일반(member)</option>
                        <option value="student" ${currentRole === 'student' ? 'selected' : ''}>부원(student)</option>
                        <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>관리자(admin)</option>
                    </select>
                </td>
                <td>
                    <button onclick="updateUserRole('${uid}')" style="margin-left:8px; padding:5px 10px; background:#1b2f80; border:none; color:white; border-radius:4px; cursor:pointer;">변경</button>
                </td>
            `;
            list.appendChild(row);
        });
    });
}

// 직접 권한 수정 함수
async function updateUserRole(uid) {
    const newRole = document.getElementById("role_" + uid).value;
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(uid)}/role`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            },
            body: JSON.stringify({ role: newRole })
        });
        if (!response.ok) throw new Error("등급 수정 실패");
        alert("등급 권한이 성공적으로 수정되었습니다.");
    } catch (error) {
        alert(error.message || "등급 수정 실패");
    }
}


// ==========================================
// [기능 2] 등급 조정 요청 관리 (Firebase RTDB - roleRequests 노드)
// ==========================================
function loadRoleRequests() {
    db.ref('roleRequests').on('value', snapshot => {
        const list = document.getElementById("roleRequestList");
        if (!list) return;
        list.innerHTML = "";

        if (!snapshot.exists()) {
            list.innerHTML = "<p style='color:#888; text-align:center;'>접수된 등급 승인 요청이 없습니다.</p>";
            return;
        }

        snapshot.forEach(child => {
            const reqId = child.key;
            const reqData = child.val();

            const div = document.createElement("div");
            div.style.padding = "12px";
            div.style.background = "rgba(255, 255, 255, 0.02)";
            div.style.border = "1px solid #1b2f80";
            div.style.borderRadius = "8px";
            div.style.marginBottom = "10px";

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong>신청자:</strong> ${escapeHtml(reqData.name || '익명')} (${escapeHtml(reqData.email || '')})<br>
                        <strong>요청 등급:</strong> <span style="color:#7fc7ff; font-weight:bold;">${escapeHtml(reqData.requestedRole || 'student')}</span><br>
                        <small style="color:#888;">신청일시: ${escapeHtml(reqData.date || '')}</small>
                    </div>
                    <div class="role-request-actions"></div>
                </div>
            `;
            const actions = div.querySelector(".role-request-actions");
            const approveButton = document.createElement("button");
            approveButton.textContent = "승인";
            approveButton.style.cssText = "padding:6px 12px;background:#28a745;border:none;color:white;border-radius:4px;cursor:pointer;margin-right:5px;";
            approveButton.addEventListener("click", () => approveRoleRequest(reqId));
            const rejectButton = document.createElement("button");
            rejectButton.textContent = "거절";
            rejectButton.style.cssText = "padding:6px 12px;background:#dc3545;border:none;color:white;border-radius:4px;cursor:pointer;";
            rejectButton.addEventListener("click", () => rejectRoleRequest(reqId));
            actions.append(approveButton, rejectButton);
            list.appendChild(div);
        });
    });
}

// 등급 요청 승인 처리 (해당 유저 role을 업데이트하고 요청서 삭제)
async function approveRoleRequest(reqId) {
    if (!confirm("이 요청을 승인하고 등급을 조절하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/role-requests/${encodeURIComponent(reqId)}/approve`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error("승인 처리 실패");
        alert("등급 요청 승인이 완료되었습니다.");
        loadRoleRequests();
    } catch (err) {
        alert("승인 처리 중 오류 발생: " + err.message);
    }
}

// 등급 요청 거절 처리 (요청 노드에서 단순 삭제)
async function rejectRoleRequest(reqId) {
    if (!confirm("요청을 거절하고 삭제하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/admin/role-requests/${encodeURIComponent(reqId)}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error("거절 처리 실패");
        alert("요청이 취소/거절되었습니다.");
        loadRoleRequests();
    } catch (err) {
        alert("처리 실패: " + err.message);
    }
}


// ==========================================
// [기능 3] 자체 백엔드 서버 건의함 종합 관리 (자체 서버 API 연동)
// ==========================================
async function loadServerSuggestions() {
    const list = document.getElementById("suggestManagerList");
    if (!list) return;

    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/suggests`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();

        list.innerHTML = "";
        const keys = Object.keys(data).reverse(); // 최신순 정렬

        if (keys.length === 0) {
            list.innerHTML = "<p style='color:#888; text-align:center;'>등록된 건의사항이 없습니다.</p>";
            return;
        }

        keys.forEach(key => {
            const s = data[key];
            const div = document.createElement("div");
            div.style.padding = "15px";
            div.style.background = "rgba(11, 15, 43, 0.6)";
            div.style.borderLeft = "4px solid #7fc7ff";
            div.style.marginBottom = "12px";
            div.style.position = "relative";

            div.innerHTML = `
                <div style="font-size:15px; font-weight:bold; color:#fff; margin-bottom:5px;">${escapeHtml(s.title || '')}</div>
                <div style="font-size:13px; color:#ccc; white-space:pre-wrap; margin-bottom:10px;">${escapeHtml(s.content || '')}</div>
                <div style="font-size:11px; color:#888;">작성자: ${escapeHtml(s.author || '')} | 날짜: ${escapeHtml(s.date || '')}</div>
            `;
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "[삭제]";
            deleteButton.style.cssText = "position:absolute;top:15px;right:15px;background:none;border:none;color:#ff4d4d;font-size:13px;cursor:pointer;font-weight:bold;";
            deleteButton.addEventListener("click", () => deleteServerSuggest(key));
            div.appendChild(deleteButton);
            list.appendChild(div);
        });
    } catch (err) {
        console.error("자체 서버 건의함 로드 오류:", err);
        list.innerHTML = "<p style='color:#ff4d4d; text-align:center;'>자체 백엔드 서버 연결 실패</p>";
    }
}

// 자체 백엔드 건의사항 영구 삭제 제어
async function deleteServerSuggest(id) {
    if (!confirm("이 건의글을 자체 데이터베이스에서 영구 삭제하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/suggests/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!res.ok) throw new Error();
        alert("건의사항 삭제 완료");
        loadServerSuggestions(); // 리스트 새로고침
    } catch (err) {
        alert("삭제 처리 중 통신 에러가 발생했습니다.");
    }
}

function escapeHtml(value) {
    return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.href="index.html"); }
