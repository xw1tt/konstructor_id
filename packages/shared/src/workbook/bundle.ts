// Пакет акта: всё, что нужно серверу для печати АОСР, РИМ, ВД, ВОР, собранное из книги, с проверкой.
import { z } from "zod";
import { ObjectInfo, Organization, Section, Representative, Material, QualityDoc } from "../schemas.ts";
import { Act, ActMaterialInput, ActDocumentInput, VorLineInput } from "../acts/schemas.ts";
import type { RoleCode, QualityDocType } from "../roles.ts";
import {
  TABLES, OBJECT_FIELDS, SCHEME_KINDS, keyColumn, roleFromBook, docTypeFromBook,
  type TableName, type ColumnDef,
} from "./schema.ts";
import { cellText, parseDateCell, parseNumberCell, splitRefs, type CellValue } from "./values.ts";
import type { Book, BookRow } from "./records.ts";
import type { ImportantMap } from "./important.ts";

export const ActBundle = z.object({
  object: ObjectInfo,
  organizations: z.array(Organization),
  sections: z.array(Section),
  representatives: z.array(Representative),
  materials: z.array(Material),
  qualityDocs: z.array(QualityDoc),
  act: Act,
  actMaterials: z.array(ActMaterialInput),
  documents: z.array(ActDocumentInput),
  vor: z.array(VorLineInput),
});
export type ActBundle = z.infer<typeof ActBundle>;

export interface Issue { table: TableName; row: number | null; column: string; message: string }

/** Поля объекта, без которых не напечатать шапку АОСР. */
const OBJECT_REQUIRED = new Set(["name", "developer", "builder"]);

export function buildBundle(book: Book, actNumber: string, important: ImportantMap): { bundle: ActBundle | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const rows = (t: TableName): BookRow[] => book.tables[t] ?? [];
  const key = (t: TableName, r: BookRow) => cellText(r.v[keyColumn(t)!.key]);
  const idOf = (r: BookRow) => r.row + 1;
  const find = (t: TableName, k: string) => (k ? rows(t).find((r) => key(t, r) === k) : undefined);
  const push = (table: TableName, row: number | null, column: string, message: string) => {
    if (!issues.some((i) => i.table === table && i.row === row && i.column === column && i.message === message))
      issues.push({ table, row, column, message });
  };

  const n = actNumber.trim();
  const actRow = find("Акты", n);
  if (!actRow) {
    push("Акты", null, "Номер акта", `Акт «${n}» не найден на листе «База актов»`);
    return { bundle: null, issues };
  }

  const ofAct = (t: TableName) => rows(t).filter((r) => cellText(r.v.act) === n);
  const schemeRows = ofAct("Схемы");
  const actMatRows = ofAct("МатериалыАктов");
  const vorRows = ofAct("ВОР");

  /** Проверка значения одной ячейки; возвращает разобранное значение (или null). */
  const check = (t: TableName, r: BookRow, col: ColumnDef, required = false): unknown => {
    const v: CellValue = r.v[col.key];
    const text = cellText(v);
    const imp = required || (important[t] ?? []).includes(col.header);
    if (!text && col.type !== "formula") {
      if (imp) push(t, r.row, col.header, "Не заполнено");
      return null;
    }
    switch (col.type) {
      case "date": {
        const p = parseDateCell(v);
        if (!p.ok) { push(t, r.row, col.header, p.message); return null; }
        return p.value;
      }
      case "number": case "int": {
        const p = parseNumberCell(v);
        if (!p.ok) { push(t, r.row, col.header, p.message); return null; }
        return p.value;
      }
      case "enum":
        if (!col.values!.includes(text)) push(t, r.row, col.header, "Значение не из списка");
        return text;
      case "ref": {
        if (!find(col.ref!, text)) push(t, r.row, col.header, `Нет в таблице «${TABLES[col.ref!].sheet}»: ${text}`);
        return text;
      }
      case "refs": {
        const list = splitRefs(v);
        for (const x of list) if (!find(col.ref!, x)) push(t, r.row, col.header, `Нет в таблице «${TABLES[col.ref!].sheet}»: ${x}`);
        return list;
      }
      default:
        return text;
    }
  };
  const checkRow = (t: TableName, r: BookRow, required: string[] = []) =>
    Object.fromEntries(TABLES[t].columns.map((c) => [c.key, check(t, r, c, required.includes(c.key))])) as Record<string, any>;

  const checkDuplicates = (t: TableName, used: BookRow[]) => {
    const col = keyColumn(t)!;
    for (const r of used) {
      const k = key(t, r);
      if (k && rows(t).filter((x) => key(t, x) === k).length > 1) push(t, r.row, col.header, "Значение повторяется");
    }
  };

  // Строка акта и его строки на связанных листах.
  const a = checkRow("Акты", actRow, ["date"]);
  checkDuplicates("Акты", [actRow]);
  const schemes = schemeRows.map((r) => ({ r, v: checkRow("Схемы", r) }));
  const actMats = actMatRows.map((r) => ({ r, v: checkRow("МатериалыАктов", r) }));
  const vor = vorRows.map((r) => ({ r, v: checkRow("ВОР", r) }));
  const actMatNames = new Set(actMats.map((m) => cellText(m.r.v.material)));
  for (const x of vor) {
    const m = cellText(x.r.v.material);
    if (m && find("Материалы", m) && !actMatNames.has(m))
      push("ВОР", x.r.row, "Материал", "Материала нет в «Материалах в актах» этого акта");
  }

  // Материалы акта и их документы качества.
  const usedMats = [...actMatNames].map((m) => find("Материалы", m)).filter((r): r is BookRow => !!r);
  for (const r of usedMats) {
    checkRow("Материалы", r);
    if (key("Материалы", r).includes(";")) push("Материалы", r.row, "Наименование", "Наименование не должно содержать «;»");
  }
  checkDuplicates("Материалы", usedMats);
  const usedMatKeys = new Set(usedMats.map((r) => key("Материалы", r)));
  for (const r of rows("ДокументыКачества")) {
    if (splitRefs(r.v.materials).some((m) => usedMatKeys.has(m))) checkRow("ДокументыКачества", r);
  }

  // Шифр, представители, объект, организации.
  const sectionKey = cellText(actRow.v.section);
  const sectionRow = find("Шифры", sectionKey);
  if (sectionRow) { checkRow("Шифры", sectionRow); checkDuplicates("Шифры", [sectionRow]); }
  for (const r of rows("Представители")) checkRow("Представители", r);
  checkDuplicates("Представители", rows("Представители"));

  const objRow = (k: string) => rows("Объект").find((r) => cellText(r.v.field) === OBJECT_FIELDS.find((f) => f.key === k)!.label);
  for (const f of OBJECT_FIELDS) {
    const v = book.object[f.key];
    const r = objRow(f.key);
    const text = cellText(v);
    if (!text) {
      if (OBJECT_REQUIRED.has(f.key)) push("Объект", r?.row ?? null, f.label, "Не заполнено");
      continue;
    }
    if (f.type === "ref" && !find("Организации", text)) push("Объект", r?.row ?? null, f.label, `Нет в таблице «Реквизиты»: ${text}`);
    if (f.type === "date" && !parseDateCell(v).ok) push("Объект", r?.row ?? null, f.label, "Дата в формате ДД.ММ.ГГГГ");
  }
  const orgKeys = new Set<string>([
    ...OBJECT_FIELDS.filter((f) => f.type === "ref").map((f) => cellText(book.object[f.key])),
    cellText(sectionRow?.v.designer ?? null), cellText(actRow.v.performerOrg),
    ...rows("Представители").map((r) => cellText(r.v.org)),
  ].filter(Boolean));
  const usedOrgs = [...orgKeys].map((k) => find("Организации", k)).filter((r): r is BookRow => !!r);
  for (const r of usedOrgs) checkRow("Организации", r);
  checkDuplicates("Организации", usedOrgs);

  if (issues.length) return { bundle: null, issues };

  // Сборка.
  const orgId = (k: CellValue) => { const r = find("Организации", cellText(k)); return r ? idOf(r) : null; };
  const matId = (k: CellValue) => idOf(find("Материалы", cellText(k))!);
  const repId = (k: CellValue) => { const r = find("Представители", cellText(k)); return r ? idOf(r) : null; };
  const date = (v: CellValue) => (parseDateCell(v) as { value: string | null }).value;
  const num = (v: CellValue) => (parseNumberCell(v) as { value: number | null }).value;
  const txt = cellText;
  const or = (v: CellValue, dflt: string | number) => (txt(v) ? v : dflt);

  const organizations = rows("Организации").map((r) => ({
    id: idOf(r), shortName: txt(r.v.shortName), fullName: txt(r.v.fullName), ogrn: txt(r.v.ogrn), inn: txt(r.v.inn),
    address: txt(r.v.address), phone: txt(r.v.phone), sroName: txt(r.v.sroName), sroOgrn: txt(r.v.sroOgrn), sroInn: txt(r.v.sroInn),
  }));
  const objectRoles = {
    developer: orgId(book.object.developer), builder: orgId(book.object.builder),
    designer: orgId(book.object.designer), performer: orgId(book.object.performer),
  };
  const bundle: ActBundle = {
    object: {
      name: txt(book.object.name), address: txt(book.object.address), contractNumber: txt(book.object.contractNumber),
      contractDate: date(book.object.contractDate), city: txt(book.object.city), roles: objectRoles,
    },
    organizations,
    sections: rows("Шифры").map((r) => ({ id: idOf(r), code: txt(r.v.code), name: txt(r.v.name), designerOrgId: orgId(r.v.designer) })),
    representatives: rows("Представители")
      .filter((r) => roleFromBook(txt(r.v.role)) && find("Организации", txt(r.v.org)))
      .map((r) => ({
        id: idOf(r), role: roleFromBook(txt(r.v.role)) as RoleCode, position: txt(r.v.position), fullName: txt(r.v.fullName),
        orgId: orgId(r.v.org)!, authorityDoc: txt(r.v.authorityDoc), nrsNumber: txt(r.v.nrsNumber), nrsDate: date(r.v.nrsDate),
        validFrom: date(r.v.validFrom), validTo: date(r.v.validTo), sortOrder: Math.round(num(r.v.sortOrder) ?? 0), actText: txt(r.v.actText),
      })),
    materials: rows("Материалы").map((r) => ({
      id: idOf(r), name: txt(r.v.name), mark: txt(r.v.mark), article: txt(r.v.article), manufacturer: txt(r.v.manufacturer), unit: txt(r.v.unit),
    })),
    qualityDocs: rows("ДокументыКачества")
      .filter((r) => docTypeFromBook(txt(r.v.type)) && splitRefs(r.v.materials).every((m) => find("Материалы", m)))
      .map((r) => ({
        id: idOf(r), type: docTypeFromBook(txt(r.v.type)) as QualityDocType, number: txt(r.v.number),
        issueDate: parseDateCell(r.v.issueDate).ok ? date(r.v.issueDate) : null,
        validUntil: parseDateCell(r.v.validUntil).ok ? date(r.v.validUntil) : null,
        sheets: parseNumberCell(r.v.sheets).ok ? Math.max(0, Math.round(num(r.v.sheets) ?? 0)) : 0,
        fileId: null, materialIds: splitRefs(r.v.materials).map((m) => matId(m)), registryName: txt(r.v.registryName),
      })),
    act: {
      id: idOf(actRow), baseNumber: n, date: a.date as string, sectionId: sectionRow ? idOf(sectionRow) : null,
      works: txt(actRow.v.works), sheets: txt(actRow.v.sheets), revision: txt(actRow.v.revision),
      dateStart: a.dateStart as string | null, dateEnd: a.dateEnd as string | null,
      normative: txt(actRow.v.normative), nextWorks: txt(actRow.v.nextWorks),
      extraInfo: txt(or(actRow.v.extraInfo, "нет")), copies: Math.max(1, Math.round((a.copies as number | null) ?? 4)),
      attachments: txt(or(actRow.v.attachments, "Согласно п.3, п.4.")),
      performerOrgId: txt(actRow.v.performerOrg) ? orgId(actRow.v.performerOrg) : objectRoles.performer,
      vorTitle: txt(actRow.v.vorTitle), vorCustomerRepId: repId(actRow.v.vorCustomer), vorContractorRepId: repId(actRow.v.vorContractor),
    },
    actMaterials: actMats.map((m, i) => ({
      materialId: matId(m.r.v.material), position: txt(m.r.v.position) || "б/н", quantity: (m.v.quantity as number | null) ?? null, sortOrder: i,
    })),
    documents: schemes.map((s, i) => ({
      kind: txt(s.r.v.kind) === SCHEME_KINDS[1] ? "other" as const : "scheme" as const,
      number: txt(s.r.v.number), name: txt(s.r.v.name), date: s.v.date as string | null, fileId: null, sortOrder: i,
    })),
    vor: vor.map((x, i) => ({
      group: txt(x.r.v.group), materialId: matId(x.r.v.material), quantity: Math.max(0, (x.v.quantity as number | null) ?? 0), sortOrder: i,
    })),
  };
  // В пакет — только то, что нужно этому акту (тело запроса к серверу ограничено 1 МБ).
  const usedMatIds = new Set(bundle.actMaterials.map((m) => m.materialId));
  bundle.qualityDocs = bundle.qualityDocs.filter((d) => d.materialIds.some((id) => usedMatIds.has(id)));
  const keepMat = new Set([...usedMatIds, ...bundle.qualityDocs.flatMap((d) => d.materialIds)]);
  bundle.materials = bundle.materials.filter((m) => keepMat.has(m.id));
  return { bundle, issues };
}
