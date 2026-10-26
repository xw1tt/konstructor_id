// Сборка комплекта: задание (POST, проверка файлов и сборка) и готовый PDF (GET) для окна предпросмотра.
import { randomUUID } from "node:crypto";
import { KitRequest } from "@idk/shared/kit/request";
import type { KitRequest as KitRequestT } from "@idk/shared/kit/request";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError } from "../http/router.ts";
import { assembleKit, type KitDeps } from "../kit/assemble.ts";
import { kitXlsxZip, kitZipName } from "../kit/xlsx.ts";
import { attachment } from "./print.ts";

/** Тело задания: пакеты нескольких актов — больше обычного предела 1 МБ. */
export const KIT_JSON_LIMIT = 20 * 1024 * 1024;
export const KIT_TTL_MS = 30 * 60_000;
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
    c.res.writeHead(200, { "content-type": "application/zip", "content-length": zip.length, "content-disposition": attachment(kitZipName(j.name)), "cache-control": "no-store" });
    c.res.end(zip);
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
