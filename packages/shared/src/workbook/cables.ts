// Кабели акта для печати кабельного журнала (kj) и протокола сопротивления изоляции (ip): сборка и проверка.
import { buildBundle, createChecker, type ActBundle, type Issue } from "./bundle.ts";
import { column, type TableName } from "./schema.ts";
import { cellText, parseNumberCell, type CellValue } from "./values.ts";
import type { Book, BookRow } from "./records.ts";
import type { ImportantMap } from "./important.ts";
import type { TableStore } from "./store.ts";
import { MEASURE_KEYS, type CablesData, type CableRow, type MarkMeasure } from "./cableTypes.ts";

export type CableDocKind = "kj" | "ip";

/** Ключ сравнения марок: края обрезаны, пробелы схлопнуты, регистр не важен. */
export const markKey = (mark: string) => mark.trim().replace(/\s+/g, " ").toUpperCase();

const txt = cellText;

export function buildCableBundle(book: Book, actNumber: string, important: ImportantMap, kind: CableDocKind):
  { bundle: ActBundle | null; issues: Issue[] } {
  const base = buildBundle(book, actNumber, important);
  const n = actNumber.trim();
  const c = createChecker(book, important);
  const ofAct = (t: TableName) => c.rows(t).filter((r) => txt(r.v.act) === n);

  const cableRows = ofAct("КабельныйЖурнал");
  if (!cableRows.length) c.push("КабельныйЖурнал", null, "Акт", `В кабельном журнале нет кабелей акта «${n}»`);
  const cables = cableRows.map((r) => ({ r, v: c.checkRow("КабельныйЖурнал", r) }));

  const docRow = ofAct("ДокументыКабелей")[0];
  if (!docRow) c.push("ДокументыКабелей", null, "Акт", `Нет строки акта «${n}» в таблице «ДокументыКабелей»`);
  // Важные поля строки документов — только те, что нужны печатаемому документу.
  const KJ_ONLY = ["journalCode", "journalDate"], IP_ONLY = ["protocolNumber", "dateFrom", "dateTo"];
  const skip = new Set((kind === "kj" ? IP_ONLY : KJ_ONLY).map((k) => column("ДокументыКабелей", k).header));
  const docImportant: ImportantMap = { ...important, "ДокументыКабелей": (important["ДокументыКабелей"] ?? []).filter((h) => !skip.has(h)) };
  const dc = createChecker(book, docImportant);
  const doc = docRow ? dc.checkRow("ДокументыКабелей", docRow) : null;
  for (const i of dc.issues) c.push(i.table, i.row, i.column, i.message);
  if (docRow) c.checkDuplicates("ДокументыКабелей", [docRow]);

  const markRows = new Map<string, BookRow>();
  for (const r of c.rows("ИзмеренияМарок")) if (!markRows.has(markKey(txt(r.v.mark)))) markRows.set(markKey(txt(r.v.mark)), r);
  let labRow: BookRow | undefined;
  let instrumentRows: BookRow[] = [];
  if (kind === "ip") {
    const used = new Map<string, BookRow>();
    for (const x of cables) {
      const mark = txt(x.r.v.cableMark);
      if (!mark) continue;
      const m = markRows.get(markKey(mark));
      if (!m) c.push("КабельныйЖурнал", x.r.row, column("КабельныйЖурнал", "cableMark").header, `Нет в таблице «ИзмеренияМарок»: ${mark}`);
      else used.set(markKey(mark), m);
    }
    for (const m of used.values()) c.checkRow("ИзмеренияМарок", m);
    labRow = c.rows("Электролаборатория")[0];
    if (!labRow) c.push("Электролаборатория", null, "Организация и адрес", "Заполните таблицу «Электролаборатория»");
    else c.checkRow("Электролаборатория", labRow);
    instrumentRows = c.rows("СредстваИзмерений");
    if (!instrumentRows.length) c.push("СредстваИзмерений", null, "Наименование СИ", "Заполните таблицу «СредстваИзмерений»");
    for (const r of instrumentRows) c.checkRow("СредстваИзмерений", r);
  }

  const issues = [...base.issues, ...c.issues];
  if (issues.length || !base.bundle) return { bundle: null, issues };

  const num = (v: CellValue) => { const p = parseNumberCell(v); return p.ok ? p.value : null; };
  const or = (v: CellValue, key: string) => txt(v) || String(column("ДокументыКабелей", key).default ?? "");
  const data: CablesData = {
    rows: cables.map(({ r, v }): CableRow => ({
      group: txt(r.v.group), designation: txt(r.v.designation), from: txt(r.v.from), to: txt(r.v.to), direction: txt(r.v.direction),
      cableMark: txt(r.v.cableMark), cableLength: (v.cableLength as number | null) ?? null, pipeMark: txt(r.v.pipeMark),
      pipeLength: (v.pipeLength as number | null) ?? null, note: txt(r.v.note),
    })),
    marks: [...markRows.values()].map((r): MarkMeasure => ({
      mark: txt(r.v.mark), purpose: txt(r.v.purpose),
      voltage: num(r.v.voltage) ?? Number(column("ИзмеренияМарок", "voltage").default),
      allowed: num(r.v.allowed) ?? Number(column("ИзмеренияМарок", "allowed").default),
      values: MEASURE_KEYS.map((k) => txt(r.v[k])),
    })),
    doc: docRow && doc ? {
      journalCode: txt(docRow.v.journalCode), journalDate: doc.journalDate ?? null, protocolNumber: txt(docRow.v.protocolNumber),
      dateFrom: doc.dateFrom ?? null, dateTo: doc.dateTo ?? null,
      temperature: doc.temperature ?? Number(column("ДокументыКабелей", "temperature").default),
      humidity: doc.humidity ?? Number(column("ДокументыКабелей", "humidity").default),
      purpose: or(docRow.v.purpose, "purpose"), normative: or(docRow.v.normative, "normative"),
      integrity: or(docRow.v.integrity, "integrity"), conclusion: or(docRow.v.conclusion, "conclusion"),
    } : null,
    lab: labRow ? { nameAddress: txt(labRow.v.nameAddress), certificate: txt(labRow.v.certificate), head: txt(labRow.v.head), tester: txt(labRow.v.tester) } : null,
    instruments: instrumentRows.map((r) => {
      const v = c.checkRow("СредстваИзмерений", r);
      return {
        name: txt(r.v.name), type: txt(r.v.type), range: txt(r.v.range), accuracy: txt(r.v.accuracy), serial: txt(r.v.serial),
        certificate: txt(r.v.certificate), checkedOn: v.checkedOn ?? null, nextCheck: v.nextCheck ?? null, authority: txt(r.v.authority),
      };
    }),
  };
  if (kind === "kj") data.marks = [];
  return { bundle: { ...base.bundle, cables: data }, issues: [] };
}

/** Дописывает в «ИзмеренияМарок» марки кабельного журнала, которых там нет. Возвращает число добавленных. */
export async function collectMarks(store: TableStore, book: Book): Promise<number> {
  const table = await store.read("ИзмеренияМарок");
  if (!table) throw new Error("Таблица «ИзмеренияМарок» не найдена");
  const known = new Set((book.tables["ИзмеренияМарок"] ?? []).map((r) => markKey(txt(r.v.mark))));
  const add: Record<string, CellValue>[] = [];
  for (const r of book.tables["КабельныйЖурнал"] ?? []) {
    const mark = txt(r.v.cableMark).replace(/\s+/g, " ");
    if (!mark || known.has(markKey(mark))) continue;
    known.add(markKey(mark));
    add.push({
      [column("ИзмеренияМарок", "mark").header]: mark,
      [column("ИзмеренияМарок", "voltage").header]: column("ИзмеренияМарок", "voltage").default as number,
      [column("ИзмеренияМарок", "allowed").header]: column("ИзмеренияМарок", "allowed").default as number,
    });
  }
  if (add.length) await store.insert("ИзмеренияМарок", table.rows.length, add);
  return add.length;
}
