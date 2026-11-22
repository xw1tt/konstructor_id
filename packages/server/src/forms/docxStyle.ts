// 0.50: оформление документа (DocStyle) для форм Word — «Камчатка» и свои формы заказчика. Шрифт — всему документу;
// «Текст» масштабирует все размеры от основного размера значений (формы Word обычно целиком в таблицах; заголовки
// остаются крупнее, подписи — мельче); жирный/курсив — подставленным значениям; интервал, высота строк таблиц,
// выравнивание основного текста по ширине, поля и ориентация листа. Порядок дочерних элементов w:rPr/w:pPr/w:trPr — по схеме OOXML (иначе Word ругается на файл).
import type { DocStyle } from "@idk/shared/docStyle";
import { elements } from "./docx.ts";

/** Метки подставленного значения (внутри текста <w:t>; снимаются после оформления). */
export const VALUE_START = "";
export const VALUE_END = "";

const R_ORDER = [
  "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "outline", "shadow", "emboss", "imprint", "noProof",
  "snapToGrid", "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd",
  "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath", "rPrChange",
]; // prettier-ignore
const P_ORDER = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs",
  "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
  "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment",
  "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange",
]; // prettier-ignore
const TR_ORDER = [
  "cnfStyle",
  "divId",
  "gridBefore",
  "gridAfter",
  "wBefore",
  "wAfter",
  "cantSplit",
  "trHeight",
  "tblHeader",
  "tblCellSpacing",
  "jc",
  "hidden",
  "ins",
  "del",
  "trPrChange",
];

/** Дочерние элементы первого уровня внутреннего XML (самозакрытые и с содержимым). */
function children(inner: string): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = [];
  let i = 0;
  while (i < inner.length) {
    const lt = inner.indexOf("<", i);
    if (lt < 0) break;
    const m = /^<w:([A-Za-z]+)\b[^>]*?(\/?)>/.exec(inner.slice(lt));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const tag = m[1];
    if (m[2] === "/") {
      out.push({ tag, xml: m[0] });
      i = lt + m[0].length;
      continue;
    }
    // С содержимым: ищем парный закрывающий с учётом вложенности того же тега.
    let depth = 1;
    let j = lt + m[0].length;
    const re = new RegExp(`<(/?)w:${tag}\\b[^>]*?(/?)>`, "g");
    re.lastIndex = j;
    let n: RegExpExecArray | null;
    while (depth && (n = re.exec(inner))) {
      if (n[1]) depth--;
      else if (!n[2]) depth++;
      j = re.lastIndex;
    }
    out.push({ tag, xml: inner.slice(lt, j) });
    i = j;
  }
  return out;
}

/** Задать (или убрать — null) дочерние элементы в порядке схемы; прочие остаются на своих местах. */
function setProps(inner: string, order: string[], set: Record<string, string | null>): string {
  const list = children(inner).filter((c) => !(c.tag in set));
  const rank = (t: string) => {
    const k = order.indexOf(t);
    return k < 0 ? order.length : k;
  };
  for (const [tag, xml] of Object.entries(set)) {
    if (xml === null) continue;
    const at = list.findIndex((c) => rank(c.tag) > rank(tag));
    list.splice(at < 0 ? list.length : at, 0, { tag, xml });
  }
  return list.map((c) => c.xml).join("");
}

const attr = (xml: string | undefined, name: string) => (xml ? new RegExp(`\\bw:${name}="([^"]*)"`).exec(xml)?.[1] : undefined);
const child = (inner: string, tag: string) => children(inner).find((c) => c.tag === tag)?.xml;
const withAttrs = (xml: string | undefined, tag: string, attrs: Record<string, string>) => {
  let x = xml ?? `<w:${tag}/>`;
  for (const [k, v] of Object.entries(attrs)) {
    const re = new RegExp(`\\bw:${k}="[^"]*"`);
    x = re.test(x) ? x.replace(re, `w:${k}="${v}"`) : x.replace(new RegExp(`^<w:${tag}\\b`), `<w:${tag} w:${k}="${v}"`);
  }
  return x;
};

/** Внутренность свойства (w:rPr и т. п.) в начале элемента и остальное. */
function splitProps(inner: string, tag: string): { props: string; rest: string } {
  const m = new RegExp(`^\\s*<w:${tag}>([\\s\\S]*?)</w:${tag}>`).exec(inner);
  if (m) return { props: m[1], rest: inner.slice(m[0].length) };
  const e = new RegExp(`^\\s*<w:${tag}/>`).exec(inner);
  if (e) return { props: "", rest: inner.slice(e[0].length) };
  return { props: "", rest: inner };
}

interface Ctx {
  style: DocStyle;
  /** Основной размер значений, полупункты (для масштаба). */
  base: number;
  /** Размер по умолчанию (стиль документа), полупункты. */
  def: number;
}

function runProps(rPr: string, ctx: Ctx, value: boolean | null): string {
  const s = ctx.style;
  const set: Record<string, string | null> = {};
  if (s.font) set.rFonts = `<w:rFonts w:ascii="${s.font}" w:hAnsi="${s.font}" w:cs="${s.font}" w:eastAsia="${s.font}"/>`;
  if (s.size !== undefined && ctx.base > 0) {
    const cur = Number(attr(child(rPr, "sz"), "val")) || ctx.def;
    const v = Math.max(8, Math.round((cur * (s.size * 2)) / ctx.base));
    set.sz = `<w:sz w:val="${v}"/>`;
    set.szCs = `<w:szCs w:val="${v}"/>`;
  }
  if (value !== null) {
    if (s.valueBold !== undefined) {
      set.b = s.valueBold ? "<w:b/>" : '<w:b w:val="0"/>';
      set.bCs = s.valueBold ? "<w:bCs/>" : '<w:bCs w:val="0"/>';
    }
    if (s.valueItalic !== undefined) {
      set.i = s.valueItalic ? "<w:i/>" : '<w:i w:val="0"/>';
      set.iCs = s.valueItalic ? "<w:iCs/>" : '<w:iCs w:val="0"/>';
    }
  }
  return Object.keys(set).length ? setProps(rPr, R_ORDER, set) : rPr;
}

/** Прогон: оформление и деление на куски «значение / текст формы» по меткам значений. */
function styleRun(run: string, ctx: Ctx): string {
  const m = /^<w:r\b([^>]*)>([\s\S]*)<\/w:r>$/.exec(run);
  if (!m) return run;
  const { props, rest } = splitProps(m[2], "rPr");
  const values = ctx.style.valueBold !== undefined || ctx.style.valueItalic !== undefined;
  const marked = rest.includes(VALUE_START) || rest.includes(VALUE_END);
  const wrap = (body: string, value: boolean | null) => {
    const p = runProps(props, ctx, value);
    return `<w:r${m[1]}>${p ? `<w:rPr>${p}</w:rPr>` : ""}${body}</w:r>`;
  };
  if (!marked || !values) return wrap(rest.replace(/[]/g, ""), null);
  // Части прогона: текст по меткам делится на куски; прочие элементы (перенос строки, табуляция) — в текущий кусок.
  const groups: { value: boolean; body: string }[] = [];
  let state = false;
  const push = (value: boolean, body: string) => {
    if (!body) return;
    const last = groups.at(-1);
    if (last && last.value === value) last.body += body;
    else groups.push({ value, body });
  };
  for (const c of children(rest)) {
    if (c.tag !== "t") {
      push(state, c.xml);
      continue;
    }
    const open = /^<w:t\b[^>]*>/.exec(c.xml)?.[0] ?? '<w:t xml:space="preserve">';
    const text = c.xml.startsWith("<w:t") && c.xml.endsWith("/>") ? "" : c.xml.slice(open.length, -"</w:t>".length);
    let buf = "";
    for (const ch of text) {
      if (ch === VALUE_START || ch === VALUE_END) {
        if (buf) push(state, `<w:t xml:space="preserve">${buf}</w:t>`);
        buf = "";
        state = ch === VALUE_START;
      } else buf += ch;
    }
    if (buf) push(state, `<w:t xml:space="preserve">${buf}</w:t>`);
  }
  return groups.map((g) => wrap(g.body, g.value)).join("");
}

function paraProps(pPr: string, ctx: Ctx, inTable: boolean): string {
  const s = ctx.style;
  const set: Record<string, string | null> = {};
  if (s.lineHeight !== undefined) set.spacing = withAttrs(child(pPr, "spacing"), "spacing", { line: String(Math.round(240 * s.lineHeight)), lineRule: "auto" });
  const jc = attr(child(pPr, "jc"), "val");
  if (!inTable && s.textAlign === "justify" && (!jc || jc === "left" || jc === "start")) set.jc = '<w:jc w:val="both"/>';
  // Знак абзаца — тем же размером и шрифтом, что текст (высота пустых строк).
  const rPr = child(pPr, "rPr");
  if (s.font || s.size !== undefined) {
    const inner = rPr ? rPr.replace(/^<w:rPr>|<\/w:rPr>$/g, "").replace(/^<w:rPr\/>$/, "") : "";
    const p = runProps(inner, ctx, null);
    if (p) set.rPr = `<w:rPr>${p}</w:rPr>`;
  }
  return Object.keys(set).length ? setProps(pPr, P_ORDER, set) : pPr;
}

function styleParagraph(p: string, ctx: Ctx, inTable: boolean): string {
  const m = /^<w:p\b([^>]*?)(\/?)>([\s\S]*?)(<\/w:p>)?$/.exec(p);
  if (!m || m[2] === "/") return p;
  const { props, rest } = splitProps(m[3], "pPr");
  const pp = paraProps(props, ctx, inTable);
  const body = rest.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (r) => styleRun(r, ctx));
  return `<w:p${m[1]}>${pp ? `<w:pPr>${pp}</w:pPr>` : ""}${body}</w:p>`;
}

/** Основной размер: самый частый по длине текста значений, полупункты. */
function baseSize(xml: string, def: number): number {
  const count = new Map<number, number>();
  // Основной размер — по подставленным значениям (подписи под строками мелкие и длинные — сбили бы масштаб);
  // форма без значений — по всему тексту.
  const valuesOnly = xml.includes(VALUE_START);
  for (const r of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    if (valuesOnly && !r[1].includes(VALUE_START) && !r[1].includes(VALUE_END)) continue;
    const len = [...r[1].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].reduce((s, t) => s + t[1].replace(/[\s]/g, "").length, 0);
    if (!len) continue;
    const sz = Number(/<w:sz w:val="(\d+)"/.exec(splitProps(r[1], "rPr").props)?.[1]) || def;
    count.set(sz, (count.get(sz) ?? 0) + len);
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? def;
}

const TWIP_PER_MM = 1440 / 25.4;

function styleSection(sect: string, s: DocStyle): string {
  const m = /^<w:sectPr\b([^>]*)>([\s\S]*)<\/w:sectPr>$/.exec(sect);
  if (!m) return sect;
  let inner = m[2];
  const sz = /<w:pgSz\b[^>]*\/>/.exec(inner)?.[0];
  if (s.orientation && sz) {
    const w = Number(attr(sz, "w")),
      h = Number(attr(sz, "h"));
    const land = s.orientation === "landscape";
    const [nw, nh] = land === w > h ? [w, h] : [h, w];
    let x = withAttrs(sz, "pgSz", { w: String(nw), h: String(nh) });
    x = land ? withAttrs(x, "pgSz", { orient: "landscape" }) : x.replace(/\s*w:orient="[^"]*"/, "");
    inner = inner.replace(sz, x);
  }
  const mar = /<w:pgMar\b[^>]*\/>/.exec(inner)?.[0];
  const sides: [keyof DocStyle, string][] = [
    ["marginTop", "top"],
    ["marginRight", "right"],
    ["marginBottom", "bottom"],
    ["marginLeft", "left"],
  ];
  const set = Object.fromEntries(sides.filter(([k]) => s[k] !== undefined).map(([k, a]) => [a, String(Math.round((s[k] as number) * TWIP_PER_MM))]));
  if (mar && Object.keys(set).length) inner = inner.replace(mar, withAttrs(mar, "pgMar", set));
  return `<w:sectPr${m[1]}>${inner}</w:sectPr>`;
}

function styleRow(tr: string, s: DocStyle): string {
  if (s.rowHeight === undefined) return tr;
  const m = /^<w:tr\b([^>]*)>([\s\S]*)<\/w:tr>$/.exec(tr);
  if (!m) return tr;
  const { props, rest } = splitProps(m[2], "trPr");
  const cur = child(props, "trHeight");
  const want = Math.round(s.rowHeight * TWIP_PER_MM);
  const val = Math.max(want, Number(attr(cur, "val")) || 0);
  const rule = attr(cur, "hRule") === "exact" ? "exact" : "atLeast";
  const p = setProps(props, TR_ORDER, { trHeight: `<w:trHeight w:val="${val}" w:hRule="${rule}"/>` });
  return `<w:tr${m[1]}><w:trPr>${p}</w:trPr>${rest}</w:tr>`;
}

/** Часть документа (тело, колонтитул): метки значений снимаются всегда, оформление — если задано. */
export function styleDocxPart(xml: string, style: DocStyle | undefined, def: number): string {
  if (!style || !Object.keys(style).length) return xml.replace(/[]/g, "");
  const ctx: Ctx = { style, base: baseSize(xml, def), def };
  const tables = elements(xml, "tbl");
  const inT = (at: number) => tables.some((t) => at >= t.start && at < t.end);
  // Абзацы — по положению в исходном тексте (в таблице или нет); вложенных абзацев в Word нет, кроме таблиц в ячейках.
  let out = "";
  let last = 0;
  for (const p of xml.matchAll(/<w:p\b[^>]*?(?:\/>|>[\s\S]*?<\/w:p>)/g)) {
    out += xml.slice(last, p.index) + styleParagraph(p[0], ctx, inT(p.index!));
    last = p.index! + p[0].length;
  }
  out += xml.slice(last);
  out = out.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, (tr) => (/<w:tr\b/.test(tr.slice(4)) ? tr : styleRow(tr, style)));
  out = out.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g, (s) => styleSection(s, style));
  return out.replace(/[]/g, "");
}

/** Размер по умолчанию из styles.xml (docDefaults, затем стиль Normal), полупункты; Word без указания — 10 пт. */
export function defaultSize(stylesXml: string | undefined): number {
  if (!stylesXml) return 20;
  const d = /<w:rPrDefault>[\s\S]*?<w:sz w:val="(\d+)"/.exec(stylesXml)?.[1];
  const normal =
    /<w:style\b[^>]*w:default="1"[^>]*w:type="paragraph"[^>]*>[\s\S]*?<\/w:style>|<w:style\b[^>]*w:type="paragraph"[^>]*w:default="1"[^>]*>[\s\S]*?<\/w:style>/.exec(
      stylesXml,
    )?.[0];
  const n = normal ? /<w:sz w:val="(\d+)"/.exec(normal)?.[1] : undefined;
  return Number(n ?? d) || 20;
}

/** styles.xml: шрифт — в умолчаниях документа и во всех стилях, где он задан. */
export function styleDocxStyles(xml: string, style: DocStyle | undefined): string {
  if (!style?.font) return xml;
  const f = style.font;
  const fonts = `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>`;
  let out = xml.replace(/<w:rFonts\b[^>]*\/>/g, fonts);
  if (!/<w:rPrDefault>/.test(out)) out = out.replace(/<w:docDefaults>/, `<w:docDefaults><w:rPrDefault><w:rPr>${fonts}</w:rPr></w:rPrDefault>`);
  else if (!/<w:rPrDefault>[\s\S]*?<w:rFonts/.test(out))
    out = out.replace(
      /<w:rPrDefault>\s*<w:rPr>([\s\S]*?)<\/w:rPr>/,
      (_m, inner: string) => `<w:rPrDefault><w:rPr>${setProps(inner, R_ORDER, { rFonts: fonts })}</w:rPr>`,
    );
  return out;
}
