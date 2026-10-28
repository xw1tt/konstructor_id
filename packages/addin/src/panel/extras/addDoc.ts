// Добавление документа качества из панели (карточка материала, «Документы по сканам»): новый — в «Док.N» строк
// материалов; документ с тем же видом и номером уже есть — к нему дописываются материалы и, если не было, скан.
import { cellText, isoToExcelSerial, splitRefs } from "@idk/shared/workbook/values";
import { newQualityDoc, docMaterials } from "@idk/shared/acts/actMaterials";
import { flat } from "@idk/shared/scan/match";
import type { ExcelPort } from "../../book/excelPort.ts";

export interface NewDoc {
  type: string; number: string; date: string; valid: string; sheets: string; materials: string[];
  /** Загруженный скан (/api/files/:id). */
  scan: { id: number; name: string } | null;
}

const norm = (s: string) => s.trim().toLowerCase();
/** Номер для сравнения: без «№»/«N», пробелов и регистра; похожие латинские и русские буквы — одинаково. */
export const numKey = (s: string) => flat(s).replace(/^\s*(№|n|no\.?)\s*/i, "").replace(/[\s№]/g, "");

export async function addQualityDoc(port: ExcelPort, d: NewDoc): Promise<string> {
  const materials = [...new Set(d.materials.map((m) => m.trim()).filter(Boolean))];
  if (!materials.length) throw new Error("Отметьте материалы, к которым относится документ");
  if (!d.number.trim()) throw new Error("Укажите номер документа");
  if (await port.isFiltered("ДокументыКачества")) await port.clearFilters("ДокументыКачества");
  const t = await port.read("ДокументыКачества");
  if (!t) throw new Error("Таблица «Материалы» не найдена — нажмите «Обновить разметку»");
  const h = (n: string) => t.headers.indexOf(n);
  const same = t.rows.findIndex((r) => norm(cellText(r[h("Тип")] ?? null)) === norm(d.type) && numKey(cellText(r[h("Номер")] ?? null)) === numKey(d.number));
  const link = d.scan ? { "Скан": `${location.origin}/api/files/${d.scan.id}` } : null;
  if (same >= 0) {
    const before = cellText(t.rows[same][h("Материалы")] ?? null);
    let list = before;
    for (const m of materials) if (!splitRefs(list).some((x) => norm(x) === norm(m))) list = docMaterials(list, m, true);
    if (list !== before) await port.write("ДокументыКачества", same, { "Материалы": list });
    if (link && !t.links[same]?.[h("Скан")]) await port.write("ДокументыКачества", same, { "Скан": d.scan!.name }, link);
    const added = splitRefs(list).length - splitRefs(before).length;
    return added ? `документ уже был — добавлен к материалам: ${added}` : "документ уже есть у этих материалов";
  }
  const sheets = Number(d.sheets);
  const values = newQualityDoc(materials.join("; "), {
    type: d.type, number: d.number,
    date: d.date ? isoToExcelSerial(d.date) : null, validUntil: d.valid ? isoToExcelSerial(d.valid) : null,
    sheets: Number.isInteger(sheets) && sheets > 0 ? sheets : null,
  });
  const row = await port.insert("ДокументыКачества", t.rows.length, [values]);
  if (link) await port.write("ДокументыКачества", row, { "Скан": d.scan!.name }, link);
  return `добавлен к материалам: ${materials.length}`;
}
