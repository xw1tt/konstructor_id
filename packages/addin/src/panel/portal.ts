// Окно портала protect.gost.ru. Программа страницы портала не загружает и не хранит:
// окно Office открывает служебную страницу панели, а она сразу переходит на адрес портала.
import { isPortalUrl } from "@idk/shared/normativ";

declare const Office: any;

export const portalDialogUrl = (origin: string, url: string) =>
  `${origin}/addin/portal.html?to=${encodeURIComponent(url)}`;

/** Открывает страницу портала в окне Office; если окно не открылось — в браузере по умолчанию. */
export function openPortal(url: string): void {
  if (!isPortalUrl(url)) return;
  const fallback = () => window.open(url, "_blank", "noopener");
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(portalDialogUrl(location.origin, url), { height: 90, width: 70, displayInIframe: false },
      (r: any) => { if (r?.status === "failed" || r?.status === Office?.AsyncResultStatus?.Failed) fallback(); });
  } else {
    fallback();
  }
}
