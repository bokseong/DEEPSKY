auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
const appCheck = firebase.appCheck();
appCheck.activate('6Leol8MsAAAAAJcS-pWEjPLZu4alKMIxiYYiDJI0', true);

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

        db.ref('users/' + user.uid).on('value', (snapshot) => {
            const userData = snapshot.val() || {};
            const currentName = userData.name || user.email.split('@')[0];

            let roleName = "일반 회원";
            if (user.email === ADMIN_EMAIL) roleName = "관리자";
            else if (userData.role === 'student') roleName = "동아리 부원";

            if(status) status.innerText = `${currentName}님 (${roleName})`;
            if(displayRole) displayRole.innerText = roleName;
            if(nameInput) nameInput.value = currentName;
        });
    } else {
        // [비로그인 상태 시] 즉시 안내 후 로그인 페이지로 이동
        alert("로그인이 필요한 페이지입니다. 로그인 페이지로 이동합니다.");
        location.href = "login.html";
    }
});

// 프로필 업데이트
function updateProfile() {
    const user = auth.currentUser;
    const newName = document.getElementById("userName").value.trim();
    if (!newName) return alert("이름을 입력해주세요.");

    db.ref('users/' + user.uid).update({ name: newName })
      .then(() => alert("성공적으로 저장되었습니다."))
      .catch(err => alert("오류: " + err.message));
}

async function sendRequestEmail() {
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
        const btn = event.currentTarget;
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

            alert("성공적으로 요청을 보냈습니다. 관리자 확인 후 반영됩니다.");
            reasonElement.value = "";
        } catch (error) {
            alert("요청 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
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
function deleteAccount() {
    if (confirm("정말 탈퇴하시겠습니까? 데이터는 복구할 수 없습니다.")) {
        const user = auth.currentUser;
        db.ref('users/' + user.uid).remove().then(() => user.delete())
          .then(() => { alert("탈퇴되었습니다."); location.href="index.html"; })
          .catch(() => alert("다시 로그인 후 시도해주세요."));
    }
}

// 로그아웃
function logout() {
    if(confirm("로그아웃 하시겠습니까?")) {
        auth.signOut().then(() => { location.href = "index.html"; });
    }
}
