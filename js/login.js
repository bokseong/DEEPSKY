    const googleProvider = new firebase.auth.GoogleAuthProvider();
    const githubProvider = new firebase.auth.GithubAuthProvider();

    // ------------------------------------------------
    // [추가] 엔터키 이벤트 리스너
    // ------------------------------------------------

    // 이름 입력창에서 엔터 -> 회원가입 시도
    document.getElementById("name").addEventListener("keypress", function(e) {
        if (e.key === 'Enter') signup();
    });

    // 이메일 입력창에서 엔터 -> 로그인 시도
    document.getElementById("email").addEventListener("keypress", function(e) {
        if (e.key === 'Enter') login();
    });

    // 비밀번호 입력창에서 엔터 -> 로그인 시도
    document.getElementById("password").addEventListener("keypress", function(e) {
        if (e.key === 'Enter') login();
    });

    // ------------------------------------------------

    // 3. 구글 로그인
    function googleLogin() {
        auth.signInWithPopup(googleProvider)
            .then(async (result) => {
                const user = result.user;
                return syncServerUserProfile(user, user.displayName || "구글 사용자");
            })
            .then(() => {
                alert("환영합니다!");
                location.href = "index.html";
            })
            .catch((error) => handleAuthError(error));
    }

    // 4. 깃허브 로그인
    function githubLogin() {
        auth.signInWithPopup(githubProvider)
            .then(async (result) => {
                const user = result.user;
                return syncServerUserProfile(user, user.displayName || "GitHub 유저");
            })
            .then(() => {
                alert("환영합니다!");
                location.href = "index.html";
            })
            .catch((error) => handleAuthError(error));
    }

    // 5. 에러 핸들러
    function handleAuthError(error) {
        console.error("Auth Error:", error);
        if (error.code === 'auth/internal-error') {
            alert("Firebase 내부 오류입니다. \n승인된 도메인 및 활성화 여부를 확인하세요.");
        } else if (error.code === 'auth/account-exists-with-different-credential') {
            alert("이미 다른 방식으로 가입된 이메일입니다.");
        } else if (error.code === 'auth/popup-closed-by-user') {
            // 팝업 닫힘
        } else {
            alert("오류 발생: " + error.message);
        }
    }

    // 6. 이메일 회원가입
    function signup() {
        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const pw = document.getElementById("password").value.trim();
        if(!name || !email || !pw) return alert("회원가입을 위해 모든 항목을 입력해주세요.");

        auth.createUserWithEmailAndPassword(email, pw)
            .then(async result => {
                const user = result.user;
                await user.updateProfile({ displayName: name });
                await syncServerUserProfile(user, name);
                return user.sendEmailVerification();
            })
            .then(() => auth.signOut())
            .then(() => {
                alert("가입 성공! 메일함을 확인하여 인증을 완료해주세요.");
                location.href = "login.html";
            })
            .catch(err => alert("가입 실패: " + err.message));
    }

    // 7. 이메일 로그인
    function login() {
        const email = document.getElementById("email").value.trim();
        const pw = document.getElementById("password").value.trim();
        if(!email || !pw) return alert("이메일과 비밀번호를 입력해주세요.");

        auth.signInWithEmailAndPassword(email, pw)
            .then(async result => {
                if (!result.user.emailVerified) {
                    alert("이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.");
                    await auth.signOut();
                } else {
                    const profile = await getServerUserProfile(result.user);
                    await syncServerUserProfile(result.user, profile.name);
                    alert("로그인 성공!");
                    location.href = "index.html";
                }
            })
            .catch(err => alert("로그인 실패: 이메일 또는 비밀번호를 확인하세요."));
    }

    // 8. 비밀번호 찾기
    function resetPassword() {
        const email = document.getElementById("email").value.trim();
        if (!email) return alert("이메일을 먼저 입력해주세요.");
        auth.sendPasswordResetEmail(email)
            .then(() => alert("비밀번호 재설정 메일을 보냈습니다."))
            .catch(err => alert("에러: " + err.message));
    }
