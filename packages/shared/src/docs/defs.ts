// План 15: описания документов акта — единственный источник номеров, наименований реестра, видов реестра, подписей
// в шаблоне, нужных таблиц и форм (протоколы и акты плана 13 — в protocols/defs.ts).
import type { RegistryKind, TableName } from "../workbook/schema.ts";
import type { FormDoc, FormSet } from "../templates.ts";

export const ACT_DOC_KINDS = ["aosr", "rim", "vd", "vor", "avk", "kj", "ip", "rp"] as const;
export type ActDocKind = (typeof ACT_DOC_KINDS)[number];

/** Что нужно наименованию строки реестра. */
export interface NameCtx { aosrNo: string; date: string; works: string }

export interface ActDocDef {
  kind: ActDocKind;
  /** Подпись в шаблоне и на кнопке печати. */
  label: string;
  /** Вид строки реестра ИД. */
  registry: RegistryKind;
  /** Суффикс номера «<акт>.<суффикс>» по набору; "" — номер акта без суффикса; null — номер не от номера акта. */
  suffix: Record<FormSet, string | null>;
  /** Наименование строки реестра по набору. */
  name: (set: FormSet, c: NameCtx) => string;
  /** Пакет печати: акта или с кабелями акта. */
  bundle: "act" | "cable";
  /** Таблицы книги, из которых документ берёт данные (кроме общих: «Акты», «Объект», «Организации»…). */
  tables: TableName[];
  /** Строка реестра — только если у акта есть строки этой таблицы. */
  rowsFrom?: TableName;
  /** Форма выбирается в шаблоне отдельно («Форма:» документа). */
  formDoc?: FormDoc;
  /** Наборы, у которых есть своя встроенная форма; первая — для остальных наборов. */
  forms: FormSet[];
}

export const AOSR_NAME = "Акт освидетельствования скрытых работ";
export const RIM_NAME = "Реестр использованных материалов";
export const VD_NAME = "Ведомость смонтированного оборудования, технических средств и материалов";
export const VOR_NAME = "Ведомость объемов выполненных работ";
export const KJ_NAME = "Кабельный журнал";
export const PROTOCOL_NAME = "Протокол проверки сопротивления изоляции проводов, кабелей и обмоток электрических машин";
export const AVK_NAME = "Акт входного контроля, технических средств и материалов";
/** Реестр приложений к АОСР (план 14) и наименования строк реестра в наборе «ТИ». */
export const RP_NAME = "Реестр приложений к АОСР";
export const TI_NAMES = {
  rim: "Реестр используемых материалов и документов, подтверждающих их качество, к АОСР",
  vd: "Ведомость смонтированного электрооборудования и материалов",
  ip: "Протокол сопротивления изоляции",
};

const both = (s: string): Record<FormSet, string> => ({ sbd: s, ti: s });
const MATS: TableName[] = ["МатериалыАктов", "Материалы"];

const list: ActDocDef[] = [
  { kind: "aosr", label: "АОСР", registry: "АОСР", suffix: { sbd: "АОСР", ti: "" },
    name: (s, c) => (s === "ti" ? AOSR_NAME : `${AOSR_NAME} ${c.works}`), bundle: "act", tables: ["Схемы", "МатериалыАктов"], forms: ["sbd"] },
  { kind: "rim", label: "РИМ", registry: "РИМ", suffix: { sbd: "РИМ", ti: "РМ" },
    name: (s, c) => (s === "ti" ? `${TI_NAMES.rim} ${c.aosrNo} от ${c.date}` : RIM_NAME), bundle: "act",
    tables: [...MATS, "ДокументыКачества"], rowsFrom: "МатериалыАктов", formDoc: "rim", forms: ["sbd", "ti"] },
  { kind: "vd", label: "ВД", registry: "ВД", suffix: both("ВД"), name: (s) => (s === "ti" ? TI_NAMES.vd : VD_NAME), bundle: "act",
    tables: MATS, rowsFrom: "МатериалыАктов", formDoc: "vd", forms: ["sbd", "ti"] },
  { kind: "vor", label: "ВОР", registry: "ВОР", suffix: both("ВОР"), name: () => VOR_NAME, bundle: "act", tables: ["ВОР"],
    rowsFrom: "ВОР", forms: ["sbd"] },
  { kind: "avk", label: "АВК", registry: "АВК", suffix: { sbd: null, ti: null }, name: () => AVK_NAME, bundle: "act",
    tables: MATS, rowsFrom: "МатериалыАктов", forms: ["sbd"] },
  { kind: "kj", label: "КЖ", registry: "КЖ", suffix: both("КЖ"), name: () => KJ_NAME, bundle: "cable",
    tables: ["КабельныйЖурнал", "ДокументыКабелей"], rowsFrom: "КабельныйЖурнал", formDoc: "kj", forms: ["sbd", "ti"] },
  { kind: "ip", label: "Протокол", registry: "Протокол", suffix: { sbd: "Протокол", ti: "П" },
    name: (s) => (s === "ti" ? TI_NAMES.ip : PROTOCOL_NAME), bundle: "cable",
    tables: ["КабельныйЖурнал", "ДокументыКабелей", "Электролаборатория", "СредстваИзмерений", "ИзмеренияМарок"],
    rowsFrom: "КабельныйЖурнал", forms: ["sbd"] },
  { kind: "rp", label: "РП", registry: "РП", suffix: both("РП"), name: (_s, c) => `${RP_NAME} ${c.aosrNo} от ${c.date}`, bundle: "act",
    tables: ["ДокументыКачества", "МатериалыАктов"], rowsFrom: "МатериалыАктов", forms: ["ti"] },
];
export const ACT_DOC_DEFS = Object.fromEntries(list.map((d) => [d.kind, d])) as Record<ActDocKind, ActDocDef>;

export const isActDocKind = (k: string): k is ActDocKind => (ACT_DOC_KINDS as readonly string[]).includes(k);

/** Встроенная форма документа для набора: своя форма набора, иначе первая (АОСР «ТИ» — по 344/пр, как «СБД»). */
export const actDocForm = (kind: ActDocKind, set: FormSet): FormSet => {
  const f = ACT_DOC_DEFS[kind].forms;
  return f.includes(set) ? set : f[0];
};
