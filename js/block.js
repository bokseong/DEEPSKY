    const appCheck = firebase.appCheck();
    appCheck.activate('6Leol8MsAAAAAJcS-pWEjPLZu4alKMIxiYYiDJI0', true);


   // 3. 인증 상태 관리
    auth.onAuthStateChanged((user) => {
        const status = document.getElementById("userStatus");
        const loginBtn = document.getElementById("loginBtn");
        const logoutBtn = document.getElementById("logoutBtn");
        const mainContainer = document.getElementById("mainContainer");

        if (user) {
            // [로그인 상태] 컨테이너를 보여주고 유저 정보 로드
            if (mainContainer) mainContainer.classList.remove("hidden");

            db.ref('users/' + user.uid).on('value', (snapshot) => {
                const userData = snapshot.val() || {};
                const finalName = userData.name || user.displayName || user.email.split('@')[0];
                let userRole = (user.email === ADMIN_EMAIL) ? 'admin' : (userData.role || 'member');

                if (status) status.innerText = `${finalName}님 (${getRoleName(userRole)})`;
            });

            loginBtn?.classList.add("hidden");
            logoutBtn?.classList.remove("hidden");
        } else {
            // [비로그인 상태] 경고 없이 즉시 로그인 페이지로 리다이렉트
            location.href = 'login.html';
        }
    });

    async function sendRequestEmail() {
        const user = auth.currentUser;
        const roleElement = document.getElementById("requestedRole");
        const reasonElement = document.getElementById("requestReason");
        const btn = document.getElementById("submitBtn");

        if (!user) {
            alert("로그인 후 요청이 가능합니다.");
            return;
        }

        const requestedRoleName = roleElement.options[roleElement.selectedIndex].text;
        const reasonValue = reasonElement.value.trim();

        if (!reasonValue) {
            alert("조정 사유를 입력해주세요.");
            reasonElement.focus();
            return;
        }

        if (confirm(`[${requestedRoleName}] 등급으로 조정을 요청하시겠습니까?`)) {
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

                alert("성공적으로 요청을 보냈습니다. 관리자 확인을 기다려주세요.");
                reasonElement.value = "";
            } catch (error) {
                console.error("Error:", error);
                alert("전송 중 오류가 발생했습니다.");
            } finally {
                btn.disabled = false;
                btn.innerText = "등급 조정 요청 보내기";
            }
        }
    }

    window.logout = () => {
        if (confirm("로그아웃 하시겠습니까?")) {
            auth.signOut().then(() => {
                alert("로그아웃 되었습니다.");
                location.href = 'index.html';
            });
        }
    };
