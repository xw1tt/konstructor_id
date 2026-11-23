// 0.51: «Проверить книгу целиком» — чистота данных книги, которую не видят проверки актов: лишние пробелы (на них
// ломаются формулы Excel «Закрыто»/«РКЦ» — сравнение точное), строки чужих актов, дубли наименований, перерасход,
// подозрительные номера документов, латиница вперемешку с кириллицей. Только предупреждения; пробелы исправляются
// кнопкой «Убрать лишние пробелы» (fixSpaces).
import { TABLES, TABLE_NAMES, column, type TableName } from "../workbook/schema.ts";
import { cellText, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { TableStore } from "../workbook/store.ts";
import type { Warning } from "./predelivery.ts";

const txt = (v: CellValue | undefined) => cellText(v ?? null);
const key = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** Таблицы, вычисляемые программой (виртуальные и служебные) — пробелы в них не правятся. */
const SKIP = new Set<TableName>(["ДокументыКачества", "Спецификация"]);

/** Текстовые ячейки с пробелами в начале или в конце (кроме формул). */
export function spaceCells(book: Book): { table: TableName; row: number; key: string; header: string; value: string }[] {
  const out: { table: TableName; row: number; key: string; header: string; value: string }[] = [];
  for (const t of TABLE_NAMES) {
    if (SKIP.has(t)) continue;
    const cols = TABLES[t].columns.filter((c) => c.type !== "formula" && c.type !== "file");
    for (const r of book.tables[t] ?? [])
      for (const c of cols) {
        const v = r.v[c.key];
        if (typeof v === "string" && v.trim() && v !== v.trim()) out.push({ table: t, row: r.row, key: c.key, header: c.header, value: v });
      }
  }
  return out;
}

/** Убирает пробелы в начале и в конце текстовых ячеек (кроме формул и сканов). Возвращает число исправленных ячеек. */
export async function fixSpaces(store: TableStore, book: Book): Promise<number> {
  const cells = spaceCells(book);
  const byRow = new Map<string, { table: TableName; row: number; values: Record<string, CellValue> }>();
  for (const c of cells) {
    const k = `${c.table}|${c.row}`;
    const e = byRow.get(k) ?? byRow.set(k, { table: c.table, row: c.row, values: {} }).get(k)!;
    e.values[c.header] = c.value.trim();
  }
  for (const e of byRow.values()) await store.write(e.table, e.row, e.values);
  return cells.length;
}

const MIXED = /[А-Яа-яЁё][A-Za-z]|[A-Za-z][А-Яа-яЁё]/;
/** Слова, где латиница соседствует с кириллицей («КRONE», «орrанайзер»); единицы вида «5е», «нг(А)» — не считаются. */
export function mixedWords(s: string): string[] {
  return (s.match(/[A-Za-zА-Яа-яЁё0-9]+/g) ?? []).filter((w) => MIXED.test(w) && !/^\d+[A-Za-zА-Яа-яЁё]{1,2}$/.test(w));
}

export function checkBook(book: Book): Warning[] {
  const out: Warning[] = [];
  const rows = (t: TableName) => book.tables[t] ?? [];
  const H = (t: TableName, k: string) => column(t, k).header;
  const warn = (table: TableName, row: number | null, col: string, message: string) => out.push({ act: "", table, row, column: col, message });

  // 1. Лишние пробелы: по таблице — первые 10 ячеек и общее число.
  const spaces = spaceCells(book);
  const byTable = new Map<TableName, typeof spaces>();
  for (const s of spaces) (byTable.get(s.table) ?? byTable.set(s.table, []).get(s.table)!).push(s);
  for (const [t, list] of byTable) {
    for (const s of list.slice(0, 10))
      warn(
        t,
        s.row,
        s.header,
        `лишний пробел в ${/^\s/.test(s.value) ? "начале" : "конце"} «${s.value.trim().slice(0, 60)}» — из-за него не совпадают ссылки между листами и формулы Excel (Закрыто, РКЦ)`,
      );
    if (list.length > 10) warn(t, null, list[0].header, `и ещё ${list.length - 10} ячеек с лишними пробелами`);
  }

  // 2. Дубли наименований и номеров (без учёта регистра и пробелов).
  const dup = (t: TableName, k: string, what: string) => {
    const seen = new Map<string, number>();
    for (const r of rows(t)) {
      const v = key(txt(r.v[k]));
      if (!v) continue;
      if (seen.has(v)) warn(t, r.row, H(t, k), `${what} «${txt(r.v[k]).slice(0, 80)}» повторяется (строка ${seen.get(v)! + 1}) — программа возьмёт первую`);
      else seen.set(v, r.row);
    }
  };
  dup("Материалы", "name", "наименование");
  dup("Акты", "baseNumber", "номер акта");
  dup("Организации", "shortName", "организация");
  dup("Комплекты", "number", "номер комплекта");

  // 3. «Материалы в актах»: акт и материал должны быть в книге.
  const acts = new Set(rows("Акты").map((r) => key(txt(r.v.baseNumber))));
  const mats = new Set(rows("Материалы").map((r) => key(txt(r.v.name))));
  const foreign = new Map<string, { row: number; n: number }>();
  for (const r of rows("МатериалыАктов")) {
    const a = txt(r.v.act);
    const m = txt(r.v.material);
    if (!a && !m) continue;
    if (a && !acts.has(key(a))) {
      const f = foreign.get(a) ?? foreign.set(a, { row: r.row, n: 0 }).get(a)!;
      f.n++;
      continue;
    }
    if (m && !mats.has(key(m))) warn("МатериалыАктов", r.row, H("МатериалыАктов", "material"), `материала «${m.slice(0, 80)}» нет на листе «Материалы»`);
  }
  for (const [a, f] of foreign)
    warn(
      "МатериалыАктов",
      f.row,
      H("МатериалыАктов", "act"),
      `акта «${a}» нет в «Базе актов» (строк: ${f.n}) — старые данные: они попадают в «Закрыто» материалов; удалите или верните акт`,
    );

  // 4. Перерасход: по актам книги закрыто больше, чем по проекту.
  const closed = new Map<string, number>();
  for (const r of rows("МатериалыАктов")) {
    if (!acts.has(key(txt(r.v.act)))) continue;
    const q = parseNumberCell(r.v.quantity ?? null);
    if (q.ok && q.value !== null) closed.set(key(txt(r.v.material)), (closed.get(key(txt(r.v.material))) ?? 0) + q.value);
  }
  for (const r of rows("Материалы")) {
    const p = parseNumberCell(r.v.quantity ?? null);
    const c = closed.get(key(txt(r.v.name)));
    if (!p.ok || p.value === null || c === undefined) continue;
    if (c > p.value + 1e-9)
      warn(
        "Материалы",
        r.row,
        H("Материалы", "quantity"),
        `по актам закрыто ${+c.toFixed(3)} при ${+p.value.toFixed(3)} по проекту — перерасход ${+(c - p.value).toFixed(3)}`,
      );
  }

  // 5. Номера документов качества: без букв и цифр («,/y») — опечатка; пустой номер — «б/н».
  for (const r of rows("Материалы"))
    for (const k of [1, 2, 3]) {
      const n = txt(r.v[`d${k}number`]);
      if (n && !/[0-9A-Za-zА-Яа-яЁё]{2,}|\d/.test(n.replace(/^б\s*[/.\\]?\s*н\.?$/i, "бн")))
        warn("Материалы", r.row, H("Материалы", `d${k}number`), `номер документа «${n}» похож на опечатку (для документа без номера — «б/н»)`);
    }

  // 6. Номера схем внутри акта не повторяются.
  const schemes = new Map<string, number>();
  for (const r of rows("Схемы")) {
    const n = key(txt(r.v.number));
    if (!n) continue;
    const k = `${key(txt(r.v.act))}|${n}`;
    if (schemes.has(k))
      warn("Схемы", r.row, H("Схемы", "number"), `номер схемы «${txt(r.v.number)}» уже есть у акта «${txt(r.v.act)}» (строка ${schemes.get(k)! + 1})`);
    else schemes.set(k, r.row);
  }

  // 7. Латиница вперемешку с кириллицей в наименованиях и марках (не найдёт поиск, подозрительно для технадзора).
  let mixed = 0;
  for (const r of rows("Материалы"))
    for (const k of ["name", "mark"] as const) {
      const w = mixedWords(txt(r.v[k]));
      if (w.length && mixed++ < 15) warn("Материалы", r.row, H("Материалы", k), `смешаны латиница и кириллица: ${w.slice(0, 4).join(", ")}`);
    }
  if (mixed > 15) warn("Материалы", null, H("Материалы", "name"), `и ещё ${mixed - 15} наименований и марок со смешанными буквами`);
  return out;
}
