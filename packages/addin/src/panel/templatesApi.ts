// Шаблоны пользователя в панели: запросы к серверу, кнопки печати по шаблону, выбор шаблона книги.
import { BUILTIN_SBD, BUILTIN_DOC_LABELS, type UserTemplate, type TemplateDoc, type FormRef } from "@idk/shared/forms/template";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { apiGet, apiSend } from "../api.ts";

export interface TemplateButton { key: string; label: string; doc: PrintKind | null; code: string | null; form: boolean }

/** Кнопки печати карточки акта в порядке шаблона; свой документ без формы не печатается. */
export function templateButtons(t: UserTemplate): TemplateButton[] {
  return t.docs.flatMap((d): TemplateButton[] => d.kind === "builtin"
    ? [{ key: d.doc, label: BUILTIN_DOC_LABELS[d.doc], doc: d.doc, code: null, form: !!d.form }]
    : d.form ? [{ key: d.code, label: d.name, doc: null, code: d.code, form: true }] : []);
}

/** Шаблон книги по id; нет на этом компьютере — «СБД» с предупреждением. */
export function resolveTemplate(list: UserTemplate[], id: string): { template: UserTemplate; warning: string | null } {
  const t = list.find((x) => x.id === id);
  if (t) return { template: t, warning: null };
  return { template: list.find((x) => x.id === BUILTIN_SBD.id) ?? BUILTIN_SBD, warning: id === BUILTIN_SBD.id ? null : `Шаблон «${id}» не найден на этом компьютере — печать по «СБД»` };
}

export const listTemplates = () => apiGet<UserTemplate[]>("/api/templates");
export const createTemplate = (name: string, from?: string) => apiSend<UserTemplate>("POST", "/api/templates", { name, from });
export const saveTemplateDocs = (t: UserTemplate) => apiSend<UserTemplate>("PUT", `/api/templates/${t.id}`, { name: t.name, docs: t.docs });
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
