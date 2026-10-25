// Печать из пакета акта, собранного панелью в книге Excel.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { Router, Reply, HttpError } from "../http/router.ts";
import { PRINT_KINDS, type PrintKind } from "@idk/shared/acts/schemas";
import type { ActDocKind } from "@idk/shared/docs/defs";
import { renderActDoc } from "../print/docs.ts";
import { z } from "zod";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "@idk/shared/templates";
import { protoHtml } from "../print/templates/proto.ts";
import { isProtoKind } from "@idk/shared/protocols/defs";
import { htmlToPdf } from "../print/browser.ts";

/** Тело запроса печати: пакет акта и код шаблона (форма заказчика); без кода — СБД. */
export const PrintRequest = ActBundle.extend({ template: z.string().default(DEFAULT_TEMPLATE), options: PrintOptions.default({}) });

interface PrintJob { bundle: ActBundle; template: TemplateCode; options: PrintOptions }

const readRequest = (b: z.infer<typeof PrintRequest>): PrintJob => {
  const { template, options, ...bundle } = b;
  return { bundle, template, options };
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

const kindOf = (doc: string): PrintKind => {
  if (!PRINT_KINDS.includes(doc as PrintKind)) throw new HttpError(400, "Неизвестный документ: " + doc);
  return doc as PrintKind;
};

/** PDF документа пакета и имя файла (как у прежней печати из базы). */
export async function renderBundlePdf(b: ActBundle, kind: PrintKind, _template: TemplateCode = DEFAULT_TEMPLATE, options: Partial<PrintOptions> = {}):
  Promise<{ pdf: Buffer; name: string }> {
  // Набор форм и нумерация — из опций шаблона (план 14); код шаблона сам по себе не влияет на печать.
  // Документы акта — по описаниям (план 15, print/docs.ts); протоколы плана 13 — по PROTO_DEFS.
  let html: string, name: string;
  if (isProtoKind(kind)) {
    if (b.proto?.kind !== kind) throw new HttpError(400, "В пакете нет данных документа " + kind);
    html = protoHtml(b);
    name = `${b.proto.code} №${b.proto.number}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
  } else {
    const r = renderActDoc(b, kind as ActDocKind, options);
    html = r.html;
    name = r.name;
  }
  return { pdf: await htmlToPdf(html, { pageNumbers: kind === "vor" }), name };
}

/** PDF документа пакета в ответ. */
export async function sendBundlePdf(res: ServerResponse, b: ActBundle, kind: PrintKind, template: TemplateCode = DEFAULT_TEMPLATE,
  options: Partial<PrintOptions> = {}) {
  const { pdf, name } = await renderBundlePdf(b, kind, template, options);
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
    await sendBundlePdf(c.res, job.bundle, kind, job.template, job.options);
  });
  r.post("/api/print-jobs", async (c) => new Reply(201, { id: jobs.add(readRequest(await c.body(PrintRequest))) }));
  r.get("/api/print-jobs/:job/:doc", async (c) => {
    const j = jobs.get(c.params.job);
    if (!j) throw new HttpError(404, "Задание печати не найдено или устарело");
    await sendBundlePdf(c.res, j.bundle, kindOf(c.params.doc), j.template, j.options);
  });
}
