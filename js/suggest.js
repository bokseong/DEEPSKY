let currentUser = null;
let currentUserRole = "guest";
let currentUserName = "익명";

auth.onAuthStateChanged(async (user) => {
    const status = document.getElementById("userStatus");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (user) {
        currentUser = user;
        loginBtn?.classList.add("hidden");
        logoutBtn?.classList.remove("hidden");
        try {
            const userData = await getServerUserProfile(user);
            currentUserRole = normalizeRole(userData.role);
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            if (status) status.innerText = `${currentUserName}님 (${getRoleName(currentUserRole)})`;

            if(currentUserRole === 'admin' || currentUserRole === 'student') {
                setProtectedPageAccess({ allowed: true });
                loadSuggestions();
            } else {
                setProtectedPageAccess({
                    allowed: false,
                    title: "접근 제한",
                    message: "건의함은 동아리 부원 이상만 접근할 수 있습니다.",
                    action: "role"
                });
            }
        } catch (error) {
            if (status) status.innerText = error.message;
            setProtectedPageAccess({
                allowed: false,
                title: "권한 확인 실패",
                message: "서버에서 권한 정보를 확인하지 못했습니다.",
                action: "retry"
            });
        }
    } else {
        currentUser = null;
        currentUserRole = "guest";
        if (status) status.innerText = "로그인이 필요합니다";
        loginBtn?.classList.remove("hidden");
        logoutBtn?.classList.add("hidden");
        setProtectedPageAccess({
            allowed: false,
            title: "회원 전용 공간",
            message: "건의함을 이용하려면 로그인해 주세요.",
            action: "login"
        });
    }
});

async function addSuggestion() {
const content = document.getElementById("sInput").value.trim();
if(!content) return alert("건의 내용을 입력하세요.");

     const isAnon = document.getElementById("sAnon")?.checked;
     const authorName = isAnon ? "익명" : currentUserName;

     try {
         const token = await currentUser.getIdToken();
         const response = await fetch(`${API_BASE_URL}/api/suggests`, {
             method: "POST",
             headers: {
                 "Content-Type": "application/json",
                 "Authorization": `Bearer ${token}`,
                 "ngrok-skip-browser-warning": "69420"
             },
             body: JSON.stringify({
                 title: "건의사항", // HTML에 제목 칸이 없으므로 기본값 지정
                 content: content,
                 author: authorName,
                 uid: currentUser.uid,
                 date: new Date().toLocaleDateString()
             })
         });
         if (!response.ok) throw new Error("건의 등록 실패");
         alert("건의가 성공적으로 접수되었습니다!");
         document.getElementById("sInput").value = "";
         if(document.getElementById("sAnon")) document.getElementById("sAnon").checked = false;

         if(currentUserRole === 'admin' || currentUserRole === 'student') loadSuggestions();
     } catch (err) { alert("접수 중 에러가 발생했습니다."); }
 }
async function submitSuggest() {
    const title = document.getElementById("sTitle").value;
    const content = document.getElementById("sContent").value;
    if(!title || !content) return alert("내용을 입력하세요.");

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/suggests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            },
            body: JSON.stringify({
                title: title, content: content,
                author: currentUser.email.split('@')[0],
                uid: currentUser.uid, date: new Date().toLocaleDateString()
            })
        });
        if (!response.ok) throw new Error("건의 등록 실패");
        alert("건의가 접수되었습니다!");
        if(currentUserRole === 'admin' || currentUserRole === 'student') loadSuggestions();
    } catch (err) { alert("접수 에러"); }
}

async function deleteSuggest(id) {
    if(confirm("삭제하시겠습니까?")) {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/suggests/${encodeURIComponent(String(id))}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) return alert("삭제 권한이 없거나 삭제에 실패했습니다.");
        loadSuggestions();
    }
}

    function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
