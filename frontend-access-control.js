import { auth, getCurrentProfile } from "./js/common.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
const ROLES = {
    loggedIn: ["admin", "teacher", "student", "member"],
    ai: ["admin", "teacher", "student"],
    resourceWrite: ["admin", "teacher"],
    suggestions: ["admin", "teacher", "student"],
    suggestionRead: ["admin", "teacher"],
    clubBoard: ["admin", "teacher", "student"]
};

const PAGE_RULES = [
    { match: /^admin\.html$/, roles: ["admin"] },
    { match: /^talk\.html$/, roles: ROLES.clubBoard },
    { match: /^write\.html$/, roles: ROLES.resourceWrite },
    { match: /^suggest\.html$/, roles: ROLES.loggedIn },
    { match: /^resource\.html$/, roles: ROLES.loggedIn },
    { match: /^view\.html$/, roles: ROLES.loggedIn },
    { match: /^ai\.html$/, roles: ROLES.ai },
    { match: /^search\.html$/, roles: ROLES.loggedIn },
    { match: /^notifications\.html$/, roles: ROLES.loggedIn },
    { match: /^mypage\.html$/, roles: ROLES.loggedIn },
    { match: /^adjust\.html$/, roles: ROLES.loggedIn },
    { match: /^school-board\.html$/, roles: schoolRolesFromQuery },
    { match: /^school-view\.html$/, roles: schoolRolesFromQuery },
    { match: /^school-write\.html$/, roles: schoolRolesFromQuery }
];

function schoolRolesFromQuery(searchParams = new URLSearchParams(location.search)) {
    const school = searchParams.get("school");
    if (school === "b") return ROLES.clubBoard;
    return [];
}

function currentPage() {
    return location.pathname.split("/").pop() || "index.html";
}

function findRule(page = currentPage()) {
    return PAGE_RULES.find(rule => rule.match.test(page));
}

function canAccess(role, rule, searchParams = new URLSearchParams(location.search)) {
    if (!rule) return true;
    const roles = typeof rule.roles === "function" ? rule.roles(searchParams) : rule.roles;
    return roles.includes(role);
}

function setLinkVisibility(selector, visible) {
    document.querySelectorAll(selector).forEach(link => {
        link.style.display = visible ? "" : "none";
    });
}

function hardenNavigation(role) {
    setLinkVisibility(".nav-menu a", true);

    document.querySelectorAll('a[href="write.html"]:not(.nav-menu a), button[onclick*="write.html"]').forEach(el => {
        el.style.display = ROLES.resourceWrite.includes(role) ? "" : "none";
    });
}

function ruleForLink(link) {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return null;
    }

    const url = new URL(href, location.href);
    if (url.origin !== location.origin) {
        return null;
    }

    const page = url.pathname.split("/").pop() || "index.html";
    const rule = findRule(page);
    return { rule, searchParams: url.searchParams };
}

function installNavGuards(role) {
    window.__deepskyNavRole = role;
    if (window.__deepskyNavGuardsInstalled) return;
    window.__deepskyNavGuardsInstalled = true;

    document.addEventListener("click", event => {
        const link = event.target.closest(".nav-menu a");
        if (!link) return;
        const target = ruleForLink(link);
        if (!target) return;

        const currentRole = window.__deepskyNavRole || "guest";
        if (!canAccess(currentRole, target.rule, target.searchParams)) {
            event.preventDefault();
            location.href = "block.html";
        }
    });
}

async function resolveRole(user) {
    if (!user) return "guest";
    const profile = await getCurrentProfile(user);
    return profile.role || "member";
}

installNavGuards("guest");

onAuthStateChanged(auth, async user => {
    let role = "guest";
    try {
        role = await resolveRole(user);
    } catch (err) {
        role = "guest";
    }

    hardenNavigation(role);
    installNavGuards(role);

    const rule = findRule();
    if (!canAccess(role, rule)) {
        const isLoginRequired = role === "guest" && currentPage() !== "block.html";
        location.replace(isLoginRequired ? "login.html" : "block.html");
    }
});
