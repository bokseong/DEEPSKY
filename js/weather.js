import { apiFetch, auth, getCurrentProfile } from "./common.js";
import { getAstronomicalTwilight, getMoonInfo } from "./astronomy.js?v=20260925-observing-planner";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const DEFAULT_LOCATION = Object.freeze({
  key: "school",
  label: "순천 복성고등학교 인근",
  latitude: 34.9506,
  longitude: 127.4872
});
const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
const CACHE_PREFIX = "deepsky:weather-cache:v4";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_CONFIGS = Object.freeze({
  temperature: {
    label: "기온·체감온도·이슬점",
    unit: "°C",
    series: [
      { key: "temperature_2m", label: "기온", color: "#ffb45b", transform: value => value },
      { key: "apparent_temperature", label: "체감온도", color: "#ff6b75", transform: value => value },
      { key: "dew_point_2m", label: "이슬점", color: "#77bfff", transform: value => value }
    ]
  },
  pressure: {
    label: "지표면 기압",
    unit: "hPa",
    series: [{ key: "surface_pressure", label: "기압", color: "#c19cff", transform: value => value }]
  },
  moisture: {
    label: "습도·구름량",
    unit: "%",
    fixedRange: [0, 100],
    series: [
      { key: "relative_humidity_2m", label: "상대습도", color: "#52d49a", transform: value => value },
      { key: "cloud_cover", label: "구름량", color: "#aeb5b8", transform: value => value }
    ]
  },
  precipitationChance: {
    label: "강수 확률",
    unit: "%",
    fixedRange: [0, 100],
    series: [{ key: "precipitation_probability", label: "강수 확률", color: "#77bfff", transform: value => value }]
  },
  precipitationAmount: {
    label: "강수량",
    unit: "mm",
    minZero: true,
    series: [{ key: "precipitation", label: "강수량", color: "#52d49a", transform: value => value }]
  },
  wind: {
    label: "바람·돌풍",
    unit: "km/h",
    minZero: true,
    series: [
      { key: "wind_speed_10m", label: "바람", color: "#77bfff", transform: value => value },
      { key: "wind_gusts_10m", label: "돌풍", color: "#ff6b75", transform: value => value }
    ]
  },
  visibility: {
    label: "시정",
    unit: "km",
    minZero: true,
    series: [{ key: "visibility", label: "시정", color: "#52d49a", transform: value => value / 1000 }]
  }
});

const status = document.getElementById("weather-status");
const refreshButton = document.getElementById("weather-refresh");
const locationSelect = document.getElementById("weather-location");
const loginLink = document.getElementById("login-link");
const logoutButton = document.getElementById("logout-btn");
const userName = document.getElementById("user-name");
let activeLocation = { ...DEFAULT_LOCATION };
let latestForecast = null;
let activeChartMetric = "temperature";

refreshButton.addEventListener("click", () => loadWeather());
locationSelect.addEventListener("change", handleLocationChange);
logoutButton.addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });
document.querySelectorAll("[data-weather-metric]").forEach(button => {
  button.addEventListener("click", () => {
    activeChartMetric = button.dataset.weatherMetric;
    document.querySelectorAll("[data-weather-metric]").forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    if (latestForecast) renderForecastChart(latestForecast);
  });
});

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

initializeWeatherTools();
loadWeather();

function buildForecastUrl(locationData) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(locationData.latitude),
    longitude: String(locationData.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,surface_pressure,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly: "temperature_2m,apparent_temperature,dew_point_2m,surface_pressure,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_gusts_10m",
    daily: "sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "Asia/Seoul",
    past_hours: "24",
    forecast_hours: "73",
    forecast_days: "4"
  }).toString();
  return url;
}

async function handleLocationChange() {
  if (locationSelect.value === "school") {
    activeLocation = { ...DEFAULT_LOCATION };
    await loadWeather();
    return;
  }

  locationSelect.disabled = true;
  status.classList.remove("error");
  status.textContent = "현재 위치 사용 권한을 확인하고 있습니다.";
  try {
    const position = await currentPosition();
    activeLocation = {
      key: "device",
      label: "현재 위치",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    await loadWeather();
  } catch (error) {
    console.error(error);
    activeLocation = { ...DEFAULT_LOCATION };
    locationSelect.value = "school";
    status.textContent = "현재 위치를 사용할 수 없어 복성고등학교 인근 예보로 돌아갑니다.";
    status.classList.add("error");
    await loadWeather({ preserveStatus: true });
  } finally {
    locationSelect.disabled = false;
  }
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 10 * 60 * 1000
    });
  });
}

async function loadWeather({ preserveStatus = false } = {}) {
  refreshButton.disabled = true;
  refreshButton.textContent = "불러오는 중";
  if (!preserveStatus) {
    status.textContent = `${activeLocation.label} 최신 수치예보를 불러오는 중입니다.`;
    status.classList.remove("error");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchForecast(activeLocation, controller.signal);
    const data = await response.json();
    validateForecast(data);
    renderWeather(data);
    writeCache(data);
    status.textContent = `${activeLocation.label} 예보 갱신 완료 · 조회 기준 ${formatDateTime(parseForecastTime(data.current.time))} KST`;
  } catch (error) {
    console.error(error);
    const cached = readCache();
    if (cached) {
      renderWeather(cached.data);
      status.textContent = `실시간 예보를 불러오지 못해 저장 자료를 표시합니다 · 조회 기준 ${formatDateTime(parseForecastTime(cached.data.current.time))} KST`;
    } else {
      status.textContent = error.name === "AbortError"
        ? "예보 서버 응답 시간이 초과되었습니다. 새로고침을 눌러 다시 시도해 주세요."
        : `날씨를 불러오지 못했습니다: ${error.message}`;
    }
    status.classList.add("error");
  } finally {
    clearTimeout(timeout);
    refreshButton.disabled = false;
    refreshButton.textContent = "새로고침";
  }
}

async function fetchForecast(locationData, signal) {
  try {
    const response = await apiFetch("/api/deepsky/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: locationData.latitude,
        longitude: locationData.longitude
      }),
      signal,
      cache: "no-store"
    });
    if (response.ok) return response;
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `DEEP SKY 날씨 서버 응답 오류 (${response.status})`);
  } catch (proxyError) {
    if (signal.aborted) throw proxyError;
    console.warn("DEEP SKY 날씨 서버를 사용할 수 없어 원본 예보 서버로 재시도합니다.", proxyError);
    const response = await fetch(buildForecastUrl(locationData), { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`예보 서버 응답 오류 (${response.status})`);
    return response;
  }
}

function validateForecast(data) {
  if (!data?.current || !Array.isArray(data?.hourly?.time) || !Array.isArray(data?.daily?.time)) {
    throw new Error("예보 데이터 형식이 올바르지 않습니다.");
  }
  const requiredHourly = ["temperature_2m", "apparent_temperature", "dew_point_2m", "surface_pressure", "relative_humidity_2m", "precipitation_probability", "precipitation", "cloud_cover", "visibility", "wind_speed_10m", "wind_gusts_10m"];
  if (requiredHourly.some(field => !Array.isArray(data.hourly[field]))) {
    throw new Error("그래프에 필요한 시간대별 예보 데이터가 누락되었습니다.");
  }
}

function renderWeather(data) {
  latestForecast = data;
  renderCurrent(data);
  renderForecastChart(data);
  renderNight(data);
  renderDaily(data);
  renderAstronomy();
}

function renderCurrent(data) {
  const current = data.current;
  const currentTime = parseForecastTime(current.time);
  const condition = weatherCondition(current.weather_code);
  document.getElementById("weather-icon").textContent = condition.icon;
  document.getElementById("current-weather-title").textContent = condition.label;
  document.getElementById("current-temperature").textContent = `${round(current.temperature_2m)}°`;
  document.getElementById("current-updated").textContent = `${formatDateTime(currentTime)} 기준 · ${activeLocation.label}`;
}

function renderForecastChart(data) {
  const container = document.getElementById("forecast-chart");
  const legend = document.getElementById("forecast-chart-legend");
  const summary = document.getElementById("forecast-chart-summary");
  const period = document.getElementById("forecast-chart-period");
  const config = CHART_CONFIGS[activeChartMetric] || CHART_CONFIGS.temperature;
  const referenceTime = parseForecastTime(data.current.time);
  const windowStart = new Date(referenceTime.valueOf() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(referenceTime.valueOf() + 72 * 60 * 60 * 1000);
  const points = data.hourly.time
    .map((value, index) => ({ time: parseForecastTime(value), index }))
    .filter(point => point.time >= windowStart && point.time <= windowEnd);
  const times = points.map(point => point.time);
  const validSeries = config.series.map(series => ({
    ...series,
    values: points.map(point => {
      const value = data.hourly[series.key]?.[point.index];
      const numeric = Number(value);
      return Number.isFinite(numeric) ? series.transform(numeric) : null;
    })
  }));
  const allValues = validSeries.flatMap(series => series.values.filter(Number.isFinite));
  container.replaceChildren();
  legend.replaceChildren();
  if (!times.length || !allValues.length) {
    summary.textContent = `${config.label} 자료를 표시할 수 없습니다.`;
    const svg = svgElement("svg", { viewBox: "0 0 960 320", "aria-hidden": "true" });
    const message = svgElement("text", { x: 480, y: 160, class: "chart-empty" });
    message.textContent = "사용 가능한 시간대별 자료가 없습니다.";
    svg.appendChild(message);
    container.appendChild(svg);
    return;
  }

  const firstTime = times[0];
  const lastTime = times.at(-1);
  period.textContent = `KST · ${formatChartTime(firstTime)}–${formatChartTime(lastTime)}`;
  const width = 960;
  const height = 320;
  const margin = { top: 24, right: 24, bottom: 54, left: 68 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  let minimum;
  let maximum;
  if (config.fixedRange) {
    [minimum, maximum] = config.fixedRange;
  } else {
    minimum = Math.min(...allValues);
    maximum = Math.max(...allValues);
    const padding = Math.max((maximum - minimum) * .12, config.unit === "hPa" ? 2 : 1);
    minimum = config.minZero ? Math.max(0, minimum - padding) : minimum - padding;
    maximum += padding;
  }
  if (maximum <= minimum) maximum = minimum + 1;
  const startMs = firstTime.valueOf();
  const endMs = Math.max(lastTime.valueOf(), startMs + 1);
  const x = date => margin.left + ((date.valueOf() - startMs) / (endMs - startMs)) * plotWidth;
  const y = value => margin.top + (1 - (value - minimum) / (maximum - minimum)) * plotHeight;
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${config.label} ${formatChartTime(firstTime)}부터 ${formatChartTime(lastTime)}까지의 변화`
  });

  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const gridY = margin.top + ratio * plotHeight;
    const value = maximum - ratio * (maximum - minimum);
    svg.appendChild(svgElement("line", { x1: margin.left, y1: gridY, x2: width - margin.right, y2: gridY, class: "chart-grid" }));
    const label = svgElement("text", { x: margin.left - 10, y: gridY + 4, class: "chart-axis-label", "text-anchor": "end" });
    label.textContent = `${formatChartValue(value, config.unit)} ${config.unit}`;
    svg.appendChild(label);
  }

  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const tickTime = new Date(startMs + ratio * (endMs - startMs));
    const tickX = margin.left + ratio * plotWidth;
    svg.appendChild(svgElement("line", { x1: tickX, y1: margin.top, x2: tickX, y2: height - margin.bottom, class: "chart-grid" }));
    const label = svgElement("text", { x: tickX, y: height - 24, class: "chart-axis-label", "text-anchor": "middle" });
    label.textContent = formatChartTick(tickTime);
    svg.appendChild(label);
  }

  validSeries.forEach(series => {
    let pathData = "";
    let drawing = false;
    series.values.forEach((value, index) => {
      if (!Number.isFinite(value) || !times[index]) {
        drawing = false;
        return;
      }
      pathData += `${drawing ? " L" : "M"} ${x(times[index]).toFixed(2)} ${y(value).toFixed(2)}`;
      drawing = true;
    });
    if (pathData) svg.appendChild(svgElement("path", { d: pathData, class: "chart-series", stroke: series.color }));
    const item = document.createElement("span");
    const swatch = document.createElement("i");
    swatch.style.background = series.color;
    item.append(swatch, document.createTextNode(series.label));
    legend.appendChild(item);
  });

  if (referenceTime >= firstTime && referenceTime <= lastTime) {
    const referenceX = x(referenceTime);
    svg.appendChild(svgElement("line", { x1: referenceX, y1: margin.top, x2: referenceX, y2: height - margin.bottom, class: "chart-current-line" }));
    const referenceLabel = svgElement("text", { x: referenceX, y: margin.top + 13, class: "chart-axis-label", "text-anchor": "middle" });
    referenceLabel.textContent = "조회 기준";
    svg.appendChild(referenceLabel);
  }
  container.appendChild(svg);

  const nearest = nearestHourlyIndex(times, referenceTime);
  const currentValues = validSeries.map(series => `${series.label} ${formatChartValue(series.values[nearest], config.unit)} ${config.unit}`);
  summary.textContent = `조회 기준 ${formatChartTime(referenceTime)} KST · ${config.label} · ${currentValues.join(" · ")} · 전체 범위 ${formatChartValue(Math.min(...allValues), config.unit)}–${formatChartValue(Math.max(...allValues), config.unit)} ${config.unit}`;
}

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function formatChartValue(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return Number(value).toFixed(unit === "%" ? 0 : 1);
}

function formatChartTick(value) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", hour12: false }).format(value);
}

function formatChartTime(value) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

function nearestHourlyIndex(times, target) {
  let selectedIndex = 0;
  let selectedDistance = Infinity;
  times.forEach((time, index) => {
    const distance = Math.abs(parseForecastTime(time) - target);
    if (distance < selectedDistance) {
      selectedDistance = distance;
      selectedIndex = index;
    }
  });
  return selectedIndex;
}

function renderNight(data) {
  const entries = data.hourly.time.map((time, index) => ({
    time: parseForecastTime(time),
    cloud: data.hourly.cloud_cover[index],
    precipitationProbability: data.hourly.precipitation_probability[index],
    precipitation: data.hourly.precipitation[index],
    visibility: data.hourly.visibility[index],
    wind: data.hourly.wind_speed_10m[index],
    gust: data.hourly.wind_gusts_10m[index],
    weatherCode: data.hourly.weather_code[index]
  }));
  const { start, end } = currentNightWindow(new Date());
  const nightEntries = entries.filter(item => item.time >= start && item.time <= end && isNightHour(item.time));
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
  const labels = ["시각", "상태", "구름", "강수", "시정", "바람", "관측"];
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
      cell.dataset.label = labels[index];
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
  const today = seoulDateKey(new Date());
  const visibleDays = data.daily.time
    .map((date, sourceIndex) => ({ date, sourceIndex }))
    .filter(item => item.date >= today)
    .slice(0, 4);
  visibleDays.forEach(({ date, sourceIndex }, displayIndex) => {
    const condition = weatherCondition(data.daily.weather_code[sourceIndex]);
    const card = document.createElement("article");
    card.className = "daily-card";
    const heading = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = formatDate(date, displayIndex);
    const icon = document.createElement("span");
    icon.className = "daily-icon";
    icon.textContent = condition.icon;
    heading.append(title, icon);
    const temperature = document.createElement("strong");
    temperature.textContent = `${round(data.daily.temperature_2m_min[sourceIndex])}° / ${round(data.daily.temperature_2m_max[sourceIndex])}°`;
    const detail = document.createElement("p");
    detail.textContent = `${condition.label} · 강수 확률 ${round(data.daily.precipitation_probability_max[sourceIndex])}%`;
    const sun = document.createElement("p");
    sun.textContent = `일출 ${formatHour(parseForecastTime(data.daily.sunrise[sourceIndex]))} · 일몰 ${formatHour(parseForecastTime(data.daily.sunset[sourceIndex]))}`;
    card.append(heading, temperature, detail, sun);
    container.appendChild(card);
  });
}

function renderAstronomy() {
  const now = new Date();
  const moon = getMoonInfo(now, activeLocation.latitude, activeLocation.longitude);
  const windowDates = astronomicalNightDates(now);
  const dusk = getAstronomicalTwilight(windowDates.evening, activeLocation.latitude, activeLocation.longitude).dusk;
  const dawn = getAstronomicalTwilight(windowDates.morning, activeLocation.latitude, activeLocation.longitude).dawn;
  document.getElementById("astronomy-location").textContent = `${activeLocation.label} 기준`;
  document.getElementById("moon-icon").textContent = moon.icon;
  document.getElementById("moon-phase").textContent = moon.label;
  document.getElementById("moon-detail").textContent = `밝기 약 ${moon.illumination}% · 월령 ${number(moon.age, 1)}일`;
  document.getElementById("moon-rise-set").textContent = `월출 ${formatOptionalTime(moon.rise)} · 월몰 ${formatOptionalTime(moon.set)}`;
  document.getElementById("twilight-time").textContent = dusk && dawn ? `${formatHour(dusk)}–${formatHour(dawn)}` : "계산 불가";
  document.getElementById("dark-window").textContent = dusk && dawn
    ? "저녁 천문박명 종료부터 아침 천문박명 시작까지입니다."
    : "해당 날짜의 천문박명 시각을 계산할 수 없습니다.";
}

function astronomicalNightDates(now) {
  const parts = seoulParts(now);
  const localMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - KST_OFFSET_MS);
  if (parts.hour <= 6) {
    return { evening: new Date(localMidnight.valueOf() - 86400000), morning: localMidnight };
  }
  return { evening: localMidnight, morning: new Date(localMidnight.valueOf() + 86400000) };
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
  const breakdown = document.getElementById("score-breakdown");
  breakdown.textContent = entries.length
    ? `평균 구름 ${round(average(entries, "cloud"))}% · 강수 확률 ${round(average(entries, "precipitationProbability"))}% · 시정 ${number(average(entries, "visibility") / 1000, 1)} km · 바람 ${number(average(entries, "wind"), 1)} km/h. 구름 58%, 강수 28%를 중심으로 바람과 시정을 함께 반영합니다.`
    : "점수를 계산할 수 있는 야간 예보가 없습니다.";
}

function average(entries, key) {
  return entries.reduce((sum, entry) => sum + (Number(entry[key]) || 0), 0) / entries.length;
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
  if (score >= 90) return { label: "좋음", className: "rating-good", color: "var(--weather-good)", guide: "구름과 강수 위험이 낮아 관측을 계획하기 좋은 조건입니다." };
  if (score >= 70) return { label: "보통", className: "rating-fair", color: "var(--weather-fair)", guide: "관측은 가능하지만 시간대별 구름과 바람 변화를 확인하세요." };
  if (score >= 50) return { label: "주의", className: "rating-poor", color: "var(--weather-poor)", guide: "구름 또는 바람의 영향이 예상됩니다. 짧은 관측을 우선 검토하세요." };
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

function writeCache(data) {
  if (activeLocation.key === "device") return;
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ savedAt: Date.now(), data }));
  } catch (error) {
    console.warn("날씨 캐시 저장 실패", error);
  }
}

function readCache() {
  if (activeLocation.key === "device") return null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    if (!cached?.savedAt || !cached?.data || Date.now() - cached.savedAt > CACHE_MAX_AGE) return null;
    validateForecast(cached.data);
    return cached;
  } catch {
    return null;
  }
}

function cacheKey() {
  return `${CACHE_PREFIX}:${activeLocation.key}`;
}

function initializeWeatherTools() {
  document.querySelectorAll(".weather-tool-card").forEach(tool => {
    const hint = tool.querySelector(".tool-card-heading p");
    const hintBase = hint?.textContent.replace(/\s*·\s*(?:열기|접기)\s*$/, "") || "";
    tool.addEventListener("toggle", () => {
      if (hint) hint.textContent = `${hintBase} · ${tool.open ? "접기" : "열기"}`;
      if (!tool.open) return;
      const frame = tool.querySelector("iframe[data-src]");
      if (frame && !frame.hasAttribute("src")) frame.src = frame.dataset.src;
    });
  });
}

function parseForecastTime(value) {
  if (value instanceof Date) return value;
  const text = String(value || "");
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}+09:00`);
}

function seoulParts(date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(date).map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour)
  };
}

function isNightHour(date) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(date));
  return hour >= 18 || hour <= 6;
}

function currentNightWindow(now) {
  const parts = seoulParts(now);
  const localMidnight = Date.UTC(parts.year, parts.month - 1, parts.day) - KST_OFFSET_MS;
  if (parts.hour <= 6) return { start: now, end: new Date(localMidnight + 7 * 60 * 60 * 1000) };
  if (parts.hour < 18) return { start: new Date(localMidnight + 18 * 60 * 60 * 1000), end: new Date(localMidnight + 31 * 60 * 60 * 1000) };
  return { start: now, end: new Date(localMidnight + 31 * 60 * 60 * 1000) };
}

function windDirection(degrees) { return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round((Number(degrees) || 0) / 45) % 8]; }
function formatDateTime(value) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value); }
function formatHour(value) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(value); }
function formatOptionalTime(value) { return value ? formatHour(value) : "해당 없음"; }
function formatDay(value) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "short" }).format(value); }
function seoulDateKey(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function formatDate(value, index) { return index === 0 ? "오늘" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" }).format(parseForecastTime(`${value}T12:00`)); }
function number(value, digits = 0) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-"; }
function round(value) { return Number.isFinite(Number(value)) ? Math.round(Number(value)) : "-"; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
