// Печать акта из книги: сборка пакета, проверка, задание печати на сервере, окно предпросмотра.
import { TABLES, type TableName } from "@idk/shared/workbook/schema";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { buildBundle, type Issue } from "@idk/shared/workbook/bundle";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import type { Book } from "@idk/shared/workbook/records";
import type { ImportantMap } from "@idk/shared/workbook/important";
import type { PrintOptions, TemplateCode } from "@idk/shared/templates";
import { apiSend } from "../api.ts";

declare const Office: any;

export interface IssueLine { text: string; table: TableName; row: number | null; column: string }

/** Ошибки проверки как строки «лист, строка N, «столбец»: сообщение»; offsets — строка листа первой строки данных. */
export function issueLines(issues: Issue[], offsets: Partial<Record<TableName, number>>): IssueLine[] {
  return issues.map((i) => {
    const sheet = TABLES[i.table].sheet;
    const off = offsets[i.table];
    const where = i.row !== null && off !== undefined ? `${sheet}, строка ${off + i.row}` : sheet;
    return { text: `${where}, «${i.column}»: ${i.message}`, table: i.table, row: i.row, column: i.column };
  });
}

export const previewJobUrl = (id: string, doc: PrintKind, origin: string) =>
  `${origin}/addin/preview.html?src=${encodeURIComponent(`/api/print-jobs/${id}/${doc}`)}`;

function openPreview(url: string) {
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 70, displayInIframe: false });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** Проверяет акт; при ошибках возвращает их, иначе создаёт задание печати и открывает предпросмотр. */
export async function printAct(book: Book, actNumber: string, important: ImportantMap, doc: PrintKind, template: TemplateCode,
  options?: PrintOptions): Promise<Issue[]> {
  const { bundle, issues } = doc === "kj" || doc === "ip" ? buildCableBundle(book, actNumber, important, doc) : buildBundle(book, actNumber, important);
  if (!bundle) return issues;
  const { id } = await apiSend<{ id: string }>("POST", "/api/print-jobs", { ...bundle, template, options });
  openPreview(previewJobUrl(id, doc, location.origin));
  return [];
}
