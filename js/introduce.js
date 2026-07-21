    const appCheck = firebase.appCheck();
    appCheck.activate('6Leol8MsAAAAAJcS-pWEjPLZu4alKMIxiYYiDJI0', true);


    // 3. 로그인 상태 감지 및 정보 업데이트
    auth.onAuthStateChanged((user) => {
        const status = document.getElementById("userStatus");
        const loginBtn = document.getElementById("loginBtn");
        const logoutBtn = document.getElementById("logoutBtn");

        if (user) {
            // 사용자 실시간 데이터 감시 (이름 및 등급)
            db.ref('users/' + user.uid).on('value', (snapshot) => {
                const userData = snapshot.val() || {};
                const finalName = userData.name || user.displayName || user.email.split('@')[0];

                // 등급 판정: 관리자 이메일이면 'admin', 아니면 DB 등급, 기본값 'member'
                let userRole = (user.email === ADMIN_EMAIL) ? 'admin' : (userData.role || 'member');

                if (status) status.innerText = `${finalName}님 (${getRoleName(userRole)})`;
            });

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
