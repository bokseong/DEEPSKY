import { apiRequest, auth, getCurrentProfile } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
const loginLink=document.getElementById("login-link");
const logoutBtn=document.getElementById("logout-btn");
const userName=document.getElementById("user-name");

logoutBtn?.addEventListener("click",async()=>{
  await signOut(auth);
  location.href="index.html";
});

onAuthStateChanged(auth,async user=>{
  if(!user) return;
  try {
    const data=await getCurrentProfile(user);
    loginLink.style.display="none";
    logoutBtn.style.display="inline-flex";
    userName.style.display="inline";
    userName.textContent=data.name||user.displayName||"User";
    const response = await apiRequest("/api/jhimap/dashboard", {}, user);
    renderDashboard(await response.json());
  } catch (error) {
    console.error(error);
  }
});

function renderDashboard(data) {
  document.getElementById("member-dashboard").hidden = false;
  document.getElementById("dashboard-unread").textContent = data.unread_notifications || 0;
  document.getElementById("dashboard-bookmarks").textContent = data.bookmark_count || 0;
  document.getElementById("dashboard-authority").textContent =
    requestStatusLabel(data.authority_request?.status);
  renderEvents(data.events || []);
  renderPosts(data.recent_posts || []);
}

function renderEvents(items) {
  const section = document.getElementById("dashboard-events-section");
  const list = document.getElementById("dashboard-event-list");
  section.hidden = false;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">예정된 관측 일정이 없습니다.</div>';
    return;
  }
  items.forEach(item => {
    const article = document.createElement("article");
    article.className = "feature-item";
    const link = document.createElement("a");
    link.href = `schedule.html#event-${item.id}`;
    const title = document.createElement("h3");
    title.textContent = item.title;
    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = `${formatDateTime(item.start_at)} · ${item.location || "장소 미정"} · 참여 ${item.participant_count || 0}명`;
    link.append(title, meta);
    article.appendChild(link);
    list.appendChild(article);
  });
}

function renderPosts(items) {
  const section = document.getElementById("dashboard-posts-section");
  const list = document.getElementById("dashboard-post-list");
  section.hidden = false;
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">확인할 수 있는 최근 자료가 없습니다.</div>';
    return;
  }
  items.forEach(item => {
    const article = document.createElement("article");
    article.className = "feature-item";
    const link = document.createElement("a");
    link.href = item.link;
    const title = document.createElement("h3");
    title.textContent = item.title || "제목 없음";
    const meta = document.createElement("div");
    meta.className = "item-meta";
    meta.textContent = `${item.category || "기타"} · ${item.author_name || "익명"} · ${formatDate(item.created_at)}`;
    link.append(title, meta);
    article.appendChild(link);
    list.appendChild(article);
  });
}

function requestStatusLabel(status) {
  return { pending: "대기", approved: "승인", rejected: "반려" }[status] || "없음";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("ko-KR") : "-";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}
