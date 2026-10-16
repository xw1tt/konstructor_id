import type { DocKind } from "./schemas.ts";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** "2026-07-28" → "28 июля 2026 г." */
export function formatDateLong(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y} г.`;
}

/** "2025-05-09" → "09.05.2025 г." */
export function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y} г.`;
}

/** Число с десятичной запятой, без хвоста плавающей точки и лишних нулей. */
export function formatNumber(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

const SUFFIX: Record<Exclude<DocKind, "vor">, string> = { aosr: "АОСР", rim: "РИМ", vd: "ВД" };

export const docNumber = (base: string, kind: Exclude<DocKind, "vor">) => `${base.trim()}.${SUFFIX[kind]}`;

/** Номер со знаком «№» (не дублирует, если пользователь уже ввёл «№»). */
export const withNo = (n: string) => {
  const t = n.trim();
  return !t ? "" : t.startsWith("№") ? t : `№${t}`;
};
