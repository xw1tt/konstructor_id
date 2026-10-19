// Значения новой строки таблицы: умолчания схемы, а для акта — номер, дата и подписанты ВОР.
import { TABLES, ROLE_BOOK_LABELS, type TableName } from "@idk/shared/workbook/schema";
import { cellText, isoToExcelSerial, parseNumberCell, type CellValue } from "@idk/shared/workbook/values";
import type { Book } from "@idk/shared/workbook/records";
import { nextBaseNumber, nextNumberFor, todayIso } from "./numbering.ts";

export function newRowDefaults(table: TableName, book: Book, today = todayIso()): Record<string, CellValue> {
  const out: Record<string, CellValue> = {};
  for (const c of TABLES[table].columns) if (c.default !== undefined) out[c.header] = c.default;
  if (table === "ДокументыКабелей") {
    // Последний акт «Базы актов», у которого ещё нет строки документов кабелей.
    const has = new Set((book.tables["ДокументыКабелей"] ?? []).map((r) => cellText(r.v.act)));
    const free = (book.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber)).filter((n) => n && !has.has(n));
    if (free.length) out["Акт"] = free[free.length - 1];
    return out;
  }
  if (table === "Комплекты") {
    // Следующий номер реестра: наибольший числовой + 1.
    const nums = (book.tables["Комплекты"] ?? []).map((r) => Number(cellText(r.v.number))).filter((n) => Number.isInteger(n));
    out["№ реестра"] = String(nums.length ? Math.max(...nums) + 1 : 1);
    return out;
  }
  if (table === "АктыКомплектов" || table === "РеестрИД") {
    const kits = (book.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean);
    if (kits.length) out["Комплект"] = kits[kits.length - 1];
    return out;
  }
  if (table !== "Акты") return out;
  const acts = (book.tables["Акты"] ?? []).map((r) => ({ baseNumber: cellText(r.v.baseNumber) })).filter((a) => a.baseNumber);
  const reps = (book.tables["Представители"] ?? []).map((r) => ({
    role: cellText(r.v.role), name: cellText(r.v.fullName), order: (parseNumberCell(r.v.sortOrder) as { value: number | null }).value ?? 0,
  }));
  const byOrder = (role: string) => reps.filter((r) => r.role === role).sort((a, b) => a.order - b.order);
  const performers = byOrder(ROLE_BOOK_LABELS.performer);
  out["Номер акта"] = nextNumberFor(acts);
  out["Дата акта"] = isoToExcelSerial(today);
  const customer = byOrder(ROLE_BOOK_LABELS.developer_control)[0]?.name;
  const contractor = performers[performers.length - 1]?.name;
  const performerOrg = cellText(book.object.performer ?? null);
  if (customer) out["ВОР: от заказчика"] = customer;
  if (contractor) out["ВОР: от монтажников"] = contractor;
  if (performerOrg) out["Выполнивший работы"] = performerOrg;
  return out;
}

/** Значения для n новых строк подряд: у актов номера идут по порядку. */
export function newRowsDefaults(table: TableName, book: Book, n: number, today = todayIso()): Record<string, CellValue>[] {
  const first = newRowDefaults(table, book, today);
  const out = [first];
  for (let i = 1; i < n; i++) {
    const next = { ...first };
    if (table === "Акты") next["Номер акта"] = nextBaseNumber(String(out[i - 1]["Номер акта"]));
    out.push(next);
  }
  return out;
}
