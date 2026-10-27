// План 30: материалы акта выбираются в карточке акта (лист «Материалы в актах» — служебный), документы качества
// добавляются и привязываются в карточке материала. Здесь — чистые правила: что добавить, изменить и убрать.
import { column } from "../workbook/schema.ts";
import { cellText, splitRefs, type CellValue } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { BookChange } from "../ai/changes.ts";

export interface ActMaterialPick { material: string; quantity: number | null; position: string }
export interface ActMaterialRow extends ActMaterialPick { row: number }

const H = (k: string) => column("МатериалыАктов", k).header;
const norm = (s: string) => s.trim().toLowerCase();
const num = (v: CellValue): number | null => {
  if (typeof v === "number") return v;
  const t = cellText(v).replace(",", ".").replace(/\s/g, "");
  return t && Number.isFinite(Number(t)) ? Number(t) : null;
};

/** Материалы акта по порядку строк «Материалов в актах». */
export function actMaterialRows(book: Book, act: string): ActMaterialRow[] {
  return (book.tables["МатериалыАктов"] ?? []).filter((r) => cellText(r.v.act) === act).map((r) => ({
    row: r.row, material: cellText(r.v.material), quantity: num(r.v.quantity ?? null), position: cellText(r.v.position),
  }));
}

/**
 * Правки «Материалов в актах» по выбору в карточке: снятый материал — удалить строку (повторы — тоже), новый —
 * добавить в конец, изменённые количество и № поз. — записать. Материал ищется без учёта регистра.
 */
export function planActMaterials(book: Book, act: string, picks: ActMaterialPick[]): BookChange[] {
  const cur = actMaterialRows(book, act);
  const changes: BookChange[] = [];
  const del: number[] = [];
  const add: Record<string, CellValue>[] = [];
  const seen = new Set<string>();
  for (const p of picks) {
    const k = norm(p.material);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const rows = cur.filter((r) => norm(r.material) === k);
    const pos = p.position.trim() || "б/н";
    if (!rows.length) {
      add.push({ [H("act")]: act, [H("material")]: p.material.trim(), [H("position")]: pos, [H("quantity")]: p.quantity });
      continue;
    }
    const [first, ...dups] = rows;
    del.push(...dups.map((r) => r.row));
    const values: Record<string, CellValue> = {};
    if (first.quantity !== p.quantity) values[H("quantity")] = p.quantity;
    if ((first.position || "б/н") !== pos) values[H("position")] = pos;
    if (Object.keys(values).length) changes.push({ kind: "update", table: "МатериалыАктов", row: first.row, values });
  }
  for (const r of cur) if (!seen.has(norm(r.material))) del.push(r.row);
  if (del.length) changes.push({ kind: "delete", table: "МатериалыАктов", rows: [...new Set(del)].sort((a, b) => a - b) });
  if (add.length) changes.push({ kind: "add", table: "МатериалыАктов", rows: add });
  return changes;
}

/** Итог для пользователя: «добавлено 2, изменено 1, убрано 3». */
export function describeActMaterials(changes: BookChange[]): string {
  const n = (k: BookChange["kind"]) => changes.filter((c) => c.kind === k).reduce((s, c) => s + (c.kind === "add" ? c.rows.length : c.kind === "delete" ? c.rows.length : 1), 0);
  const parts = [n("add") && `добавлено ${n("add")}`, n("update") && `изменено ${n("update")}`, n("delete") && `убрано ${n("delete")}`].filter(Boolean);
  return parts.length ? parts.join(", ") : "без изменений";
}

const DH = (k: string) => column("ДокументыКачества", k).header;

/** Строка нового документа качества материала (ячейки по заголовкам; даты — как ввёл пользователь, ДД.ММ.ГГГГ). */
export function newQualityDoc(material: string, d: { type: string; number: string; date: CellValue; validUntil: CellValue; sheets: number | null }): Record<string, CellValue> {
  return {
    [DH("materials")]: material.trim(), [DH("type")]: d.type, [DH("number")]: d.number.trim(),
    [DH("issueDate")]: d.date ?? null, [DH("validUntil")]: d.validUntil ?? null, [DH("sheets")]: d.sheets,
  };
}

/** «Материалы» документа после привязки или отвязки материала (без повторов, через «; »). */
export function docMaterials(current: CellValue, material: string, on: boolean): string {
  const list = splitRefs(current ?? null).filter((m) => norm(m) !== norm(material));
  return (on ? [...list, material.trim()] : list).join("; ");
}
