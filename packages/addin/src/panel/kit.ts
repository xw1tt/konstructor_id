// Комплект на панели: строка → комплект, ошибки сборки со ссылками на ячейки, задание сборки на сервере.
import { TABLES, column, type TableName } from "@idk/shared/workbook/schema";
import { cellText, type CellValue } from "@idk/shared/workbook/values";
import type { Book } from "@idk/shared/workbook/records";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { PrintOptions, TemplateCode } from "@idk/shared/templates";
import { buildKitRequest } from "@idk/shared/kit/request";
import type { Issue } from "@idk/shared/workbook/bundle";
import { ServerUnavailableError } from "../api.ts";
import type { IssueLine } from "./print.ts";

/** Комплект, к которому относится строка таблицы комплекта, «актов комплектов» или реестра. */
export function kitOfRow(table: TableName, headers: string[], row: CellValue[]): string {
  const key = table === "Комплекты" ? column("Комплекты", "number").header
    : table === "АктыКомплектов" || table === "РеестрИД" ? column(table, "kit").header : null;
  if (!key) return "";
  return cellText(row[headers.indexOf(key)] ?? null);
}

export const kitRegistryCount = (book: Book, kit: string) =>
  (book.tables["РеестрИД"] ?? []).filter((r) => cellText(r.v.kit) === kit).length;

export const previewUrl = (src: string, origin: string) => `${origin}/addin/preview.html?src=${encodeURIComponent(src)}`;

export interface ServerKitIssue { row: number | null; column: string; message: string }

/** Ошибки файлов от сервера: строка реестра (offset — строка листа первой строки данных) или логотип организации. */
export function kitIssueLines(issues: ServerKitIssue[], offset: number | undefined): IssueLine[] {
  return issues.map((i) => {
    if (i.row === null) {
      const table: TableName = i.column === "Логотип" ? "Организации" : "РеестрИД";
      return { text: `${TABLES[table].sheet}, «${i.column}»: ${i.message}`, table, row: null, column: i.column };
    }
    const where = offset !== undefined ? `Реестр ИД, строка ${offset + i.row}` : "Реестр ИД";
    return { text: `${where}, «${i.column}»: ${i.message}`, table: "РеестрИД", row: i.row, column: i.column };
  });
}

export type KitOutcome =
  | { kind: "issues"; issues: Issue[] }
  | { kind: "files"; issues: ServerKitIssue[] }
  | { kind: "ok"; id: string; pages: number; name: string };

/** Проверяет комплект в книге и отправляет задание сборки на сервер. */
export async function assembleKit(book: Book, kit: string, important: ImportantMap, template: TemplateCode, options: PrintOptions): Promise<KitOutcome> {
  const { request, issues } = buildKitRequest(book, kit, important, template, options);
  if (!request) return { kind: "issues", issues };
  let res: Response;
  try {
    res = await fetch("/api/kit-jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  } catch {
    throw new ServerUnavailableError();
  }
  const data = await res.json().catch(() => null);
  if (res.status === 422 && Array.isArray(data?.issues)) return { kind: "files", issues: data.issues };
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
  return { kind: "ok", id: data.id, pages: data.pages, name: data.name };
}
