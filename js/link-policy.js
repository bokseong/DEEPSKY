const UPLOAD_PATH_PREFIX = "/api/jhimap/uploads/";

export function normalizeLinkUrl(value, { allowUpload = false, resolveUpload = false, apiBaseUrl = "" } = {}) {
    const raw = String(value || "").trim();
    if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw)) return "";
    try {
        if (allowUpload && raw.startsWith(UPLOAD_PATH_PREFIX)) {
            const rawPath = raw.split(/[?#]/, 1)[0];
            const decodedRawPath = decodeURIComponent(rawPath);
            if (decodedRawPath.split("/").some(part => part === "." || part === "..")) return "";
            const api = new URL(apiBaseUrl);
            const url = new URL(raw, api);
            const decodedPath = decodeURIComponent(url.pathname);
            if (
                url.origin !== api.origin ||
                url.username ||
                url.password ||
                url.search ||
                url.hash ||
                !url.pathname.startsWith(UPLOAD_PATH_PREFIX) ||
                decodedPath.split("/").some(part => part === "." || part === "..")
            ) return "";
            return resolveUpload ? `${api.origin}${url.pathname}` : url.pathname;
        }
        const url = new URL(raw);
        if (
            !["http:", "https:"].includes(url.protocol) ||
            !url.hostname ||
            url.username ||
            url.password ||
            url.pathname.startsWith(UPLOAD_PATH_PREFIX)
        ) return "";
        return url.href;
    } catch {
        return "";
    }
}
