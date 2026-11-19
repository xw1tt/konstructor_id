// 0.37: список актов для окна программы — номер, работы, даты, комплекты, вид работ и готовность к печати.
// «не собирается» — пакет акта не собран (печать покажет, что исправить); «замечания» — предупреждения проверки
// перед сдачей (печать не блокируют); иначе «готов».
import type { Book } from "../workbook/records.ts";
import type { ImportantMap } from "../workbook/important.ts";
import { buildBundle } from "../workbook/bundle.ts";
import { checkActs } from "../check/predelivery.ts";
import { cellText, parseDateCell, splitRefs } from "../workbook/values.ts";

export type ActStatus = "ready" | "warn" | "blocked";

export interface ActOverview {
  /** Строка «Базы актов». */
  row: number;
  number: string;
  works: string;
  dates: string;
  /** ISO-дата начала работ (для сортировки), "" — нет. */
  start: string;
  kits: string[];
  workKinds: string[];
  status: ActStatus;
  /** Ошибки сборки (status = blocked) или предупреждения проверки (status = warn). */
  problems: number;
}

const iso = (v: Parameters<typeof parseDateCell>[0]) => {
  const p = parseDateCell(v);
  return p.ok ? (p.value ?? "") : "";
};
const ru = (d: string, year = true) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}${year ? `.${d.slice(0, 4)}` : ""}` : "");

/** «02.03 – 06.03.2026»; год у начала — если годы разные; одна дата — без тире. */
export function actDates(start: string, end: string): string {
  if (!start && !end) return "";
  if (!start || !end || start === end) return ru(start || end);
  return `${ru(start, start.slice(0, 4) !== end.slice(0, 4))} – ${ru(end)}`;
}

export function actsOverview(book: Book, important: ImportantMap, today: string): ActOverview[] {
  const kitsOf = new Map<string, string[]>();
  for (const r of book.tables["АктыКомплектов"] ?? []) {
    const act = cellText(r.v.act);
    const kit = cellText(r.v.kit);
    if (!act || !kit) continue;
    const list = kitsOf.get(act) ?? [];
    if (!list.includes(kit)) list.push(kit);
    kitsOf.set(act, list);
  }
  const out: ActOverview[] = [];
  for (const r of book.tables["Акты"] ?? []) {
    const number = cellText(r.v.baseNumber);
    if (!number) continue;
    const start = iso(r.v.dateStart);
    const end = iso(r.v.dateEnd);
    const built = buildBundle(book, number, important);
    let status: ActStatus = "ready";
    let problems: number;
    if (!built.bundle) {
      status = "blocked";
      problems = built.issues.length;
    } else {
      problems = checkActs(book, [number], today).length;
      if (problems) status = "warn";
    }
    out.push({
      row: r.row,
      number,
      works: cellText(r.v.works),
      dates: actDates(start, end),
      start,
      kits: kitsOf.get(number) ?? [],
      workKinds: splitRefs(r.v.workKinds),
      status,
      problems,
    });
  }
  return out;
}

export const STATUS_LABEL: Record<ActStatus, string> = { ready: "готов", warn: "замечания", blocked: "не собирается" };

/** Подпись статуса в строке: «готов», «2 замечания», «не собирается». */
export function statusText(a: Pick<ActOverview, "status" | "problems">): string {
  if (a.status !== "warn") return STATUS_LABEL[a.status];
  const n = a.problems;
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? "замечание" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "замечания" : "замечаний";
  return `${n} ${word}`;
}

export interface ActFilter {
  query: string;
  status: ActStatus | "all";
  workKind: string;
}

export function filterActs(list: ActOverview[], f: ActFilter): ActOverview[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(
    (a) =>
      (f.status === "all" || a.status === f.status) &&
      (!f.workKind || a.workKinds.includes(f.workKind)) &&
      (!q || a.number.toLowerCase().includes(q) || a.works.toLowerCase().includes(q) || a.kits.some((k) => k.toLowerCase().includes(q))),
  );
}
