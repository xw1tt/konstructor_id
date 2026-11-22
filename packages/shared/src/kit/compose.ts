// 0.47: состав комплекта в окне программы — список актов по порядку → строки «Актов комплектов».
// Строки этого комплекта переписываются по порядку; лишние — удаляются, недостающие — добавляются после последней.
import type { Book } from "../workbook/records.ts";
import { cellText } from "../workbook/values.ts";

export interface KitComposePlan {
  /** Перезаписать строки (индекс строки таблицы → акт). */
  write: { row: number; act: string }[];
  /** Добавить строки после строки after (null — в конец таблицы). */
  insert: { after: number | null; acts: string[] } | null;
  /** Удалить строки (индексы таблицы). */
  remove: number[];
}

export function planKitActs(book: Book, kit: string, acts: string[]): KitComposePlan {
  const rows = (book.tables["АктыКомплектов"] ?? []).filter((r) => cellText(r.v.kit) === kit);
  const list = [...new Set(acts.filter(Boolean))];
  const write: KitComposePlan["write"] = [];
  rows.slice(0, list.length).forEach((r, i) => {
    if (cellText(r.v.act) !== list[i]) write.push({ row: r.row, act: list[i] });
  });
  const extra = list.slice(rows.length);
  const last = rows.length ? rows[rows.length - 1].row : null;
  return {
    write,
    insert: extra.length ? { after: last, acts: extra } : null,
    remove: rows.slice(list.length).map((r) => r.row),
  };
}
