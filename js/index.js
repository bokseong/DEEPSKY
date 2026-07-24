// 전역 유저 변수
let currentUser = null;

// 3. 인증 및 사용자 등급 로직 (Firebase 로그인 세션 유지)
auth.onAuthStateChanged(async (user) => {
    const status = document.getElementById("userStatus");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const adminBox = document.getElementById("adminBox");
    const adminUpdateBox = document.getElementById("adminUpdateBox");

    // 업데이트 로그 카드는 항상 노출
    const logCard = document.getElementById("updateLogList")?.closest('.card');
    logCard?.classList.remove("hidden");

    if (user) {
        currentUser = user; // 전역 변수에 저장하여 글 작성 시 활용

        try {
            const userData = await getServerUserProfile(user);
            const finalName = userData.name || user.displayName || user.email.split('@')[0];

            const userRole = normalizeRole(userData.role);
            const isAdmin = userRole === 'admin';

            if(status) status.innerText = `${finalName}님 (${getRoleName(userRole)})`;

            if (isAdmin) {
                adminBox?.classList.remove("hidden");
                adminUpdateBox?.classList.remove("hidden");
            } else {
                adminBox?.classList.add("hidden");
                adminUpdateBox?.classList.add("hidden");
            }
        } catch (error) {
            if(status) status.innerText = error.message;
            adminBox?.classList.add("hidden");
            adminUpdateBox?.classList.add("hidden");
        }

        loginBtn?.classList.add("hidden");
        logoutBtn?.classList.remove("hidden");
    } else {
        currentUser = null;
        if(status) status.innerText = "로그인 해주세요";
        loginBtn?.classList.remove("hidden");
        logoutBtn?.classList.add("hidden");

        adminBox?.classList.add("hidden");
        adminUpdateBox?.classList.add("hidden");
    }

    // 💡 초기 로드는 Firebase가 아닌 내 자체 우분투 서버에서 데이터를 가져옵니다.
    loadProgram();
    loadUpdateLogs();
});

// 4. 등급 명칭 변환
// 5. 이번 주 프로그램 로드 (자체 서버 연동 버전)
async function loadProgram() {
    const el = document.getElementById("weekProgramText");
    if(!el) return;

    try {
        // 💡 ngrok 경고창 패스를 위해 headers 옵션을 추가했습니다.
        const response = await fetch(`${API_BASE_URL}/api/program`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error("데이터 로드 실패");

        const data = await response.json();
        // 백엔드가 program 폴더에서 가져온 text를 출력
        el.innerText = data ? data.text : "공지가 없습니다.";
    } catch (error) {
        console.error("주간 프로그램 로드 에러:", error);
        el.innerText = "프로그램 정보를 불러오지 못했습니다.";
    }
}

// 6. 업데이트 로그 로드 (자체 서버 연동 및 최신순 정렬 버전)
async function loadUpdateLogs() {
    const logList = document.getElementById("updateLogList");
    if(!logList) return;

    try {
        // 💡 여기도 똑같이 ngrok 경고창 패스 headers 옵션을 추가했습니다.
        const response = await fetch(`${API_BASE_URL}/api/update-logs`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error("로그 로드 실패");

        const rawLogs = await response.json();
        const logs = Array.isArray(rawLogs) ? rawLogs : Object.values(rawLogs || {});
        logList.innerHTML = "";

        // 💡 백엔드가 주는 데이터를 최신순(timestamp 내림차순) 정렬
        logs.sort((a, b) => {
            const timeA = a.timestamp || 0;
            const timeB = b.timestamp || 0;
            return timeB - timeA;
        });

        if (logs.length === 0) {
            logList.innerHTML = "<p style='text-align:center; padding:20px; color:#888;'>등록된 기록이 없습니다.</p>";
            return;
        }

        // 최신 5개만 잘라서 화면에 렌더링
        logs.slice(0, 5).forEach(log => {
            const item = document.createElement("div");
            item.className = "log-item";
            item.innerHTML = `
                <div class="log-header">
                    <span class="log-version">${escapeHtml(log.version || '')}</span>
                    <span class="log-date">${escapeHtml(log.date || '')}</span>
                </div>
                <div class="log-text">${escapeHtml(log.content || '')}</div>`;
            logList.appendChild(item);
        });
    } catch (error) {
        console.error("업데이트 로그 로드 에러:", error);
        logList.innerHTML = "<p style='text-align:center; padding:20px; color:#888;'>로그를 불러올 수 없습니다.</p>";
    }
}

// 7. 관리자: 공지 수정 (자체 서버 전송 버전)
async function saveProgram() {
    const text = document.getElementById("weekProgramInput").value;
    if(!text) return alert("내용을 입력하세요.");
    if(!currentUser) return alert("로그인이 필요합니다.");

    try {
        // 보안 및 권한 검증을 위해 Firebase 위조 방지 토큰(JWT) 획득
        const idToken = await currentUser.getIdToken(true);

        const response = await fetch(`${API_BASE_URL}/api/program`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}` // 헤더에 인증 토큰 탑재
            },
            body: JSON.stringify({ text: text })
        });

        const result = await response.json();
        if (response.ok) {
            alert("공지가 수정되었습니다.");
            document.getElementById("weekProgramInput").value = "";
            loadProgram(); // 화면 새로고침
        } else {
            alert(`실패: ${result.message || "수정 권한이 없습니다."}`);
        }
    } catch(e) {
        console.error(e);
        alert("서버 통신 중 오류가 발생했습니다.");
    }
}

// 8. 관리자: 업데이트 로그 추가 (자체 서버 전송 버전 - 5개 초과 자동 처리는 백엔드가 담당)
async function addUpdateLog() {
    const version = document.getElementById("updateVersion").value;
    const content = document.getElementById("updateContent").value;
    if(!version || !content) return alert("내용을 채워주세요.");
    if(!currentUser) return alert("로그인이 필요합니다.");

    try {
        const today = new Date().toISOString().split('T')[0];
        const idToken = await currentUser.getIdToken(true);

        const response = await fetch(`${API_BASE_URL}/api/update-logs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({
                version: version,
                content: content,
                date: today
            })
        });

        const result = await response.json();
        if (response.ok) {
            alert("로그가 등록되었습니다. (최신 5개 데이터 유지)");
            document.getElementById("updateVersion").value = "";
            document.getElementById("updateContent").value = "";
            loadUpdateLogs(); // 화면 새로고침
        } else {
            alert(`실패: ${result.message || "권한이 없거나 오류가 발생했습니다."}`);
        }
    } catch(e) {
        console.error(e);
        alert("서버 통신 중 오류가 발생했습니다.");
    }
}

// 입력창 엔터키 이벤트 리스너 (기존과 동일)
document.getElementById("weekProgramInput")?.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === 'Enter') saveProgram();
});

document.getElementById("updateVersion")?.addEventListener("keypress", function(e) {
    if (e.key === 'Enter') addUpdateLog();
});

document.getElementById("updateContent")?.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === 'Enter') addUpdateLog();
});

// 9. 사진 슬라이드 기능 (기존과 동일)
let slideIndex = 0;
function setupSlides() {
    const slides = document.querySelectorAll(".slide-item");
    if(slides.length === 0) return;
    const pauseButton = document.getElementById("slidePauseBtn");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let isPaused = reduceMotion;

    window.changeSlide = (n) => {
        slides.forEach(s => s.classList.remove("active"));
        slideIndex = (slideIndex + n + slides.length) % slides.length;
        slides[slideIndex].classList.add("active");
    };

    const stopSlides = () => {
        if (window.slideInterval) {
            clearInterval(window.slideInterval);
            window.slideInterval = null;
        }
    };
    const startSlides = () => {
        stopSlides();
        if (!isPaused && !document.hidden) {
            window.slideInterval = setInterval(() => window.changeSlide(1), 4000);
        }
    };
    const updatePauseButton = () => {
        if (!pauseButton) return;
        pauseButton.textContent = isPaused ? "재생" : "일시정지";
        pauseButton.setAttribute("aria-pressed", String(isPaused));
    };

    pauseButton?.addEventListener("click", () => {
        isPaused = !isPaused;
        updatePauseButton();
        startSlides();
    });
    document.addEventListener("visibilitychange", startSlides);
    updatePauseButton();
    startSlides();
}
setupSlides();

// 10. 로그아웃 (기존과 동일)
window.logout = () => {
    if(confirm("로그아웃 하시겠습니까?")) {
        auth.signOut().then(() => location.reload());
    }
};
