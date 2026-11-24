// 0.47: состав комплекта в окне программы — список актов по порядку → строки «Актов комплектов».
// Строки этого комплекта переписываются по порядку; лишние — удаляются, недостающие — добавляются после последней.
import type { Book } from "../workbook/records.ts";
import { cellText } from "../workbook/values.ts";
import { column } from "../workbook/schema.ts";
import type { TableStore } from "../workbook/store.ts";

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

/**
 * 0.52.2: комплект акта (карточка акта): акт — в одном комплекте. Строка добавляется в конец состава комплекта kit,
 * прежние строки акта убираются; kit пустой — акт выходит из комплектов.
 */
export async function setActKit(store: TableStore, book: Book, act: string, kit: string): Promise<void> {
  const rows = book.tables["АктыКомплектов"] ?? [];
  const own = rows.filter((r) => cellText(r.v.act) === act).map((r) => r.row);
  if (kit) {
    if (own.length === 1 && cellText(rows.find((r) => r.row === own[0])!.v.kit) === kit) return;
    const last = rows.filter((r) => cellText(r.v.kit) === kit).at(-1)?.row;
    const at = last === undefined ? rows.length : last + 1;
    await store.insert("АктыКомплектов", at, [{ [column("АктыКомплектов", "kit").header]: kit, [column("АктыКомплектов", "act").header]: act }]);
    const shifted = own.map((r) => (r >= at ? r + 1 : r));
    if (shifted.length)
      await store.remove(
        "АктыКомплектов",
        shifted.sort((x, y) => y - x),
      );
  } else if (own.length)
    await store.remove(
      "АктыКомплектов",
      [...own].sort((x, y) => y - x),
    );
}
