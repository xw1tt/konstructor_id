// Служебная страница окна портала: переходит на разрешённый адрес protect.gost.ru, остальные отклоняет.
import { isPortalUrl, MSG_PORTAL_ONLY } from "@idk/shared/normativ";

const to = new URLSearchParams(location.search).get("to") ?? "";
if (isPortalUrl(to)) location.replace(to);
else document.getElementById("msg")!.textContent = MSG_PORTAL_ONLY;
