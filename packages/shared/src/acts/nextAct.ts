// 0.32: «Следующий акт» — копия акта того же вида работ: номер +1, работы продолжаются со следующего рабочего дня
// (той же длительности), шифр, нормативы, подписанты, ВОР-реквизиты — как в образце; схемы — с номерами +1 и датой
// нового акта (без сканов); материалы акта — те же, без количества. АВК не копируется (у каждого акта свой).
import { TABLES, type TableName } from "../workbook/schema.ts";
import type { TableData, TableStore } from "../workbook/store.ts";
import { cellText, excelSerialToIso, isoToExcelSerial, parseDateCell, type CellValue } from "../workbook/values.ts";

const H = (t: TableName, key: string) => TABLES[t].columns.find((c) => c.key === key)!.header;

/** Номер +1 по последней группе цифр с сохранением нулей: «АОВ1.01.00.9» → «АОВ1.01.00.10», «АОСР-007» → «АОСР-008».
 *  Без цифр — «-2». Занятые номера пропускаются. */
export function nextNumber(n: string, taken: ReadonlySet<string> = new Set()): string {
  const bump = (s: string): string => {
    const m = /^(.*?)(\d+)(\D*)$/.exec(s);
    if (!m) return `${s}-2`;
    const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
    return `${m[1]}${next}${m[3]}`;
  };
  let out = bump(n);
  for (let i = 0; i < 1000 && taken.has(out.toLowerCase()); i++) out = bump(out);
  return out;
}

const iso = (v: CellValue): string | null => {
  const p = parseDateCell(v);
  return p.ok ? p.value : null;
};
const addDays = (d: string, n: number) => excelSerialToIso(isoToExcelSerial(d) + n);
/** Следующий день после d, не воскресенье (как в ОЖР). */
const nextWorkDay = (d: string) => {
  let x = addDays(d, 1);
  if (new Date(`${x}T00:00:00Z`).getUTCDay() === 0) x = addDays(x, 1);
  return x;
};

const record = (t: TableData, i: number): Record<string, CellValue> => Object.fromEntries(t.headers.map((h, j) => [h, t.rows[i][j] ?? null]));

/** Образец для нового акта: последний акт с тем же «Видом работ», что у from; нет вида — сам from. */
export function sampleAct(acts: TableData, from: number): number {
  const wk = acts.headers.indexOf(H("Акты", "workKinds"));
  const kind = wk >= 0 ? cellText(acts.rows[from][wk] ?? null).toLowerCase() : "";
  if (!kind) return from;
  for (let i = acts.rows.length - 1; i >= 0; i--) if (cellText(acts.rows[i][wk] ?? null).toLowerCase() === kind) return i;
  return from;
}

export interface NextAct {
  act: Record<string, CellValue>;
  schemes: Record<string, CellValue>[];
  materials: Record<string, CellValue>[];
  number: string;
  /** Индекс строки-образца в «Актах». */
  sample: number;
}

/** Значения нового акта по образцу (строка from таблицы «Акты» или последний акт того же вида работ). */
export function nextActValues(acts: TableData, from: number, schemes: TableData | null, materials: TableData | null): NextAct {
  const sample = sampleAct(acts, from);
  const a = record(acts, sample);
  const hn = H("Акты", "baseNumber");
  const old = cellText(a[hn]);
  const taken = new Set(acts.rows.map((r) => cellText(r[acts.headers.indexOf(hn)] ?? null).toLowerCase()));
  const number = nextNumber(old, taken);
  const act: Record<string, CellValue> = { ...a, [hn]: number, [H("Акты", "avkNumber")]: null, [H("Акты", "avkDate")]: null };
  const s = iso(a[H("Акты", "dateStart")]),
    e = iso(a[H("Акты", "dateEnd")]);
  let actDate: number | null = null;
  if (e) {
    const len = s && s <= e ? isoToExcelSerial(e) - isoToExcelSerial(s) : 0;
    const start = nextWorkDay(e);
    let end = addDays(start, len);
    if (new Date(`${end}T00:00:00Z`).getUTCDay() === 0) end = addDays(end, 1);
    actDate = isoToExcelSerial(end);
    act[H("Акты", "dateStart")] = isoToExcelSerial(start);
    act[H("Акты", "dateEnd")] = actDate;
    act[H("Акты", "date")] = actDate;
  }
  const ofAct = (t: TableData | null, table: TableName) => {
    if (!t) return [];
    const ai = t.headers.indexOf(H(table, "act"));
    return t.rows.map((_, i) => i).filter((i) => cellText(t.rows[i][ai] ?? null) === old);
  };
  const schemeNumbers = new Set((schemes?.rows ?? []).map((r) => cellText(r[schemes!.headers.indexOf(H("Схемы", "number"))] ?? null).toLowerCase()));
  const outSchemes = ofAct(schemes, "Схемы").map((i) => {
    const r = record(schemes!, i);
    const num = cellText(r[H("Схемы", "number")]);
    const nn = num ? nextNumber(num, schemeNumbers) : "";
    if (nn) schemeNumbers.add(nn.toLowerCase());
    return {
      ...r,
      [H("Схемы", "act")]: number,
      [H("Схемы", "number")]: nn || null,
      [H("Схемы", "date")]: actDate ?? r[H("Схемы", "date")],
      [H("Схемы", "file")]: null,
    };
  });
  const outMaterials = ofAct(materials, "МатериалыАктов").map((i) => {
    const r = record(materials!, i);
    return { ...r, [H("МатериалыАктов", "act")]: number, [H("МатериалыАктов", "quantity")]: null };
  });
  return { act, schemes: outSchemes, materials: outMaterials, number, sample };
}

/** Добавляет следующий акт сразу после образца, его схемы и материалы — в конец своих таблиц. Возвращает строку акта. */
export async function addNextAct(store: TableStore, from: number): Promise<{ row: number; number: string; schemes: number; materials: number }> {
  const acts = await store.read("Акты");
  if (!acts || !acts.rows[from]) throw new Error("Выберите акт-образец в «Базе актов»");
  const schemes = await store.read("Схемы");
  const materials = await store.read("МатериалыАктов");
  const v = nextActValues(acts, from, schemes, materials);
  const row = await store.insert("Акты", v.sample + 1, [v.act]);
  if (schemes && v.schemes.length) await store.insert("Схемы", schemes.rows.length, v.schemes);
  if (materials && v.materials.length) await store.insert("МатериалыАктов", materials.rows.length, v.materials);
  return { row, number: v.number, schemes: v.schemes.length, materials: v.materials.length };
}
