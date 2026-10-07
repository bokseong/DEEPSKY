import { auth, getCurrentProfile, loginWithReturnUrl, safeInternalReturnTarget } from "./common.js?v=20261007-return-after-login";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
const queryTarget=safeInternalReturnTarget(new URLSearchParams(location.search).get("returnTo"));
const referrerTarget=safeInternalReturnTarget(document.referrer);
const returnTarget=queryTarget||referrerTarget;
document.querySelectorAll('a[href="login.html"]').forEach(link=>{link.href=loginWithReturnUrl(returnTarget);});
const loginLink=document.getElementById("login-link"),logoutBtn=document.getElementById("logout-btn"),userName=document.getElementById("user-name");logoutBtn?.addEventListener("click",async()=>{await signOut(auth);location.href="index.html";});onAuthStateChanged(auth,async user=>{if(!user)return;const data=await getCurrentProfile(user);loginLink.style.display="none";logoutBtn.style.display="inline";userName.style.display="inline";userName.textContent=`${data.name||user.displayName||"사용자"}`;});
