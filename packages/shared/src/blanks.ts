// Настройки бланков встроенных документов в шаблоне: скрыть графы таблицы и необязательные строки/блоки,
// переименовать заголовки граф. Действуют на PDF и Excel. Ключ бланка — «вид:набор форм» (kj:ti), у протоколов — вид.
import { z } from "zod";
import { ACT_DOC_DEFS, isActDocKind, type ActDocKind } from "./docs/defs.ts";
import { PROTO_DEFS, isProtoKind } from "./protocols/defs.ts";
import type { PrintKind } from "./acts/schemas.ts";
import { formOf } from "./acts/format.ts";
import type { FormSet } from "./templates.ts";

/** Графа таблицы бланка: ширина — доля (%), group — общий заголовок над соседними графами. */
export interface BlankColumn { key: string; header: string; width: number; align?: "l" | "c"; group?: string; fixed?: boolean }
/** Необязательная часть бланка (строка итогов, подписи и т. п.). */
export interface BlankBlock { key: string; label: string; aliases?: string[] }
export interface BlankDef { key: string; label: string; columns: BlankColumn[]; blocks: BlankBlock[] }

export const BlankSettings = z.object({
  /** Ключи скрытых граф и блоков. */
  hide: z.array(z.string()).default([]),
  /** Свои заголовки граф: ключ графы → заголовок. */
  headers: z.record(z.string()).default({}),
});
export type BlankSettings = z.infer<typeof BlankSettings>;

const col = (key: string, header: string, width: number, o: Partial<BlankColumn> = {}): BlankColumn => ({ key, header, width, align: "c", ...o });
const N = (header = "№ п/п", width = 5) => col("n", header, width);
const PAIRS = ["А-В", "В-С", "С-А", "A-N (PEN)", "B-N (PEN)", "C-N (PEN)", "A-PE", "B-PE", "C-PE", "N-PE"];
export const IP_PAIRS = PAIRS;

const ACT_BLANKS: BlankDef[] = [
  { key: "rim:sbd", label: "РИМ (СБД)", blocks: [], columns: [
    N(), col("name", "Наименование материалов", 32, { align: "l", fixed: true }), col("type", "Тип документа", 22), col("number", "Номер документа", 19),
    col("date", "Дата документа", 14), col("sheets", "Кол-во листов", 8)] },
  { key: "vd:sbd", label: "ВД (СБД)", blocks: [], columns: [
    N("№ п/п", 6), col("position", "№ поз по УСР", 8), col("name", "Наименование оборудования, комплекта", 41, { align: "l", fixed: true }),
    col("article", "Артикул", 13), col("manufacturer", "Завод изготовитель", 13), col("unit", "Ед. изм.", 8), col("quantity", "Кол-во", 11)] },
  { key: "vor:sbd", label: "ВОР", blocks: [{ key: "signs", label: "Подписи заказчика и монтажной организации", aliases: ["подписи"] }], columns: [
    N("№", 5), col("name", "Наименование работ", 55, { align: "l", fixed: true }), col("unit", "Ед. изм.", 8), col("quantity", "Объем", 8), col("note", "Примечания", 24)] },
  { key: "avk:sbd", label: "АВК", blocks: [], columns: [
    N("п/п", 4), col("name", "Наименование оборудования, материала", 30, { align: "l", fixed: true }), col("manufacturer", "Производитель", 17),
    col("quantity", "Кол-во / Единица", 9), col("docs", "Номера Сертификатов, отказных писем, паспортов", 40)] },
  { key: "ip:sbd", label: "Протокол изоляции (СБД)", blocks: [{ key: "instruments", label: "Перечень средств измерений", aliases: ["средства измерений", "приборы", "си"] }], columns: [
    N("№ п/п", 4), col("line", "Наименование линий, электрических машин по проекту, рабочее напряжение.", 16, { align: "l", fixed: true }),
    col("mark", "Марка провода, кабеля, кол-во жил сечение провода, кабеля, (мм2)", 16), col("voltage", "Напряжение мегаомметра, В", 6),
    col("allowed", "Допуст. сопрот. изоляции (Мом)", 6),
    ...PAIRS.map((p, i) => col(`p${i}`, p, 5.2, { group: "Сопротивление изоляции, (Мом)" }))] },
  { key: "vd:ti", label: "ВД (ТИ)", blocks: [], columns: [
    N("№ п/п", 6), col("name", "Наименование электрооборудования, комплекта", 42, { align: "l", fixed: true }), col("type", "Тип, марка", 20),
    col("quantity", "Кол-во", 8), col("unit", "Ед. изм.", 8), col("note", "Примечания", 16)] },
  { key: "rim:ti", label: "РМ (ТИ)", blocks: [], columns: [
    N("№", 6), col("name", "Наименование", 54, { align: "l", fixed: true }), col("date", "Дата документа", 14), col("number", "Номер документа", 26)] },
  { key: "rp:ti", label: "РП (ТИ)", blocks: [], columns: [
    N("№", 6), col("type", "Наименование", 40, { align: "l", fixed: true }), col("date", "Дата документа", 14), col("number", "Номер документа", 32), col("sheets", "Лист", 8)] },
  { key: "kj:ti", label: "Кабельный журнал (ТИ)", blocks: [
    { key: "total", label: "Строка «Итого всего»", aliases: ["итого"] }, { key: "byMark", label: "Строки «в т.ч. <марка>»", aliases: ["в т.ч.", "по маркам"] },
    { key: "reserve", label: "Строка «с учетом кф запаса»", aliases: ["запас", "коэффициент", "кф"] },
    { key: "signs", label: "Подписи «Сдал / Принял»", aliases: ["сдал", "принял", "подписи"] }], columns: [
    col("designation", "Обозначение кабеля, провода", 12, { fixed: true }), col("from", "Начало", 10, { group: "Трасса" }), col("to", "Конец", 10, { group: "Трасса" }),
    col("mark", "Марка", 22, { group: "Кабель" }), col("project", "Длина по проекту, м", 9, { group: "Кабель" }), col("fact", "Длина фактическая, м", 9, { group: "Кабель" }),
    col("tray", "Лоток", 9, { group: "Способ прокладки" }), col("smooth", "Труба гладкая", 9, { group: "Способ прокладки" }),
    col("corrugated", "Труба гофрированная", 10, { group: "Способ прокладки" })] },
];

/** Бланк протокола или акта комиссии: «№ п/п» и графы описания. */
function protoBlank(kind: keyof typeof PROTO_DEFS): BlankDef {
  const d = PROTO_DEFS[kind];
  return {
    key: kind, label: d.code, blocks: d.signer === "lab" ? [{ key: "instruments", label: "Перечень средств измерений", aliases: ["средства измерений", "приборы"] }] : [],
    columns: [N("№ п/п", 4), ...d.columns.map((c, i) => col(c.key, c.header, c.width ?? 8, i === 0 ? { align: "l", fixed: true } : {}))],
  };
}

export function blankDef(key: string): BlankDef | null {
  if (isProtoKind(key)) return protoBlank(key);
  return ACT_BLANKS.find((b) => b.key === key) ?? null;
}
export const ACT_BLANK_KEYS = ACT_BLANKS.map((b) => b.key);

/** Форма документа акта: выбранная в шаблоне (ВД, РИМ, КЖ) или набора; нет такой встроенной — первая из описания. */
export function actDocFormFor(kind: ActDocKind, options: { formSet?: FormSet; forms?: Partial<Record<string, FormSet>> }): FormSet {
  const def = ACT_DOC_DEFS[kind];
  const f = def.formDoc ? formOf(options as never, def.formDoc) : options.formSet ?? "sbd";
  return def.forms.includes(f) ? f : def.forms[0];
}

/** Ключ бланка документа при этих настройках печати; null — у формы нет настраиваемых частей. */
export function blankKeyFor(kind: PrintKind, options: { formSet?: FormSet; forms?: Partial<Record<string, FormSet>> }): string | null {
  if (isProtoKind(kind)) return kind;
  if (!isActDocKind(kind)) return null;
  const key = `${kind}:${actDocFormFor(kind, options)}`;
  return blankDef(key) ? key : null;
}

/** Видимые графы и блоки бланка с заголовками по настройкам. */
export interface BlankView { columns: BlankColumn[]; shown(key: string): boolean; header(key: string): string }
export function blankView(key: string, settings?: Partial<BlankSettings> | null): BlankView {
  const def = blankDef(key);
  const hide = new Set(settings?.hide ?? []);
  const headers = settings?.headers ?? {};
  const all = def?.columns ?? [];
  const columns = all.filter((c) => c.fixed || !hide.has(c.key)).map((c) => ({ ...c, header: headers[c.key]?.trim() || c.header }));
  return {
    columns,
    shown: (k) => !hide.has(k) || !!all.find((c) => c.key === k)?.fixed,
    header: (k) => headers[k]?.trim() || all.find((c) => c.key === k)?.header || "",
  };
}

/** Настройки бланка из настроек печати шаблона. */
export const blankSettingsOf = (o: { blanks?: Record<string, Partial<BlankSettings>> } | undefined, key: string | null) =>
  (key ? o?.blanks?.[key] : undefined) ?? null;

/** Понятный список отличий бланка от встроенного. */
export function describeBlank(key: string, s: Partial<BlankSettings> | null | undefined): string[] {
  const def = blankDef(key);
  if (!def || !s) return [];
  const out: string[] = [];
  for (const k of s.hide ?? []) {
    const c = def.columns.find((x) => x.key === k);
    const b = def.blocks.find((x) => x.key === k);
    if (c && !c.fixed) out.push(`без графы «${c.header}»`);
    if (b) out.push(`без «${b.label}»`);
  }
  for (const [k, h] of Object.entries(s.headers ?? {})) {
    const c = def.columns.find((x) => x.key === k);
    if (c && h.trim() && h.trim() !== c.header) out.push(`графа «${c.header}» → «${h.trim()}»`);
  }
  return out;
}

/** Найти графу или блок по ключу или по тексту заголовка/названия (без учёта регистра). */
export function findBlankPart(def: BlankDef, q: string): { kind: "column" | "block"; key: string; label: string; fixed?: boolean } | null {
  const s = q.trim().toLowerCase().replace(/[«»"]/g, "");
  if (!s) return null;
  const cols = def.columns.map((c) => ({ kind: "column" as const, key: c.key, label: c.header, fixed: c.fixed }));
  const blocks = def.blocks.map((b) => ({ kind: "block" as const, key: b.key, label: b.label }));
  const all = [...cols, ...blocks];
  const norm = (x: string) => x.toLowerCase().replace(/[«»"]/g, "");
  /** «Лоток, м» → «лоток»: единицы измерения в конце не важны. */
  const bare = (x: string) => x.replace(/(?:,|\s)\s*(?:м|шт|мм2?|%)\.?$/, "").trim();
  const one = <T,>(xs: T[]) => (xs.length === 1 ? xs[0] : null);
  return all.find((p) => p.key.toLowerCase() === s) ?? all.find((p) => norm(p.label) === s)
    ?? all.find((p) => bare(norm(p.label)) === bare(s))
    ?? one(all.filter((p) => norm(p.label).includes(bare(s))))
    // Строки и блоки — по словам-подсказкам («строку с коэффициентом запаса» → запас).
    ?? one(def.blocks.filter((b) => (b.aliases ?? []).some((a) => s.includes(a))).map((b) => blocks.find((x) => x.key === b.key)!));
}
