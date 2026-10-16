// Печать из пакета акта, собранного панелью в книге Excel.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { Router, Reply, HttpError } from "../http/router.ts";
import { DOC_KINDS, type DocKind } from "@idk/shared/acts/schemas";
import { docNumber } from "@idk/shared/acts/format";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { buildDocDataFromBundle } from "../print/fromBundle.ts";
import { renderHtml } from "../print/templates/index.ts";
import { htmlToPdf } from "../print/browser.ts";

export const JOB_TTL_MS = 30 * 60_000;
export const MAX_JOBS = 50;

export function createPrintJobs(now: () => number = Date.now) {
  const jobs = new Map<string, { bundle: ActBundle; at: number }>();
  return {
    add(bundle: ActBundle): string {
      const id = randomUUID();
      jobs.set(id, { bundle, at: now() });
      while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value!);
      return id;
    },
    get(id: string): ActBundle | undefined {
      const j = jobs.get(id);
      if (!j) return undefined;
      if (now() - j.at > JOB_TTL_MS) { jobs.delete(id); return undefined; }
      return j.bundle;
    },
  };
}

const kindOf = (doc: string): DocKind => {
  if (!DOC_KINDS.includes(doc as DocKind)) throw new HttpError(400, "Неизвестный документ: " + doc);
  return doc as DocKind;
};

/** PDF документа пакета в ответ; имя файла — как у прежней печати из базы. */
export async function sendBundlePdf(res: ServerResponse, b: ActBundle, kind: DocKind) {
  const pdf = await htmlToPdf(renderHtml(kind, buildDocDataFromBundle(b, kind)), { pageNumbers: kind === "vor" });
  const name = (kind === "vor" ? `${b.act.baseNumber}.ВОР` : docNumber(b.act.baseNumber, kind)) + ".pdf";
  res.writeHead(200, {
    "content-type": "application/pdf",
    "content-length": pdf.length,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  res.end(pdf);
}

export function printRoutes(r: Router, jobs = createPrintJobs()) {
  r.post("/api/print/:doc", async (c) => {
    const kind = kindOf(c.params.doc);
    await sendBundlePdf(c.res, await c.body(ActBundle), kind);
  });
  r.post("/api/print-jobs", async (c) => new Reply(201, { id: jobs.add(await c.body(ActBundle)) }));
  r.get("/api/print-jobs/:job/:doc", async (c) => {
    const b = jobs.get(c.params.job);
    if (!b) throw new HttpError(404, "Задание печати не найдено или устарело");
    await sendBundlePdf(c.res, b, kindOf(c.params.doc));
  });
}
