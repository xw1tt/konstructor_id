// Исполнительная схема в AutoCAD: данные для листа схемы из книги — ведомость объёмов работ на листе и основная надпись.
// Чертёж (подложка проекта и трасса) делает инженер; конструктор заполняет то, что уже есть в книге.
import { z } from "zod";
import { ROLE_BOOK_LABELS, column, type TableName } from "../workbook/schema.ts";
import { cellText, parseDateCell, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { Issue } from "../workbook/bundle.ts";
import { withNo } from "../acts/format.ts";

export const SheetRow = z.object({
  n: z.number().int(),
  name: z.string(),
  /** «Тип, марка, обозначение»: марка, иначе артикул. */
  mark: z.string(),
  supplier: z.string(),
  unit: z.string(),
  quantity: z.number(),
  note: z.string(),
});
export type SheetRow = z.infer<typeof SheetRow>;

export const SheetJob = z.object({
  act: z.string(),
  number: z.string(),
  /** Наименование листа в штампе: «Исполнительная схема №1. Монтаж кабельных лотков на отм. …». */
  title: z.string(),
  /** Шифр (обозначение документа). */
  code: z.string(),
  /** Наименование объекта (адрес) — графа над наименованием раздела. */
  object: z.string(),
  /** Наименование раздела (из «Шифров»). */
  section: z.string(),
  org: z.string(),
  stage: z.string(),
  /** «ММ.ГГ» по дате схемы (иначе — по дате акта). */
  date: z.string(),
  signers: z.array(z.object({ role: z.string(), name: z.string() })),
  rows: z.array(SheetRow),
});
export type SheetJob = z.infer<typeof SheetJob>;

const txt = (v: CellValue | undefined) => cellText(v ?? null);
const H = (t: TableName, key: string) => column(t, key).header;
const num = (v: CellValue | undefined) => { const p = parseNumberCell(v ?? null); return p.ok ? p.value : null; };

/** Строки «Ведомостей схем» одной схемы акта. Номер сравнивается без «№». */
export function sheetRows(book: Book, act: string, number: string): BookRow[] {
  const key = withNo(number);
  return (book.tables["ВедомостиСхем"] ?? []).filter((r) => txt(r.v.act) === act && withNo(txt(r.v.scheme)) === key);
}

/** Строка «Схем» по акту и номеру. */
export function schemeRow(book: Book, act: string, number: string): BookRow | undefined {
  const key = withNo(number);
  return (book.tables["Схемы"] ?? []).find((r) => txt(r.v.act) === act && withNo(txt(r.v.number)) === key);
}

/** Представитель роли, действующий на дату (первый по «Порядку»): фамилия с инициалами — как в «ФИО». */
function repOf(book: Book, role: keyof typeof ROLE_BOOK_LABELS, iso: string | null): string {
  const label = ROLE_BOOK_LABELS[role];
  const day = (v: CellValue | undefined) => { const p = parseDateCell(v ?? null); return p.ok ? p.value : null; };
  const reps = (book.tables["Представители"] ?? []).filter((r) => {
    if (txt(r.v.role) !== label) return false;
    if (!iso) return true;
    const from = day(r.v.validFrom), to = day(r.v.validTo);
    return (!from || from <= iso) && (!to || iso <= to);
  });
  reps.sort((a, b) => (num(a.v.sortOrder) ?? 1) - (num(b.v.sortOrder) ?? 1));
  return reps.length ? txt(reps[0]!.v.fullName) : "";
}

const monthYear = (iso: string | null) => (iso ? `${iso.slice(5, 7)}.${iso.slice(2, 4)}` : "");

/**
 * Предложение ведомости схемы: материалы акта с остатком — количество в акте («Учёт»: «Кол-во» или сумма ВОР) минус
 * то, что уже стоит в ведомостях других схем этого акта. Материалы без остатка не предлагаются.
 */
export function proposeSheetRows(book: Book, act: string, number: string): { material: string; quantity: number | null }[] {
  const key = withNo(number);
  const vor = new Map<string, number>();
  for (const r of book.tables["ВОР"] ?? []) {
    if (txt(r.v.act) !== act) continue;
    const m = txt(r.v.material);
    vor.set(m, (vor.get(m) ?? 0) + (num(r.v.quantity) ?? 0));
  }
  const used = new Map<string, number>();
  for (const r of book.tables["ВедомостиСхем"] ?? []) {
    if (txt(r.v.act) !== act || withNo(txt(r.v.scheme)) === key) continue;
    const m = txt(r.v.material);
    used.set(m, (used.get(m) ?? 0) + (num(r.v.quantity) ?? 0));
  }
  const out: { material: string; quantity: number | null }[] = [];
  const seen = new Set<string>();
  for (const r of book.tables["МатериалыАктов"] ?? []) {
    if (txt(r.v.act) !== act) continue;
    const m = txt(r.v.material);
    if (!m || seen.has(m)) continue;
    seen.add(m);
    const inAct = num(r.v.quantity) ?? (vor.has(m) ? vor.get(m)! : null);
    if (inAct === null) { out.push({ material: m, quantity: null }); continue; }
    const rest = Math.round((inAct - (used.get(m) ?? 0)) * 1000) / 1000;
    if (rest > 0) out.push({ material: m, quantity: rest });
  }
  return out;
}

/** Данные листа схемы для AutoCAD: ведомость и штамп; ошибки — по ячейкам книги. */
export function sheetJob(book: Book, act: string, number: string): { job: SheetJob | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const push = (table: TableName, r: BookRow | null, key: string, message: string) =>
    issues.push({ table, row: r?.row ?? null, column: H(table, key), message });

  const actRow = (book.tables["Акты"] ?? []).find((r) => txt(r.v.baseNumber) === act);
  if (!actRow) { push("Акты", null, "baseNumber", `Акт «${act}» не найден на листе «База актов»`); return { job: null, issues }; }
  const sch = schemeRow(book, act, number);
  if (!sch) { push("Схемы", null, "number", `Схема «${number}» акта «${act}» не найдена в «Исполнительных схемах»`); return { job: null, issues }; }
  if (!txt(sch.v.name)) push("Схемы", sch, "name", "Укажите наименование схемы — оно идёт в штамп и в п.4 АОСР");

  const rows: SheetRow[] = [];
  const lines = sheetRows(book, act, number);
  if (!lines.length) push("ВедомостиСхем", null, "scheme", `Ведомость схемы «${number}» пуста — нажмите «Заполнить из материалов акта»`);
  const mats = book.tables["Материалы"] ?? [];
  for (const r of lines) {
    const name = txt(r.v.material);
    const m = mats.find((x) => txt(x.v.name) === name);
    if (!name) { push("ВедомостиСхем", r, "material", "Укажите материал"); continue; }
    if (!m) { push("ВедомостиСхем", r, "material", `Нет на листе «Материалы»: ${name}`); continue; }
    const p = parseNumberCell(r.v.quantity ?? null);
    if (!p.ok) { push("ВедомостиСхем", r, "quantity", p.message); continue; }
    if (p.value === null) { push("ВедомостиСхем", r, "quantity", "Укажите количество на этой схеме"); continue; }
    rows.push({
      n: rows.length + 1, name,
      mark: txt(m.v.mark) || txt(m.v.article),
      supplier: txt(m.v.manufacturer), unit: txt(m.v.unit), quantity: p.value, note: txt(r.v.note),
    });
  }

  // Сумма по схемам акта не больше количества в акте.
  for (const r of rows) {
    const inAct = (book.tables["МатериалыАктов"] ?? []).filter((x) => txt(x.v.act) === act && txt(x.v.material) === r.name)
      .reduce((s, x) => s + (num(x.v.quantity) ?? 0), 0);
    if (!inAct) continue;
    const all = (book.tables["ВедомостиСхем"] ?? []).filter((x) => txt(x.v.act) === act && txt(x.v.material) === r.name)
      .reduce((s, x) => s + (num(x.v.quantity) ?? 0), 0);
    if (all > inAct + 1e-9) {
      const row = lines.find((x) => txt(x.v.material) === r.name) ?? null;
      push("ВедомостиСхем", row, "quantity", `По всем схемам акта ${fmt(all)}, в акте ${fmt(inAct)} — больше, чем в акте`);
    }
  }
  if (issues.length) return { job: null, issues };

  const sectionCode = txt(actRow.v.section);
  const section = (book.tables["Шифры"] ?? []).find((r) => txt(r.v.code) === sectionCode);
  const dSch = parseDateCell(sch.v.date ?? null), dAct = parseDateCell(actRow.v.date ?? null);
  const iso = (dSch.ok ? dSch.value : null) ?? (dAct.ok ? dAct.value : null);
  const name = txt(sch.v.name);
  const job: SheetJob = {
    act, number: txt(sch.v.number),
    title: `Исполнительная схема ${withNo(txt(sch.v.number))}. ${name}`,
    code: sectionCode,
    object: txt(book.object.name) || txt(book.object.address),
    section: txt(section?.v.name),
    org: txt(actRow.v.performerOrg) || txt(book.object.performer),
    stage: "ИД",
    date: monthYear(iso),
    signers: [
      { role: "Разработал", name: repOf(book, "performer", iso) },
      { role: "Проверил", name: repOf(book, "builder_control", iso) },
    ],
    rows,
  };
  return { job, issues };
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
