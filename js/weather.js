// 세션 유지
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

// 2. 로그인 상태 감지 및 UI 처리
auth.onAuthStateChanged(async (user) => {
    const status = document.getElementById("userStatus");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (user) {
        try {
            const userData = await getServerUserProfile(user);
            const currentName = userData.name || user.displayName || user.email.split('@')[0];

            const roleName = getRoleName(normalizeRole(userData.role));

            if (status) status.innerText = `${currentName}님 (${roleName})`;

            // UI 표시 전환
            loginBtn.classList.add("hidden");
            logoutBtn.classList.remove("hidden");
        } catch (error) {
            if (status) status.innerText = error.message;
        }

    } else {
        // 비로그인 상태
        if (status) status.innerText = "로그인 해주세요";
        loginBtn.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
    }
});

// 3. 페이지 초기화 기능 (이미지 로드 및 이벤트 통합)
window.addEventListener('load', function() {
    // 외계행성 식 이미지 강제 새로고침 로드
    const img = document.getElementById('transitImg');
    if (img) {
        const timestamp = new Date().getTime();
        const proxyUrl = "https://images.weserv.nl/?url=";
        const targetImg = "nysc.dothome.co.kr/today_2.png";

        // 이미지 로드 시도
        img.src = proxyUrl + targetImg + "&t=" + timestamp;

        // 로드 실패 시 에러 처리
        img.onerror = function() {
            this.alt = "예보 이미지를 불러올 수 없습니다. (원본 사이트 확인 필요)";
            this.style.background = "#2d367a";
            this.style.padding = "20px";
        };
    }
});

// 4. 로그아웃 기능
function logout() {
    if(confirm("로그아웃 하시겠습니까?")) {
        auth.signOut().then(() => {
            location.href = 'index.html';
        });
    }
}
