// Шаблоны пользователя: список, создание/копия, сохранение, удаление, формы, выгрузка и загрузка.
import { z } from "zod";
import { TemplateDoc } from "@idk/shared/forms/template";
import { Router, Reply } from "../http/router.ts";
import type { TemplateStore } from "../forms/store.ts";
import { readRaw } from "./rkc.ts";

const FORM_LIMIT = 30 * 1024 * 1024;
const disposition = (name: string, kind = "attachment") =>
  `${kind}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`;

export function templateRoutes(r: Router, store: TemplateStore) {
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
