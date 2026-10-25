// Шаблоны пользователя в панели: запросы к серверу, кнопки печати по шаблону, выбор шаблона книги.
import { BUILTIN_SBD, BUILTIN_DOC_LABELS, isBuiltinTemplate, type UserTemplate, type TemplateDoc, type FormRef } from "@idk/shared/forms/template";
import type { FormDoc, FormSet } from "@idk/shared/templates";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { PROTO_DEFS, isProtoKind } from "@idk/shared/protocols/defs";
import { apiGet, apiSend } from "../api.ts";

export interface TemplateButton { key: string; label: string; doc: PrintKind | null; code: string | null; form: boolean }

/** Кнопки печати шаблона: в карточке акта (scope "act") — документы на акт; в карточке комплекта ("kit") — протоколы и
 *  акты плана 13 «на комплект». Порядок — порядок шаблона; свой документ без формы не печатается. */

export function templateButtons(t: UserTemplate, scope: "act" | "kit" = "act"): TemplateButton[] {
  const onKit = (d: UserTemplate["docs"][number]) => d.kind === "builtin" && isProtoKind(d.doc) && PROTO_DEFS[d.doc].scope === "kit";
  return t.docs.filter((d) => (scope === "kit" ? onKit(d) : !onKit(d))).flatMap((d): TemplateButton[] => d.kind === "builtin"
    ? [{ key: d.doc, label: BUILTIN_DOC_LABELS[d.doc], doc: d.doc, code: null, form: !!d.form }]
    : d.form ? [{ key: d.code, label: d.name, doc: null, code: d.code, form: true }] : []);
}

/**
 * Шаблон книги по id; нет на этом компьютере — «СБД» с предупреждением. Пока список с сервера не загружен (loaded=false),
 * шаблон пользователя неизвестен: ready=false — реестр по нему не заполняется, предупреждения нет.
 */
export function resolveTemplate(list: UserTemplate[], id: string, loaded = true): { template: UserTemplate; warning: string | null; ready: boolean } {
  const t = list.find((x) => x.id === id);
  if (t) return { template: t, warning: null, ready: true };
  const sbd = list.find((x) => x.id === BUILTIN_SBD.id) ?? BUILTIN_SBD;
  if (id === BUILTIN_SBD.id) return { template: sbd, warning: null, ready: true };
  if (!loaded) return { template: sbd, warning: null, ready: false };
  return { template: sbd, warning: `Шаблон «${id}» не найден на этом компьютере — печать по «СБД»`, ready: true };
}

export const listTemplates = () => apiGet<UserTemplate[]>("/api/templates");
export const createTemplate = (name: string, from?: string) => apiSend<UserTemplate>("POST", "/api/templates", { name, from });
export const saveTemplateDocs = (t: UserTemplate) => apiSend<UserTemplate>("PUT", `/api/templates/${t.id}`, { name: t.name, docs: t.docs, print: t.print });
export const deleteTemplate = (id: string) => apiSend<void>("DELETE", `/api/templates/${id}`);

async function rawCall<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
  return data as T;
}
export const uploadForm = (id: string, file: File) =>
  rawCall<FormRef>(`/api/templates/${id}/forms`, { method: "POST", body: file, headers: { "x-file-name": encodeURIComponent(file.name) } });
export const importTemplate = (file: File) => rawCall<UserTemplate>("/api/templates/import", { method: "POST", body: file });

export type { UserTemplate, TemplateDoc, FormRef };

// ---------- План 14: наборы форм в редакторе шаблонов ----------

const withPrint = (t: UserTemplate, p: Partial<UserTemplate["print"]>): UserTemplate => ({ ...t, print: { ...t.print, ...p } });
/** Набор форм и нумерации шаблона. */
export const withFormSet = (t: UserTemplate, set: FormSet) => withPrint(t, { formSet: set });
/** Форма документа вопреки набору; null — «по набору». */
export function withDocForm(t: UserTemplate, doc: FormDoc, set: FormSet | null): UserTemplate {
  const forms = { ...t.print.forms };
  if (set) forms[doc] = set;
  else delete forms[doc];
  return withPrint(t, { forms });
}
/** Коэффициент запаса КЖ «ТИ», %. */
export const withReserve = (t: UserTemplate, pct: number) => withPrint(t, { kjReserve: pct });

/**
 * Изменение шаблона: свой — сохраняется на месте; встроенный («СБД», «ТИ») не меняется — создаётся копия
 * «<имя> (копия)», изменение сохраняется в неё. Возвращает сохранённый шаблон.
 */
export async function applyChange(
  t: UserTemplate, change: (t: UserTemplate) => UserTemplate,
  api: { create(name: string, from?: string): Promise<UserTemplate>; save(t: UserTemplate): Promise<UserTemplate> } = { create: createTemplate, save: saveTemplateDocs },
): Promise<UserTemplate> {
  if (!isBuiltinTemplate(t.id)) return api.save(change(t));
  const copy = await api.create(`${t.name} (копия)`, t.id);
  return api.save(change({ ...copy }));
}
