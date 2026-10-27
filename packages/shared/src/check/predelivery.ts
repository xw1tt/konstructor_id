// Проверка перед сдачей ИД: то, за что технадзор обычно возвращает документы. Только предупреждения — печать, сборку
// и прочие действия программа не блокирует. Каждое предупреждение указывает ячейку книги (как ошибки печати).
import type { RoleCode } from "../roles.ts";
import { roleFromBook } from "../workbook/schema.ts";
import { cellText, parseDateCell, splitRefs, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { Issue } from "../workbook/bundle.ts";

export interface Warning extends Issue { act: string }

const iso = (v: CellValue | undefined): string | null => {
  const p = parseDateCell(v ?? null);
  return p.ok ? p.value : null;
};
const ru = (d: string) => d.split("-").reverse().join(".");
const norm = (s: string) => s.trim().toLowerCase();
const roleOf = (label: string): RoleCode | null => roleFromBook(label);
const hasScan = (r: BookRow) => !!(r.link.file || cellText(r.v.file ?? null));

/**
 * Предупреждения по актам (в порядке актов). Повтор одной и той же ячейки (документ качества в нескольких актах)
 * — один раз, с первым актом. today — ГГГГ-ММ-ДД.
 */
export function checkActs(book: Book, acts: readonly string[], today: string): Warning[] {
  const rows = (t: keyof Book["tables"]) => book.tables[t] ?? [];
  const out: Warning[] = [];
  const seen = new Set<string>();
  const warn = (act: string, table: Warning["table"], row: number | null, column: string, message: string, key?: string) => {
    const k = key ?? `${table}|${row}|${column}|${message.replace(/«[^»]*»/g, "")}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ act, table, row, column, message });
  };
  const contract = iso(book.object.contractDate);
  const docsOf = (m: string) => rows("ДокументыКачества").filter((d) => splitRefs(d.v.materials ?? null).some((x) => norm(x) === norm(m)));
  const reps = rows("Представители");
  const rolesInBook = [...new Set(reps.map((r) => roleOf(cellText(r.v.role ?? null))).filter((r): r is RoleCode => !!r))];

  for (const act of acts) {
    const a = rows("Акты").find((r) => cellText(r.v.baseNumber ?? null) === act);
    if (!a) continue;
    const date = iso(a.v.date);
    const start = iso(a.v.dateStart), end = iso(a.v.dateEnd);
    const A = `акт ${act}`;

    // Даты акта и работ.
    if (start && end && start > end) warn(act, "Акты", a.row, "Окончание работ", `${A}: окончание работ (${ru(end)}) раньше начала (${ru(start)})`);
    if (date && end && end > date) warn(act, "Акты", a.row, "Окончание работ", `${A}: окончание работ (${ru(end)}) позже даты акта (${ru(date)})`);
    if (date && date > today) warn(act, "Акты", a.row, "Дата акта", `${A}: дата акта ${ru(date)} ещё не наступила`);
    if (contract && start && start < contract) warn(act, "Акты", a.row, "Начало работ", `${A}: начало работ (${ru(start)}) раньше даты договора (${ru(contract)})`);

    // Подписанты: роль есть в книге, но ни у кого полномочия не действуют на дату акта — подписи не будет.
    if (date) for (const role of rolesInBook) {
      const of = reps.filter((r) => roleOf(cellText(r.v.role ?? null)) === role);
      const active = of.filter((r) => { const f = iso(r.v.validFrom), t = iso(r.v.validTo); return (!f || f <= date) && (!t || date <= t); });
      if (!active.length) warn(act, "Представители", of[0].row, "Действует по",
        `${A} от ${ru(date)}: нет представителя «${cellText(of[0].v.role ?? null)}» с действующими полномочиями — строка подписи будет пустой (проверьте «Действует с/по»)`, `role|${role}`);
    }

    // Материалы акта и их документы качества.
    const vor = rows("ВОР").filter((r) => cellText(r.v.act ?? null) === act);
    for (const m of rows("МатериалыАктов").filter((r) => cellText(r.v.act ?? null) === act)) {
      const name = cellText(m.v.material ?? null);
      if (!name || !rows("Материалы").some((x) => norm(cellText(x.v.name ?? null)) === norm(name))) continue;
      const docs = docsOf(name);
      if (!docs.length) warn(act, "МатериалыАктов", m.row, "Материал", `${A}: у материала «${name}» нет документов качества`);
      const hasVor = vor.some((v) => norm(cellText(v.v.material ?? null)) === norm(name) && cellText(v.v.quantity ?? null));
      if (!cellText(m.v.quantity ?? null) && !hasVor) warn(act, "МатериалыАктов", m.row, "Кол-во", `${A}: у материала «${name}» нет количества — пусто и в ВОР нет объёмов`);
      for (const d of docs) {
        const label = `${cellText(d.v.type ?? null) || "документ"} ${cellText(d.v.number ?? null)}`.trim();
        const valid = iso(d.v.validUntil), issued = iso(d.v.issueDate);
        if (date && valid && valid < date) warn(act, "ДокументыКачества", d.row, "Действует до", `«${label}» (${name}): срок действия истёк ${ru(valid)} — раньше даты акта ${act} (${ru(date)}); проверьте, что материал поставлен в период действия, или приложите действующий`);
        if (date && issued && issued > date) warn(act, "ДокументыКачества", d.row, "Дата", `«${label}» (${name}): дата документа ${ru(issued)} позже даты акта ${act} (${ru(date)})`);
        if (!hasScan(d)) warn(act, "ДокументыКачества", d.row, "Скан", `«${label}» (${name}): нет скана`);
        if (!cellText(d.v.sheets ?? null)) warn(act, "ДокументыКачества", d.row, "Листов", `«${label}» (${name}): не указано число листов`);
      }
    }

    // Исполнительные схемы акта.
    for (const s of rows("Схемы").filter((r) => cellText(r.v.act ?? null) === act)) {
      const label = `${cellText(s.v.kind ?? null) || "Схема"} ${cellText(s.v.number ?? null)}`.trim();
      const sd = iso(s.v.date);
      if (date && sd && sd > date) warn(act, "Схемы", s.row, "Дата", `${A}: «${label}» датирована ${ru(sd)} — позже даты акта (${ru(date)})`);
      if (!hasScan(s)) warn(act, "Схемы", s.row, "Скан", `${A}: у «${label}» нет скана`);
    }
  }
  return out;
}

/** Все акты книги по порядку строк «Базы актов». */
export const allActs = (book: Book): string[] =>
  [...new Set((book.tables["Акты"] ?? []).map((r) => cellText(r.v.baseNumber ?? null)).filter(Boolean))];

/** «3 предупреждения» */
export function warningsText(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? "предупреждение" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "предупреждения" : "предупреждений";
  return `${n} ${w}`;
}
