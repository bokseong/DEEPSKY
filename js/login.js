import { apiRequest, auth, authPersistenceReady } from "./common.js?v=20260826-session-auth";
import { signInWithEmailAndPassword, GithubAuthProvider, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

async function continueAfterAuthentication(user) {
    if (!user.emailVerified) {
        location.href = "signup.html";
        return;
    }
    const response = await apiRequest("/api/deepsky/account-status", {}, user);
    if (!response.ok) throw new Error("계정 상태를 확인할 수 없습니다.");
    const account = await response.json();
    location.href = account.exists ? "index.html" : "signup.html";
}

document.getElementById("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("login-btn");
    button.disabled = true;
    button.textContent = "로그인 중...";
    try {
        if (!await authPersistenceReady) throw new Error("세션 로그인 설정에 실패했습니다.");
        const credential = await signInWithEmailAndPassword(
            auth,
            document.getElementById("email").value.trim(),
            document.getElementById("password").value
        );
        if (!credential.user.emailVerified) {
            alert("이메일 인증이 필요합니다.");
            await signOut(auth);
            return;
        }
        await continueAfterAuthentication(credential.user);
    } catch (error) {
        if (error?.code === "auth/user-not-found") {
            location.href = "signup.html";
            return;
        }
        alert("로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.");
    } finally {
        button.disabled = false;
        button.textContent = "로그인";
    }
});

document.getElementById("google-btn").addEventListener("click", async () => {
    try {
        if (!await authPersistenceReady) throw new Error("세션 로그인 설정에 실패했습니다.");
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        await continueAfterAuthentication(credential.user);
    } catch (error) {
        alert("Google 로그인에 실패했습니다.");
    }
});

document.getElementById("github-btn").addEventListener("click", async () => {
    try {
        if (!await authPersistenceReady) throw new Error("세션 로그인 설정에 실패했습니다.");
        const provider = new GithubAuthProvider();
        provider.addScope("read:user");
        provider.addScope("user:email");
        const credential = await signInWithPopup(auth, provider);
        await continueAfterAuthentication(credential.user);
    } catch (error) {
        if (error?.code === "auth/account-exists-with-different-credential") {
            alert("같은 이메일로 가입된 계정이 있습니다. 기존 로그인 방식을 사용해 주세요.");
            return;
        }
        if (error?.code === "auth/operation-not-allowed") {
            alert("GitHub 로그인이 아직 서버에서 활성화되지 않았습니다.");
            return;
        }
        if (error?.code !== "auth/popup-closed-by-user") alert("GitHub 로그인에 실패했습니다.");
    }
});

document.getElementById("reset-btn").addEventListener("click", async () => {
    const email = prompt("이메일 주소를 입력해 주세요.");
    if (!email) return;
    try {
        await sendPasswordResetEmail(auth, email);
        alert("비밀번호 재설정 메일을 보냈습니다.");
    } catch (error) {
        alert("비밀번호 재설정 메일을 보내지 못했습니다.");
    }
});
