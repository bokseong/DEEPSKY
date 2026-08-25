import { auth, getCurrentProfile } from "./common.js";
import { initializeAnnouncementSection } from "./announcement-manager.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const section = document.getElementById("announcement-board");
const container = document.getElementById("announcement-list");
const loginLink = document.getElementById("login-link");
const logoutButton = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");

logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    location.reload();
});

onAuthStateChanged(auth, async user => {
    if (!user) {
        loginLink.hidden = false;
        logoutButton.hidden = true;
        userName.hidden = true;
        await initializeAnnouncementSection({
            section,
            container,
            scope: "all",
            emptyMessage: "등록된 공지사항이 없습니다."
        });
        return;
    }

    const profile = await getCurrentProfile(user);
    loginLink.hidden = true;
    logoutButton.hidden = false;
    userName.hidden = false;
    userName.textContent = `${profile.name || user.displayName || "사용자"}님`;
    await initializeAnnouncementSection({
        section,
        container,
        user,
        profile,
        scope: "all",
        emptyMessage: "등록된 공지사항이 없습니다."
    });
});
