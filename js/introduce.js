    // 3. 로그인 상태 감지 및 정보 업데이트
    auth.onAuthStateChanged(async (user) => {
        const status = document.getElementById("userStatus");
        const loginBtn = document.getElementById("loginBtn");
        const logoutBtn = document.getElementById("logoutBtn");

        if (user) {
            try {
                const userData = await getServerUserProfile(user);
                const finalName = userData.name || user.displayName || user.email.split('@')[0];

                // 등급 판정: 관리자 이메일이면 'admin', 아니면 DB 등급, 기본값 'member'
                const userRole = normalizeRole(userData.role);

                if (status) status.innerText = `${finalName}님 (${getRoleName(userRole)})`;
            } catch (error) {
                if (status) status.innerText = error.message;
            }

            loginBtn?.classList.add("hidden");
            logoutBtn?.classList.remove("hidden");
        } else {
            if (status) status.innerText = "로그인 해주세요";
            loginBtn?.classList.remove("hidden");
            logoutBtn?.classList.add("hidden");
        }
    });

    // 4. 등급 명칭 변환 함수
    // 5. 로그아웃 함수
    window.logout = () => {
        if (confirm("로그아웃 하시겠습니까?")) {
            auth.signOut().then(() => {
                alert("로그아웃 되었습니다.");
                location.href = 'index.html';
            }).catch(err => alert("로그아웃 중 오류가 발생했습니다."));
        }
    };
