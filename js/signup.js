import { auth, updateCurrentProfile } from "./common.js";
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

onAuthStateChanged(auth,user=>{
  if(!user)return;
  const emailInput=document.getElementById("email");
  const passwordInput=document.getElementById("password");
  emailInput.value=user.email||"";
  emailInput.readOnly=true;
  passwordInput.required=false;
  passwordInput.style.display="none";
  if(passwordInput.previousElementSibling)passwordInput.previousElementSibling.style.display="none";
});
document.getElementById("signup-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const btn=document.getElementById("submit-btn");
  btn.disabled=true;
  try{
    const name=document.getElementById("name").value.trim();
    const school=document.getElementById("school").value;
    const email=document.getElementById("email").value.trim();
    const existingGoogleUser=auth.currentUser&&auth.currentUser.email===email;
    const user=existingGoogleUser?auth.currentUser:(await createUserWithEmailAndPassword(auth,email,document.getElementById("password").value)).user;
    await updateCurrentProfile({name,school},user);
    if(!user.emailVerified)await sendEmailVerification(user);
    alert(user.emailVerified?"회원 정보가 등록되었습니다.":"Signup complete. Verify your email before logging in.");
    location.href="login.html";
  }catch(err){
    alert("Signup failed: "+err.message);
  }finally{
    btn.disabled=false;
  }
});
