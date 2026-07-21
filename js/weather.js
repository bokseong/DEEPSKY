// 세션 유지 및 App Check 활성화
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
const appCheck = firebase.appCheck();
appCheck.activate('6Leol8MsAAAAAJcS-pWEjPLZu4alKMIxiYYiDJI0', true);

// 2. 로그인 상태 감지 및 UI 처리
auth.onAuthStateChanged(async (user) => {
    const status = document.getElementById("userStatus");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (user) {
        // [로그인 로직] 실시간 데이터 로드 및 등급 확인
        db.ref('users/' + user.uid).on('value', (snapshot) => {
            const userData = snapshot.val() || {};
            const currentName = userData.name || user.displayName || user.email.split('@')[0];

            // 등급 명칭 설정
            let roleName = "일반 회원";
            if (user.email === ADMIN_EMAIL) roleName = "관리자";
            else if (userData.role === 'student') roleName = "동아리 부원";

            if (status) status.innerText = `${currentName}님 (${roleName})`;

            // UI 표시 전환
            loginBtn.classList.add("hidden");
            logoutBtn.classList.remove("hidden");
        });

        // 보안 토큰 확인
        try { await appCheck.getToken(false); } catch (e) {}

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
