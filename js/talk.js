import { auth, getCurrentPermissions, getCurrentProfile } from "./common.js";
import { initializeAnnouncementSection } from "./announcement-manager.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
let userDataCache=null;
let permissionCache={};

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
        permissionCache=await getCurrentPermissions(null);
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

    [userDataCache,permissionCache]=await Promise.all([
        getCurrentProfile(user),
        getCurrentPermissions(user)
    ]);
    loginLink.style.display="none";
    logoutBtn.style.display="inline-flex";
    userName.style.display="inline";
    userName.textContent=userDataCache.name||user.displayName||"사용자";
    await initializeAnnouncementSection({
        section: document.getElementById("talk-announcement-section"),
        container: document.getElementById("talk-announcement-list"),
        user,
        profile: userDataCache,
        scope: "all",
        emptyMessage: "등록된 전체 공지가 없습니다."
    });
});

window.gateCheck=(targetUrl)=>{
    if(!auth.currentUser){
        location.href="block.html";
        return;
    }
    if(!userDataCache){
        alert("권한 정보를 불러오는 중입니다. 잠시 후 다시 시도하세요.");
        return;
    }
    const requiredPermission=targetUrl.includes("school-write.html")?"boards.write.school":"boards.read.school";
    if(permissionCache[requiredPermission]){
        location.href=targetUrl;
        return;
    }
    location.href="block.html";
};
