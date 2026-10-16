/** Номер следующего акта: увеличивает последнее числовое звено, сохраняя ведущие нули. */
export function nextBaseNumber(prev: string): string {
  const t = prev.trim();
  if (!t) return "1";
  const m = t.match(/^(.*?)(\d+)$/);
  if (!m) return `${t}.1`;
  const next = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return m[1] + next;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

const trailingNumber = (s: string) => Number(s.trim().match(/(\d+)$/)?.[1] ?? -1);

/** Номер следующего акта по списку: от акта с наибольшим числом в конце номера. */
export function nextNumberFor(list: { baseNumber: string }[]): string {
  if (!list.length) return "1";
  const top = list.reduce((a, b) => (trailingNumber(b.baseNumber) > trailingNumber(a.baseNumber) ? b : a));
  return nextBaseNumber(top.baseNumber);
}
