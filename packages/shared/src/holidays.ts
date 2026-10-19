// Нерабочие праздничные дни РФ для общего журнала работ.
//
// Правила:
//  • ст. 112 ТК РФ: 1–8 января, 23 февраля, 8 марта, 1 и 9 мая, 12 июня, 4 ноября;
//  • праздник на субботу или воскресенье (кроме январских) переносится на ближайший
//    следующий будний день, если он сам не праздник;
//  • январские праздники, выпавшие на выходные, правительство переносит отдельным
//    постановлением — эти дни перечислены в DECREE_DAYS_OFF по годам.
// Обычные субботы — рабочие: журнал пропускает только воскресенья и дни из этого модуля.

/** Перенесённые постановлениями выходные (будние дни, ставшие нерабочими). */
export const DECREE_DAYS_OFF: Record<number, string[]> = {
  // постановление Правительства РФ от 24.09.2025 № 1466
  2026: ["2026-01-09", "2026-12-31"],
  // постановление Правительства РФ от 17.09.2026 № 1187
  2027: ["2027-02-22", "2027-11-05", "2027-12-31"],
};

const FIXED = ["01-01", "01-02", "01-03", "01-04", "01-05", "01-06", "01-07", "01-08", "02-23", "03-08", "05-01", "05-09", "06-12", "11-04"];
const MOVABLE = FIXED.filter((d) => !d.startsWith("01-"));

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const cache = new Map<number, Set<string>>();

/** Все нерабочие праздничные и перенесённые дни года (ISO). */
export function holidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const set = new Set(FIXED.map((d) => `${year}-${d}`));
  for (const md of MOVABLE) {
    const d = day(`${year}-${md}`);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) continue;
    const next = new Date(d);
    do next.setUTCDate(next.getUTCDate() + 1);
    while (next.getUTCDay() === 0 || next.getUTCDay() === 6 || set.has(isoOf(next)));
    set.add(isoOf(next));
  }
  for (const d of DECREE_DAYS_OFF[year] ?? []) set.add(d);
  cache.set(year, set);
  return set;
}

export const isHoliday = (iso: string) => holidays(Number(iso.slice(0, 4))).has(iso);
