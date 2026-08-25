import { apiRequest, auth, getCurrentProfile, logoutTo } from "./common.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const SUGGESTION_ROLES = new Set([
    "admin", "teacher", "student"
]);

const loginLink = document.getElementById("login-link");
const logoutBtn = document.getElementById("logout-btn");
const userNameDisplay = document.getElementById("user-name");
const form = document.getElementById("suggestion-form");
const nameInput = document.getElementById("user-name-input");
const anonCheck = document.getElementById("anon-check");
const anonymousOption = document.getElementById("anonymous-option");
const categorySelect = document.getElementById("category");
const authorityFields = document.getElementById("authority-fields");
const roleSelect = document.getElementById("request-role");
const subjectGroup = document.getElementById("subject-input-group");
const subjectInput = document.getElementById("subject");
const contentInput = document.getElementById("content");
const contentLabel = document.getElementById("content-label");
const submitButton = document.querySelector(".submit-btn");

let currentUser = null;
let currentProfile = null;

logoutBtn.addEventListener("click", () => logoutTo());
categorySelect.addEventListener("change", applyCategoryMode);
anonCheck.addEventListener("change", syncAnonymousState);

onAuthStateChanged(auth, async user => {
    if (!user) {
        location.replace("block.html");
        return;
    }
    try {
        currentUser = user;
        currentProfile = await getCurrentProfile(user);
        loginLink.style.display = "none";
        userNameDisplay.style.display = "inline";
        userNameDisplay.textContent = `${currentProfile.name || "사용자"}님`;
        logoutBtn.style.display = "inline";
        nameInput.value = currentProfile.name || "";

        if (!SUGGESTION_ROLES.has(currentProfile.role)) {
            [...categorySelect.options].forEach(option => {
                if (option.value !== "등급 조정") option.remove();
            });
            categorySelect.value = "등급 조정";
            categorySelect.disabled = true;
        } else if (new URLSearchParams(location.search).get("category") === "authority") {
            categorySelect.value = "등급 조정";
        }
        applyCategoryMode();
    } catch (error) {
        console.error(error);
        location.replace("block.html");
    }
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentUser) return;
    const authorityMode = categorySelect.value === "등급 조정";
    submitButton.disabled = true;
    submitButton.textContent = authorityMode ? "요청 중..." : "제출 중...";
    try {
        if (authorityMode) {
            await submitAuthorityRequest();
            alert("등급 조정 요청이 제출되었습니다.");
            location.href = "mypage.html";
            return;
        }
        await submitSuggestion();
        alert("소중한 의견이 제출되었습니다. 관리자가 확인 후 반영하겠습니다.");
        form.reset();
        nameInput.value = currentProfile?.name || "";
        applyCategoryMode();
    } catch (error) {
        alert(`제출 중 오류가 발생했습니다: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = authorityMode ? "등급 조정 요청" : "제출하기";
    }
});

async function submitAuthorityRequest() {
    const response = await apiRequest("/api/jhimap/authority-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: nameInput.value.trim(),
            requestedRole: roleSelect.value,
            reason: contentInput.value.trim()
        })
    }, currentUser);
    return response.json();
}

async function submitSuggestion() {
    const isAnonymous = anonCheck.checked;
    const response = await apiRequest("/api/jhimap/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            authorName: isAnonymous ? "익명" : nameInput.value.trim(),
            isAnonymous,
            category: categorySelect.value,
            subject: subjectInput.value.trim(),
            content: contentInput.value.trim(),
            userEmail: currentUser.email
        })
    }, currentUser);
    return response.json();
}

function applyCategoryMode() {
    const authorityMode = categorySelect.value === "등급 조정";
    authorityFields.hidden = !authorityMode;
    anonymousOption.hidden = authorityMode;
    subjectGroup.hidden = authorityMode;
    subjectInput.required = !authorityMode;
    roleSelect.required = authorityMode;
    anonCheck.checked = authorityMode ? false : anonCheck.checked;
    contentLabel.textContent = authorityMode ? "요청 사유" : "내용";
    contentInput.placeholder = authorityMode
        ? "등급 조정이 필요한 이유를 작성해주세요."
        : "건의 내용을 상세히 작성해주세요.";
    submitButton.textContent = authorityMode ? "등급 조정 요청" : "제출하기";
    syncAnonymousState();
}

function syncAnonymousState() {
    const anonymous = !anonymousOption.hidden && anonCheck.checked;
    nameInput.disabled = anonymous;
    nameInput.required = !anonymous;
    nameInput.placeholder = anonymous ? "익명으로 안전하게 제출합니다" : "성함을 입력하세요";
    if (anonymous) nameInput.value = "";
    else if (!nameInput.value && currentProfile) nameInput.value = currentProfile.name || "";
}
