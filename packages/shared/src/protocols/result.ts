// План 13: вычисляемые значения и результат строки замера (спецификация §6.3). Равенство на границе — «соответствует».
import { formatNumber } from "../acts/format.ts";
import { cellText, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { ProtoDef } from "./defs.ts";

export const OK = "соответствует";
export const BAD = "не соответствует";
export type Result = typeof OK | typeof BAD;

type Row = Record<string, CellValue | undefined>;

const num = (v: CellValue | undefined): number | null => {
  if (v === undefined) return null;
  const p = parseNumberCell(v);
  return p.ok ? p.value : null;
};
const txt = (v: CellValue | undefined) => (v === undefined ? "" : cellText(v));
const verdict = (ok: boolean): Result => (ok ? OK : BAD);

/** Кратность тока срабатывания по характеристике автомата (B/C/D, латиница или кириллица). */
const CURVE: Record<string, number> = { B: 5, C: 10, D: 20, "В": 5, "С": 10 };

/** Верхняя граница нормы времени: последнее число в тексте («0,01–0,1», «≤5»). */
function upperBound(text: string): number | null {
  const all = [...text.replace(/,/g, ".").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return all.length ? all[all.length - 1] : null;
}

/** Числа вычисляемых столбцов: ПФН — Iкз (230 / Zп) и Iсраб (Iн × кратность), ПЗУ — приведённое R, ПЗОВ — норма. */
function values(def: ProtoDef, row: Row): Record<string, number | null> {
  switch (def.rule) {
    case "pfn": {
      const z = num(row.zloop), rated = num(row.rated), k = CURVE[txt(row.curve).toUpperCase()];
      return {
        ikz: num(row.ikz) ?? (z && z > 0 ? 230 / z : null),
        itrip: num(row.itrip) ?? (rated !== null && k ? rated * k : null),
      };
    }
    case "pzu": {
      const m = num(row.measured);
      return { reduced: m === null ? null : m * (num(row.season) ?? 1) };
    }
    case "pzov": {
      const wave = num(row.wave) ?? 1550;
      return { norm: num(row.norm) ?? (wave === 1310 ? 0.36 : wave === 1550 ? 0.22 : null) };
    }
    default:
      return {};
  }
}

/** Печатные значения вычисляемых столбцов документа. */
export function computed(def: ProtoDef, row: Row): Record<string, string> {
  return Object.fromEntries(Object.entries(values(def, row)).map(([k, v]) => [k, formatNumber(v)]));
}

/** Результат строки по правилу документа; null — вычислить нельзя (нет правила или данных). */
export function resultOf(def: ProtoDef, row: Row): Result | null {
  const v = values(def, row);
  switch (def.rule) {
    case "pav": {
      const fact = num(row.tripFact), max = upperBound(txt(row.tripNorm));
      return fact === null || max === null ? null : verdict(fact <= max);
    }
    case "puzo": {
      const r = num(row.diffRated), f = num(row.diffFact), t = num(row.timeFact), tn = num(row.timeNorm) ?? 300;
      if (r === null || f === null) return null;
      return verdict(f >= r / 2 && f <= r && (t === null || t <= tn));
    }
    case "pfn":
      return v.ikz === null || v.itrip === null ? null : verdict(v.ikz >= v.itrip);
    case "pms": {
      const r = num(row.resistance);
      return r === null ? null : verdict(r <= (num(row.allowed) ?? 0.05));
    }
    case "pzu":
      return v.reduced === null ? null : verdict(v.reduced <= (num(row.allowed) ?? 4));
    case "pzov": {
      const a = num(row.att);
      return a === null || v.norm === null ? null : verdict(a <= v.norm);
    }
    case "ptsks": {
      const map = txt(row.wiremap).trim().toUpperCase();
      if (!map) return null;
      const margins = [row.next, row.il, row.rl].map(num).filter((x): x is number => x !== null);
      return verdict(map === "PASS" && margins.every((m) => m >= 0));
    }
    default:
      return null;
  }
}

/** Отрицательный результат строки: «не соответствует», «не годен», «не выдержала», «непригоден», «FAIL». */
export const isNegative = (s: string) => /(^|[^\p{L}])не\s*(соответ|год|выдерж|пригод)|\bfail\b/iu.test(s);
