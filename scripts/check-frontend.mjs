import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        if (entry.name === ".git" || entry.name === "node_modules") return [];
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function relative(file) {
    return path.relative(root, file).replaceAll("\\", "/");
}

function fail(file, message) {
    failures.push(`${relative(file)}: ${message}`);
}

const files = walk(root);
const htmlFiles = files.filter(file => file.endsWith(".html"));
const jsFiles = files.filter(file => file.endsWith(".js") || file.endsWith(".mjs"));
const canonicalNavigation = [
    "index.html", "introduction.html", "talk.html", "question.html", "photo.html",
    "resource.html", "weather.html", "ai.html", "search.html", "notifications.html",
    "suggest.html", "mypage.html", "admin.html"
];
const pageHeroFiles = [
    "introduction.html", "talk.html", "question.html", "photo.html", "resource.html",
    "weather.html", "ai.html", "search.html", "notifications.html", "suggest.html",
    "mypage.html", "admin.html"
];

for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");

    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
        if (!/\balt\s*=/i.test(match[0])) fail(file, "img 요소에 alt 속성이 없습니다.");
    }

    for (const match of html.matchAll(/<nav\b[^>]*>/gi)) {
        if (!/\baria-label(?:ledby)?\s*=/i.test(match[0])) {
            fail(file, "nav 요소에 접근 가능한 이름이 없습니다.");
        }
    }

    const menu = html.match(/<div class="nav-menu">([\s\S]*?)<\/div>/i)?.[1];
    if (menu) {
        const links = [...menu.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(match => match[1]);
        if (JSON.stringify(links) !== JSON.stringify(canonicalNavigation)) {
            fail(file, "nav-menu 항목 또는 순서가 공통 기준과 다릅니다.");
        }
    }

    for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
        const tag = match[0];
        if (/\btype\s*=\s*["']hidden["']/i.test(tag)) continue;
        if (/\baria-label(?:ledby)?\s*=/i.test(tag)) continue;
        const id = tag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
        const hasForLabel = id && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html);
        const lastOpenLabel = html.lastIndexOf("<label", match.index);
        const lastCloseLabel = html.lastIndexOf("</label>", match.index);
        if (!hasForLabel && lastOpenLabel <= lastCloseLabel) {
            fail(file, `${tag.slice(0, 80)} 요소에 연결된 label 또는 aria-label이 없습니다.`);
        }
    }

    for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#?]+)["']/gi)) {
        const reference = match[1];
        if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/)/i.test(reference)) continue;
        const target = path.resolve(path.dirname(file), reference);
        if (!fs.existsSync(target)) fail(file, `로컬 참조가 존재하지 않습니다: ${reference}`);
    }

    for (const match of html.matchAll(/<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*>/gi)) {
        if (!/\brel\s*=\s*["'][^"']*\bnoopener\b[^"']*["']/i.test(match[0])) {
            fail(file, "target=_blank 링크에 rel=noopener가 없습니다.");
        }
    }
}

for (const fileName of pageHeroFiles) {
    const file = path.join(root, fileName);
    const html = fs.readFileSync(file, "utf8");
    const hero = html.match(/<header\b[^>]*class=["'][^"']*\bpage-hero\b[^"']*["'][^>]*>([\s\S]*?)<\/header>/i)?.[1];
    if (!hero || !/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(hero) || !/<p\b[^>]*>[\s\S]*?<\/p>/i.test(hero)) {
        fail(file, "공통 page-hero에 페이지 이름(h1)과 설명(p)이 필요합니다.");
    }
}

for (const file of jsFiles) {
    const source = fs.readFileSync(file, "utf8");
    const syntax = spawnSync(process.execPath, ["--input-type=module", "--check"], {
        input: source,
        encoding: "utf8"
    });
    if (syntax.status !== 0) fail(file, `JavaScript 문법 오류: ${syntax.stderr.trim()}`);
}

const resourceSource = fs.readFileSync(path.join(root, "js", "resource.js"), "utf8");
if (/innerHTML\s*=\s*filtered\.map/.test(resourceSource)) {
    fail(path.join(root, "js", "resource.js"), "서버 자료를 innerHTML 템플릿으로 렌더링하고 있습니다.");
}
for (const field of ["title", "author_name"]) {
    if (!new RegExp(`\\.textContent\\s*=\\s*post\\.${field}`).test(resourceSource)) {
        fail(path.join(root, "js", "resource.js"), `${field} 필드가 textContent로 렌더링되지 않습니다.`);
    }
}
if (!/\.textContent\s*=\s*normalizeResourceCategory\(post\.category\)/.test(resourceSource)) {
    fail(path.join(root, "js", "resource.js"), "category 필드가 정규화 후 textContent로 렌더링되지 않습니다.");
}

const signupSource = fs.readFileSync(path.join(root, "js", "signup.js"), "utf8");
if (!/sendEmailVerification\(user\)[\s\S]*?signOut\(auth\)/.test(signupSource)) {
    fail(path.join(root, "js", "signup.js"), "이메일 미인증 가입 세션을 종료하지 않습니다.");
}

const loginSource = fs.readFileSync(path.join(root, "js", "login.js"), "utf8");
if (!/GithubAuthProvider/.test(loginSource) || !/id="github-btn"/.test(fs.readFileSync(path.join(root, "login.html"), "utf8"))) {
    fail(path.join(root, "js", "login.js"), "GitHub 로그인 제공자 또는 로그인 버튼이 누락되었습니다.");
}

for (const [fileName, pattern] of [
    ["school-board.js", /collection:\s*"questions"/],
    ["school-write.js", /collection:\s*"questions"/],
    ["school-view.js", /collection:\s*"questions"/],
    ["search.js", /questions:\s*"질문 게시판"/]
]) {
    const file = path.join(root, "js", fileName);
    if (!pattern.test(fs.readFileSync(file, "utf8"))) fail(file, "질문 게시판 연동이 누락되었습니다.");
}

for (const fileName of ["school-board.js", "school-write.js"]) {
    const file = path.join(root, "js", fileName);
    const source = fs.readFileSync(file, "utf8");
    const clubCategories = source.match(/b:\s*\{[^\n]*categories:\s*\[([^\]]+)\]/)?.[1] || "";
    if (/실험 보고서/.test(clubCategories) || !/보고서/.test(clubCategories)) {
        fail(file, "동아리 게시판의 실험 보고서와 보고서 분류가 통합되지 않았습니다.");
    }
}

for (const [fileName, required] of [
    ["resource.html", [/value="발표"/, /value="보고서"/]],
    ["write.html", [/value="발표"/, /value="보고서"/]],
    ["search.html", [/<option>발표<\/option>/, /<option>보고서<\/option>/]]
]) {
    const file = path.join(root, fileName);
    const source = fs.readFileSync(file, "utf8");
    if (required.some(pattern => !pattern.test(source)) || /발표 및 (?:보고서|세미나)/.test(source)) {
        fail(file, "자료실의 발표와 보고서 분류가 분리되지 않았습니다.");
    }
}

const commonSource = fs.readFileSync(path.join(root, "js", "common.js"), "utf8");
for (const requiredPattern of [
    /normalizeLinkUrl/,
    /apiBaseUrl:\s*API_BASE_URL/
]) {
    if (!requiredPattern.test(commonSource)) {
        fail(path.join(root, "js", "common.js"), "공유 링크 URL 보안 정책이 누락되었습니다.");
    }
}
if (!/if\s*\(!forToday\)\s*return;/.test(commonSource)) {
    fail(path.join(root, "js", "common.js"), "오늘 하루 보지 않기를 선택하지 않은 닫기까지 저장합니다.");
}
if (/deepsky:popup:session/.test(commonSource)) {
    fail(path.join(root, "js", "common.js"), "일반 닫기를 세션에 저장하여 새로고침 후 팝업이 숨겨집니다.");
}
if (!/if\s*\(!pageName\s*\|\|\s*pageName\s*===\s*["']index\.html["']\)\s*\{\s*createAnnouncementPopup\(\);\s*\}/.test(commonSource)) {
    fail(path.join(root, "js", "common.js"), "공지 팝업이 index 화면으로 제한되지 않았습니다.");
}

const weatherHtml = fs.readFileSync(path.join(root, "weather.html"), "utf8");
const weatherSource = fs.readFileSync(path.join(root, "js", "weather.js"), "utf8");
for (const pattern of [
    /id="weather-location"/,
    /id="red-mode-toggle"/,
    /id="moon-phase"/,
    /id="twilight-time"/,
    /weather\.go\.kr\/w\/weather\/warning\/status\.do/,
    /weather\.go\.kr\/w\/weather\/radar\/radar\.do/,
    /meteoblue\.com\/ko\/weather\/outdoorsports\/seeing/,
    /windy\.com\/34\.950\/127\.490/
]) {
    if (!pattern.test(weatherHtml)) fail(path.join(root, "weather.html"), "관측용 날씨 기능 또는 기상청 안전 링크가 누락되었습니다.");
}
for (const pattern of [/CACHE_MAX_AGE/, /navigator\.geolocation/, /getMoonInfo/, /getAstronomicalTwilight/, /red-night-mode/]) {
    if (!pattern.test(weatherSource)) fail(path.join(root, "js", "weather.js"), "날씨 복구·위치·천문·야간 모드 로직이 누락되었습니다.");
}
if (!/activeLocation\.key === ["']device["']/.test(weatherSource)) {
    fail(path.join(root, "js", "weather.js"), "현재 위치 예보를 브라우저 저장소에 남기지 않는 보호 로직이 누락되었습니다.");
}
const astronomyModule = await import(pathToFileURL(path.join(root, "js", "astronomy.js")));
const astronomyDate = new Date("2026-09-25T12:00:00+09:00");
const moonCheck = astronomyModule.getMoonInfo(astronomyDate, 34.9506, 127.4872);
const twilightCheck = astronomyModule.getAstronomicalTwilight(astronomyDate, 34.9506, 127.4872);
if (!Number.isFinite(moonCheck.age) || moonCheck.age < 0 || moonCheck.age >= 30 || moonCheck.illumination < 0 || moonCheck.illumination > 100) {
    fail(path.join(root, "js", "astronomy.js"), "달 위상 계산값이 정상 범위를 벗어났습니다.");
}
if (!(twilightCheck.dawn instanceof Date) || !(twilightCheck.dusk instanceof Date) || !Number.isFinite(twilightCheck.dawn.valueOf()) || !Number.isFinite(twilightCheck.dusk.valueOf())) {
    fail(path.join(root, "js", "astronomy.js"), "천문박명 계산 결과가 올바르지 않습니다.");
}

const { normalizeLinkUrl } = await import(pathToFileURL(path.join(root, "js", "link-policy.js")));
const apiBaseUrl = "https://api.example.com";
for (const unsafe of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example/file",
    "https://user:pass@example.com/file",
    "https://example.com\\@evil.example/file",
    "https://example.com/api/deepsky/uploads/resources/file.pdf",
    "/api/deepsky/uploads/resources/../secret.txt",
    "/api/deepsky/uploads/resources/%2e%2e/secret.txt"
]) {
    if (normalizeLinkUrl(unsafe, { allowUpload: true, apiBaseUrl })) {
        fail(path.join(root, "js", "link-policy.js"), `위험한 URL을 허용합니다: ${unsafe}`);
    }
}
if (normalizeLinkUrl("https://example.com/file?q=1") !== "https://example.com/file?q=1") {
    fail(path.join(root, "js", "link-policy.js"), "정상 HTTPS 링크를 거부합니다.");
}
if (normalizeLinkUrl("/api/deepsky/uploads/resources/file.pdf", { allowUpload: true, apiBaseUrl }) !== "/api/deepsky/uploads/resources/file.pdf") {
    fail(path.join(root, "js", "link-policy.js"), "정상 서버 첨부 경로를 거부합니다.");
}
for (const name of ["view.js", "school-view.js", "write.js", "school-write.js"]) {
    const file = path.join(root, "js", name);
    const source = fs.readFileSync(file, "utf8");
    if (!/normalizeSafeLinkUrl/.test(source)) {
        fail(file, "공유 링크 URL 검증 함수를 사용하지 않습니다.");
    }
}

for (const file of files) {
    const size = fs.statSync(file).size;
    if (size > 5 * 1024 * 1024) fail(file, `파일이 5MB를 초과합니다 (${(size / 1024 / 1024).toFixed(1)}MB).`);
}

if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
}

console.log(`Frontend checks passed: ${htmlFiles.length} HTML, ${jsFiles.length} JavaScript files.`);
