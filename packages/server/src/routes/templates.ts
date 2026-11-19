// Шаблоны пользователя: список, создание/копия, сохранение, удаление, формы, выгрузка и загрузка.
import { z } from "zod";
import { TemplateDoc } from "@idk/shared/forms/template";
import { PrintOptions } from "@idk/shared/templates";
import { Router, Reply } from "../http/router.ts";
import type { TemplateStore } from "../forms/store.ts";
import { readRaw } from "./rkc.ts";
import { randomUUID } from "node:crypto";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { HttpError } from "../http/router.ts";
import { formType, NEED_OFFICE_FILE } from "../forms/store.ts";
import { formData } from "../forms/fields.ts";
import { markupForm, applyChoices, applyPairs, markupText } from "../forms/markup.ts";
import { guessDoc } from "@idk/shared/forms/recognize";
import { defaultLegacyConverter, toOpenXml, type LegacyConverter } from "../forms/legacy.ts";
import { isKnownField } from "@idk/shared/forms/fields";

const MARKUP_TTL_MS = 30 * 60_000;

const FORM_LIMIT = 30 * 1024 * 1024;
const disposition = (name: string, kind = "attachment") =>
  `${kind}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`;

import { protoSampleDocx } from "../forms/protoDocx.ts";
import { PROTO_DEFS, isProtoKind } from "@idk/shared/protocols/defs";

export function templateRoutes(r: Router, store: TemplateStore, now: () => number = Date.now, legacy: LegacyConverter = defaultLegacyConverter()) {
  const marks = new Map<string, { buf: Buffer; type: "docx" | "xlsx"; name: string; at: number }>();
  const mark = (token: string) => {
    const m = marks.get(token);
    if (!m || now() - m.at > MARKUP_TTL_MS) {
      marks.delete(token);
      throw new HttpError(404, "Разметка устарела — загрузите образец заново");
    }
    return m;
  };
  r.post("/api/templates/:id/markup", async (c) => {
    const q = await c.body(
      z.object({ bundle: ActBundle, file: z.string(), name: z.string().default("образец"), code: z.string().optional() }),
      40 * 1024 * 1024,
    );
    store.get(c.params.id);
    const buf = Buffer.from(q.file, "base64");
    const type = formType(buf);
    if (!type) throw new HttpError(422, NEED_OFFICE_FILE);
    const res = markupForm(buf, type, formData(q.bundle, { ...(q.code ? { code: q.code } : {}), set: store.get(c.params.id).print.formSet }));
    for (const [k, m] of marks) if (now() - m.at > MARKUP_TTL_MS) marks.delete(k);
    const token = randomUUID();
    marks.set(token, { buf: res.buf, type, name: q.name, at: now() });
    return new Reply(201, { token, found: res.found, ambiguous: res.ambiguous, type });
  });
  // 0.34: загрузка формы в один шаг. Шаг 1 — что это за документ (по тексту файла).
  // 0.35: перевод формы старого формата для любых мест панели (загрузка формы, «Файл формы…» помощника).
  r.post("/api/forms/convert", async (c) => {
    const q = await c.body(z.object({ file: z.string(), name: z.string().default("") }), 40 * 1024 * 1024);
    const x = await toOpenXml(Buffer.from(q.file, "base64"), q.name, legacy);
    if (!formType(x.buf)) throw new HttpError(422, NEED_OFFICE_FILE);
    return { file: x.buf.toString("base64"), name: x.name, converted: x.converted };
  });
  // 0.35: .doc/.xls переводятся в .docx/.xlsx (Word/Excel на компьютере) — ответ несёт переведённый файл.
  r.post("/api/templates/:id/recognize/detect", async (c) => {
    const q = await c.body(z.object({ file: z.string(), name: z.string().default("") }), 40 * 1024 * 1024);
    store.get(c.params.id);
    const x = await toOpenXml(Buffer.from(q.file, "base64"), q.name, legacy);
    const type = formType(x.buf);
    if (!type) throw new HttpError(422, NEED_OFFICE_FILE);
    return { type, ...guessDoc(markupText(x.buf, type)), ...(x.converted ? { file: x.buf.toString("base64"), name: x.name } : {}) };
  });
  // Шаг 2 — разметка по каждому акту книги; образец заполнен по тому, у которого больше совпавших значений.
  r.post("/api/templates/:id/recognize", async (c) => {
    const q = await c.body(
      z.object({
        file: z.string(),
        name: z.string().default("образец"),
        code: z.string().optional(),
        bundles: z
          .array(z.object({ act: z.string(), bundle: ActBundle }))
          .min(1)
          .max(60),
      }),
      120 * 1024 * 1024,
    );
    const set = store.get(c.params.id).print.formSet;
    const buf = Buffer.from(q.file, "base64");
    const type = formType(buf);
    if (!type) throw new HttpError(422, NEED_OFFICE_FILE);
    let best: { act: string; res: ReturnType<typeof markupForm> } | null = null;
    const byAct: { act: string; found: number }[] = [];
    for (const b of q.bundles) {
      const res = markupForm(buf, type, formData(b.bundle, { ...(q.code ? { code: q.code } : {}), set }));
      byAct.push({ act: b.act, found: res.found });
      if (!best || res.found > best.res.found) best = { act: b.act, res };
    }
    for (const [k, m] of marks) if (now() - m.at > MARKUP_TTL_MS) marks.delete(k);
    const token = randomUUID();
    marks.set(token, { buf: best!.res.buf, type, name: q.name, at: now() });
    return new Reply(201, { token, type, act: best!.act, found: best!.res.found, ambiguous: best!.res.ambiguous, byAct });
  });
  // План 20: текст размеченного образца и новые метки от помощника (поверх разметки; выбор вариантов — при сохранении).
  r.get("/api/templates/:id/markup/:token/text", (c) => {
    const m = mark(c.params.token);
    return { text: markupText(m.buf, m.type) };
  });
  r.post("/api/templates/:id/markup/:token/pairs", async (c) => {
    const q = await c.body(z.object({ replacements: z.array(z.object({ text: z.string().min(1), field: z.string().min(1) })) }));
    const bad = q.replacements.find((p) => !isKnownField(p.field));
    if (bad) throw new HttpError(400, `Неизвестное поле: ${bad.field}`);
    const m = mark(c.params.token);
    const res = applyPairs(m.buf, m.type, q.replacements);
    marks.set(c.params.token, { ...m, buf: res.buf, at: now() });
    return { applied: res.applied, missing: res.missing };
  });
  r.get("/api/templates/:id/markup/:token", (c) => {
    const m = mark(c.params.token);
    // План 20: выбор вариантов помощника — в ?choices={"id":"Поле"}.
    let choices: Record<number, string> = {};
    try {
      choices = Object.fromEntries(
        Object.entries(JSON.parse(c.query.get("choices") ?? "{}") as Record<string, string>).map(([k, v]) => [Number(k), String(v)]),
      );
    } catch {
      /* без выбора */
    }
    const buf = applyChoices(m.buf, m.type, choices);
    c.res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": buf.length,
      "content-disposition": disposition(m.name.replace(/\.(docx|xlsx)$/i, "") + ` (с метками).${m.type}`),
    });
    c.res.end(buf);
  });
  r.post("/api/templates/:id/markup/:token", async (c) => {
    const q = await c.body(z.object({ choices: z.record(z.string()).default({}) }));
    const m = mark(c.params.token);
    const choices = Object.fromEntries(Object.entries(q.choices).map(([k, v]) => [Number(k), v]));
    return new Reply(201, store.addForm(c.params.id, applyChoices(m.buf, m.type, choices), m.name));
  });
  // План 13: образец .docx с метками протокола или акта — основа своей формы встроенного документа.
  r.get("/api/forms/sample/:kind", (c) => {
    if (!isProtoKind(c.params.kind)) throw new HttpError(404, "Образца для этого документа нет");
    const buf = protoSampleDocx(c.params.kind);
    c.res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-length": buf.length,
      "content-disposition": disposition(`${PROTO_DEFS[c.params.kind].code}.docx`),
    });
    c.res.end(buf);
  });
  r.get("/api/templates", () => store.list());
  r.post("/api/templates", async (c) => {
    const q = await c.body(z.object({ name: z.string(), from: z.string().optional() }));
    return new Reply(201, store.create(q.name, q.from));
  });
  r.post("/api/templates/import", async (c) => new Reply(201, store.importZip(await readRaw(c.req, FORM_LIMIT * 4))));
  r.put("/api/templates/:id", async (c) => {
    const q = await c.body(z.object({ name: z.string(), docs: z.array(TemplateDoc), print: PrintOptions.optional() }));
    return store.save(c.params.id, q);
  });
  r.delete("/api/templates/:id", (c) => {
    store.remove(c.params.id);
  });
  r.post("/api/templates/:id/forms", async (c) => {
    let name = "форма";
    try {
      name = decodeURIComponent(String(c.req.headers["x-file-name"] ?? name));
    } catch {
      /* имя по умолчанию */
    }
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
