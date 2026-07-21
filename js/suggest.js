let currentUser = null;
let currentUserRole = "guest";
let currentUserName = "익명";

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        db.ref('users/' + user.uid).on('value', (snapshot) => {
            const userData = snapshot.val() || {};
            currentUserRole = (user.email === ADMIN_EMAIL) ? 'admin' : (userData.role || 'member');
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];

            // 열람은 학생 이상만 가능
            if(currentUserRole === 'admin' || currentUserRole === 'student') {
                loadSuggestions();
            } else {
                document.getElementById("suggestList").innerHTML = "<p>건의함 내용은 동아리원 이상 열람 가능합니다. 작성만 가능합니다.</p>";
            }
        });
    } else {
        location.href = "index.html";
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
        const response = await fetch(`${API_BASE_URL}/api/suggests/${id}`, {
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
