// Печать документа по своей форме шаблона: задание (POST) → PDF и заполненный файл (GET), хранение в памяти 30 мин.
// Значения меток для экрана «Поля для шаблона» — POST /api/form-fields.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { docLabel, type TemplateDoc } from "@idk/shared/forms/template";
import { Router, Reply, HttpError } from "../http/router.ts";
import type { TemplateStore } from "../forms/store.ts";
import { renderForm, type OfficeRunner } from "../forms/convert.ts";
import { formData } from "../forms/fields.ts";

export const FORM_TTL_MS = 30 * 60_000;
const MAX_JOBS = 20;
const JSON_LIMIT = 20 * 1024 * 1024;
const BUILTIN_CODES: Record<string, string> = { aosr: "АОСР", rim: "РИМ", vd: "ВД" };

/** Документ шаблона по ключу: встроенный — по виду (aosr…), свой — по коду без учёта регистра. */
export function findDoc(docs: TemplateDoc[], key: string): TemplateDoc | undefined {
  return docs.find((d) => (d.kind === "builtin" ? d.doc === key : d.code.toUpperCase() === key.toUpperCase()));
}
/** Код для номера документа: свой — его код, встроенный АОСР/РИМ/ВД — суффикс номера. */
export const docCode = (d: TemplateDoc) => (d.kind === "custom" ? d.code : BUILTIN_CODES[d.doc]);

const disposition = (name: string, kind: string) =>
  `${kind}; filename*=UTF-8''${encodeURIComponent(name.replace(/[\\/:*?"<>|]/g, "_")).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`;

export function formJobRoutes(r: Router, store: TemplateStore, runner: OfficeRunner, now: () => number = Date.now) {
  const jobs = new Map<string, { pdf: Buffer; source: Buffer; name: string; type: "docx" | "xlsx"; at: number }>();
  const get = (id: string) => {
    const j = jobs.get(id);
    if (!j || now() - j.at > FORM_TTL_MS) { jobs.delete(id); throw new HttpError(404, "Документ не найден или устарел — напечатайте его заново"); }
    return j;
  };
  r.post("/api/form-jobs", async (c) => {
    const q = await c.body(z.object({ bundle: ActBundle, template: z.string(), doc: z.string() }), JSON_LIMIT);
    const t = store.get(q.template);
    const d = findDoc(t.docs, q.doc);
    if (!d) throw new HttpError(404, `Документа «${q.doc}» нет в шаблоне «${t.name}»`);
    if (!d.form) throw new HttpError(400, `У документа «${docLabel(d)}» нет своей формы — печать встроенной`);
    const code = docCode(d);
    const res = await renderForm(q.bundle, { ...d.form, buf: store.form(t.id, d.form.file) }, code ? { code } : undefined, runner);
    const number = formData(q.bundle, code ? { code } : undefined).values["Акт.Номер документа"];
    const id = randomUUID();
    for (const [k, j] of jobs) if (now() - j.at > FORM_TTL_MS) jobs.delete(k);
    jobs.set(id, { pdf: res.pdf, source: res.source, name: `${docLabel(d)} ${number}`, type: d.form.type, at: now() });
    while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value!);
    return new Reply(201, { id, warnings: res.warnings, via: res.via, name: `${docLabel(d)} ${number}` });
  });
  r.get("/api/form-jobs/:id", (c) => {
    const j = get(c.params.id);
    c.res.writeHead(200, { "content-type": "application/pdf", "content-length": j.pdf.length, "cache-control": "no-store",
      "content-disposition": disposition(`${j.name}.pdf`, c.query.get("download") ? "attachment" : "inline") });
    c.res.end(j.pdf);
  });
  r.get("/api/form-jobs/:id/source", (c) => {
    const j = get(c.params.id);
    c.res.writeHead(200, { "content-type": "application/octet-stream", "content-length": j.source.length,
      "content-disposition": disposition(`${j.name}.${j.type}`, "attachment") });
    c.res.end(j.source);
  });
  r.post("/api/form-fields", async (c) => {
    const q = await c.body(z.object({ bundle: ActBundle, code: z.string().optional() }), JSON_LIMIT);
    return formData(q.bundle, q.code ? { code: q.code } : undefined);
  });
}
