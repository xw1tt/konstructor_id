// Задание сборки комплекта: всё, что нужно серверу для реестра, титула, корешков и документов (план 7, §4).
import { z } from "zod";
import { Organization } from "../schemas.ts";
import { PRINT_KINDS, type PrintKind } from "../acts/schemas.ts";
import { withNo } from "../acts/format.ts";
import { DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "../templates.ts";
import { REGISTRY_KINDS, column, type RegistryKind, type TableName } from "../workbook/schema.ts";
import { cellText, parseNumberCell, type CellValue } from "../workbook/values.ts";
import { ActBundle, buildBundle, createChecker, type Issue } from "../workbook/bundle.ts";
import { buildCableBundle } from "../workbook/cables.ts";
import type { Book, BookRow } from "../workbook/records.ts";
import type { ImportantMap } from "../workbook/important.ts";
import { kitActs } from "./registry.ts";
import type { UserTemplate } from "../forms/template.ts";

/** Файл скана или логотипа: имя (в папке сканов или полный путь) и адрес прикреплённого файла сервера. */
export const FileRef = z.object({ name: z.string(), link: z.string().nullable().default(null) });
export type FileRef = z.infer<typeof FileRef>;

export const KitRow = z.object({
  /** Строка таблицы «РеестрИД» (для сообщений об ошибках). */
  row: z.number().int(),
  kind: z.enum(REGISTRY_KINDS),
  number: z.string().default(""),
  name: z.string().default(""),
  date: z.string().default(""),
  copies: z.number().int().min(0).default(1),
  code: z.string().default(""),
  /** Листов для графы реестра; null — по документу. */
  sheets: z.number().int().min(0).nullable().default(null),
  /** Документ конструктора: акт и вид печати. */
  /** Документ конструктора: акт и вид встроенной печати; form — печать по своей форме шаблона (вид встроенного — null
   *  для своего документа). */
  doc: z.object({
    act: z.string(), kind: z.enum(PRINT_KINDS).nullable(),
    form: z.object({ template: z.string(), doc: z.string() }).optional(),
  }).nullable().default(null),
  file: FileRef.nullable().default(null),
});
export type KitRow = z.infer<typeof KitRow>;

export const KitHeader = z.object({
  number: z.string(), volume: z.string().default(""), part: z.string().default(""), building: z.string().default(""),
  works: z.string().default(""), city: z.string().default(""), year: z.string().default(""),
  cover: z.boolean().default(true), spine: z.boolean().default(true), parts: z.number().int().min(1).max(30).default(1),
  code: z.string(), sectionName: z.string().default(""),
});
export type KitHeader = z.infer<typeof KitHeader>;

export const KitRequest = z.object({
  template: z.string().default(DEFAULT_TEMPLATE),
  options: PrintOptions.default({}),
  kit: KitHeader,
  object: z.object({ name: z.string().default(""), contractNumber: z.string().default("") }),
  /** Заказчик (застройщик), подрядчик (выполнивший работы первого акта, иначе из «Объекта»), разработчик РД. */
  developer: Organization.nullable(),
  contractor: Organization.nullable(),
  designer: Organization.nullable(),
  logos: z.object({ contractor: FileRef.nullable().default(null), developer: FileRef.nullable().default(null) }),
  scanFolder: z.string().default(""),
  acts: z.array(ActBundle),
  rows: z.array(KitRow).min(1),
});
export type KitRequest = z.infer<typeof KitRequest>;

/** Вид строки реестра → документ конструктора. */
export const PRINTED_KINDS: Partial<Record<RegistryKind, PrintKind>> = {
  "ВОР": "vor", "АОСР": "aosr", "РИМ": "rim", "ВД": "vd", "КЖ": "kj", "Протокол": "ip", "АВК": "avk",
};

const txt = cellText;
const H = (t: TableName, key: string) => column(t, key).header;

const orgOf = (r: BookRow | undefined): Organization | null => r ? {
  id: r.row + 1, shortName: txt(r.v.shortName), fullName: txt(r.v.fullName), ogrn: txt(r.v.ogrn), inn: txt(r.v.inn),
  address: txt(r.v.address), phone: txt(r.v.phone), sroName: txt(r.v.sroName), sroOgrn: txt(r.v.sroOgrn), sroInn: txt(r.v.sroInn),
} : null;

const fileOf = (r: BookRow | undefined, key = "file"): FileRef | null => {
  if (!r) return null;
  const name = txt(r.v[key]);
  const link = r.link[key] ?? null;
  return name || link ? { name, link } : null;
};

/** Собирает задание сборки комплекта; при ошибках книги — null и список ошибок (как у печати акта). */
export function buildKitRequest(
  book: Book, kit: string, important: ImportantMap, template: TemplateCode = DEFAULT_TEMPLATE,
  options: PrintOptions = PrintOptions.parse({}), now = new Date(), tpl?: UserTemplate,
): { request: KitRequest | null; issues: Issue[] } {
  /** Своя форма документа в шаблоне: ключ задания печати формы (вид встроенного или код своего). */
  const formOf = (kind: PrintKind | null, code: string | null): { template: string; doc: string } | undefined => {
    const d = tpl?.docs.find((x) => (x.kind === "builtin" ? x.doc === kind : x.code.toUpperCase() === (code ?? "").toUpperCase()));
    return d?.form && tpl ? { template: tpl.id, doc: d.kind === "builtin" ? d.doc : d.code } : undefined;
  };
  const c = createChecker(book, important);
  const { kitRow, acts } = kitActs(book, kit);
  if (!kitRow) {
    c.push("Комплекты", null, H("Комплекты", "number"), `Комплект «${kit}» не найден на листе «Комплекты»`);
    return { request: null, issues: c.issues };
  }
  const k = c.checkRow("Комплекты", kitRow);
  c.checkDuplicates("Комплекты", [kitRow]);
  if (!acts.length) c.push("АктыКомплектов", null, H("АктыКомплектов", "act"), `В комплект «${kit}» не включены акты (таблица «Акты комплектов»)`);
  for (const a of acts) if (!c.find("Акты", a)) c.push("АктыКомплектов", null, H("АктыКомплектов", "act"), `Акт «${a}» не найден на листе «База актов»`);

  const regRows = c.rows("РеестрИД").filter((r) => txt(r.v.kit) === kit);
  if (!regRows.length) c.push("РеестрИД", null, H("РеестрИД", "kit"), `Реестр комплекта «${kit}» пуст — нажмите «Заполнить из актов»`);

  // Сканы, которые можно найти по номеру в исходных таблицах, если в строке реестра «Скан» пуст.
  const byNumber = (t: TableName, key: string, number: string, act?: string) =>
    c.rows(t).find((r) => withNo(txt(r.v[key])) === withNo(number) && (!act || !("act" in r.v) || txt(r.v.act) === act));
  const fallback = (kind: RegistryKind, number: string, act: string): FileRef | null => {
    switch (kind) {
      case "Схема": return fileOf(byNumber("Схемы", "number", number, act || undefined));
      case "Документ качества": return fileOf(byNumber("ДокументыКачества", "number", number));
      case "Поверка": return fileOf(byNumber("СредстваИзмерений", "certificate", number));
      case "Лаборатория": return fileOf(c.rows("Электролаборатория")[0]);
      default: return null;
    }
  };

  const docRef = (act: string, kind: PrintKind | null, code: string | null) => {
    const form = formOf(kind, code);
    return form ? { act, kind, form } : { act, kind };
  };
  const needs = new Map<string, Set<PrintKind>>();
  const rows: KitRow[] = [];
  for (const r of regRows) {
    const v = c.checkRow("РеестрИД", r);
    const kind = txt(r.v.kind) as RegistryKind;
    if (!REGISTRY_KINDS.includes(kind)) continue;
    const act = txt(r.v.act);
    const own = kind === "Свой документ";
    const ownCode = own ? withNo(txt(r.v.number)).replace(/^№/, "").slice(act.length + 1) : null;
    const printed = PRINTED_KINDS[kind];
    let file: FileRef | null = null;
    if (own && !formOf(null, ownCode)) c.push("РеестрИД", r.row, H("РеестрИД", "kind"), `Своего документа «${ownCode}» нет в шаблоне или у него нет формы`);
    if (printed || own) {
      if (!act) c.push("РеестрИД", r.row, H("РеестрИД", "act"), `Укажите акт: документ «${kind}» печатает конструктор`);
      else if (!acts.includes(act)) c.push("РеестрИД", r.row, H("РеестрИД", "act"), `Акт «${act}» не входит в комплект «${kit}»`);
      else (needs.get(act) ?? needs.set(act, new Set()).get(act)!).add(printed ?? "aosr");
    } else {
      file = fileOf(r) ?? fallback(kind, txt(r.v.number), act);
      if (!file) c.push("РеестрИД", r.row, H("РеестрИД", "file"), "Нет скана: укажите файл в столбце «Скан»");
    }
    const sheets = parseNumberCell(r.v.sheets as CellValue);
    rows.push({
      row: r.row, kind, number: txt(r.v.number), name: txt(r.v.name), date: txt(r.v.date),
      copies: Math.max(0, Math.round((v.copies as number | null) ?? 1)), code: txt(r.v.code),
      sheets: sheets.ok && sheets.value !== null ? Math.max(0, Math.round(sheets.value)) : null,
      doc: (printed || own) && act ? docRef(act, printed ?? null, ownCode) : null, file,
    });
  }

  // Пакеты актов: обычные проверки печати; кабельные — если в реестре есть КЖ или протокол акта.
  const bundles: ActBundle[] = [];
  const issues: Issue[] = [];
  for (const [act, kinds] of needs) {
    const results = [
      ...(kinds.has("ip") ? [buildCableBundle(book, act, important, "ip")] : []),
      ...(kinds.has("kj") ? [buildCableBundle(book, act, important, "kj")] : []),
      ...(!kinds.has("ip") && !kinds.has("kj") ? [buildBundle(book, act, important)] : []),
    ];
    for (const x of results) issues.push(...x.issues);
    if (results.every((x) => x.bundle)) bundles.push(results[0].bundle!);
  }

  const sectionKey = txt(kitRow.v.section) || txt(c.find("Акты", acts[0] ?? "")?.v.section ?? null);
  const sectionRow = c.find("Шифры", sectionKey);
  if (!sectionKey) c.push("Комплекты", kitRow.row, H("Комплекты", "section"), "Укажите шифр комплекта (или шифр первого акта)");
  const org = (k: string) => c.find("Организации", txt(k as CellValue));
  const developerRow = org(txt(book.object.developer));
  // Подрядчик реестра и титула — выполнивший работы (как «Велесстрой» в образце), иначе лицо, осуществляющее строительство.
  const firstAct = c.find("Акты", acts[0] ?? "");
  const contractorRow = org(txt(firstAct?.v.performerOrg ?? null)) ?? org(txt(book.object.performer)) ?? org(txt(book.object.builder));
  const designerRow = org(txt(sectionRow?.v.designer ?? null) || txt(book.object.designer));

  const all = [...c.issues, ...issues];
  // одна и та же ошибка из нескольких проверок — один раз
  const uniq = all.filter((i, n) => all.findIndex((j) => j.table === i.table && j.row === i.row && j.column === i.column && j.message === i.message) === n);
  if (uniq.length) return { request: null, issues: uniq };

  const request: KitRequest = {
    template, options,
    kit: {
      number: kit, volume: txt(kitRow.v.volume), part: txt(kitRow.v.part), building: txt(kitRow.v.building), works: txt(kitRow.v.works),
      city: txt(kitRow.v.city) || txt(book.object.city), year: txt(kitRow.v.year) || String(now.getFullYear()),
      cover: txt(kitRow.v.cover) !== "нет", spine: txt(kitRow.v.spine) !== "нет",
      parts: Math.min(30, Math.max(1, Math.round((k.parts as number | null) ?? 1))),
      code: sectionKey, sectionName: txt(sectionRow?.v.name ?? null),
    },
    object: { name: txt(book.object.name), contractNumber: txt(book.object.contractNumber) },
    developer: orgOf(developerRow), contractor: orgOf(contractorRow), designer: orgOf(designerRow),
    logos: { contractor: fileOf(contractorRow, "logo"), developer: fileOf(developerRow, "logo") },
    scanFolder: txt(book.object.scanFolder),
    acts: bundles,
    rows,
  };
  return { request, issues: [] };
}
