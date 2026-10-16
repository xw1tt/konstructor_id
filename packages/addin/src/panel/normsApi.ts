// Справочник нормативов: адреса запросов к серверу и чистые помощники экрана «Норматив».
import { appendDesignation } from "@idk/shared/normativ";
import { sectionLabel, type NormSection, type RefreshState } from "@idk/shared/normCatalog";
import type { CellValue } from "@idk/shared/workbook/values";

export const PAGE_SIZE = 100;

export function normsQuery(p: { section?: NormSection | null; q: string; offset: number }): string {
  const u = new URLSearchParams();
  if (p.section) u.set("section", p.section);
  if (p.q.trim()) u.set("q", p.q.trim());
  u.set("offset", String(p.offset));
  u.set("limit", String(PAGE_SIZE));
  return `/api/norms?${u.toString().replace(/\+/g, "%20")}`;
}

/** Значение ячейки после «В ячейку»: пустая — обозначение, иначе дописать через запятую. */
export function cellAppend(current: CellValue, designation: string): { value: string } | { error: "Уже есть в ячейке" } {
  const text = current === null || current === undefined ? "" : String(current);
  const next = appendDesignation(text, designation);
  return next === null ? { error: "Уже есть в ячейке" } : { value: next };
}

export function refreshText(s: RefreshState): string {
  if (s.running && s.section) return `Обновляю: ${sectionLabel(s.section)}, страница ${s.page}${s.pages ? ` из ${s.pages}` : ""}`;
  if (s.running) return "Обновляю…";
  return s.error ?? "";
}

export function docsCount(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? "документ" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "документа" : "документов";
  return `${n} ${word}`;
}
