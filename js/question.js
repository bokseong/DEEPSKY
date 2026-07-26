let currentUser = null;
let currentUserName = "익명";
let currentUserRole = "guest";
let cachedData = null;
let questionDraft = null;

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    const status = document.getElementById("userStatus");
    if (user) {
        try {
            const userData = await getServerUserProfile(user);
            currentUserName = userData.name || user.displayName || user.email.split('@')[0];
            currentUserRole = normalizeRole(userData.role);
            if (status) status.innerText = `${currentUserName}님 (${currentUserRole==='admin'?'관리자':(currentUserRole==='student'?'부원':'일반')})`;
            if (!questionDraft) {
                questionDraft = setupDraftAutosave({
                    key: `deepsky:draft:question:${currentUser.uid}`,
                    fields: { content: "#qInput" }
                });
            }
            renderList(cachedData);
        } catch (error) {
            if (status) status.innerText = error.message;
        }
        document.getElementById("loginBtn")?.classList.add("hidden");
        document.getElementById("logoutBtn")?.classList.remove("hidden");
    } else {
        currentUserName = "익명";
        currentUserRole = "guest";
        if (status) status.innerText = "로그인 해주세요";
        document.getElementById("loginBtn")?.classList.remove("hidden");
        document.getElementById("logoutBtn")?.classList.add("hidden");
        renderList(cachedData);
    }
    loadQuestions();
});

// 💡 질문 리스트 로드 (자체 5001번 ngrok 서버와 실시간으로 실존 연동)
async function loadQuestions() {
    try {
        // ngrok 우회 헤더 마법의 주문 탑재 및 백엔드 GET 호출
        const response = await fetch(`${API_BASE_URL}/api/questions`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error("서버에서 질문을 읽어오지 못했습니다.");

        cachedData = await response.json(); // 질문 내용(db에 question 구조) 받아옴
        renderList(cachedData);
    } catch (error) {
        console.error("질문 로드 실패:", error);
        document.getElementById("questionList").innerHTML = `<p style="text-align:center; color:#ff4d4d;">서버 연동 오류 (백엔드가 오프라인 상태일 수 있습니다.)</p>`;
    }
}

// 💡 새로운 질문 등록 (자체 5001번 ngrok 서버 연동 및 보안 규칙 매칭 버전)
async function addQuestion() {
    if (!currentUser) return showToast("로그인 후 질문을 등록할 수 있습니다.", "error");
    const textInput = document.getElementById("qInput");
    const text = textInput.value.trim();
    if(!text) return showToast("질문을 입력해 주세요.", "error");

    try {
        // 보안 규칙을 통과하고 우분투 DB에 question 항목으로 적재될 데이터 구조화
        const newPost = {
            content: text,
            author: currentUserName,
            timestamp: Date.now(),
            date: new Date().toLocaleDateString('ko-KR')
        };

        // 백엔드로 POST 전송
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/questions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            },
            body: JSON.stringify(newPost)
        });

        if(!response.ok) throw new Error("서버 저장에 실패했습니다.");

        textInput.value = "";
        questionDraft?.clear();
        showToast("질문을 등록했습니다.", "success");
        loadQuestions(); // 갱신된 리스트 새로 불러오기
    } catch (err) {
        showToast(err.message || "질문 등록에 실패했습니다.", "error");
    }
}

// 💡 답변 등록 (각 질문 내부 하위 항목에 replies-reply 배열 형식 구조화 연동)
async function saveAnswer(qKey, answerInput) {
    if(currentUserRole !== 'admin' && currentUserRole !== 'student') return alert("답변 권한이 없습니다.");
    const ansInput = answerInput;
    if (!ansInput) return alert("답변 입력창을 찾을 수 없습니다.");
    const ansText = ansInput.value.trim();
    if(!ansText) return alert("내용을 입력하세요.");

    try {
        // 특정 qKey 질문의 하위 replies 경로로 POST 통신 진행
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/questions/${encodeURIComponent(String(qKey))}/replies`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            },
            body: JSON.stringify({
                content: ansText,
                author: currentUserName,
                date: new Date().toISOString()
            })
        });

        if(!response.ok) throw new Error("서버에 답변을 추가하지 못했습니다.");

        ansInput.value = "";
        loadQuestions(); // 등록 완료 후 갱신
    } catch (err) {
        alert("등록 실패.");
    }
}

// 💡 화면 렌더링 로직 (기존 HTML 돔 구조 및 CSS 속성 완벽 호환)
function renderList(data) {
    const list = document.getElementById("questionList");
    const searchTerm = document.getElementById("qSearch").value.toLowerCase();
    list.innerHTML = "";
    if(!data || Object.keys(data).length === 0) {
        list.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">등록된 질문이 없습니다.</p>`;
        return;
    }

    const canReply = (currentUserRole === 'admin' || currentUserRole === 'student');
    const isAdmin = currentUserRole === 'admin';

    // 파이어베이스 기존 실시간 내림차순 정렬 로직 보존하며 렌더링
    Object.keys(data).reverse().forEach(qKey => {
        const q = data[qKey];
        const questionText = String(q.content || q.text || "");
        const questionAuthor = String(q.author || "익명");
        const isQAuthor = currentUser && q.email !== "anonymous" && currentUser.email === q.email;

        // 검색 필터 검증 (질문 본문, 작성자 명칭 포함 여부 검사)
        if (searchTerm && !questionText.toLowerCase().includes(searchTerm) && !questionAuthor.toLowerCase().includes(searchTerm)) return;

        const repliesContainer = document.createElement("div");
        repliesContainer.className = "replies-container";
        if (q.replies) {
            Object.keys(q.replies).forEach(rKey => {
                const r = q.replies[rKey];
                const replyText = r.content || r.text || "";
                const canDeleteReply = isAdmin || (currentUser && currentUser.email === r.email) || isQAuthor;

                const answerBox = document.createElement("div");
                answerBox.className = "ans-box";
                const answerContent = document.createElement("div");
                answerContent.className = "ans-content";
                const answerLabel = document.createElement("b");
                answerLabel.textContent = "A. ";
                const answerText = document.createTextNode(String(replyText));
                const lineBreak = document.createElement("br");
                const answerAuthor = document.createElement("span");
                answerAuthor.className = "ans-author";
                answerAuthor.textContent = `- ${r.author || '익명'}`;
                answerContent.append(answerLabel, answerText, lineBreak, answerAuthor);
                answerBox.appendChild(answerContent);

                if (canDeleteReply) {
                    const deleteReplyButton = document.createElement("button");
                    deleteReplyButton.type = "button";
                    deleteReplyButton.className = "btn-ans-del";
                    deleteReplyButton.textContent = "삭제";
                    deleteReplyButton.addEventListener("click", () => deleteAnswer(qKey, rKey));
                    answerBox.appendChild(deleteReplyButton);
                }
                repliesContainer.appendChild(answerBox);
            });
        }

        const card = document.createElement("div");
        card.className = "q-card";
        card.id = `question-${qKey}`;
        const canDeleteQuestion = isAdmin || isQAuthor;

        const meta = document.createElement("div");
        meta.className = "q-meta";
        meta.textContent = questionAuthor;
        const question = document.createElement("span");
        question.className = "q-text";
        question.textContent = `Q. ${questionText}`;
        card.append(meta, question, repliesContainer);

        if (canReply || canDeleteQuestion) {
            const controls = document.createElement("div");
            controls.className = "answer-controls";
            if (!canReply) controls.style.justifyContent = "flex-end";

            if (canReply) {
                const answerInput = document.createElement("input");
                answerInput.type = "text";
                answerInput.placeholder = "답글 입력...";
                answerInput.setAttribute("aria-label", "답글");
                answerInput.addEventListener("keydown", event => {
                    if (event.key === "Enter") saveAnswer(qKey, answerInput);
                });
                const answerButton = document.createElement("button");
                answerButton.type = "button";
                answerButton.className = "btn-ans";
                answerButton.textContent = "등록";
                answerButton.addEventListener("click", () => saveAnswer(qKey, answerInput));
                controls.append(answerInput, answerButton);
            }

            if (canDeleteQuestion) {
                const deleteQuestionButton = document.createElement("button");
                deleteQuestionButton.type = "button";
                deleteQuestionButton.className = "btn-del";
                deleteQuestionButton.textContent = "삭제";
                deleteQuestionButton.addEventListener("click", () => deleteQuestion(qKey));
                controls.appendChild(deleteQuestionButton);
            }
            card.appendChild(controls);
        }
        list.appendChild(card);
    });
    const target = location.hash ? document.querySelector(location.hash) : null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
}

function filterQuestions() { renderList(cachedData); }

// 💡 질문 전전체 삭제 연동 함수
async function deleteQuestion(qKey) {
    if(!confirm("삭제하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/questions/${encodeURIComponent(String(qKey))}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error();
        alert("삭제되었습니다.");
        loadQuestions();
    } catch(e) {
        alert("삭제 권한이 없거나 서버 에러가 발생했습니다.");
    }
}

// 💡 답글 단일 삭제 연동 함수
async function deleteAnswer(qKey, rKey) {
    if(!confirm("삭제하시겠습니까?")) return;
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`${API_BASE_URL}/api/questions/${encodeURIComponent(String(qKey))}/replies/${encodeURIComponent(String(rKey))}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "ngrok-skip-browser-warning": "69420"
            }
        });
        if (!response.ok) throw new Error();
        alert("삭제되었습니다.");
        loadQuestions();
    } catch(e) {
        alert("답변 삭제 권한이 없거나 실패했습니다.");
    }
}

function logout() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut().then(() => location.reload()); }
