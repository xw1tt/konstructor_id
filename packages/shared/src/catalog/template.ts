// План 12, задача 3: сборка шаблона из справочника — добавить/убрать вид работ.
import type { Catalog } from "./model.ts";
import type { TemplateDoc, UserTemplate } from "../forms/template.ts";
import { docLabel } from "../forms/template.ts";

/** Коды видов работ, на которые ссылается шаблон. */
export function templateWorks(t: UserTemplate): string[] {
  return [...new Set(t.docs.flatMap((d) => d.works ?? []))];
}

/** Добавить вид работ: его документы — в шаблон, без дублей; повторный вызов ничего не меняет. */
export function addWork(t: UserTemplate, c: Catalog, work: string): UserTemplate {
  const w = c.sections.flatMap((s) => s.works).find((x) => x.code === work);
  if (!w) return t;
  const docs = structuredClone(t.docs) as TemplateDoc[];
  for (const code of w.docs) {
    const doc = c.docs.find((d) => d.code === code);
    if (!doc) continue;
    const existing = docs.find((d) =>
      doc.make === "builtin" && d.kind === "builtin" && d.doc === doc.builtin ? true : d.catalog === code);
    if (existing) {
      existing.works = [...(existing.works ?? []), ...(existing.works?.includes(work) ? [] : [work])];
      if (doc.make === "builtin" && !existing.catalog) existing.catalog = code;
      continue;
    }
    if (doc.make === "builtin") docs.push({ kind: "builtin", doc: doc.builtin!, form: null, catalog: code, works: [work] });
    else docs.push({ kind: "custom", code: doc.code, name: doc.name, form: null, catalog: code, works: [work], scope: doc.scope, scan: doc.make === "scan" });
  }
  return { ...t, docs };
}

/** Убрать вид работ: документы справочника без оставшихся видов — удалить, их подписи — в removed. */
export function removeWork(t: UserTemplate, work: string): { template: UserTemplate; removed: string[] } {
  const removed: string[] = [];
  const docs: TemplateDoc[] = [];
  for (const d of t.docs) {
    const without = (d.works ?? []).filter((w) => w !== work);
    if (d.catalog && without.length === 0) { removed.push(docLabel(d)); continue; }
    docs.push(without.length === (d.works ?? []).length ? d : { ...d, works: without });
  }
  return { template: { ...t, docs }, removed };
}
