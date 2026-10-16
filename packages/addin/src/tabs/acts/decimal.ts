/**
 * Разбор числа, которое пользователь ещё набирает: «436,» допустимо (значение 436),
 * пустая строка — null, отрицательные и мусор отклоняются.
 */
export function parseDecimalDraft(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim();
  if (t === "") return { ok: true, value: null };
  if (!/^\d+([.,]\d*)?$/.test(t) && !/^[.,]\d+$/.test(t)) return { ok: false };
  return { ok: true, value: Number(t.replace(",", ".")) };
}

export const showDecimal = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
