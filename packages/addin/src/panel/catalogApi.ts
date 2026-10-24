// План 12, задача 7: справочник в панели — запрос к серверу, тексты полноты, «не нужен для этого акта».
import { createContext } from "react";
import type { Catalog, UserCatalog } from "@idk/shared/catalog/model";
import type { Status } from "@idk/shared/catalog/need";
import { templateWorks } from "@idk/shared/catalog/template";
import type { UserTemplate } from "@idk/shared/forms/template";
import { column } from "@idk/shared/workbook/schema";
import type { Book } from "@idk/shared/workbook/records";
import type { TableStore } from "@idk/shared/workbook/store";
import { cellText, joinRefs, splitRefs } from "@idk/shared/workbook/values";
import { apiGet, apiSend } from "../api.ts";

/** Ответ GET /api/catalog: итоговый справочник, коды дополнений пользователя и скрытые встроенные. */
export interface CatalogState { catalog: Catalog; own: string[]; hidden: string[] }

export const loadCatalog = () => apiGet<CatalogState>("/api/catalog");
export const saveUserCatalog = (u: UserCatalog) => apiSend<UserCatalog>("PUT", "/api/catalog/user", u);

/** Справочник в панели; null — ещё не загружен с сервера (полнота не считается). */
export const CatalogContext = createContext<Catalog | null>(null);

const STATUS: Record<Status, string> = { print: "печатается", scan: "скан есть", noScan: "нет скана", noForm: "нет формы", noData: "нет данных" };

/** «печатается: АОСР», «нет скана: Протокол испытания кабеля»… */
export const statusText = (s: Status, label: string): string => `${STATUS[s]}: ${label}`;

/** Сводка перед сборкой комплекта. */
export const shortageText = (n: number): string => `Не хватает документов: ${n}`;

/** Документ «не нужен для этого акта»: дописать код в «Без документов» через «; » (без повторов). */
export async function skipDoc(store: TableStore, book: Book, act: string, code: string): Promise<void> {
  const row = (book.tables["Акты"] ?? []).find((r) => cellText(r.v.baseNumber) === act);
  if (!row) throw new Error(`Акт «${act}» не найден в «Базе актов»`);
  const list = splitRefs(row.v.skipDocs ?? null);
  if (list.some((x) => x.toLowerCase() === code.toLowerCase())) return;
  await store.write("Акты", row.row, { [column("Акты", "skipDocs").header]: joinRefs([...list, code]) });
}

/** Названия видов работ для списка «ВидыРабот»: виды работ шаблона книги, если они есть, иначе — все из справочника. */
export function workListNames(c: Catalog, t: UserTemplate): string[] {
  const all = c.sections.flatMap((s) => s.works);
  const used = new Set(templateWorks(t));
  const pick = used.size ? all.filter((w) => used.has(w.code)) : all;
  return [...new Set(pick.map((w) => w.name))];
}
