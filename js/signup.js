import { auth, authPersistenceReady, updateCurrentProfile } from "./common.js?v=20260826-session-auth";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

onAuthStateChanged(auth,user=>{
  if(!user)return;
  const emailInput=document.getElementById("email");
  emailInput.value=user.email||"";
  emailInput.readOnly=true;
  [
    ["password", "password-label"],
    ["password-confirm", "password-confirm-label"]
  ].forEach(([inputId, labelId])=>{
    const input=document.getElementById(inputId);
    input.required=false;
    input.hidden=true;
    document.getElementById(labelId).hidden=true;
  });
});
document.getElementById("signup-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=document.getElementById("submit-btn");
  btn.disabled=true;
  try{
    if(!await authPersistenceReady)throw new Error("세션 로그인 설정에 실패했습니다.");
    const name=document.getElementById("name").value.trim();
    const email=document.getElementById("email").value.trim();
    const existingGoogleUser=auth.currentUser&&auth.currentUser.email===email;
    const password=document.getElementById("password").value;
    const passwordConfirm=document.getElementById("password-confirm").value;
    if(!name)throw new Error("이름을 입력해 주세요.");
    if(!existingGoogleUser&&password!==passwordConfirm)throw new Error("비밀번호가 서로 일치하지 않습니다.");
    const user=existingGoogleUser?auth.currentUser:(await createUserWithEmailAndPassword(auth,email,password)).user;
    await updateCurrentProfile({name},user);
    if(!user.emailVerified)await sendEmailVerification(user);
    alert(user.emailVerified?"회원 정보가 등록되었습니다.":"Signup complete. Verify your email before logging in.");
    location.href="login.html";
  }catch(err){
    alert("Signup failed: "+err.message);
  }finally{
    btn.disabled=false;
  }
});
