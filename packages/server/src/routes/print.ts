// Печать из пакета акта, собранного панелью в книге Excel.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { Router, Reply, HttpError } from "../http/router.ts";
import { DOC_KINDS, type DocKind } from "@idk/shared/acts/schemas";
import { docNumber } from "@idk/shared/acts/format";
import { z } from "zod";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { isTemplateCode, DEFAULT_TEMPLATE, type TemplateCode } from "@idk/shared/templates";
import { buildDocDataFromBundle } from "../print/fromBundle.ts";
import { renderHtml } from "../print/templates/index.ts";
import { htmlToPdf } from "../print/browser.ts";

/** Тело запроса печати: пакет акта и код шаблона (форма заказчика); без кода — СБД. */
export const PrintRequest = ActBundle.extend({ template: z.string().default(DEFAULT_TEMPLATE) });

interface PrintJob { bundle: ActBundle; template: TemplateCode }

const readRequest = (b: z.infer<typeof PrintRequest>): PrintJob => {
  const { template, ...bundle } = b;
  if (!isTemplateCode(template)) throw new HttpError(400, "Неизвестный шаблон: " + template);
  return { bundle, template };
};

export const JOB_TTL_MS = 30 * 60_000;
export const MAX_JOBS = 50;

export function createPrintJobs(now: () => number = Date.now) {
  const jobs = new Map<string, { job: PrintJob; at: number }>();
  return {
    add(job: PrintJob): string {
      const id = randomUUID();
      jobs.set(id, { job, at: now() });
      while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value!);
      return id;
    },
    get(id: string): PrintJob | undefined {
      const j = jobs.get(id);
      if (!j) return undefined;
      if (now() - j.at > JOB_TTL_MS) { jobs.delete(id); return undefined; }
      return j.job;
    },
  };
}

const kindOf = (doc: string): DocKind => {
  if (!DOC_KINDS.includes(doc as DocKind)) throw new HttpError(400, "Неизвестный документ: " + doc);
  return doc as DocKind;
};

/** PDF документа пакета в ответ; имя файла — как у прежней печати из базы. */
export async function sendBundlePdf(res: ServerResponse, b: ActBundle, kind: DocKind, _template: TemplateCode = DEFAULT_TEMPLATE) {
  // Шаблон пока один (СБД); код передаётся сюда для будущих форм других заказчиков.
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
    const job = readRequest(await c.body(PrintRequest));
    await sendBundlePdf(c.res, job.bundle, kind, job.template);
  });
  r.post("/api/print-jobs", async (c) => new Reply(201, { id: jobs.add(readRequest(await c.body(PrintRequest))) }));
  r.get("/api/print-jobs/:job/:doc", async (c) => {
    const j = jobs.get(c.params.job);
    if (!j) throw new HttpError(404, "Задание печати не найдено или устарело");
    await sendBundlePdf(c.res, j.bundle, kindOf(c.params.doc), j.template);
  });
}
