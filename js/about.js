import { auth, getCurrentProfile, logoutTo } from "./common.js?v=20261007-return-after-login";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const loginLink = document.getElementById("login-link");
const logoutButton = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");

logoutButton?.addEventListener("click", () => logoutTo());

function showGuest() {
    loginLink.style.display = "inline";
    logoutButton.style.display = "none";
    userName.style.display = "none";
    userName.textContent = "";
}

function showMember(name) {
    loginLink.style.display = "none";
    logoutButton.style.display = "inline";
    userName.style.display = "inline";
    userName.textContent = `${name || "사용자"}님`;
}

onAuthStateChanged(auth, async user => {
    if (!user) {
        showGuest();
        return;
    }

    // Profile API가 일시적으로 응답하지 않아도 Firebase 로그인 세션을 로그아웃 상태로 보이지 않게 합니다.
    try {
        const profile = await getCurrentProfile(user);
        showMember(profile.name || user.displayName || user.email);
    } catch (error) {
        console.warn("회원 프로필을 불러오지 못해 Firebase 계정 표시를 사용합니다.", error);
        showMember(user.displayName || user.email);
    }
});
