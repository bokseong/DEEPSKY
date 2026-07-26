auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
let roleRequestDraft = null;
let myActivities = [];

const myActivityTypeNames = {
    post: "게시글",
    comment: "댓글",
    question: "질문",
    reply: "답변",
    suggestion: "건의",
    photo: "사진",
    roleRequest: "권한 요청"
};

// 로그인 상태 감지
auth.onAuthStateChanged(async (user) => {
    const status = document.getElementById("userStatus");
    const displayRole = document.getElementById("displayRole");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const emailInput = document.getElementById("userEmail");
    const nameInput = document.getElementById("userName");
    const container = document.querySelector('.container');

    if (user) {
        // [로그인 성공 시] 화면을 보여줌
        container.classList.remove("hidden");

        if(emailInput) emailInput.value = user.email;
        loginBtn.classList.add("hidden");
        logoutBtn.classList.remove("hidden");

        try {
            const userData = await getServerUserProfile(user);
            const currentName = userData.name || user.email.split('@')[0];

            const roleName = getRoleName(normalizeRole(userData.role));

            if(status) status.innerText = `${currentName}님 (${roleName})`;
            if(displayRole) displayRole.innerText = roleName;
            if(nameInput) nameInput.value = currentName;
            if (!roleRequestDraft) {
                roleRequestDraft = setupDraftAutosave({
                    key: `deepsky:draft:role-request:${user.uid}`,
                    fields: {
                        requestedRole: "#requestedRole",
                        reason: "#requestReason"
                    }
                });
            }
            setProtectedPageAccess({ allowed: true });
            await loadMyActivities();
        } catch (error) {
            if(status) status.innerText = error.message;
            setProtectedPageAccess({
                allowed: false,
                title: "권한 확인 실패",
                message: "서버에서 사용자 정보를 확인하지 못했습니다.",
                action: "retry"
            });
        }
    } else {
        if(status) status.innerText = "로그인이 필요합니다";
        loginBtn.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "회원 정보를 수정하려면 로그인해 주세요.",
            action: "login"
        });
    }
});

document.getElementById("activityFilter")?.addEventListener("change", renderMyActivities);

async function loadMyActivities() {
    const list = document.getElementById("activityList");
    if (!list) return;
    list.innerHTML = '<div class="hub-empty">활동 내역을 불러오는 중...</div>';
    try {
        const data = await requestAuthenticatedApi("/api/me/activity");
        myActivities = data.items || [];
        renderMyActivities();
        if (location.hash === "#activitySection") {
            requestAnimationFrame(() => {
                document.getElementById("activitySection")?.scrollIntoView({ block: "start" });
            });
        }
    } catch (error) {
        list.innerHTML = `<div class="hub-empty">${escapeHtml(error.message)}</div>`;
    }
}

function renderMyActivities() {
    const list = document.getElementById("activityList");
    if (!list) return;
    const filter = document.getElementById("activityFilter")?.value || "all";
    const filtered = filter === "all"
        ? myActivities
        : myActivities.filter(item => item.type === filter);
    list.replaceChildren();

    if (!filtered.length) {
        list.innerHTML = '<div class="hub-empty">표시할 활동 내역이 없습니다.</div>';
        return;
    }

    filtered.forEach(item => {
        const link = document.createElement("a");
        link.className = "hub-item";
        link.href = item.href || "#";
        link.innerHTML = `
            <div class="hub-item__top">
                <h2>${escapeHtml(item.title)}</h2>
                <span class="hub-item__meta">${escapeHtml(myActivityTypeNames[item.type] || item.type)}${item.date ? ` · ${escapeHtml(formatDateTime(item.date))}` : ""}</span>
            </div>
            <p>${escapeHtml(item.summary || "내용 없음")}</p>
        `;
        list.appendChild(link);
    });
}

// 프로필 업데이트
async function updateProfile() {
    const user = auth.currentUser;
    const newName = document.getElementById("userName").value.trim();
    if (!newName) return alert("이름을 입력해주세요.");

    try {
        await syncServerUserProfile(user, newName);
        await user.updateProfile({ displayName: newName });
        alert("성공적으로 저장되었습니다.");
    } catch (error) {
        alert("오류: " + error.message);
    }
}

async function sendRequestEmail(button) {
    const user = auth.currentUser;
    const roleElement = document.getElementById("requestedRole");
    const reasonElement = document.getElementById("requestReason");

    if (!user) return alert("로그인 후 이용 가능합니다.");

    const requestedRoleName = roleElement.options[roleElement.selectedIndex].text;
    const reasonValue = reasonElement.value.trim();

    if (reasonValue.length < 5) {
        alert("조정 사유를 구체적으로 작성해주세요 (최소 5자).");
        reasonElement.focus();
        return;
    }

    if (confirm(`[${requestedRoleName}] 등급으로 조정을 요청하시겠습니까?`)) {
        const btn = button;
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "전송 중...";

        try {
            const token = await user.getIdToken();
            const response = await fetch(`${API_BASE_URL}/api/role-requests`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "ngrok-skip-browser-warning": "69420"
                },
                body: JSON.stringify({
                requestedRole: roleElement.value,
                reason: reasonValue,
                date: new Date().toISOString()
                })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "등급 요청 실패");
            }

            showToast("요청을 보냈습니다. 관리자 확인 후 반영됩니다.", "success");
            reasonElement.value = "";
            roleRequestDraft?.clear();
        } catch (error) {
            showToast(error.message || "요청 저장 중 오류가 발생했습니다.", "error");
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
}

// 비밀번호 재설정
function resetPassword() {
    const email = auth.currentUser.email;
    if(confirm("재설정 메일을 발송할까요?")) {
        auth.sendPasswordResetEmail(email)
            .then(() => alert("메일이 발송되었습니다."))
            .catch(err => alert(err.message));
    }
}

// 회원 탈퇴
async function deleteAccount() {
    if (confirm("정말 탈퇴하시겠습니까? 데이터는 복구할 수 없습니다.")) {
        const user = auth.currentUser;
        try {
            await requestAuthenticatedApi("/api/me", { method: "DELETE" });
            await user.delete();
            alert("탈퇴되었습니다.");
            location.href = "index.html";
        } catch (error) {
            alert("다시 로그인 후 시도해주세요: " + error.message);
        }
    }
}

// 로그아웃
function logout() {
    if(confirm("로그아웃 하시겠습니까?")) {
        auth.signOut().then(() => { location.href = "index.html"; });
    }
}
