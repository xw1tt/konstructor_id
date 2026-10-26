// План 20: наборы инструментов помощника вне книги — справочник (и формы, задача 3).
import type { ToolCall, ToolDef } from "@idk/shared/ai/model";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { FIELD_TREE, isKnownField } from "@idk/shared/forms/fields";
import type { Proposal, ToolContext } from "@idk/shared/ai/tools";
import { CATALOG_TOOLS, validateCatalogProposal } from "@idk/shared/ai/catalogTool";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { mergeUserCatalog } from "@idk/shared/catalog/merge";
import type { UserCatalog } from "@idk/shared/catalog/model";
import { apiGet, apiSend } from "../api.ts";
import type { ToolKit } from "./assistant.ts";
import { TEMPLATE_TOOLS, getBlanks, validateBlankProposal, validatePrintProposal } from "@idk/shared/ai/templateTools";
import type { UserTemplate } from "@idk/shared/forms/template";

export interface CatalogApi {
  user(): Promise<UserCatalog>;
  save(u: UserCatalog): Promise<UserCatalog>;
}
export const catalogApi: CatalogApi = {
  user: () => apiGet<UserCatalog>("/api/catalog/user"),
  save: (u) => apiSend<UserCatalog>("PUT", "/api/catalog/user", u),
};

const json = (v: unknown) => JSON.stringify(v);

/** Справочник: propose_catalog → предложение; применение — дополнения пользователя + отмена прежними. */
export function catalogKit(api: CatalogApi = catalogApi, onChanged: () => void = () => {}): ToolKit {
  return {
    tools: CATALOG_TOOLS,
    async exec(call: ToolCall, ctx: ToolContext) {
      if (call.name !== "propose_catalog") return null;
      const r = validateCatalogProposal(BUILTIN_CATALOG, await api.user(), call.arguments ?? {});
      if (!r.ok) return json({ error: r.error });
      const id = ctx.proposals.length + 1;
      ctx.proposals.push({ id, change: { kind: "catalog", add: r.add }, lines: r.lines });
      return json({ ok: true, proposal: id, note: `Предложение №${id} будет показано пользователю; он сам решит, применять ли его.` });
    },
    async apply(p: Proposal) {
      if (p.change.kind !== "catalog") return null;
      const before = await api.user();
      await api.save(mergeUserCatalog(before, p.change.add));
      onChanged();
      return async () => { await api.save(before); onChanged(); };
    },
  };
}

// ---------- Формы (задача 3) ----------

export interface FormFile { name: string; base64: string }
export interface Markup { token: string; templateId: string; type: "docx" | "xlsx"; found: number; ambiguous: { id: number; text: string; context: string; options: string[]; chosen: string }[]; text: string; act: string }
/** Размеченная помощником форма, готовая к проверке и сохранению. */
export interface FormReady { name: string; token: string; type: "docx" | "xlsx"; choices: Record<string, string>; missing: string[] }

export interface FormApi {
  markup(templateId: string, bundle: unknown, file: FormFile): Promise<{ token: string; type: "docx" | "xlsx"; found: number; ambiguous: Markup["ambiguous"] }>;
  text(templateId: string, token: string): Promise<{ text: string }>;
  fields(bundle: unknown, templateId: string): Promise<{ values: Record<string, string>; lists: Record<string, Record<string, string>[]> }>;
  pairs(templateId: string, token: string, replacements: { text: string; field: string }[]): Promise<{ applied: number; missing: string[] }>;
}
export const formApi: FormApi = {
  markup: (id, bundle, f) => apiSend("POST", `/api/templates/${id}/markup`, { bundle, file: f.base64, name: f.name }),
  text: (id, token) => apiGet(`/api/templates/${id}/markup/${token}/text`),
  fields: (bundle, template) => apiSend("POST", "/api/form-fields", { bundle, template }),
  pairs: (id, token, replacements) => apiSend("POST", `/api/templates/${id}/markup/${token}/pairs`, { replacements }),
};

export const FORM_TOOLS: ToolDef[] = [
  { name: "read_form", description: "Разметить приложенный пользователем файл Word/Excel (заполненный документ заказчика) по акту: программа сама ставит метки там, где узнала значения акта. Возвращает число меток, неоднозначные места (id, варианты), текст документа с метками и поля с значениями акта.",
    parameters: { type: "object", properties: { act: { type: "string", description: "Номер акта, по которому заполнен файл (по умолчанию — текущий)" } } } },
  { name: "propose_form", description: "Предложить разметку формы (пользователь подтвердит): выбор вариантов для неоднозначных мест и новые метки — точный текст из документа заменяется меткой поля.",
    parameters: { type: "object", properties: {
      choices: { type: "object", description: "{\"id места\": \"Поле из его вариантов\"}", additionalProperties: { type: "string" } },
      replacements: { type: "array", items: { type: "object", properties: { text: { type: "string", description: "Точный текст из документа" }, field: { type: "string", description: "Поле «Группа.Поле», например «Акт.Номер АОСР»" } }, required: ["text", "field"] } },
    } } },
];

/** Формы: приложенный файл → разметка «По образцу» → предложение меток → применение на сервере → проверка и сохранение. */
export class FormKit implements ToolKit {
  tools = FORM_TOOLS;
  file: FormFile | null = null;
  markup: Markup | null = null;
  ready: FormReady | null = null;
  constructor(private deps: { api?: FormApi; templateId(): string; act(): string | null; onReady?(): void }) {}
  private get api() { return this.deps.api ?? formApi; }

  private subs = new Set<() => void>();
  /** Подписка экрана на смену вложения и готовой формы. */
  on(fn: () => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private changed() { this.deps.onReady?.(); for (const f of this.subs) f(); }

  attach(f: FormFile | null) { this.file = f; this.markup = null; this.ready = null; this.changed(); }

  async exec(call: ToolCall, ctx: ToolContext): Promise<string | null> {
    if (call.name === "read_form") {
      if (!this.file) return json({ error: "Пользователь не приложил файл формы — попроси приложить .docx или .xlsx кнопкой «Файл формы»" });
      const act = String(call.arguments?.act ?? "").trim() || this.deps.act() || "";
      if (!act) return json({ error: "Не указан акт, по которому заполнен файл" });
      const { bundle, issues } = buildBundle(ctx.book, act, ctx.important);
      if (!bundle) return json({ error: `Акт «${act}» не готов: ${issues.slice(0, 3).map((i) => `${i.table} «${i.column}»: ${i.message}`).join("; ")}` });
      const tid = this.deps.templateId();
      const m = await this.api.markup(tid, bundle, this.file);
      const { text } = await this.api.text(tid, m.token);
      const data = await this.api.fields(bundle, tid);
      this.markup = { ...m, templateId: tid, text, act };
      const mask = (s: string) => ctx.mask.mask(s);
      return json({
        found: m.found,
        ambiguous: m.ambiguous.map((a) => ({ id: a.id, text: mask(a.text), context: mask(a.context), options: a.options })),
        text: mask(text),
        fields: Object.fromEntries(Object.entries(data.values).filter(([, v]) => v.trim()).map(([k, v]) => [k, mask(v.length > 120 ? v.slice(0, 120) + "…" : v)])),
        listFields: FIELD_TREE.filter((g) => g.list).map((g) => ({ list: g.list, fields: g.fields.map((f) => `${g.group}.${f}`) })),
        note: "Метка в тексте выглядит как {Группа.Поле}; {Поле#N} — неоднозначное место N. Строки таблиц с материалами и схемами программа уже сделала повтором.",
      });
    }
    if (call.name === "propose_form") {
      const m = this.markup;
      if (!m) return json({ error: "Сначала вызови read_form" });
      const a = ctx.mask.unmaskDeep(call.arguments ?? {}) as { choices?: Record<string, string>; replacements?: { text: string; field: string }[] };
      const choices: Record<string, string> = {};
      const lines: string[] = [];
      for (const [id, field] of Object.entries(a.choices ?? {})) {
        const place = m.ambiguous.find((p) => String(p.id) === String(id));
        if (!place) return json({ error: `Нет неоднозначного места ${id}` });
        if (!place.options.includes(field)) return json({ error: `Для места ${id} можно выбрать только: ${place.options.join(", ")}` });
        choices[id] = field;
        lines.push(`«${place.text}» → {${field}}`);
      }
      const reps = (a.replacements ?? []).map((r) => ({ text: String(r.text ?? ""), field: String(r.field ?? "").replace(/^\{|\}$/g, "").trim() }));
      for (const r of reps) {
        if (!isKnownField(r.field)) return json({ error: `Неизвестное поле: ${r.field}` });
        if (!r.text.trim() || !m.text.includes(r.text)) return json({ error: `Текста «${r.text}» нет в документе — возьми его точно из text` });
        lines.push(`«${r.text}» → {${r.field}}`);
      }
      if (!lines.length) return json({ error: "Нечего предлагать: укажи choices и/или replacements" });
      const id = ctx.proposals.length + 1;
      ctx.proposals.push({ id, change: { kind: "form", token: m.token, templateId: m.templateId, choices, replacements: reps }, lines: [`Форма «${this.file?.name ?? "файл"}»:`, ...lines] });
      return json({ ok: true, proposal: id, note: `Предложение №${id} будет показано пользователю; после применения он проверит и сохранит форму.` });
    }
    return null;
  }

  async apply(p: Proposal) {
    if (p.change.kind !== "form" || !this.markup) return null;
    const c = p.change;
    const r = c.replacements.length ? await this.api.pairs(c.templateId, c.token, c.replacements) : { applied: 0, missing: [] };
    const chosen = Object.fromEntries(this.markup.ambiguous.map((a) => [String(a.id), a.chosen]));
    this.ready = { name: this.file?.name ?? "форма", token: c.token, type: this.markup.type, choices: { ...chosen, ...c.choices }, missing: r.missing };
    this.changed();
    return async () => { this.ready = null; this.changed(); };
  }
}

// ---------- Бланки и настройки печати шаблона ----------

export interface TemplateApi {
  list(): Promise<UserTemplate[]>;
  save(t: UserTemplate): Promise<UserTemplate>;
  create(name: string, from?: string): Promise<UserTemplate>;
  remove(id: string): Promise<void>;
  /** Выбрать шаблон для книги. */
  choose(id: string): Promise<void>;
}

/**
 * Бланки шаблона: get_blanks — что настраивается; propose_blank / propose_print_settings → предложение; применение —
 * сохранение настроек печати шаблона (встроенный — копия, выбранная для книги), отмена — прежние настройки.
 */
export function templateKit(api: TemplateApi, onChanged: () => void = () => {}): ToolKit {
  return {
    tools: TEMPLATE_TOOLS,
    async exec(call: ToolCall, ctx: ToolContext) {
      const a = call.arguments ?? {};
      if (call.name === "get_blanks") return json(getBlanks(ctx.template, a.doc ? String(a.doc) : undefined));
      if (call.name !== "propose_blank" && call.name !== "propose_print_settings") return null;
      // Предложения одного ответа накапливаются: следующее строится от уже предложенных настроек.
      const prev = [...ctx.proposals].reverse().find((p) => p.change.kind === "template" && p.change.templateId === ctx.template.id);
      const t = prev && prev.change.kind === "template" ? { ...ctx.template, print: prev.change.after } : ctx.template;
      const r = call.name === "propose_blank" ? validateBlankProposal(t, a) : validatePrintProposal(t, a);
      if (!r.ok) return json({ error: r.error });
      const change = prev && prev.change.kind === "template" ? { ...r.change, before: prev.change.before } : r.change;
      if (prev) ctx.proposals.splice(ctx.proposals.indexOf(prev), 1);
      const id = ctx.proposals.length + 1;
      ctx.proposals.push({ id, change, lines: prev ? [...prev.lines.filter((l) => !l.startsWith("Шаблон «") || !l.includes("встроенный")), ...r.lines] : r.lines });
      ctx.proposals.forEach((p, i) => { p.id = i + 1; });
      return json({ ok: true, proposal: ctx.proposals.length, note: "Предложение будет показано пользователю; он сам решит, применять ли его." });
    },
    async apply(p: Proposal) {
      if (p.change.kind !== "template") return null;
      const c = p.change;
      const list = await api.list();
      const cur = list.find((x) => x.id === c.templateId);
      if (!cur) throw new Error(`Шаблон «${c.templateName}» не найден — попросите помощника заново`);
      if (c.copy) {
        const copy = await api.create(`${cur.name} (копия)`, cur.id);
        await api.save({ ...copy, print: c.after });
        await api.choose(copy.id);
        onChanged();
        return async () => { await api.choose(cur.id); await api.remove(copy.id); onChanged(); };
      }
      await api.save({ ...cur, print: c.after });
      onChanged();
      return async () => {
        const now = (await api.list()).find((x) => x.id === c.templateId);
        if (now) await api.save({ ...now, print: c.before });
        onChanged();
      };
    },
  };
}
