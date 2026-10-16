// Кабельный журнал и протокол изоляции: строки документов из данных кабелей акта.
import type { Organization, Representative } from "../schemas.ts";
import { activeRepresentatives } from "../rules.ts";
import { formatNumber } from "./format.ts";
import type { CableRow, MarkMeasure } from "../workbook/cableTypes.ts";
import { markKey } from "../workbook/cables.ts";

export type JournalLine =
  | { kind: "group"; title: string }
  | { kind: "cable"; row: CableRow }
  | { kind: "total"; label: "ИТОГО" | "Всего"; mark: string; length: string; pipe?: true };

/** Строк данных (кабели, группы, итоги) на одном листе журнала — как в образце СБД. */
export const JOURNAL_LINES_PER_SHEET = 30;

function totals(items: { mark: string; length: number | null }[], pipe: boolean): JournalLine[] {
  const sums = new Map<string, { mark: string; sum: number }>();
  for (const it of items) {
    if (!it.mark.trim()) continue;
    const k = markKey(it.mark);
    const s = sums.get(k) ?? { mark: it.mark, sum: 0 };
    s.sum += it.length ?? 0;
    sums.set(k, s);
  }
  const out: JournalLine[] = [...sums.values()].map((s) =>
    ({ kind: "total", label: "ИТОГО", mark: s.mark, length: formatNumber(s.sum), ...(pipe ? { pipe: true as const } : {}) }));
  if (sums.size > 1) {
    const all = [...sums.values()].reduce((a, s) => a + s.sum, 0);
    out.push({ kind: "total", label: "Всего", mark: "", length: formatNumber(all), ...(pipe ? { pipe: true as const } : {}) });
  }
  return out;
}

/** Кабели с заголовками групп, затем итоги по маркам кабеля и (если есть) по трубам. */
export function journalLines(rows: CableRow[]): JournalLine[] {
  const out: JournalLine[] = [];
  let group = "";
  for (const row of rows) {
    const g = row.group.trim();
    if (g && g !== group) out.push({ kind: "group", title: g });
    if (g) group = g;
    out.push({ kind: "cable", row });
  }
  out.push(...totals(rows.map((r) => ({ mark: r.cableMark, length: r.cableLength })), false));
  out.push(...totals(rows.map((r) => ({ mark: r.pipeMark, length: r.pipeLength })), true));
  return out;
}

/** Раскладка строк по листам; пустой журнал — один пустой лист. */
export function journalSheets(lines: JournalLine[]): JournalLine[][] {
  const sheets: JournalLine[][] = [];
  for (let i = 0; i < lines.length; i += JOURNAL_LINES_PER_SHEET) sheets.push(lines.slice(i, i + JOURNAL_LINES_PER_SHEET));
  return sheets.length ? sheets : [[]];
}

/** Подписи в штампе: выполнившие работы (последний по «Порядку» — первым, как в образце), затем технадзор застройщика. */
export function journalSigners(reps: Representative[], orgs: Organization[], date: string): { position: string; name: string; org: string }[] {
  const org = (id: number) => orgs.find((o) => o.id === id)?.shortName ?? "";
  const list = [...activeRepresentatives(reps, "performer", date).reverse(), ...activeRepresentatives(reps, "developer_control", date)];
  return list.slice(0, 5).map((r) => ({ position: r.position, name: r.fullName, org: org(r.orgId) }));
}

/** «ММ.ГГ» для даты журнала в штампе. */
export function monthYear(iso: string | null): string {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return `${m}.${y.slice(2)}`;
}

export interface ProtocolRow { n: number; line: string; mark: string; voltage: string; allowed: string; values: string[] }

/** Строки протокола: каждая линия журнала со значениями своей марки; пустые значения — «—». */
export function protocolRows(rows: CableRow[], marks: MarkMeasure[]): ProtocolRow[] {
  const byMark = new Map(marks.map((m) => [markKey(m.mark), m]));
  return rows.map((r, i) => {
    const m = byMark.get(markKey(r.cableMark));
    const purpose = m?.purpose.trim() ?? "";
    return {
      n: i + 1,
      line: purpose ? `${r.designation}; ${purpose}` : r.designation,
      mark: r.cableMark,
      voltage: formatNumber(m?.voltage ?? null),
      allowed: formatNumber(m?.allowed ?? null),
      values: (m?.values ?? Array(10).fill("")).map((v) => v.trim() || "—"),
    };
  });
}
