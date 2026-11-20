// 0.33: оформление встроенного документа в шаблоне — шрифт, размеры текста, жирный/курсив значений, межстрочный
// интервал, высота строк таблицы, поворот заголовков узких граф, выравнивание, поля и ориентация листа.
// Хранится в настройках печати шаблона (print.styles, ключ — «вид:набор форм», у протоколов — вид).
// Пустое поле — как в образце. Действует на PDF и (шрифт, масштаб, поля, ориентация) на Excel.
import { z } from "zod";
import { ACT_DOC_DEFS, isActDocKind } from "./docs/defs.ts";
import { isProtoKind, PROTO_DEFS } from "./protocols/defs.ts";
import { actDocFormFor } from "./blanks.ts";
import type { PrintKind } from "./acts/schemas.ts";
import type { FormSet } from "./templates.ts";

export const DOC_FONTS = ["Times New Roman", "Arial", "Calibri", "Cambria", "Courier New", "GOST type A"] as const;
export type DocFont = (typeof DOC_FONTS)[number];

const pt = (min: number, max: number) => z.number().min(min).max(max).optional();
const mm = z.number().min(0).max(40).optional();

export const DocStyle = z.object({
  /** Шрифт всего документа. */
  font: z.enum(DOC_FONTS).optional(),
  /** Основной текст и значения, пт (в образце СБД — 10). */
  size: pt(6, 16),
  /** Текст в ячейках таблиц, пт. */
  tableSize: pt(5, 14),
  /** Заголовки граф таблиц, пт. */
  headerSize: pt(5, 14),
  /** Заголовок документа («АКТ…», «ВЕДОМОСТЬ…»), пт. */
  titleSize: pt(8, 20),
  /** Заполненные значения (подчёркнутые строки): жирный / курсив. В образце — жирный курсив. */
  valueBold: z.boolean().optional(),
  valueItalic: z.boolean().optional(),
  /** Межстрочный интервал (1 — одинарный; в образце 1,15). */
  lineHeight: z.number().min(0.9).max(2).optional(),
  /** Наименьшая высота строки таблицы, мм. */
  rowHeight: z.number().min(3).max(30).optional(),
  /** Повернуть заголовки узких граф (текст снизу вверх), чтобы не переносились по слогам. */
  headerRotate: z.boolean().optional(),
  /** Выравнивание текста в ячейках таблиц: как в образце, всё влево или всё по центру. */
  tableAlign: z.enum(["left", "center"]).optional(),
  /** Выравнивание основного текста: как в образце или по ширине. */
  textAlign: z.enum(["justify"]).optional(),
  /** Поля листа, мм. */
  marginTop: mm,
  marginRight: mm,
  marginBottom: mm,
  marginLeft: mm,
  /** Ориентация листа. */
  orientation: z.enum(["portrait", "landscape"]).optional(),
});
export type DocStyle = z.infer<typeof DocStyle>;

/** Готовые наборы: пользователь выбирает одним щелчком, затем правит. */
export const STYLE_PRESETS: { id: string; label: string; style: DocStyle }[] = [
  { id: "sample", label: "Как в образце", style: {} },
  { id: "large", label: "Крупнее (11 пт)", style: { size: 11, tableSize: 10, headerSize: 9, titleSize: 12 } },
  {
    id: "compact",
    label: "Компактно (9 пт, узкие поля)",
    style: { size: 9, tableSize: 8, headerSize: 7.5, lineHeight: 1.05, marginTop: 8, marginRight: 8, marginBottom: 8, marginLeft: 15 },
  },
  { id: "arial", label: "Arial, без курсива", style: { font: "Arial", size: 9.5, tableSize: 8.5, headerSize: 8, valueItalic: false } },
  {
    id: "gost",
    label: "ГОСТ: Times 12, поля 20/10/10/30",
    style: { size: 12, tableSize: 10, headerSize: 10, titleSize: 13, marginTop: 20, marginRight: 10, marginBottom: 10, marginLeft: 30 },
  },
];

/** Ключ оформления документа при этих настройках печати: «вид:форма» у документов акта, вид — у протоколов. */
export function styleKeyFor(kind: PrintKind | string, options: { formSet?: FormSet; forms?: Partial<Record<string, FormSet>> }): string | null {
  if (isProtoKind(kind)) return kind;
  if (!isActDocKind(kind)) return null;
  return `${kind}:${actDocFormFor(kind, options)}`;
}

/** Подписи наборов (как FORM_SET_LABELS; без импорта значения — templates.ts импортирует этот файл). */
const SET_LABELS: Record<string, string> = { sbd: "СБД", ti: "ТИ", kam: "Камчатка" };

/** Название документа для ключа оформления. */
export function styleLabel(key: string): string {
  if (isProtoKind(key)) return PROTO_DEFS[key].code;
  const [kind, form] = key.split(":");
  const d = isActDocKind(kind) ? ACT_DOC_DEFS[kind] : null;
  return d ? `${d.label}${form ? ` (${SET_LABELS[form] ?? form})` : ""}` : key;
}

/** Убирает пустые и совпадающие с образцом поля; пустой объект — «как в образце». */
export function cleanStyle(s: Partial<DocStyle> | null | undefined): DocStyle {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s ?? {}))
    if (v !== undefined && v !== null && (v as unknown) !== "" && !(typeof v === "number" && !Number.isFinite(v))) out[k] = v;
  return DocStyle.parse(out);
}
export const isSampleStyle = (s: Partial<DocStyle> | null | undefined) => Object.keys(cleanStyle(s)).length === 0;

const n = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");
/** Понятный список отличий от образца (для карточки шаблона и помощника). */
export function describeStyle(s: Partial<DocStyle> | null | undefined): string[] {
  const x = cleanStyle(s);
  const out: string[] = [];
  if (x.font) out.push(`шрифт ${x.font}`);
  if (x.size) out.push(`текст ${n(x.size)} пт`);
  if (x.tableSize) out.push(`таблица ${n(x.tableSize)} пт`);
  if (x.headerSize) out.push(`заголовки граф ${n(x.headerSize)} пт`);
  if (x.titleSize) out.push(`заголовок ${n(x.titleSize)} пт`);
  if (x.valueBold === false) out.push("значения не жирные");
  if (x.valueBold === true) out.push("значения жирные");
  if (x.valueItalic === false) out.push("значения без курсива");
  if (x.valueItalic === true) out.push("значения курсивом");
  if (x.lineHeight) out.push(`интервал ${n(x.lineHeight)}`);
  if (x.rowHeight) out.push(`строки таблицы от ${n(x.rowHeight)} мм`);
  if (x.headerRotate) out.push("узкие заголовки повёрнуты");
  if (x.tableAlign) out.push(x.tableAlign === "left" ? "таблица влево" : "таблица по центру");
  if (x.textAlign) out.push("текст по ширине");
  const m = [x.marginTop, x.marginRight, x.marginBottom, x.marginLeft];
  if (m.some((v) => v !== undefined)) out.push(`поля ${m.map((v) => (v === undefined ? "—" : n(v))).join("/")} мм`);
  if (x.orientation) out.push(x.orientation === "landscape" ? "альбомная" : "книжная");
  return out;
}

const VAL = ".field .val, .ti-val, .sign-name, .ti-sign .name, td .val";
const TITLE = ".title, .subtitle, h1, h2, .ti-title, .doc-head, .appx-head";

/** CSS (и маленький скрипт поворота заголовков), который накладывается поверх встроенной формы. Пусто — образец. */
export function docStyleCss(s: Partial<DocStyle> | null | undefined): string {
  const x = cleanStyle(s);
  if (!Object.keys(x).length) return "";
  const r: string[] = [];
  const font = x.font ? `"${x.font}", ${x.font === "Arial" || x.font === "Calibri" ? '"Liberation Sans", sans-serif' : '"Liberation Serif", serif'}` : null;
  if (font) r.push(`body, body * { font-family: ${font} !important; }`);
  if (x.size) r.push(`body { font-size: ${x.size}pt !important; } ${VAL}, .sign-label, .inline, .dates { font-size: ${x.size}pt !important; }`);
  if (x.lineHeight) r.push(`body { line-height: ${x.lineHeight} !important; }`);
  if (x.size || x.lineHeight) {
    // Строка значения — с линией под каждой строкой: высота линии следует за кеглем и интервалом.
    const size = x.size ?? 10;
    const L = Math.max(size * 1.3, size * (x.lineHeight ?? 1.15) * 1.13);
    const a = (L - 0.8).toFixed(2),
      b = (L - 0.2).toFixed(2);
    r.push(
      `.field .val { line-height: ${L.toFixed(2)}pt !important; min-height: ${L.toFixed(2)}pt !important; background-size: 100% ${L.toFixed(2)}pt !important;` +
        ` background-image: linear-gradient(to bottom, transparent ${a}pt, #000 ${a}pt, #000 ${b}pt, transparent ${b}pt) !important; }`,
    );
  }
  if (x.valueBold !== undefined) r.push(`${VAL} { font-weight: ${x.valueBold ? "bold" : "normal"} !important; }`);
  if (x.valueItalic !== undefined) r.push(`${VAL} { font-style: ${x.valueItalic ? "italic" : "normal"} !important; }`);
  if (x.tableSize) r.push(`table td, table td * { font-size: ${x.tableSize}pt !important; }`);
  if (x.headerSize) r.push(`table th, table th * { font-size: ${x.headerSize}pt !important; }`);
  if (x.titleSize) r.push(`${TITLE} { font-size: ${x.titleSize}pt !important; }`);
  if (x.rowHeight) r.push(`table.grid tbody td { height: ${x.rowHeight}mm; }`);
  if (x.tableAlign) r.push(`table.grid tbody td { text-align: ${x.tableAlign} !important; }`);
  if (x.textAlign) r.push(`${VAL}, .block, p { text-align: justify !important; }`);
  r.push(
    `th.idk-rot { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; vertical-align: middle; text-align: center !important; padding: 2pt 0 !important; }`,
  );
  const margins = [x.marginTop, x.marginRight, x.marginBottom, x.marginLeft];
  const page: string[] = [];
  if (x.orientation) page.push(`size: A4 ${x.orientation};`);
  if (margins.some((v) => v !== undefined)) {
    // Неуказанное поле — как в образце СБД.
    const def = [10, 10, 10, 20];
    page.push(`margin: ${margins.map((v, i) => `${v ?? def[i]}mm`).join(" ")};`);
  }
  if (page.length) r.push(`@page { ${page.join(" ")} }`);
  let out = `<style id="idk-doc-style">\n${r.join("\n")}\n</style>`;
  if (x.headerRotate)
    out +=
      `<script>addEventListener("DOMContentLoaded",()=>{for(const th of document.querySelectorAll("table th")){` +
      `if(th.colSpan>1)continue;const w=th.getBoundingClientRect().width;` +
      // Узкая графа (< 14 мм) или слово не помещается — поворачиваем.
      `if(w<53||th.scrollWidth>th.clientWidth+1)th.classList.add("idk-rot");}});</script>`;
  return out;
}

/** Встраивает оформление в HTML документа — последним, чтобы перекрыть стили формы. */
export function applyDocStyle(html: string, s: Partial<DocStyle> | null | undefined): string {
  const css = docStyleCss(s);
  if (!css) return html;
  const i = html.lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + css + html.slice(i) : html + css;
}
