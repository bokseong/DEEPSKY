let currentUser = null;
let currentUserRole = "guest";

// 관리자 권한 검증 및 초기화 데이터 로드
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userData = await getServerUserProfile(user);
            currentUserRole = normalizeRole(userData.role);

            if (currentUserRole !== 'admin') {
                document.getElementById("loginBtn")?.classList.add("hidden");
                document.getElementById("logoutBtn")?.classList.remove("hidden");
                document.getElementById("userStatus").innerText = `${userData.name || user.displayName || '사용자'}님 (${getRoleName(currentUserRole)})`;
                setProtectedPageAccess({
                    allowed: false,
                    title: "관리자 전용 공간",
                    message: "이 페이지는 관리자 권한이 있어야 접근할 수 있습니다.",
                    action: "role"
                });
            } else {
                setProtectedPageAccess({ allowed: true });
                document.getElementById("loginBtn")?.classList.add("hidden");
                document.getElementById("logoutBtn")?.classList.remove("hidden");
                document.getElementById("userStatus").innerText = `${userData.name || user.displayName || '관리자'}님 (admin)`;
                loadAllUsers();
                loadRoleRequests();
                loadServerSuggestions();
            }
        } catch (error) {
            document.getElementById("userStatus").innerText = error.message || "권한 확인 실패";
            setProtectedPageAccess({
                allowed: false,
                title: "권한 확인 실패",
                message: "서버에서 관리자 권한을 확인하지 못했습니다.",
                action: "retry"
            });
        }
    } else {
        currentUser = null;
        currentUserRole = "guest";
        document.getElementById("userStatus").innerText = "로그인이 필요합니다";
        document.getElementById("loginBtn")?.classList.remove("hidden");
        document.getElementById("logoutBtn")?.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "관리자 전용 공간",
            message: "관리자 페이지를 이용하려면 로그인해 주세요.",
            action: "login"
        });
    }
});

// ==========================================
// [기능 1] 전체 회원 목록 및 등급 관리
// ==========================================
async function loadAllUsers() {
    try {
        const users = await requestAuthenticatedApi("/api/admin/users");
        const list = document.getElementById("userList");
        if (!list) return;
        list.innerHTML = "";

        Object.entries(users).forEach(([uid, data]) => {
            const currentRole = normalizeRole(data.role);

            const row = document.createElement("tr");
            [data.name || '이름없음', data.email || '이메일없음', currentRole].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            const roleCell = document.createElement("td");
            const select = document.createElement("select");
            select.setAttribute("aria-label", `${data.name || '사용자'}의 등급`);
            select.style.cssText = "padding:5px; background:#0b0f2b; color:white; border:1px solid #1b2f80; border-radius:4px;";
            [
                ["member", "일반(member)"],
                ["student", "부원(student)"],
                ["admin", "관리자(admin)"]
            ].forEach(([value, label]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = currentRole === value;
                select.appendChild(option);
            });
            roleCell.appendChild(select);

            const actionCell = document.createElement("td");
            const updateButton = document.createElement("button");
            updateButton.type = "button";
            updateButton.textContent = "변경";
            updateButton.style.cssText = "margin-left:8px; padding:5px 10px; background:#1b2f80; border:none; color:white; border-radius:4px; cursor:pointer;";
            updateButton.addEventListener("click", () => updateUserRole(uid, select));
            actionCell.appendChild(updateButton);
            row.append(roleCell, actionCell);
            list.appendChild(row);
        });
    } catch (error) {
        const list = document.getElementById("userList");
        if (list) list.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    }
}

// 직접 권한 수정 함수
async function updateUserRole(uid, roleSelect) {
    const newRole = roleSelect.value;
    try {
        await requestAuthenticatedApi(`/api/admin/users/${encodeURIComponent(uid)}/role`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ role: newRole })
        });
        await loadAllUsers();
        alert("등급 권한이 성공적으로 수정되었습니다.");
    } catch (error) {
        alert(error.message || "등급 수정 실패");
    }
}


// ==========================================
// [기능 2] 등급 조정 요청 관리
// ==========================================
async function loadRoleRequests() {
    try {
        const requests = await requestAuthenticatedApi("/api/admin/role-requests");
        const list = document.getElementById("roleRequestList");
        if (!list) return;
        list.innerHTML = "";

        if (Object.keys(requests).length === 0) {
            list.innerHTML = "<p style='color:#888; text-align:center;'>접수된 등급 승인 요청이 없습니다.</p>";
            return;
        }

        Object.entries(requests).forEach(([reqId, reqData]) => {

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
    } catch (error) {
        const list = document.getElementById("roleRequestList");
        if (list) list.innerHTML = `<p style="color:#ff4d4d;text-align:center;">${escapeHtml(error.message)}</p>`;
    }
}

// 등급 요청 승인 처리 (해당 유저 role을 업데이트하고 요청서 삭제)
async function approveRoleRequest(reqId) {
    if (!confirm("이 요청을 승인하고 등급을 조절하시겠습니까?")) return;
    try {
        await requestAuthenticatedApi(`/api/admin/role-requests/${encodeURIComponent(reqId)}/approve`, {
            method: "POST"
        });
        await Promise.all([loadRoleRequests(), loadAllUsers()]);
        alert("등급 요청 승인이 완료되었습니다.");
    } catch (err) {
        alert("승인 처리 중 오류 발생: " + err.message);
    }
}

// 등급 요청 거절 처리 (요청 노드에서 단순 삭제)
async function rejectRoleRequest(reqId) {
    if (!confirm("요청을 거절하고 삭제하시겠습니까?")) return;
    try {
        await requestAuthenticatedApi(`/api/admin/role-requests/${encodeURIComponent(reqId)}`, {
            method: "DELETE"
        });
        await loadRoleRequests();
        alert("요청이 취소/거절되었습니다.");
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
        const res = await fetch(`${API_BASE_URL}/api/suggests/${encodeURIComponent(String(id))}`, {
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

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.href="index.html"); }
