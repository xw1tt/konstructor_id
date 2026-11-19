// Сборка комплекта: задание (POST, проверка файлов и сборка) и готовый PDF (GET) для окна предпросмотра.
import { randomUUID } from "node:crypto";
import { KitRequest } from "@idk/shared/kit/request";
import type { KitRequest as KitRequestT } from "@idk/shared/kit/request";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError } from "../http/router.ts";
import { assembleKit, type KitDeps } from "../kit/assemble.ts";
import { docFile, kitXlsxZip, kitZipName } from "../kit/xlsx.ts";
import { writeZip } from "../zip/zip.ts";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { PRINT_KINDS } from "@idk/shared/acts/schemas";
import { PrintOptions } from "@idk/shared/templates";
import { commonRegistry, commonRegistryFiles, COMMON_NAME } from "../kit/common.ts";
import { z } from "zod";
import { attachment } from "./print.ts";

/** Тело задания: пакеты нескольких актов — больше обычного предела 1 МБ. */
export const KIT_JSON_LIMIT = 20 * 1024 * 1024;
export const KIT_TTL_MS = 30 * 60_000;
/** Общий реестр — задания всех комплектов объекта. */
export const COMMON_JSON_LIMIT = 100 * 1024 * 1024;
export const MAX_KITS = 5;

export function kitRoutes(r: Router, db: Db, dataDir: string, forms: Pick<KitDeps, "templates" | "runner"> = {}, now: () => number = Date.now) {
  const done = new Map<string, { pdf: Buffer; name: string; at: number; q: KitRequestT }>();
  r.post("/api/kit-jobs", async (c) => {
    const q = await c.body(KitRequest, KIT_JSON_LIMIT);
    const res = await assembleKit(q, { db, dataDir, ...forms });
    if (!res.ok) return new Reply(422, { error: "Комплект не собран: исправьте ошибки", issues: res.issues });
    const id = randomUUID();
    done.set(id, { pdf: res.pdf, name: res.name, at: now(), q });
    while (done.size > MAX_KITS) done.delete(done.keys().next().value!);
    return new Reply(201, { id, pages: res.pages, name: res.name });
  });
  const get = (id: string) => {
    const j = done.get(id);
    if (!j || now() - j.at > KIT_TTL_MS) {
      done.delete(id);
      throw new HttpError(404, "Комплект не найден или устарел — соберите его заново");
    }
    return j;
  };
  // Excel-файлы документов комплекта архивом (план 28).
  r.get("/api/kit-jobs/:job/xlsx", (c) => {
    const j = get(c.params.job);
    const { zip } = kitXlsxZip(j.q, forms);
    c.res.writeHead(200, {
      "content-type": "application/zip",
      "content-length": zip.length,
      "content-disposition": attachment(kitZipName(j.name)),
      "cache-control": "no-store",
    });
    c.res.end(zip);
  });
  const actFiles = new Map<string, { zip: Buffer; name: string; at: number }>();
  // 0.35: все документы одного акта файлами — свои формы Word/Excel заполненными, встроенные — в Excel — архивом.
  r.post("/api/act-files", async (c) => {
    const q = await c.body(
      z.object({
        name: z.string().default("Документы акта"),
        options: PrintOptions.partial().optional(),
        items: z
          .array(z.object({ bundle: ActBundle, kind: z.enum(PRINT_KINDS).nullable(), form: z.object({ template: z.string(), doc: z.string() }).nullable() }))
          .min(1)
          .max(40),
      }),
      KIT_JSON_LIMIT,
    );
    const files: [string, Buffer | string][] = [];
    const errors: string[] = [];
    const width = Math.max(2, String(q.items.length).length);
    q.items.forEach((it) => {
      try {
        const x = docFile(it.bundle, { kind: it.kind, form: it.form }, q.options, forms);
        files.push([`${String(files.length + 1).padStart(width, "0")} ${x.name}`, x.buf]);
      } catch (e) {
        errors.push(`${it.form?.doc ?? it.kind}: ${(e as Error).message}`);
      }
    });
    if (!files.length) throw new HttpError(422, `Файлы не собраны: ${errors.join("; ")}`);
    if (errors.length) files.push(["Ошибки.txt", errors.join("\r\n")]);
    const id = randomUUID();
    const name = `${q.name.replace(/[\\/:*?"<>|]/g, "_")}.zip`;
    actFiles.set(id, { zip: writeZip(files), name, at: now() });
    while (actFiles.size > MAX_KITS) actFiles.delete(actFiles.keys().next().value!);
    return new Reply(201, { id, name, files: files.map(([n]) => n), errors });
  });
  r.get("/api/act-files/:id", (c) => {
    const j = actFiles.get(c.params.id);
    if (!j || now() - j.at > KIT_TTL_MS) {
      actFiles.delete(c.params.id);
      throw new HttpError(404, "Архив не найден или устарел — соберите его заново");
    }
    c.res.writeHead(200, {
      "content-type": "application/zip",
      "content-length": j.zip.length,
      "content-disposition": attachment(j.name),
      "cache-control": "no-store",
    });
    c.res.end(j.zip);
  });
  // Общий реестр ИД: все комплекты объекта (задания сборки каждого комплекта) → PDF и Excel.
  const common = new Map<string, { pdf: Buffer; xlsx: Buffer; at: number }>();
  r.post("/api/common-registry-jobs", async (c) => {
    const q = await c.body(z.object({ kits: z.array(KitRequest).min(1) }), COMMON_JSON_LIMIT);
    const d = await commonRegistry(q.kits, { db, dataDir, ...forms });
    const files = await commonRegistryFiles(d);
    const id = randomUUID();
    common.set(id, { ...files, at: now() });
    while (common.size > MAX_KITS) common.delete(common.keys().next().value!);
    return new Reply(201, { id, name: COMMON_NAME, kits: d.groups.length, docs: d.docs, sheets: d.sheets, warnings: d.warnings });
  });
  const getCommon = (id: string) => {
    const j = common.get(id);
    if (!j || now() - j.at > KIT_TTL_MS) {
      common.delete(id);
      throw new HttpError(404, "Общий реестр не найден или устарел — соберите его заново");
    }
    return j;
  };
  r.get("/api/common-registry-jobs/:job/xlsx", (c) => {
    const j = getCommon(c.params.job);
    c.res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-length": j.xlsx.length,
      "content-disposition": attachment(`${COMMON_NAME}.xlsx`),
      "cache-control": "no-store",
    });
    c.res.end(j.xlsx);
  });
  r.get("/api/common-registry-jobs/:job", (c) => {
    const j = getCommon(c.params.job);
    c.res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": j.pdf.length,
      "cache-control": "no-store",
      "content-disposition": `${c.query.get("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`${COMMON_NAME}.pdf`)}`,
    });
    c.res.end(j.pdf);
  });
  r.get("/api/kit-jobs/:job", (c) => {
    const j = get(c.params.job);
    c.res.writeHead(200, {
      "content-type": "application/pdf",
      "content-length": j.pdf.length,
      "content-disposition": `${c.query.get("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(j.name)}`,
      "cache-control": "no-store",
    });
    c.res.end(j.pdf);
  });
}
