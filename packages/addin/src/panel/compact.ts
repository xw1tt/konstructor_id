// 0.38: «Компактная панель» — в панели Excel остаются «Книга» (листы, карточки строк) и «Настройки», остальные
// экраны открываются в окне программы. Настройка этого компьютера (localStorage панели).
import type { ScreenId } from "./screens.ts";

export const COMPACT_KEY = "idk.compactPanel";
export const PANEL_SCREENS: readonly ScreenId[] = ["home", "settings", "wizard"];

export function readCompact(storage: Pick<Storage, "getItem"> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(COMPACT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCompact(v: boolean, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try {
    storage?.setItem(COMPACT_KEY, v ? "1" : "0");
  } catch {
    /* хранилище недоступно — настройка на этот запуск */
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
