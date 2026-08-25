import { auth, getCurrentProfile } from "./common.js";
import { initializeAnnouncementSection } from "./announcement-manager.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
let userDataCache=null;

const loginLink=document.getElementById("login-link");
const logoutBtn=document.getElementById("logout-btn");
const userName=document.getElementById("user-name");

logoutBtn.addEventListener("click",async()=>{
    await signOut(auth);
    location.reload();
});

onAuthStateChanged(auth,async user=>{
    if(!user){
        userDataCache=null;
        loginLink.style.display="inline-flex";
        logoutBtn.style.display="none";
        userName.style.display="none";
        await initializeAnnouncementSection({
            section: document.getElementById("talk-announcement-section"),
            container: document.getElementById("talk-announcement-list"),
            scope: "all",
            emptyMessage: "등록된 전체 공지가 없습니다."
        });
        return;
    }

    userDataCache=await getCurrentProfile(user);
    loginLink.style.display="none";
    logoutBtn.style.display="inline-flex";
    userName.style.display="inline";
    userName.textContent=userDataCache.name||user.displayName||"User";
    await initializeAnnouncementSection({
        section: document.getElementById("talk-announcement-section"),
        container: document.getElementById("talk-announcement-list"),
        user,
        profile: userDataCache,
        scope: "all",
        emptyMessage: "등록된 전체 공지가 없습니다."
    });
});

window.gateCheck=(targetUrl,studentRole,leaderRole)=>{
    if(!auth.currentUser){
        location.href="block.html";
        return;
    }
    if(!userDataCache){
        alert("권한 정보를 불러오는 중입니다. 잠시 후 다시 시도하세요.");
        return;
    }
    const role=userDataCache.role||"member";
    if(role==="admin"||role==="teacher"||role===studentRole||role===leaderRole){
        location.href=targetUrl;
        return;
    }
    location.href="block.html";
};
