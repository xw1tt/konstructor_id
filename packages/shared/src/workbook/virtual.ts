// План 31: «Спецификация» и «ДокументыКачества» — виртуальные таблицы. В Excel одна таблица «Материалы»: строка —
// материал, его позиция спецификации (№ п/п РКЦ, раздел, кол-во по проекту) и до трёх документов качества.
// Здесь: вывод виртуальных строк из «Материалов» и запись в них (обёртка хранилища), так что печать, реестр,
// закрытие спецификации, библиотека и помощник работают со «Спецификацией» и «ДокументамиКачества» как прежде.
import { TABLES, DOC_SLOTS, column, slotKey, type TableName } from "./schema.ts";
import { cellText, splitRefs, type CellValue } from "./values.ts";
import { isExampleRow } from "./examples.ts";
import type { TableData, TableStore } from "./store.ts";

export const VIRTUAL_TABLES = ["Спецификация", "ДокументыКачества"] as const satisfies readonly TableName[];
export type VirtualTable = (typeof VIRTUAL_TABLES)[number];
export const isVirtual = (t: string): t is VirtualTable => (VIRTUAL_TABLES as readonly string[]).includes(t);

const M = (k: string) => column("Материалы", k).header;
const norm = (v: CellValue | undefined) => cellText(v ?? null).trim().toLowerCase();
const empty = (v: CellValue | undefined) => cellText(v ?? null).trim() === "";

/** Строки «Материалов» по заголовкам; example — строка-пример новой книги. */
interface Phys { row: number; v: Record<string, CellValue>; link: Record<string, string | null>; example: boolean }
function physRows(t: TableData): Phys[] {
  return t.rows.map((r, row) => ({
    row,
    v: Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? null])),
    link: Object.fromEntries(t.headers.map((h, i) => [h, t.links[row]?.[i] ?? null])),
    example: isExampleRow(r, "Материалы", t.headers),
  }));
}

/** Слот документа в строке материала. */
export interface Slot { row: number; slot: number }
/** Документ: слоты с одинаковыми видом и номером — один документ на несколько материалов. */
export interface DocGroup { key: string; slots: Slot[] }
/** Позиция спецификации: строки «Материалов» с одним № п/п РКЦ. */
export interface SpecGroup { number: string; rows: number[] }

const slotFilled = (p: Phys, k: number) => !empty(p.v[M(slotKey(k, "type"))]) || !empty(p.v[M(slotKey(k, "number"))]);
const docKey = (p: Phys, k: number) => {
  const n = norm(p.v[M(slotKey(k, "number"))]);
  return n ? `${norm(p.v[M(slotKey(k, "type"))])}|${n}` : `@${p.row}:${k}`;
};

export function docGroups(t: TableData): DocGroup[] {
  const out: DocGroup[] = [];
  const byKey = new Map<string, DocGroup>();
  // Строки-примеры новой книги — не данные: документов и позиций из них нет.
  for (const p of physRows(t)) for (const k of DOC_SLOTS) {
    if (p.example || !slotFilled(p, k)) continue;
    const key = docKey(p, k);
    const g = byKey.get(key) ?? (byKey.set(key, { key, slots: [] }).get(key)!);
    if (!g.slots.length) out.push(g);
    g.slots.push({ row: p.row, slot: k });
  }
  return out;
}

export function specGroups(t: TableData): SpecGroup[] {
  const out: SpecGroup[] = [];
  const by = new Map<string, SpecGroup>();
  for (const p of physRows(t)) {
    const n = cellText(p.v[M("rkc")]).trim();
    if (!n || p.example) continue;
    const g = by.get(n) ?? (by.set(n, { number: n, rows: [] }).get(n)!);
    if (!g.rows.length) out.push(g);
    g.rows.push(p.row);
  }
  return out;
}

const DOC_FIELDS = ["type", "number", "issueDate", "validUntil", "sheets", "registryName", "file"] as const;
const docHeader = (key: string) => column("ДокументыКачества", key).header;
const specHeader = (key: string) => column("Спецификация", key).header;
/** Поле спецификации → столбец «Материалов». */
const SPEC_TO_MAT: Record<string, string> = { number: "rkc", section: "section", name: "name", unit: "unit", quantity: "quantity", closed: "closed", rest: "rest", source: "source", note: "note" };

/** Виртуальная таблица из «Материалов». */
export function deriveTable(name: VirtualTable, t: TableData): TableData {
  const ps = physRows(t);
  const at = new Map(ps.map((p) => [p.row, p]));
  if (name === "ДокументыКачества") {
    const headers = TABLES["ДокументыКачества"].columns.map((c) => c.header);
    const rows: CellValue[][] = [], links: (string | null)[][] = [];
    for (const g of docGroups(t)) {
      const first = (f: (typeof DOC_FIELDS)[number]) => {
        for (const s of g.slots) { const v = at.get(s.row)!.v[M(slotKey(s.slot, f))]; if (!empty(v)) return v; }
        return null;
      };
      const link = g.slots.map((s) => at.get(s.row)!.link[M(slotKey(s.slot, "file"))]).find(Boolean) ?? null;
      const mats = [...new Set(g.slots.map((s) => cellText(at.get(s.row)!.v[M("name")]).trim()).filter(Boolean))];
      const rec: Record<string, CellValue> = { materials: mats.join("; ") };
      for (const f of DOC_FIELDS) rec[f] = first(f);
      rows.push(TABLES["ДокументыКачества"].columns.map((c) => rec[c.key] ?? null));
      links.push(TABLES["ДокументыКачества"].columns.map((c) => (c.key === "file" ? link : null)));
    }
    return { name, headers, rows, links };
  }
  const headers = TABLES["Спецификация"].columns.map((c) => c.header);
  const rows: CellValue[][] = specGroups(t).map((g) => {
    const rs = g.rows.map((r) => at.get(r)!);
    const firstOf = (k: string) => rs.map((p) => p.v[M(k)]).find((v) => !empty(v)) ?? null;
    const num = (v: CellValue) => (typeof v === "number" ? v : Number(cellText(v).replace(",", ".")) || 0);
    const quantity = firstOf("quantity");
    const closed = rs.reduce((s, p) => s + num(p.v[M("closed")] ?? 0), 0);
    const rec: Record<string, CellValue> = {
      number: g.number, section: firstOf("section"), name: rs[0].v[M("name")] ?? null, unit: firstOf("unit"), quantity,
      closed, rest: quantity === null ? null : num(quantity) - closed, source: firstOf("source"), note: firstOf("note"),
    };
    return TABLES["Спецификация"].columns.map((c) => rec[c.key] ?? null);
  });
  return { name, headers, rows, links: rows.map((r) => r.map(() => null)) };
}

/** Строка материала по наименованию (без учёта регистра и пробелов по краям). */
const findMaterial = (ps: Phys[], name: string) => ps.find((p) => norm(p.v[M("name")]) === norm(name));
const freeSlot = (p: Phys, used: Set<string> = new Set()) => DOC_SLOTS.find((k) => !slotFilled(p, k) && !used.has(`${p.row}:${k}`));

/** Значения документа (по заголовкам виртуальной таблицы) → столбцы слота k. */
function slotValues(k: number, values: Record<string, CellValue>): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const f of DOC_FIELDS) if (docHeader(f) in values) out[M(slotKey(k, f))] = values[docHeader(f)];
  return out;
}
const slotLinks = (k: number, links: Record<string, string | null>) =>
  (docHeader("file") in links ? { [M(slotKey(k, "file"))]: links[docHeader("file")] } : {});
const clearSlot = (k: number) => Object.fromEntries(DOC_FIELDS.map((f) => [M(slotKey(k, f)), null]));

/** Ячейка «Материалов» для строки и столбца виртуальной таблицы (переход к ячейке, ошибки проверки). */
export function physicalCell(name: VirtualTable, t: TableData, row: number, header: string | null): { row: number; column: string } | null {
  if (name === "ДокументыКачества") {
    const g = docGroups(t)[row];
    if (!g) return null;
    const s = g.slots[0];
    const key = TABLES["ДокументыКачества"].columns.find((c) => c.header === header)?.key;
    const col = key && key !== "materials" ? M(slotKey(s.slot, key as (typeof DOC_FIELDS)[number])) : M("name");
    return { row: s.row, column: col };
  }
  const g = specGroups(t)[row];
  if (!g) return null;
  const key = TABLES["Спецификация"].columns.find((c) => c.header === header)?.key;
  return { row: g.rows[0], column: M(SPEC_TO_MAT[key ?? "number"] ?? "rkc") };
}

/** Столбец «Материалов», по которому фильтровать вместо столбца виртуальной таблицы. */
export function physicalHeader(name: VirtualTable, header: string): string {
  const key = TABLES[name].columns.find((c) => c.header === header)?.key;
  if (name === "Спецификация") return M(SPEC_TO_MAT[key ?? "number"] ?? "rkc");
  return key === "materials" || !key ? M("name") : M(slotKey(1, key as (typeof DOC_FIELDS)[number]));
}

/** Строка материала с данными, кроме позиции спецификации (её нельзя удалять вместе с позицией). */
function hasMaterialData(p: Phys) {
  return ["mark", "article", "manufacturer"].some((k) => !empty(p.v[M(k)])) || DOC_SLOTS.some((k) => slotFilled(p, k));
}

/**
 * Хранилище с виртуальными таблицами поверх «сырого» (Excel или память). Если в сыром хранилище есть настоящая
 * таблица «Спецификация» или «ДокументыКачества» (книга прежней версии до «Обновить разметку», тесты), она
 * используется как есть.
 */
export function withVirtualTables<S extends TableStore>(raw: S): TableStore & {
  isVirtual(name: TableName): Promise<boolean>;
  physical(name: TableName, row: number, header: string | null): Promise<{ table: TableName; row: number; column: string | null } | null>;
} {
  const own = async (name: TableName) => isVirtual(name) && (await raw.read(name)) === null;
  const mats = async () => {
    const t = await raw.read("Материалы");
    if (!t) throw new Error("Таблица «Материалы» не найдена — нажмите «Обновить разметку»");
    return t;
  };
  const store = {
    async isVirtual(name: TableName) { return own(name); },
    async physical(name: TableName, row: number, header: string | null) {
      if (!(await own(name))) return { table: name, row, column: header };
      const c = physicalCell(name as VirtualTable, await mats(), row, header);
      return c ? { table: "Материалы" as TableName, row: c.row, column: c.column } : null;
    },
    async read(name: TableName) {
      if (!isVirtual(name)) return raw.read(name);
      const real = await raw.read(name);
      if (real) return real;
      const t = await raw.read("Материалы");
      return t ? deriveTable(name, t) : null;
    },
    async readMany(names: readonly TableName[]) {
      const phys = [...new Set(names.flatMap((n) => (isVirtual(n) ? [n, "Материалы" as TableName] : [n])))];
      const got = raw.readMany ? await raw.readMany(phys) : new Map(await Promise.all(phys.map(async (n) => [n, await raw.read(n)] as const)));
      const out = new Map<TableName, TableData | null>();
      for (const n of names) {
        if (!isVirtual(n)) { out.set(n, got.get(n) ?? null); continue; }
        const real = got.get(n);
        const m = got.get("Материалы");
        out.set(n, real ?? (m ? deriveTable(n, m) : null));
      }
      return out;
    },
    async write(name: TableName, row: number, values: Record<string, CellValue>, links: Record<string, string | null> = {}) {
      if (!(await own(name))) return raw.write(name, row, values, links);
      const t = await mats();
      const ps = physRows(t);
      if (name === "Спецификация") {
        const g = specGroups(t)[row];
        if (!g) throw new Error(`Нет позиции спецификации ${row + 1}`);
        for (const [i, r] of g.rows.entries()) {
          const out: Record<string, CellValue> = {};
          for (const [k, mk] of Object.entries(SPEC_TO_MAT)) {
            if (!(specHeader(k) in values) || k === "closed" || k === "rest") continue;
            // Наименование и количество — у первой строки позиции; остальное — у всех.
            if ((k === "name" || k === "quantity") && i > 0) continue;
            out[M(mk)] = values[specHeader(k)];
          }
          if (Object.keys(out).length) await raw.write("Материалы", r, out);
        }
        return;
      }
      const g = docGroups(t)[row];
      if (!g) throw new Error(`Нет документа качества ${row + 1}`);
      const { [docHeader("materials")]: matsValue, ...rest } = values;
      for (const s of g.slots) {
        const v = slotValues(s.slot, rest);
        const l = slotLinks(s.slot, links);
        if (Object.keys(v).length || Object.keys(l).length) await raw.write("Материалы", s.row, v, l);
      }
      if (docHeader("materials") in values) {
        const want = splitRefs(matsValue ?? null);
        const at = new Map(ps.map((p) => [p.row, p]));
        const have = g.slots.map((s) => ({ ...s, name: norm(at.get(s.row)!.v[M("name")]) }));
        // Отвязать: материал убран из списка — слот очищается.
        for (const h of have) if (!want.some((w) => norm(w) === h.name)) await raw.write("Материалы", h.row, clearSlot(h.slot), { [M(slotKey(h.slot, "file"))]: null });
        // Привязать: новый материал — свободный слот его строки с полями документа (как у первого слота).
        const src = at.get(g.slots[0].row)!, k0 = g.slots[0].slot;
        const fields = Object.fromEntries(DOC_FIELDS.map((f) => [M(slotKey(k0, f)), src.v[M(slotKey(k0, f))] ?? null]));
        for (const w of want) {
          if (have.some((h) => h.name === norm(w))) continue;
          const p = findMaterial(ps, w);
          if (!p) throw new Error(`Материала «${w}» нет в таблице «Материалы»`);
          const k = freeSlot(p);
          if (!k) throw new Error(`У материала «${w}» уже ${DOC_SLOTS.length} документа — освободите столбцы «Док.N»`);
          await raw.write("Материалы", p.row,
            Object.fromEntries(DOC_FIELDS.map((f) => [M(slotKey(k, f)), fields[M(slotKey(k0, f))]])),
            src.link[M(slotKey(k0, "file"))] ? { [M(slotKey(k, "file"))]: src.link[M(slotKey(k0, "file"))] } : {});
        }
      }
    },
    async insert(name: TableName, at: number, rows: Record<string, CellValue>[]): Promise<number> {
      if (!(await own(name))) return raw.insert(name, at, rows);
      if (!rows.length) return at;
      if (name === "Спецификация") {
        const recs = rows.map((r) => Object.fromEntries(Object.entries(SPEC_TO_MAT)
          .filter(([k]) => specHeader(k) in r && k !== "closed" && k !== "rest").map(([k, mk]) => [M(mk), r[specHeader(k)]])));
        const t = await mats();
        await raw.insert("Материалы", t.rows.length, recs);
        const groups = specGroups((await mats()));
        const first = cellText(recs[0][M("rkc")] ?? null).trim();
        const i = groups.findIndex((g) => g.number === first);
        return i >= 0 ? i : groups.length - rows.length;
      }
      // Документ: в свободный слот строки каждого материала из «Материалов» (нет строки — создаётся).
      let placed: Slot | null = null;
      for (const r of rows) {
        let t = await mats();
        let ps = physRows(t);
        const names = splitRefs(r[docHeader("materials")] ?? null);
        if (!names.length) throw new Error("У документа качества не указаны материалы");
        for (const n of names) {
          let p = findMaterial(ps, n);
          if (!p) {
            await raw.insert("Материалы", t.rows.length, [{ [M("name")]: n.trim() }]);
            t = await mats();
            ps = physRows(t);
            p = findMaterial(ps, n)!;
          }
          const k = freeSlot(p);
          if (!k) throw new Error(`У материала «${n}» уже ${DOC_SLOTS.length} документа — освободите столбцы «Док.N»`);
          await raw.write("Материалы", p.row, slotValues(k, r));
          placed ??= { row: p.row, slot: k };
          t = await mats();
          ps = physRows(t);
        }
      }
      const groups = docGroups(await mats());
      const i = placed ? groups.findIndex((g) => g.slots.some((s) => s.row === placed!.row && s.slot === placed!.slot)) : -1;
      return i >= 0 ? i : groups.length - 1;
    },
    async remove(name: TableName, rows: number[]) {
      if (!(await own(name))) return raw.remove(name, rows);
      const t = await mats();
      if (name === "ДокументыКачества") {
        const gs = docGroups(t);
        for (const r of rows) for (const s of gs[r]?.slots ?? [])
          await raw.write("Материалы", s.row, clearSlot(s.slot), { [M(slotKey(s.slot, "file"))]: null });
        return;
      }
      // Позиция спецификации: строка без своих данных материала удаляется, у остальных очищаются поля позиции.
      const ps = new Map(physRows(t).map((p) => [p.row, p]));
      const gs = specGroups(t);
      const drop: number[] = [];
      // Материал из «Материалов в актах» не удаляется, даже если других данных у него нет.
      const am = await raw.read("МатериалыАктов");
      const ai = am ? am.headers.indexOf(column("МатериалыАктов", "material").header) : -1;
      const used = new Set(ai >= 0 ? am!.rows.map((r) => norm(r[ai] ?? null)) : []);
      for (const r of rows) for (const pr of gs[r]?.rows ?? []) {
        const p = ps.get(pr)!;
        if (hasMaterialData(p) || used.has(norm(p.v[M("name")]))) await raw.write("Материалы", pr, { [M("rkc")]: null, [M("section")]: null, [M("quantity")]: null, [M("source")]: null });
        else drop.push(pr);
      }
      if (drop.length) await raw.remove("Материалы", drop);
    },
    setting: (k: string) => raw.setting(k),
    setSetting: (k: string, v: string) => raw.setSetting(k, v),
    writeReport: (r: Parameters<TableStore["writeReport"]>[0]) => raw.writeReport(r),
  };
  return store;
}
