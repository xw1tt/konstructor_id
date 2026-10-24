// План 13: пакет протокола или акта приёмки из книги — пакет акта (первого акта комплекта) + данные документа, с проверкой.
import { buildBundle, createChecker, type ActBundle, type Issue } from "../workbook/bundle.ts";
import { column, ROLE_BOOK_LABELS, type TableName } from "../workbook/schema.ts";
import { cellText, parseNumberCell, type CellValue } from "../workbook/values.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { ImportantMap } from "../workbook/important.ts";
import { formatNumber } from "../acts/format.ts";
import { activeRepresentatives } from "../rules.ts";
import { protoByCode, type ProtoDef } from "./defs.ts";
import { computed, isNegative, resultOf } from "./result.ts";
import { actsOfKit, headerByNumber } from "./find.ts";
import type { ProtoData } from "./types.ts";

const txt = cellText;
const num = (v: CellValue | undefined) => { const p = parseNumberCell(v ?? null); return p.ok ? p.value : null; };

/** Печатное значение ячейки строки: пусто — значение столбца по умолчанию; числа — с запятой. */
function shown(table: TableName, key: string, v: CellValue | undefined): string {
  const col = column(table, key);
  const raw = txt(v ?? null) ? (v as CellValue) : (col.default ?? null);
  if (col.type === "number" || col.type === "int") { const n = num(raw); return n === null ? txt(raw) : formatNumber(n); }
  return txt(raw);
}

/** Перечень акта приёмки из «Материалов в актах» актов: количество строки или сумма ВОР; одинаковые суммируются. */
function itemsFromMaterials(book: Book, acts: string[]): Record<string, string>[] {
  const rows = (t: TableName) => book.tables[t] ?? [];
  const sum = new Map<string, { qty: number | null }>();
  for (const am of rows("МатериалыАктов").filter((r) => acts.includes(txt(r.v.act)))) {
    const name = txt(am.v.material);
    if (!name) continue;
    const vor = rows("ВОР").filter((r) => txt(r.v.act) === txt(am.v.act) && txt(r.v.material) === name);
    const q = num(am.v.quantity) ?? (vor.length ? vor.reduce((s, r) => s + (num(r.v.quantity) ?? 0), 0) : null);
    const cur = sum.get(name);
    sum.set(name, { qty: cur ? (cur.qty === null && q === null ? null : (cur.qty ?? 0) + (q ?? 0)) : q });
  }
  return [...sum].map(([name, { qty }]) => {
    const m = rows("Материалы").find((r) => txt(r.v.name) === name);
    return { name, type: m ? txt(m.v.mark) || txt(m.v.article) : "", unit: m ? txt(m.v.unit) : "", qty: formatNumber(qty), note: "" };
  });
}

/** Пакет документа по его номеру в «Протоколах»; при ошибках книги — null и список ошибок. */
export function buildProtoBundle(book: Book, number: string, important: ImportantMap): { bundle: ActBundle | null; issues: Issue[] } {
  const c = createChecker(book, important);
  const NUM = column("Протоколы", "number").header;
  if (!book.tables["Протоколы"]) {
    c.push("Протоколы", null, NUM, "В книге нет таблицы «Протоколы» — нажмите «Обновить разметку»");
    return { bundle: null, issues: c.issues };
  }
  const head = headerByNumber(book, number);
  if (!head) {
    c.push("Протоколы", null, NUM, `Документ «${number.trim()}» не найден в таблице «Протоколы»`);
    return { bundle: null, issues: c.issues };
  }
  const h = c.checkRow("Протоколы", head);
  c.checkDuplicates("Протоколы", [head]);
  const def = protoByCode(txt(head.v.doc));
  if (!def) return { bundle: null, issues: c.issues };

  // Акт-носитель пакета: акт шапки, для документа «на комплект» без акта — первый акт комплекта.
  const act = txt(head.v.act), kit = txt(head.v.kit);
  const kitActs = kit ? actsOfKit(book, kit) : [];
  if (def.scope === "act" && !act) c.push("Протоколы", head.row, column("Протоколы", "act").header, "Не заполнено");
  if (def.scope === "kit" && !act && !kit) c.push("Протоколы", head.row, column("Протоколы", "kit").header, "Укажите комплект или акт комплекта");
  if (def.scope === "kit" && kit && !act && !kitActs.length)
    c.push("АктыКомплектов", null, column("АктыКомплектов", "act").header, `В комплект «${kit}» не включены акты (таблица «Акты комплектов»)`);
  const carrier = act || kitActs[0] || "";

  const rows = protoRows(c, book, def, number.trim(), def.scope === "kit" && kit ? kitActs : [carrier]);
  const normative = txt(head.v.normative) || def.source;
  if (rows.some((r) => isNegative(r.result ?? "")) && !txt(head.v.conclusion))
    c.push("Протоколы", head.row, column("Протоколы", "conclusion").header, "Есть строки «не соответствует» — впишите заключение");

  const base = carrier ? buildBundle(book, carrier, important) : null;
  const lab = def.signer === "lab" ? labPart(c) : null;
  const dateFrom = (h.dateFrom as string | null) ?? null;
  const commission = def.signer === "lab" || !base?.bundle ? [] : commissionOf(base.bundle, def, dateFrom ?? base.bundle.act.date);
  if (def.signer !== "lab" && base?.bundle && !commission.length)
    c.push("Представители", null, column("Представители", "role").header, `Представители: нет членов комиссии для ${def.code}`);

  const issues = [...(base?.issues ?? []), ...c.issues];
  if (issues.length || !base?.bundle) return { bundle: null, issues };
  const dflt = (key: string) => shown("Протоколы", key, head.v[key]);
  const proto: ProtoData = {
    kind: def.kind, code: def.code, name: def.name, signer: def.signer === "lab" ? "lab" : "commission",
    number: number.trim(), dateFrom, dateTo: (h.dateTo as string | null) ?? null,
    subject: txt(head.v.subject), temperature: dflt("temperature"), humidity: dflt("humidity"), pressure: dflt("pressure"), purpose: dflt("purpose"),
    normative, conclusion: txt(head.v.conclusion) || def.conclusion.replace("{нормативы}", normative),
    city: txt(book.object.city), rows, lab: lab?.lab ?? null, instruments: lab?.instruments ?? [], commission,
  };
  return { bundle: { ...base.bundle, proto }, issues: [] };
}

/** Строки документа в печатном виде; перечень акта приёмки без строк — из материалов актов. */
function protoRows(c: ReturnType<typeof createChecker>, book: Book, def: ProtoDef, number: string, acts: string[]): Record<string, string>[] {
  const own = c.rows(def.table).filter((r) => txt(r.v.doc) === number);
  if (!own.length) {
    if (def.table === "ПереченьОборудования") return itemsFromMaterials(book, acts.filter(Boolean));
    c.push(def.table, null, column(def.table, "doc").header, `Нет строк документа «${number}»`);
    return [];
  }
  const hasResult = def.columns.some((x) => x.key === "result");
  return own.map((r: BookRow) => {
    c.checkRow(def.table, r);
    const comp = computed(def, r.v);
    const result = txt(r.v.result ?? null) || resultOf(def, r.v) || "";
    if (hasResult && !result) c.push(def.table, r.row, column(def.table, "result").header, "Не заполнено");
    return Object.fromEntries(def.columns.map((col) =>
      [col.key, col.computed ? comp[col.key] ?? "" : col.key === "result" ? result : shown(def.table, col.key, r.v[col.key])]));
  });
}

/** Электролаборатория и средства измерений (как у протокола изоляции). */
function labPart(c: ReturnType<typeof createChecker>) {
  const labRow = c.rows("Электролаборатория")[0];
  if (!labRow) c.push("Электролаборатория", null, column("Электролаборатория", "nameAddress").header, "Заполните таблицу «Электролаборатория»");
  else c.checkRow("Электролаборатория", labRow);
  const si = c.rows("СредстваИзмерений");
  if (!si.length) c.push("СредстваИзмерений", null, column("СредстваИзмерений", "name").header, "Заполните таблицу «СредстваИзмерений»");
  return {
    lab: labRow ? { nameAddress: txt(labRow.v.nameAddress), certificate: txt(labRow.v.certificate), head: txt(labRow.v.head), tester: txt(labRow.v.tester) } : null,
    instruments: si.map((r) => {
      const v = c.checkRow("СредстваИзмерений", r);
      return {
        name: txt(r.v.name), type: txt(r.v.type), range: txt(r.v.range), accuracy: txt(r.v.accuracy), serial: txt(r.v.serial),
        certificate: txt(r.v.certificate), checkedOn: (v.checkedOn as string | null) ?? null, nextCheck: (v.nextCheck as string | null) ?? null,
        authority: txt(r.v.authority),
      };
    }),
  };
}

/** Члены комиссии: представители ролей документа, действующие на дату, в порядке ролей. */
function commissionOf(b: ActBundle, def: ProtoDef, date: string): ProtoData["commission"] {
  if (def.signer === "lab") return [];
  const org = (id: number) => b.organizations.find((o) => o.id === id)?.shortName ?? "";
  return def.signer.flatMap((role) => activeRepresentatives(b.representatives, role, date).map((r) => ({
    role: ROLE_BOOK_LABELS[role], position: r.position, org: org(r.orgId), name: r.fullName,
  })));
}
