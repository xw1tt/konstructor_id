// План 13: шапка документа в таблице «Протоколы» для акта или комплекта.
import { cellText } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";

const txt = cellText;
const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** Акты комплекта по таблице «Акты комплектов» (без зависимости от реестра). */
export const actsOfKit = (book: Book, kit: string): string[] =>
  [...new Set((book.tables["АктыКомплектов"] ?? []).filter((r) => txt(r.v.kit) === kit).map((r) => txt(r.v.act)).filter(Boolean))];

/**
 * Строка «Протоколы» документа с кодом code: для акта — по «Акту»; для комплекта — по «Комплекту», иначе по акту комплекта
 * (шапка с пустым комплектом и актом этого комплекта).
 */
export function findHeader(book: Book, code: string, where: { act?: string; kit?: string }): BookRow | undefined {
  const rows = (book.tables["Протоколы"] ?? []).filter((r) => same(txt(r.v.doc), code));
  if (where.act !== undefined) return rows.find((r) => txt(r.v.act) === where.act);
  if (where.kit === undefined) return undefined;
  const acts = actsOfKit(book, where.kit);
  return rows.find((r) => txt(r.v.kit) === where.kit) ?? rows.find((r) => !txt(r.v.kit) && acts.includes(txt(r.v.act)));
}

/** Шапка по номеру документа. */
export const headerByNumber = (book: Book, number: string): BookRow | undefined =>
  (book.tables["Протоколы"] ?? []).find((r) => txt(r.v.number) === number.trim());
