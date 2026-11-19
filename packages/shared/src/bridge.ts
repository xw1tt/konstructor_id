// 0.36: окно «Конструктор ИД» работает с книгой, открытой в Excel, через панель: окно шлёт вызов на сервер,
// сервер передаёт его панели книги (поток событий), панель выполняет его в Excel и возвращает ответ.
// Здесь — общий для окна, сервера и панели протокол. Слой книги окна (RemotePort) знает только эти методы,
// поэтому позже книгу можно перенести в само приложение (вариант Б), заменив один слой.
import { z } from "zod";

/** Методы книги, которые окно может вызвать через панель. «rows.*» — строки листа вне таблиц (первый аргумент — лист). */
export const BRIDGE_METHODS = [
  "read",
  "readMany",
  "write",
  "insert",
  "remove",
  "setting",
  "setSetting",
  "writeReport",
  "isFiltered",
  "clearFilters",
  "getSelection",
  "selectCell",
  "selectSheetCell",
  "activateSheet",
  "filterBy",
  "tableSheetOffset",
  "setSheetsVisible",
  "physical",
  "isVirtual",
  "ensureBook",
  "writeWorkList",
  "applyImportant",
  "activeCell",
  "setActiveCell",
  "rows.count",
  "rows.read",
  "rows.write",
  "rows.insertBlank",
  "rows.remove",
] as const;
export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

export const BridgeCall = z.object({ method: z.enum(BRIDGE_METHODS), args: z.array(z.unknown()).max(10).default([]) });
export type BridgeCall = z.infer<typeof BridgeCall>;

/** Ответ панели на вызов. */
export const BridgeResult = z.object({
  id: z.string().min(1).max(100),
  ok: z.boolean(),
  value: z.unknown().optional(),
  error: z.string().max(5000).optional(),
});
export type BridgeResult = z.infer<typeof BridgeResult>;

/** Событие книги от панели: изменение ячеек или выделения (передаётся окнам). */
export const BridgeEvent = z.object({
  panel: z.string().min(1).max(100),
  kind: z.enum(["change", "selection"]),
  payload: z.unknown().optional(),
});
export type BridgeEvent = z.infer<typeof BridgeEvent>;

/** Книга, открытая в Excel с панелью. */
export interface LinkedBook {
  panel: string;
  name: string;
}

/** Состояние связи для окна: открытые книги и та, с которой окно работает. */
export interface BridgeStatus {
  books: LinkedBook[];
  active: string | null;
}

/** Сообщения сервера панели (поток /api/book/link). */
export type PanelMessage = { type: "call"; id: string; method: BridgeMethod; args: unknown[] } | { type: "windows"; count: number; active: boolean };

/** Сообщения сервера окну (поток /api/book/events). */
export type WindowMessage = { type: "status"; status: BridgeStatus } | { type: "change" | "selection"; payload?: unknown };

/** Экраны, которые окно может открыть сразу (кнопка «Открыть в окне» на нужном экране). */
export const WINDOW_SCREENS = ["home", "acts", "delivery", "assistant", "templates", "fields", "library", "normativ", "settings"] as const;
export type WindowScreen = (typeof WINDOW_SCREENS)[number];
export const WindowOpen = z.object({ panel: z.string().min(1).max(100).optional(), screen: z.enum(WINDOW_SCREENS).optional() });
