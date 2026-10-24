// Подбор № п/п РКЦ для материалов без привязки: сходство наименования и марки материала с наименованием позиции.
import { column } from "../workbook/schema.ts";
import { cellText } from "../workbook/values.ts";
import type { Book } from "../workbook/records.ts";
import type { TableStore } from "../workbook/store.ts";

export interface SpecMatch { materialRow: number; material: string; number: string; name: string; score: number; checked: boolean }

export const MATCH_MIN = 50;
export const MATCH_CHECKED = 70;

// Латинские двойники кириллицы приводятся к латинице, чтобы «ППГнг(А)-НF» и «ППГнг(A)-HF» совпали.
const TWINS: Record<string, string> = { а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", н: "h", к: "k", м: "m", т: "t", в: "b", у: "y" };

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е")
    .replace(/(\d)\s*[хx×*]\s*(?=\d)/g, "$1x")
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(/[«»"'“”„]/g, "")
    .replace(/[аеорсхнкмтву]/g, (ch) => TWINS[ch])
    .replace(/\s+/g, " ").trim();
}

function tokens(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const raw of normalizeName(s).split(/[\s,;:]+/)) {
    const t = raw.replace(/^[.()]+|[.()]+$/g, "");
    if (t.length < 2) continue;
    out.set(t, /\d/.test(t) ? 2 : 1);
  }
  return out;
}

const weight = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** 0..100: 0,8 × доля токенов материала, найденных в позиции + 0,2 × доля токенов позиции, найденных в материале. */
function score(mat: Map<string, number>, pos: Map<string, number>): number {
  let hit = 0;
  for (const [t, w] of mat) if (pos.has(t)) hit += w;
  if (!hit) return 0;
  return Math.round(100 * (0.8 * hit / weight(mat) + 0.2 * hit / weight(pos)));
}

export function matchSpec(book: Book): SpecMatch[] {
  const spec = (book.tables["Спецификация"] ?? []).map((r) => ({ number: cellText(r.v.number).trim(), name: cellText(r.v.name), tok: tokens(cellText(r.v.name)) }))
    .filter((p) => p.number);
  if (!spec.length) return [];
  const out: SpecMatch[] = [];
  for (const m of book.tables["Материалы"] ?? []) {
    if (cellText(m.v.rkc).trim()) continue;
    const material = cellText(m.v.name);
    const tok = tokens(`${material} ${cellText(m.v.mark)}`);
    if (!tok.size) continue;
    let best: SpecMatch | null = null;
    for (const p of spec) {
      const s = score(tok, p.tok);
      if (s >= MATCH_MIN && (!best || s > best.score)) best = { materialRow: m.row, material, number: p.number, name: p.name, score: s, checked: s >= MATCH_CHECKED };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Записывает № п/п отмеченных совпадений в «Материалы»; возвращает число записанных. */
export async function applyMatches(store: TableStore, matches: SpecMatch[]): Promise<number> {
  const h = column("Материалы", "rkc").header;
  let n = 0;
  for (const m of matches) {
    if (!m.checked) continue;
    await store.write("Материалы", m.materialRow, { [h]: m.number });
    n++;
  }
  return n;
}
