// Действия реестра «Норматив»: сбор обозначений из п.6 актов, вставка в п.6, поиск по реестру.
import { extractNormativ, normKey } from "../normativ.ts";
import { column } from "./schema.ts";
import { cellText } from "./values.ts";
import type { Book, BookRow } from "./records.ts";
import type { TableStore } from "./store.ts";

const h = (key: string) => column("Нормативы", key).header;

/** Дописывает в «Нормативы» обозначения из п.6 всех актов, которых там ещё нет. Возвращает число добавленных. */
export async function collectFromActs(store: TableStore, book: Book): Promise<number> {
  const table = await store.read("Нормативы");
  if (!table) throw new Error("Таблица «Нормативы» не найдена");
  const known = new Set((book.tables["Нормативы"] ?? []).map((r) => normKey(cellText(r.v.designation))));
  const add: Record<string, string>[] = [];
  for (const act of book.tables["Акты"] ?? []) {
    for (const n of extractNormativ(cellText(act.v.normative))) {
      const k = normKey(n.designation);
      if (known.has(k)) continue;
      known.add(k);
      add.push({ [h("designation")]: n.designation, [h("kind")]: n.kind, [h("status")]: "Действует" });
    }
  }
  if (add.length) await store.insert("Нормативы", table.rows.length, add);
  return add.length;
}

const loose = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase().replace(/Ё/g, "Е");

/** Обозначение встречается в тексте целиком (не как часть более длинного номера) — для СНиП, СТО и т.п. */
function containsDesignation(text: string, designation: string): boolean {
  const t = loose(text);
  const d = loose(designation);
  if (!d) return false;
  for (let i = t.indexOf(d); i >= 0; i = t.indexOf(d, i + 1)) {
    const before = i > 0 ? t[i - 1] : "";
    const after = t[i + d.length] ?? "";
    const next = t[i + d.length + 1] ?? "";
    // «.» после обозначения — конец предложения, если за ней не цифра (иначе это продолжение номера).
    const continues = /[\p{L}\d/\-]/u.test(after) || (after === "." && /\d/.test(next));
    if (!/[\p{L}\d]/u.test(before) && !continues) return true;
  }
  return false;
}

/** Текст п.6 с добавленным обозначением; null — обозначение там уже есть. */
export function appendToP6(current: string, designation: string): string | null {
  const key = normKey(designation);
  if (extractNormativ(current).some((n) => normKey(n.designation) === key)) return null;
  if (containsDesignation(current, designation)) return null;
  const text = current.trim();
  if (!text) return designation.trim();
  const dot = text.endsWith(".");
  return `${dot ? text.slice(0, -1) : text}, ${designation.trim()}${dot ? "." : ""}`;
}

export type P6Result = { ok: true } | { ok: false; message: string };

/** Добавляет обозначение в п.6 акта на листе «База актов». */
export async function insertIntoP6(store: TableStore, book: Book, actNumber: string, designation: string): Promise<P6Result> {
  const act = (book.tables["Акты"] ?? []).find((r) => cellText(r.v.baseNumber) === actNumber.trim());
  if (!act) return { ok: false, message: `Акт «${actNumber}» не найден на листе «База актов»` };
  const next = appendToP6(cellText(act.v.normative), designation);
  if (next === null) return { ok: false, message: "Уже есть в п.6" };
  await store.write("Акты", act.row, { [column("Акты", "normative").header]: next });
  return { ok: true };
}

/** Строки реестра, где запрос входит в обозначение или наименование (без учёта регистра). */
export function filterNormativ(rows: BookRow[], query: string): BookRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${cellText(r.v.designation)}\n${cellText(r.v.title)}`.toLowerCase().includes(q));
}
