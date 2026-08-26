import { initializeAnnouncementSection } from "./announcement-manager.js";

const section = document.getElementById("announcement-board");
const container = document.getElementById("announcement-list");

export async function initializeAnnouncements(user = null, profile = null) {
    return initializeAnnouncementSection({
        section,
        container,
        user,
        profile,
        scope: "all",
        emptyMessage: "등록된 공지사항이 없습니다."
    });
}
