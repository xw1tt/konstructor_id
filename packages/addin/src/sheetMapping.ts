import type { Material, MaterialInput } from "@idk/shared/schemas";

type Key = keyof MaterialInput;

/** Распознавание заголовков: проверяется по порядку, первое совпадение выигрывает. */
const HEADER_RULES: [Key, RegExp][] = [
  ["name", /наименование/i],
  ["article", /артикул/i],
  ["manufacturer", /производител|завод/i],
  ["unit", /^\s*ед/i],
  ["mark", /марка|^\s*тип\b/i],
];

export const SHEET_HEADERS: Record<Key, string> = {
  name: "Наименование", mark: "Марка", article: "Артикул", manufacturer: "Производитель", unit: "Ед. изм.",
};
const ORDER: Key[] = ["name", "mark", "article", "manufacturer", "unit"];

const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

/** Строки листа (первая — заголовки) → материалы. Строки без наименования пропускаются. */
export function rowsToMaterials(rows: string[][]): { materials: MaterialInput[]; errors: string[] } {
  const [header = [], ...data] = rows;
  const col: Partial<Record<Key, number>> = {};
  header.forEach((h, i) => {
    const text = cell(h);
    const rule = HEADER_RULES.find(([k, re]) => col[k] === undefined && re.test(text));
    if (rule) col[rule[0]] = i;
  });
  if (col.name === undefined) return { materials: [], errors: ["Не найдена колонка «Наименование»"] };
  const materials: MaterialInput[] = [];
  for (const row of data) {
    const get = (k: Key) => (col[k] === undefined ? "" : cell(row[col[k]!]));
    const m = { name: get("name"), mark: get("mark"), article: get("article"), manufacturer: get("manufacturer"), unit: get("unit") };
    if (m.name) materials.push(m);
  }
  return { materials, errors: [] };
}

export function materialsToRows(materials: Material[]): string[][] {
  return [ORDER.map((k) => SHEET_HEADERS[k]), ...materials.map((m) => ORDER.map((k) => m[k]))];
}

const keyOf = (m: MaterialInput) => `${m.name.trim().toLowerCase()}\u0000${m.mark.trim().toLowerCase()}`;

/** Отбрасывает материалы, уже существующие (по наименованию и марке без учёта регистра), и повторы внутри списка. */
export function splitNew(candidates: MaterialInput[], existing: MaterialInput[]): { add: MaterialInput[]; skipped: number } {
  const seen = new Set(existing.map(keyOf));
  const add: MaterialInput[] = [];
  for (const c of candidates) {
    const k = keyOf(c);
    if (seen.has(k)) continue;
    seen.add(k);
    add.push(c);
  }
  return { add, skipped: candidates.length - add.length };
}
