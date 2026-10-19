// Разбор листа расчёта коммерческой стоимости (РКЦ) в позиции спецификации: №п/п, раздел, наименование, ед., кол-во.
// Цены и суммы не читаются.
import { cellText, type CellValue } from "../workbook/values.ts";

export interface RkcItem { number: string; section: string; name: string; unit: string; quantity: number }

export class RkcError extends Error {}

const norm = (v: CellValue) => cellText(v).toUpperCase().replace(/[\s.]/g, "");
const HEAD = {
  number: (s: string) => s.startsWith("№П/П") || s.startsWith("№ПП"),
  name: (s: string) => s.startsWith("НАИМЕНОВАНИЕ"),
  unit: (s: string) => s.startsWith("ЕД") && s.includes("ИЗМ"),
  quantity: (s: string) => s.startsWith("КОЛ-ВО") || s.startsWith("КОЛИЧЕСТВО"),
};
const SKIP = /^(всего|итого|ндс|зач[её]т аванса|гарантийное удержание|к оплате|-{2,})/i;

function numberText(v: CellValue): string {
  if (typeof v === "number") return String(v);
  return cellText(v).trim();
}

function quantity(v: CellValue): number | null {
  if (typeof v === "number") return v;
  const s = cellText(v).replace(/[\s ]/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseRkc(grid: CellValue[][]): { items: RkcItem[]; warnings: string[] } {
  let headAt = -1;
  let col = { number: -1, name: -1, unit: -1, quantity: -1 };
  for (let r = 0; r < grid.length && headAt < 0; r++) {
    const cells = (grid[r] ?? []).map(norm);
    const find = (k: keyof typeof HEAD) => cells.findIndex(HEAD[k]);
    const c = { number: find("number"), name: find("name"), unit: find("unit"), quantity: find("quantity") };
    if (Object.values(c).every((i) => i >= 0)) { headAt = r; col = c; }
  }
  if (headAt < 0) throw new RkcError("Не найдена шапка РКЦ: нужны столбцы «№ п/п», «Наименование», «Ед. изм.», «Кол-во»");

  const items: RkcItem[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();
  let section = "";
  let noNumber = 0;
  for (const row of grid.slice(headAt + 1)) {
    const at = (i: number) => row?.[i] ?? null;
    const nameCell = at(col.name);
    if (typeof nameCell !== "string") continue; // пустые строки и нумерация столбцов (1, 2, 3…)
    const name = nameCell.trim();
    if (!name || SKIP.test(name)) continue;
    const unit = cellText(at(col.unit)).trim();
    const q = quantity(at(col.quantity));
    if (!unit && q === null) { section = name; continue; }
    if (!unit) continue; // строка-подитог без единицы
    let number = numberText(at(col.number));
    if (!number) {
      number = `б/н-${++noNumber}`;
      warnings.push(`Позиция без №п/п: ${name} — присвоен ${number}`);
    } else if (used.has(number)) {
      let k = 2;
      while (used.has(`${number}-${k}`)) k++;
      warnings.push(`Повтор №п/п ${number}: ${name} — присвоен ${number}-${k}`);
      number = `${number}-${k}`;
    }
    if (q === null) warnings.push(`Нет количества: ${number} ${name} — принято 0`);
    used.add(number);
    items.push({ number, section, name, unit, quantity: q ?? 0 });
  }
  return { items, warnings };
}
