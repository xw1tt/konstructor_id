// Инструменты помощника для бланков и форм документов шаблона: что можно настроить и предложения изменений
// (скрыть/показать графы и строки, переименовать графы, набор форм, форма документа, запас КЖ, п.4 АОСР).
import type { ToolDef } from "./model.ts";
import { ACT_DOC_DEFS, isActDocKind } from "../docs/defs.ts";
import { PROTO_DEFS, isProtoKind } from "../protocols/defs.ts";
import { BUILTIN_DOC_LABELS, docLabel, isBuiltinTemplate, type UserTemplate } from "../forms/template.ts";
import { FORM_DOCS, FORM_SETS, FORM_SET_LABELS, PrintOptions, type FormDoc, type FormSet } from "../templates.ts";
import { blankDef, blankKeyFor, blankView, describeBlank, findBlankPart, type BlankSettings } from "../blanks.ts";
import type { PrintKind } from "../acts/schemas.ts";

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });
const strs = (description: string) => ({ type: "array", items: { type: "string" }, description });

export const TEMPLATE_TOOLS: ToolDef[] = [
  { name: "get_blanks", description: "Бланки документов шаблона книги: какая форма у документа (встроенная СБД/ТИ или своя из файла), графы таблицы (ключ, заголовок, показана ли), необязательные строки и блоки, настройки печати (набор форм, запас КЖ, п.4 АОСР). Вызывай перед изменением вида документа.",
    parameters: obj({ doc: str("Документ (необязательно): КЖ, РИМ, РМ, ВД, ВОР, АВК, РП, Протокол или код протокола") }) },
  { name: "propose_blank", description: "Предложить изменить бланк встроенного документа шаблона (пользователь подтвердит): скрыть или вернуть графы таблицы и необязательные строки/блоки, переименовать графы. Действует на PDF и Excel всех актов книги. Части — ключами или заголовками из get_blanks.",
    parameters: obj({
      doc: str("Документ: КЖ, РИМ, ВД, ВОР, АВК, РП, Протокол или код протокола"),
      hide: strs("Скрыть: графы и строки/блоки"),
      show: strs("Вернуть скрытые"),
      rename: { type: "object", description: "Новые заголовки граф: {\"графа\": \"новый заголовок\"}; пустой — вернуть исходный", additionalProperties: { type: "string" } },
      reset: { type: "boolean", description: "Вернуть бланк к исходному виду" },
    }, ["doc"]) },
  { name: "propose_print_settings", description: "Предложить изменить настройки печати шаблона (пользователь подтвердит): набор форм и нумерации (sbd — СБД, ti — ТИ), форму отдельного документа (vd, rim, kj, registry: sbd, ti или пусто — по набору), запас кабеля в КЖ «ТИ» (%), знаков после запятой в итогах КЖ «ТИ», п.4 АОСР «Исполнительная схема» перед каждой схемой.",
    parameters: obj({
      formSet: { type: "string", enum: ["sbd", "ti"] },
      forms: { type: "object", description: "{\"kj\": \"ti\", \"vd\": \"\"}", additionalProperties: { type: "string" } },
      kjReserve: { type: "number", description: "Запас кабеля в КЖ «ТИ», %" },
      kjDecimals: { type: "integer", description: "Знаков после запятой в итогах и строках «в т.ч. <марка>» КЖ «ТИ»: 0–3; -1 — как посчитано (запас — до целого)" },
      schemeEach: { type: "boolean", description: "П.4 АОСР: «Исполнительная схема» перед каждой схемой (иначе — только перед первой)" },
    }) },
];

/** Предложение изменить настройки печати шаблона. */
export interface TemplateChange { kind: "template"; templateId: string; templateName: string; before: PrintOptions; after: PrintOptions; copy: boolean }

const norm = (s: string) => s.trim().toLowerCase().replace(/[«»"]/g, "");

/** Документ шаблона по ключу, подписи или коду протокола. */
export function findTemplateDoc(t: UserTemplate, q: string): { kind: PrintKind; label: string; ownForm: boolean } | null {
  const s = norm(q);
  const docs = t.docs.filter((d): d is Extract<UserTemplate["docs"][number], { kind: "builtin" }> => d.kind === "builtin");
  const alias: Record<string, string> = { "кабельный журнал": "kj", "кж": "kj", "рм": "rim", "реестр материалов": "rim", "протокол изоляции": "ip", "ведомость": "vd" };
  const key = alias[s] ?? s;
  const d = docs.find((x) => x.doc === key) ?? docs.find((x) => norm(BUILTIN_DOC_LABELS[x.doc]) === key)
    ?? docs.find((x) => isProtoKind(x.doc) && norm(PROTO_DEFS[x.doc].code) === key)
    ?? docs.find((x) => isActDocKind(x.doc) && norm(ACT_DOC_DEFS[x.doc].label) === key);
  return d ? { kind: d.doc, label: BUILTIN_DOC_LABELS[d.doc], ownForm: !!d.form } : null;
}

const editNote = (t: UserTemplate) => isBuiltinTemplate(t.id)
  ? `Шаблон «${t.name}» встроенный и не меняется: при применении будет создана копия «${t.name} (копия)» и выбрана для этой книги.` : "";

/** Сведения о бланках для модели. */
export function getBlanks(t: UserTemplate, doc?: string): unknown {
  const o = PrintOptions.parse(t.print ?? {});
  const docs = doc ? [findTemplateDoc(t, doc)].filter(Boolean) as NonNullable<ReturnType<typeof findTemplateDoc>>[] : t.docs.flatMap((d) => (d.kind === "builtin" ? [findTemplateDoc(t, d.doc)!] : []));
  if (doc && !docs.length) return { error: `В шаблоне «${t.name}» нет документа «${doc}». Документы: ${t.docs.map(docLabel).join(", ")}` };
  return {
    template: t.name, note: editNote(t) || undefined,
    print: { formSet: o.formSet, forms: o.forms, kjReserve: o.kjReserve, kjDecimals: o.kjDecimals, schemeEach: o.schemeEach },
    documents: docs.map((d) => {
      if (d.ownForm) return { doc: d.label, form: "своя форма из файла — меняется файлом (Шаблоны → «Скачать форму», правка в Word/Excel, «Загрузить форму»)" };
      const key = blankKeyFor(d.kind, o);
      const def = key ? blankDef(key) : null;
      if (!key || !def) return { doc: d.label, form: "встроенная, без настраиваемых граф (вид задан нормативом)" };
      const v = blankView(key, o.blanks[key]);
      return {
        doc: d.label, blank: def.label,
        columns: def.columns.map((c) => ({ key: c.key, header: v.header(c.key), original: c.header, shown: v.shown(c.key), ...(c.fixed ? { fixed: "нельзя скрыть" } : {}), ...(c.group ? { group: c.group } : {}) })),
        blocks: def.blocks.map((b) => ({ key: b.key, label: b.label, shown: v.shown(b.key) })),
        changes: describeBlank(key, o.blanks[key]),
      };
    }),
  };
}

type Result = { ok: true; change: TemplateChange; lines: string[] } | { ok: false; error: string };

const change = (t: UserTemplate, after: PrintOptions, lines: string[]): Result => {
  const before = PrintOptions.parse(t.print ?? {});
  if (JSON.stringify(before) === JSON.stringify(after)) return { ok: false, error: "Ничего не меняется: так уже настроено" };
  const note = editNote(t);
  return { ok: true, change: { kind: "template", templateId: t.id, templateName: t.name, before, after, copy: isBuiltinTemplate(t.id) }, lines: note ? [...lines, note] : lines };
};

/** Проверка propose_blank → новые настройки печати шаблона. */
export function validateBlankProposal(t: UserTemplate, a: Record<string, unknown>): Result {
  const d = findTemplateDoc(t, String(a.doc ?? ""));
  if (!d) return { ok: false, error: `В шаблоне «${t.name}» нет документа «${String(a.doc ?? "")}». Документы: ${t.docs.map(docLabel).join(", ")}` };
  if (d.ownForm) return { ok: false, error: `У «${d.label}» своя форма из файла — её вид меняется в файле формы (Шаблоны → «Скачать форму», правка, «Загрузить форму»), а не настройками бланка` };
  const o = PrintOptions.parse(t.print ?? {});
  const key = blankKeyFor(d.kind, o);
  const def = key ? blankDef(key) : null;
  if (!key || !def) return { ok: false, error: `У «${d.label}» нет настраиваемых граф: бланк задан нормативом` };
  const cur: BlankSettings = { hide: [...(o.blanks[key]?.hide ?? [])], headers: { ...(o.blanks[key]?.headers ?? {}) } };
  const next: BlankSettings = a.reset ? { hide: [], headers: {} } : cur;
  const part = (q: string) => {
    const p = findBlankPart(def, q);
    if (!p) throw new Error(`В бланке «${def.label}» нет графы или строки «${q}». Графы: ${def.columns.map((c) => c.header).join("; ")}${def.blocks.length ? `. Строки и блоки: ${def.blocks.map((b) => b.label).join("; ")}` : ""}`);
    return p;
  };
  try {
    for (const q of (Array.isArray(a.hide) ? a.hide : []).map(String)) {
      const p = part(q);
      if (p.fixed) throw new Error(`Графу «${p.label}» скрыть нельзя — без неё таблица теряет смысл; её можно переименовать`);
      if (!next.hide.includes(p.key)) next.hide.push(p.key);
    }
    for (const q of (Array.isArray(a.show) ? a.show : []).map(String)) {
      const p = part(q);
      next.hide = next.hide.filter((k) => k !== p.key);
    }
    if (a.rename && typeof a.rename === "object") {
      for (const [q, h] of Object.entries(a.rename as Record<string, unknown>)) {
        const p = part(q);
        if (p.kind !== "column") throw new Error(`«${p.label}» — не графа: переименовать можно только графы`);
        const text = String(h ?? "").trim();
        if (text.length > 120) throw new Error("Заголовок графы — не длиннее 120 знаков");
        if (!text || text === def.columns.find((c) => c.key === p.key)!.header) delete next.headers[p.key];
        else next.headers[p.key] = text;
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (def.columns.filter((c) => !next.hide.includes(c.key) || c.fixed).length < 2) return { ok: false, error: "В таблице должно остаться хотя бы две графы" };
  const blanks = { ...o.blanks };
  if (!next.hide.length && !Object.keys(next.headers).length) delete blanks[key]; else blanks[key] = next;
  const was = describeBlank(key, o.blanks[key]), will = describeBlank(key, next);
  const lines = [`Шаблон «${t.name}», бланк «${def.label}»: ${will.length ? will.join("; ") : "исходный вид"}${was.length ? ` (было: ${was.join("; ")})` : ""}`];
  return change(t, { ...o, blanks }, lines);
}

/** Проверка propose_print_settings → новые настройки печати шаблона. */
export function validatePrintProposal(t: UserTemplate, a: Record<string, unknown>): Result {
  const o = PrintOptions.parse(t.print ?? {});
  const next: PrintOptions = { ...o, forms: { ...o.forms } };
  const lines: string[] = [];
  const setName = (s: FormSet) => FORM_SET_LABELS[s];
  if (a.formSet !== undefined) {
    if (!(FORM_SETS as readonly string[]).includes(String(a.formSet))) return { ok: false, error: "formSet — sbd или ti" };
    next.formSet = a.formSet as FormSet;
    lines.push(`набор форм и нумерации: ${setName(o.formSet)} → ${setName(next.formSet)}`);
  }
  if (a.forms && typeof a.forms === "object") {
    for (const [doc, v] of Object.entries(a.forms as Record<string, unknown>)) {
      if (!(FORM_DOCS as readonly string[]).includes(doc)) return { ok: false, error: `Форму можно выбрать только у: ${FORM_DOCS.join(", ")}` };
      const s = String(v ?? "");
      if (s && !(FORM_SETS as readonly string[]).includes(s)) return { ok: false, error: `Форма «${doc}» — sbd, ti или пусто (по набору)` };
      if (s) next.forms[doc as FormDoc] = s as FormSet; else delete next.forms[doc as FormDoc];
      lines.push(`форма ${doc === "registry" ? "реестра ИД" : BUILTIN_DOC_LABELS[doc as PrintKind]}: ${s ? setName(s as FormSet) : "по набору"}`);
    }
  }
  if (a.kjReserve !== undefined) {
    const n = Number(a.kjReserve);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: "kjReserve — число от 0 до 100" };
    next.kjReserve = n;
    lines.push(`запас кабеля в КЖ «ТИ»: ${o.kjReserve}% → ${n}%`);
  }
  if (a.kjDecimals !== undefined) {
    const n = a.kjDecimals === null || a.kjDecimals === "" || Number(a.kjDecimals) === -1 ? null : Number(a.kjDecimals);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 3)) return { ok: false, error: "kjDecimals — целое от 0 до 3 или null" };
    next.kjDecimals = n;
    const txt = (v: number | null) => (v === null ? "как посчитано" : `${v} знак.`);
    lines.push(`округление итогов КЖ «ТИ»: ${txt(o.kjDecimals)} → ${txt(n)}`);
  }
  if (a.schemeEach !== undefined) {
    next.schemeEach = !!a.schemeEach;
    lines.push(`п.4 АОСР: «Исполнительная схема» ${next.schemeEach ? "перед каждой схемой" : "только перед первой схемой"}`);
  }
  if (!lines.length) return { ok: false, error: "Укажите, что изменить: formSet, forms, kjReserve, kjDecimals или schemeEach" };
  return change(t, next, [`Шаблон «${t.name}»: ${lines.join("; ")}`]);
}
