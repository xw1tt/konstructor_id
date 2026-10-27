// План 31: перенос книги прежней версии — «Материалы», «Спецификация» и «ДокументыКачества» сводятся в одну таблицу
// «Материалы». Позиция спецификации — к материалам с её № п/п РКЦ (без материала — новой строкой), документ — в
// свободную группу «Док.N» строки каждого своего материала. Что не поместилось — списком для пользователя.
import { DOC_SLOTS, column, slotKey } from "./schema.ts";
import { cellText, splitRefs, type CellValue } from "./values.ts";
import { isExampleRow } from "./examples.ts";
import type { TableData } from "./store.ts";

export interface MergePlan {
  /** Изменения существующих строк «Материалов» (индекс строки данных). */
  updates: { row: number; values: Record<string, CellValue>; links: Record<string, string | null> }[];
  /** Новые строки в конец «Материалов». */
  appended: { values: Record<string, CellValue>; links: Record<string, string | null> }[];
  /** Документы, которым не хватило групп «Док.N», и прочее, что не перенесено. */
  problems: string[];
  docs: number; positions: number;
}

const M = (k: string) => column("Материалы", k).header;
const S = (k: string) => column("Спецификация", k).header;
const D = (k: string) => column("ДокументыКачества", k).header;
const norm = (v: CellValue | undefined) => cellText(v ?? null).trim().toLowerCase();
const txt = (v: CellValue | undefined) => cellText(v ?? null).trim();
const rec = (t: TableData, r: CellValue[]) => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? null]));
const linkRec = (t: TableData, ri: number) => Object.fromEntries(t.headers.map((h, i) => [h, t.links[ri]?.[i] ?? null]));

const DOC_FIELDS = ["type", "number", "issueDate", "validUntil", "sheets", "registryName", "file"] as const;

export function planMerge(mat: TableData, spec: TableData | null, docs: TableData | null): MergePlan {
  type Row = { values: Record<string, CellValue>; links: Record<string, string | null>; existing: number | null; slots: number; name: string; rkc: string };
  const all: Row[] = mat.rows.map((r, i) => {
    const v = rec(mat, r);
    const used = DOC_SLOTS.filter((k) => txt(v[M(slotKey(k, "type"))]) || txt(v[M(slotKey(k, "number"))])).length;
    return { values: {}, links: {}, existing: i, slots: used, name: txt(v[M("name")]), rkc: txt(v[M("rkc")]) };
  });
  const problems: string[] = [];
  let positions = 0, docCount = 0;

  // 1. Спецификация.
  if (spec) for (const r of spec.rows) {
    if (isExampleRow(r, "Спецификация", spec.headers)) continue;
    const v = rec(spec, r);
    const number = txt(v[S("number")]);
    if (!number && !txt(v[S("name")])) continue;
    positions++;
    const fields = { [M("section")]: v[S("section")] ?? null, [M("source")]: v[S("source")] ?? null, [M("note")]: v[S("note")] ?? null };
    const owners = number ? all.filter((x) => x.rkc === number) : [];
    if (owners.length) {
      owners.forEach((o, i) => {
        Object.assign(o.values, fields);
        if (i === 0) {
          o.values[M("quantity")] = v[S("quantity")] ?? null;
          if (!txt(mat.rows[o.existing!]?.[mat.headers.indexOf(M("unit"))] ?? null) && txt(v[S("unit")])) o.values[M("unit")] = v[S("unit")];
        }
      });
      continue;
    }
    all.push({
      values: { [M("name")]: v[S("name")] ?? null, [M("unit")]: v[S("unit")] ?? null, [M("rkc")]: number || null, [M("quantity")]: v[S("quantity")] ?? null, ...fields },
      links: {}, existing: null, slots: 0, name: txt(v[S("name")]), rkc: number,
    });
  }

  // 2. Документы качества.
  if (docs) for (const [di, r] of docs.rows.entries()) {
    if (isExampleRow(r, "ДокументыКачества", docs.headers)) continue;
    const v = rec(docs, r);
    const l = linkRec(docs, di);
    const label = `${txt(v[D("type")]) || "Документ"} ${txt(v[D("number")])}`.trim();
    const names = splitRefs(v[D("materials")] ?? null);
    if (!names.length && !txt(v[D("number")])) continue;
    docCount++;
    if (!names.length) { problems.push(`«${label}»: не указаны материалы — документ не перенесён`); continue; }
    for (const n of names) {
      let o = all.find((x) => norm(x.name) === norm(n));
      if (!o) { o = { values: { [M("name")]: n.trim() }, links: {}, existing: null, slots: 0, name: n.trim(), rkc: "" }; all.push(o); }
      if (o.slots >= DOC_SLOTS.length) { problems.push(`«${label}» для «${n.trim()}»: у материала уже ${DOC_SLOTS.length} документа — не поместился`); continue; }
      const k = DOC_SLOTS[o.slots];
      o.slots++;
      for (const f of DOC_FIELDS) o.values[M(slotKey(k, f))] = v[D(f)] ?? null;
      if (l[D("file")]) o.links[M(slotKey(k, "file"))] = l[D("file")];
    }
  }

  return {
    updates: all.filter((x) => x.existing !== null && (Object.keys(x.values).length || Object.keys(x.links).length))
      .map((x) => ({ row: x.existing!, values: x.values, links: x.links })),
    appended: all.filter((x) => x.existing === null).map((x) => ({ values: x.values, links: x.links })),
    problems, docs: docCount, positions,
  };
}
