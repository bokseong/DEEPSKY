import { auth, getCurrentProfile } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const FORECAST_URL = new URL("https://api.open-meteo.com/v1/forecast");
FORECAST_URL.search = new URLSearchParams({
  latitude: "34.9506",
  longitude: "127.4872",
  current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_gusts_10m",
  daily: "sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  timezone: "Asia/Seoul",
  forecast_days: "3"
}).toString();

const status = document.getElementById("weather-status");
const refreshButton = document.getElementById("weather-refresh");
const loginLink = document.getElementById("login-link");
const logoutButton = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");

refreshButton.addEventListener("click", loadWeather);
logoutButton.addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });

onAuthStateChanged(auth, async user => {
  loginLink.hidden = Boolean(user);
  logoutButton.hidden = !user;
  userName.hidden = !user;
  if (!user) return;
  try {
    const profile = await getCurrentProfile(user);
    userName.textContent = `${profile.name || user.displayName || "사용자"}님`;
  } catch {
    userName.textContent = "로그인 사용자";
  }
});

loadWeather();

async function loadWeather() {
  refreshButton.disabled = true;
  refreshButton.textContent = "불러오는 중";
  status.textContent = "순천 최신 수치예보를 불러오는 중입니다.";
  status.classList.remove("error");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(FORECAST_URL, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`예보 서버 응답 오류 (${response.status})`);
    const data = await response.json();
    validateForecast(data);
    renderCurrent(data);
    renderNight(data);
    renderDaily(data);
    status.textContent = `예보 갱신 완료 · ${new Date().toLocaleString("ko-KR")}`;
  } catch (error) {
    console.error(error);
    status.textContent = error.name === "AbortError" ? "예보 서버 응답 시간이 초과되었습니다. 다시 시도해 주세요." : `날씨를 불러오지 못했습니다: ${error.message}`;
    status.classList.add("error");
  } finally {
    clearTimeout(timeout);
    refreshButton.disabled = false;
    refreshButton.textContent = "새로고침";
  }
}

function validateForecast(data) {
  if (!data?.current || !Array.isArray(data?.hourly?.time) || !Array.isArray(data?.daily?.time)) {
    throw new Error("예보 데이터 형식이 올바르지 않습니다.");
  }
}

function renderCurrent(data) {
  const current = data.current;
  const condition = weatherCondition(current.weather_code);
  document.getElementById("weather-icon").textContent = condition.icon;
  document.getElementById("current-weather-title").textContent = condition.label;
  document.getElementById("current-temperature").textContent = `${round(current.temperature_2m)}°`;
  document.getElementById("current-updated").textContent = `${formatDateTime(current.time)} 기준 · 순천 복성고등학교 인근`;
  setText("metric-cloud", `${round(current.cloud_cover)}%`);
  setText("metric-humidity", `${round(current.relative_humidity_2m)}%`);
  setText("metric-precipitation", `${number(current.precipitation, 1)} mm`);
  setText("metric-wind", `${number(current.wind_speed_10m, 1)} km/h ${windDirection(current.wind_direction_10m)}`);
  setText("metric-gust", `${number(current.wind_gusts_10m, 1)} km/h`);
  setText("metric-apparent", `${number(current.apparent_temperature, 1)}°C`);
}

function renderNight(data) {
  const entries = data.hourly.time.map((time, index) => ({
    time: new Date(time),
    index,
    cloud: data.hourly.cloud_cover[index],
    precipitationProbability: data.hourly.precipitation_probability[index],
    precipitation: data.hourly.precipitation[index],
    visibility: data.hourly.visibility[index],
    wind: data.hourly.wind_speed_10m[index],
    gust: data.hourly.wind_gusts_10m[index],
    weatherCode: data.hourly.weather_code[index]
  }));
  const now = new Date();
  const { start, end } = currentNightWindow(now);
  const nightEntries = entries.filter(item => item.time >= start && item.time <= end && isNightHour(item.time.getHours()));
  const selected = nightEntries.filter((_, index) => index % 2 === 0).slice(0, 7);
  const tbody = document.getElementById("night-forecast");
  tbody.replaceChildren();
  if (!selected.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "오늘 밤 예보 구간을 찾지 못했습니다.";
    row.appendChild(cell);
    tbody.appendChild(row);
    updateOverallScore([]);
    return;
  }
  document.getElementById("night-window").textContent = `${formatHour(selected[0].time)}–${formatHour(selected.at(-1).time)}`;
  selected.forEach(item => {
    const score = observingScore(item);
    const rating = scoreRating(score);
    const condition = weatherCondition(item.weatherCode);
    const row = document.createElement("tr");
    [
      `${formatDay(item.time)} ${formatHour(item.time)}`,
      `${condition.icon} ${condition.label}`,
      `${round(item.cloud)}%`,
      `${round(item.precipitationProbability)}%`,
      `${number(item.visibility / 1000, 1)} km`,
      `${number(item.wind, 1)} km/h`,
      rating.label
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 6) cell.className = `night-rating ${rating.className}`;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  updateOverallScore(selected);
}

function renderDaily(data) {
  const container = document.getElementById("daily-forecast");
  container.replaceChildren();
  data.daily.time.forEach((date, index) => {
    const condition = weatherCondition(data.daily.weather_code[index]);
    const card = document.createElement("article");
    card.className = "daily-card";
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = formatDate(date, index);
    const icon = document.createElement("span");
    icon.className = "daily-icon";
    icon.textContent = condition.icon;
    heading.append(title, icon);
    const temperature = document.createElement("strong");
    temperature.textContent = `${round(data.daily.temperature_2m_min[index])}° / ${round(data.daily.temperature_2m_max[index])}°`;
    const detail = document.createElement("p");
    detail.textContent = `${condition.label} · 강수 확률 ${round(data.daily.precipitation_probability_max[index])}%`;
    const sun = document.createElement("p");
    sun.textContent = `일출 ${formatHour(new Date(data.daily.sunrise[index]))} · 일몰 ${formatHour(new Date(data.daily.sunset[index]))}`;
    card.append(heading, temperature, detail, sun);
    container.appendChild(card);
  });
}

function updateOverallScore(entries) {
  const score = entries.length ? Math.round(entries.reduce((sum, item) => sum + observingScore(item), 0) / entries.length) : 0;
  const rating = scoreRating(score);
  const scoreElement = document.getElementById("observing-score");
  const label = document.getElementById("observing-label");
  const bar = document.getElementById("observing-score-bar");
  scoreElement.textContent = entries.length ? `${score}` : "-";
  label.textContent = entries.length ? rating.label : "계산 불가";
  label.className = rating.className;
  bar.style.width = `${score}%`;
  bar.style.background = rating.color;
  document.getElementById("observing-guide").textContent = entries.length ? rating.guide : "사용 가능한 야간 예보가 없습니다.";
}

function observingScore(item) {
  const cloudPenalty = clamp(item.cloud, 0, 100) * .58;
  const rainPenalty = clamp(item.precipitationProbability, 0, 100) * .28 + (item.precipitation > 0 ? 12 : 0);
  const windPenalty = Math.max(0, item.wind - 8) * 1.4 + Math.max(0, item.gust - 20) * .45;
  const visibilityKm = item.visibility / 1000;
  const visibilityPenalty = visibilityKm >= 20 ? 0 : Math.max(0, 20 - visibilityKm) * 1.2;
  return Math.round(clamp(100 - cloudPenalty - rainPenalty - windPenalty - visibilityPenalty, 0, 100));
}

function scoreRating(score) {
  if (score >= 78) return { label: "좋음", className: "rating-good", color: "var(--weather-good)", guide: "구름과 강수 위험이 낮아 관측을 계획하기 좋은 조건입니다." };
  if (score >= 58) return { label: "보통", className: "rating-fair", color: "var(--weather-fair)", guide: "관측은 가능하지만 시간대별 구름과 바람 변화를 확인하세요." };
  if (score >= 38) return { label: "주의", className: "rating-poor", color: "var(--weather-poor)", guide: "구름 또는 바람의 영향이 예상됩니다. 짧은 관측을 우선 검토하세요." };
  return { label: "어려움", className: "rating-bad", color: "var(--weather-bad)", guide: "구름·강수·시정 조건으로 관측 성공 가능성이 낮습니다." };
}

function weatherCondition(code) {
  if (code === 0) return { icon: "☀️", label: "맑음" };
  if ([1, 2].includes(code)) return { icon: "🌤️", label: "대체로 맑음" };
  if (code === 3) return { icon: "☁️", label: "흐림" };
  if ([45, 48].includes(code)) return { icon: "🌫️", label: "안개" };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: "🌦️", label: "이슬비" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: "🌧️", label: "비" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "🌨️", label: "눈" };
  if ([95, 96, 99].includes(code)) return { icon: "⛈️", label: "뇌우" };
  return { icon: "🌥️", label: "기상 변화" };
}

function isNightHour(hour) { return hour >= 18 || hour <= 6; }
function currentNightWindow(now) {
  const start = new Date(now);
  const end = new Date(now);
  if (now.getHours() <= 6) {
    end.setHours(6, 59, 59, 999);
  } else if (now.getHours() < 18) {
    start.setHours(18, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(6, 59, 59, 999);
  } else {
    end.setDate(end.getDate() + 1);
    end.setHours(6, 59, 59, 999);
  }
  return { start, end };
}
function windDirection(degrees) { return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round((Number(degrees) || 0) / 45) % 8]; }
function formatDateTime(value) { return new Date(value).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function formatHour(value) { return value.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function formatDay(value) { return value.toLocaleDateString("ko-KR", { weekday: "short" }); }
function formatDate(value, index) { return index === 0 ? "오늘" : new Date(value).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }); }
function number(value, digits = 0) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-"; }
function round(value) { return Number.isFinite(Number(value)) ? Math.round(Number(value)) : "-"; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function setText(id, value) { document.getElementById(id).textContent = value; }
