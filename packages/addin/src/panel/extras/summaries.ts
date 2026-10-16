// Сводки для дополнений разделов: акт, материал, кабельный журнал.
import { cellText, splitRefs, parseNumberCell } from "@idk/shared/workbook/values";
import type { Book, BookRow } from "@idk/shared/workbook/records";

const ofAct = (book: Book, t: "Схемы" | "МатериалыАктов" | "ВОР" | "КабельныйЖурнал", act: string) =>
  (book.tables[t] ?? []).filter((r) => cellText(r.v.act) === act.trim());

export function actSummary(book: Book, act: string) {
  return { schemes: ofAct(book, "Схемы", act).length, materials: ofAct(book, "МатериалыАктов", act).length, vor: ofAct(book, "ВОР", act).length };
}

export function docsOfMaterial(book: Book, name: string): BookRow[] {
  const n = name.trim();
  return (book.tables["ДокументыКачества"] ?? []).filter((r) => splitRefs(r.v.materials).includes(n));
}

export function cableTotal(book: Book, act: string): number {
  const sum = ofAct(book, "КабельныйЖурнал", act).reduce((s, r) => {
    const p = parseNumberCell(r.v.cableLength);
    return s + (p.ok && p.value ? p.value : 0);
  }, 0);
  return Math.round(sum * 1000) / 1000;
}
