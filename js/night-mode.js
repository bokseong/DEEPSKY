const ENABLED_KEY = "deepsky:night-mode:enabled";
const STRENGTH_KEY = "deepsky:night-mode:strength";
const LEGACY_WEATHER_KEY = "deepsky:weather-red-mode";
const DEFAULT_STRENGTH = 70;
const MIN_STRENGTH = 20;
const MAX_STRENGTH = 100;

export function getNightModeStrength() {
    const stored = readStorage(STRENGTH_KEY);
    return normalizeStrength(stored ?? DEFAULT_STRENGTH);
}

export function isNightModeEnabled() {
    const stored = readStorage(ENABLED_KEY);
    if (stored !== null) return stored === "1";

    const legacy = readStorage(LEGACY_WEATHER_KEY);
    if (legacy === "1") {
        writeStorage(ENABLED_KEY, "1");
        return true;
    }
    return false;
}

export function setNightModeStrength(value) {
    const strength = normalizeStrength(value);
    writeStorage(STRENGTH_KEY, String(strength));
    const enabled = document.documentElement.classList.contains("night-mode-active");
    applyNightMode(enabled, strength);
    notifyChange(enabled, strength);
    return strength;
}

export function setNightModeEnabled(enabled) {
    const active = Boolean(enabled);
    writeStorage(ENABLED_KEY, active ? "1" : "0");
    const strength = getNightModeStrength();
    applyNightMode(active, strength);
    notifyChange(active, strength);
    return active;
}

export function applyNightMode(enabled = isNightModeEnabled(), strength = getNightModeStrength()) {
    const normalizedStrength = normalizeStrength(strength);
    const opacity = 0.08 + normalizedStrength * 0.007;
    const root = document.documentElement;
    root.classList.toggle("night-mode-active", Boolean(enabled));
    root.style.setProperty("--night-mode-strength", `${normalizedStrength}%`);
    root.style.setProperty("--night-mode-opacity", opacity.toFixed(3));
    root.dataset.nightMode = enabled ? "on" : "off";
    updateToggleButton();
}

function normalizeStrength(value) {
    const number = Number(value);
    const valid = Number.isFinite(number) ? number : DEFAULT_STRENGTH;
    return Math.round(Math.min(MAX_STRENGTH, Math.max(MIN_STRENGTH, valid)) / 5) * 5;
}

function readStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // 브라우저가 저장소를 차단해도 현재 화면에는 설정을 적용합니다.
    }
}

function notifyChange(enabled, strength) {
    window.dispatchEvent(new CustomEvent("deepsky:night-mode-change", {
        detail: { enabled, strength }
    }));
}

function createToggleButton() {
    if (document.getElementById("night-mode-toggle")) return;
    const button = document.createElement("button");
    button.id = "night-mode-toggle";
    button.className = "night-mode-toggle";
    button.type = "button";
    button.textContent = "☾";
    button.addEventListener("click", () => setNightModeEnabled(!isNightModeEnabled()));
    document.body.append(button);
    updateToggleButton();
}

function updateToggleButton() {
    const button = document.getElementById("night-mode-toggle");
    if (!button) return;
    const enabled = document.documentElement.classList.contains("night-mode-active");
    const action = enabled ? "끄기" : "켜기";
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", `적색 야간 모드 ${action}`);
    button.title = `적색 야간 모드 ${action} · 강도는 마이페이지에서 설정`;
}

function initializeNightMode() {
    applyNightMode();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createToggleButton, { once: true });
    } else {
        createToggleButton();
    }

    window.addEventListener("storage", event => {
        if (![ENABLED_KEY, STRENGTH_KEY].includes(event.key)) return;
        applyNightMode();
    });
}

initializeNightMode();
