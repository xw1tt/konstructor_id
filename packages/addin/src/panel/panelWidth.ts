// Ширина панели между запусками: запоминается в localStorage, восстанавливается через TaskPaneApi 1.1
// (Office.extensionLifeCycle.taskpane.setWidth). Без поддержки API ширину помнит сам Excel.
export const WIDTH_KEY = "idk.panelWidth";
const MIN = 200;

export function restoreWidth(office: any, storage: Storage | null): void {
  try {
    if (!office?.context?.requirements?.isSetSupported?.("TaskPaneApi", "1.1")) return;
    const w = Number(storage?.getItem(WIDTH_KEY));
    if (Number.isFinite(w) && w >= MIN) office.extensionLifeCycle.taskpane.setWidth(Math.round(w));
  } catch {
    /* хранилище недоступно или API отказал — оставляем ширину Excel */
  }
}

/** Следит за шириной окна панели; сохраняет через 500 мс после последнего изменения. Возвращает отписку. */
export function trackWidth(win: Window, storage: Storage | null): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const w = win.innerWidth;
      if (w < MIN) return;
      try { storage?.setItem(WIDTH_KEY, String(w)); } catch { /* недоступно — не страшно */ }
    }, 500);
  };
  win.addEventListener("resize", onResize);
  return () => { clearTimeout(timer); win.removeEventListener("resize", onResize); };
}

/** План 21: версия Excel и умеет ли она восстанавливать ширину панели (TaskPaneApi 1.1 — Excel 2507 и новее). */
export function widthSupport(office: any): { version: string | null; supported: boolean } {
  let version: string | null = null, supported = false;
  try { version = office?.context?.diagnostics?.version ?? null; } catch { /* нет сведений */ }
  try { supported = !!office?.context?.requirements?.isSetSupported?.("TaskPaneApi", "1.1"); } catch { /* нет API */ }
  return { version, supported };
}

export const widthSupportText = (s: { version: string | null; supported: boolean }) =>
  s.supported
    ? "Ширина панели запоминается и восстанавливается при следующем запуске."
    : `Эта версия Excel${s.version ? ` (${s.version})` : ""} не умеет восстанавливать ширину панели надстройки — это возможно в Excel 2507 и новее (Microsoft 365). Ширину придётся выставлять вручную.`;
