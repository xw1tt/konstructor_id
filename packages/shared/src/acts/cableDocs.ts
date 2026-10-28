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
  // Марки с «В протокол» — «нет» (кабельные сборки) не измеряются: их линий в протоколе нет, номера — подряд.
  return rows.filter((r) => byMark.get(markKey(r.cableMark))?.inProtocol !== false).map((r, i) => {
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

// ---------- План 14: кабельный журнал набора «ТИ» ----------

export type TiJournalLine =
  | { kind: "group"; title: string }
  | { kind: "cable"; designation: string; from: string; to: string; mark: string; project: string; fact: string; tray: string; smooth: string; corrugated: string };

export interface TiJournal {
  lines: TiJournalLine[];
  /** «Итого всего» по способам прокладки. */
  total: { tray: string; smooth: string; corrugated: string };
  /** «в т.ч. <марка>»: длина по проекту («-», если не задана ни у одного кабеля), фактическая и фактическая с запасом. */
  byMark: { mark: string; project: string; fact: string; factReserve: string }[];
  /** «с учетом кф запаса N%»: факт и способы × (1 + N/100), вверх до целого. */
  reserve: { pct: string; fact: string; tray: string; smooth: string; corrugated: string };
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Фактическая длина кабеля: сумма заполненных способов прокладки; ни одного — «Кабель: длина». */
export const factLength = (r: CableRow): number | null =>
  [r.tray, r.smoothPipe, r.corrugatedPipe].some((x) => x !== null) ? round3(sum([r.tray, r.smoothPipe, r.corrugatedPipe])) : r.cableLength;

/** Число с заданным числом знаков после запятой (как разрядность в Excel: по правилам округления, нули дописываются). */
export function fixedNumber(x: number, decimals: number): string {
  const k = 10 ** decimals;
  const v = Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9) / k;
  return v.toFixed(decimals).replace(".", ",");
}

/**
 * decimals — знаков после запятой в итогах и строках «в т.ч.» (строки кабелей — как в книге); null — как посчитано
 * (до 3 знаков), длина с запасом — вверх до целого. С decimals длина с запасом — вверх до этого знака.
 */
export function tiJournal(rows: CableRow[], reservePct: number, decimals: number | null = null): TiJournal {
  const lines: TiJournalLine[] = [];
  let group = "";
  for (const r of rows) {
    const g = r.group.trim();
    if (g && g !== group) lines.push({ kind: "group", title: g });
    if (g) group = g;
    lines.push({
      kind: "cable", designation: r.designation, from: r.from, to: r.to, mark: r.cableMark,
      project: r.projectLength === null ? "-" : formatNumber(r.projectLength), fact: formatNumber(factLength(r)),
      tray: formatNumber(r.tray), smooth: formatNumber(r.smoothPipe), corrugated: formatNumber(r.corrugatedPipe),
    });
  }
  const tray = round3(sum(rows.map((r) => r.tray))), smooth = round3(sum(rows.map((r) => r.smoothPipe))), corr = round3(sum(rows.map((r) => r.corrugatedPipe)));
  const marks = new Map<string, { mark: string; project: number | null; fact: number }>();
  for (const r of rows) {
    if (!r.cableMark.trim()) continue;
    const k = markKey(r.cableMark);
    const m = marks.get(k) ?? { mark: r.cableMark, project: null, fact: 0 };
    if (r.projectLength !== null) m.project = round3((m.project ?? 0) + r.projectLength);
    m.fact = round3(m.fact + (factLength(r) ?? 0));
    marks.set(k, m);
  }
  const factAll = round3([...marks.values()].reduce((a, m) => a + m.fact, 0));
  const d = decimals;
  const k = 10 ** (d ?? 0);
  const up = (x: number) => { const v = Math.ceil(round3(x * (1 + reservePct / 100) * k) - 1e-9) / k; return d === null ? String(v) : fixedNumber(v, d); };
  const num = (x: number) => (d === null ? formatNumber(x) : fixedNumber(x, d));
  return {
    lines,
    total: { tray: num(tray), smooth: num(smooth), corrugated: num(corr) },
    byMark: [...marks.values()].map((m) => ({ mark: m.mark, project: m.project === null ? "-" : num(m.project), fact: num(m.fact), factReserve: up(m.fact) })),
    reserve: { pct: formatNumber(reservePct), fact: up(factAll), tray: up(tray), smooth: up(smooth), corrugated: up(corr) },
  };
}
