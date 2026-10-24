// Шаблоны пользователя: список, создание/копия, сохранение, удаление, формы, выгрузка и загрузка.
import { z } from "zod";
import { TemplateDoc } from "@idk/shared/forms/template";
import { Router, Reply } from "../http/router.ts";
import type { TemplateStore } from "../forms/store.ts";
import { readRaw } from "./rkc.ts";
import { randomUUID } from "node:crypto";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { HttpError } from "../http/router.ts";
import { formType, NEED_OFFICE_FILE } from "../forms/store.ts";
import { formData } from "../forms/fields.ts";
import { markupForm, applyChoices } from "../forms/markup.ts";

const MARKUP_TTL_MS = 30 * 60_000;

const FORM_LIMIT = 30 * 1024 * 1024;
const disposition = (name: string, kind = "attachment") =>
  `${kind}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`;

export function templateRoutes(r: Router, store: TemplateStore, now: () => number = Date.now) {
  const marks = new Map<string, { buf: Buffer; type: "docx" | "xlsx"; name: string; at: number }>();
  const mark = (token: string) => {
    const m = marks.get(token);
    if (!m || now() - m.at > MARKUP_TTL_MS) { marks.delete(token); throw new HttpError(404, "Разметка устарела — загрузите образец заново"); }
    return m;
  };
  r.post("/api/templates/:id/markup", async (c) => {
    const q = await c.body(z.object({ bundle: ActBundle, file: z.string(), name: z.string().default("образец"), code: z.string().optional() }), 40 * 1024 * 1024);
    store.get(c.params.id);
    const buf = Buffer.from(q.file, "base64");
    const type = formType(buf);
    if (!type) throw new HttpError(422, NEED_OFFICE_FILE);
    const res = markupForm(buf, type, formData(q.bundle, q.code ? { code: q.code } : undefined));
    for (const [k, m] of marks) if (now() - m.at > MARKUP_TTL_MS) marks.delete(k);
    const token = randomUUID();
    marks.set(token, { buf: res.buf, type, name: q.name, at: now() });
    return new Reply(201, { token, found: res.found, ambiguous: res.ambiguous, type });
  });
  r.get("/api/templates/:id/markup/:token", (c) => {
    const m = mark(c.params.token);
    const buf = applyChoices(m.buf, m.type, {});
    c.res.writeHead(200, { "content-type": "application/octet-stream", "content-length": buf.length,
      "content-disposition": disposition(m.name.replace(/\.(docx|xlsx)$/i, "") + ` (с метками).${m.type}`) });
    c.res.end(buf);
  });
  r.post("/api/templates/:id/markup/:token", async (c) => {
    const q = await c.body(z.object({ choices: z.record(z.string()).default({}) }));
    const m = mark(c.params.token);
    const choices = Object.fromEntries(Object.entries(q.choices).map(([k, v]) => [Number(k), v]));
    return new Reply(201, store.addForm(c.params.id, applyChoices(m.buf, m.type, choices), m.name));
  });
  r.get("/api/templates", () => store.list());
  r.post("/api/templates", async (c) => {
    const q = await c.body(z.object({ name: z.string(), from: z.string().optional() }));
    return new Reply(201, store.create(q.name, q.from));
  });
  r.post("/api/templates/import", async (c) => new Reply(201, store.importZip(await readRaw(c.req, FORM_LIMIT * 4))));
  r.put("/api/templates/:id", async (c) => {
    const q = await c.body(z.object({ name: z.string(), docs: z.array(TemplateDoc) }));
    return store.save(c.params.id, q);
  });
  r.delete("/api/templates/:id", (c) => { store.remove(c.params.id); });
  r.post("/api/templates/:id/forms", async (c) => {
    let name = "форма";
    try { name = decodeURIComponent(String(c.req.headers["x-file-name"] ?? name)); } catch { /* имя по умолчанию */ }
    return new Reply(201, store.addForm(c.params.id, await readRaw(c.req, FORM_LIMIT), name));
  });
  r.get("/api/templates/:id/forms/:file", (c) => {
    const buf = store.form(c.params.id, c.params.file);
    c.res.writeHead(200, { "content-type": "application/octet-stream", "content-length": buf.length, "content-disposition": disposition(c.params.file) });
    c.res.end(buf);
  });
  r.get("/api/templates/:id/export", (c) => {
    const { name, buf } = store.exportZip(c.params.id);
    c.res.writeHead(200, { "content-type": "application/zip", "content-length": buf.length, "content-disposition": disposition(name) });
    c.res.end(buf);
  });
}
