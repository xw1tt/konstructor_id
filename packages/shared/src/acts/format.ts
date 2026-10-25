import type { FormSet, FormDoc, PrintOptions } from "../templates.ts";
import type { DocKind } from "./schemas.ts";
import { ACT_DOC_DEFS } from "../docs/defs.ts";

/** Месяцы в родительном падеже («15 октября»). */
export const MONTHS_GEN: readonly string[] = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** "2026-07-28" → "28 июля 2026 г." */
export function formatDateLong(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y} г.`;
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

/** Документы с номером от номера акта по правилам набора (план 14). */
export type NumberedDoc = "aosr" | "rim" | "vd" | "rp" | "kj" | "ip";
/** Номер документа акта по набору форм: «СБД» — «<акт>.АОСР», «ТИ» — «<акт>» для АОСР, «<акт>.РМ» для РИМ и т. д. */
export function docNumberFor(base: string, kind: NumberedDoc, set: FormSet = "sbd"): string {
  const s = ACT_DOC_DEFS[kind].suffix[set];
  return s ? `${base.trim()}.${s}` : base.trim();
}

/** Форма документа: своя для документа (forms) или набора (formSet); без опций — «СБД». */
export const formOf = (o: Partial<Pick<PrintOptions, "formSet" | "forms">> | undefined, doc: FormDoc): FormSet =>
  o?.forms?.[doc] ?? o?.formSet ?? "sbd";

/** Номер со знаком «№» (не дублирует, если пользователь уже ввёл «№»). */
export const withNo = (n: string) => {
  const t = n.trim();
  return !t ? "" : t.startsWith("№") ? t : `№${t}`;
};
