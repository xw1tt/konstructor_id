// Печать из пакета акта, собранного панелью в книге Excel.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { Router, Reply, HttpError } from "../http/router.ts";
import { CABLE_DOC_KINDS, PRINT_KINDS, type CableDocKind, type DocKind, type PrintKind } from "@idk/shared/acts/schemas";
import { docNumber } from "@idk/shared/acts/format";
import { z } from "zod";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { isTemplateCode, DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "@idk/shared/templates";
import { buildDocDataFromBundle, buildAvkData } from "../print/fromBundle.ts";
import { avkHtml } from "../print/templates/avk.ts";
import { renderHtml, renderCableHtml } from "../print/templates/index.ts";
import { cableDocData } from "../print/cableData.ts";
import { htmlToPdf } from "../print/browser.ts";

/** Тело запроса печати: пакет акта и код шаблона (форма заказчика); без кода — СБД. */
export const PrintRequest = ActBundle.extend({ template: z.string().default(DEFAULT_TEMPLATE), options: PrintOptions.default({}) });

interface PrintJob { bundle: ActBundle; template: TemplateCode; options: PrintOptions }

const readRequest = (b: z.infer<typeof PrintRequest>): PrintJob => {
  const { template, options, ...bundle } = b;
  if (!isTemplateCode(template)) throw new HttpError(400, "Неизвестный шаблон: " + template);
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
const isCable = (k: PrintKind): k is CableDocKind => (CABLE_DOC_KINDS as readonly string[]).includes(k);

/** PDF документа пакета и имя файла (как у прежней печати из базы). */
export async function renderBundlePdf(b: ActBundle, kind: PrintKind, _template: TemplateCode = DEFAULT_TEMPLATE, options: Partial<PrintOptions> = {}):
  Promise<{ pdf: Buffer; name: string }> {
  // Шаблон пока один (СБД); код передаётся сюда для будущих форм других заказчиков.
  let html: string, name: string;
  if (kind === "avk") {
    const d = buildAvkData(b);
    html = avkHtml(d);
    name = `АВК ${d.number}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
  } else if (isCable(kind)) {
    html = kind === "kj" ? renderCableHtml("kj", cableDocData(b, "kj")) : renderCableHtml("ip", cableDocData(b, "ip"));
    name = (kind === "kj" ? b.cables?.doc?.journalCode || `${b.act.baseNumber}.КЖ` : `${b.act.baseNumber}.Протокол`) + ".pdf";
  } else {
    html = renderHtml(kind, buildDocDataFromBundle(b, kind as DocKind, options));
    name = (kind === "vor" ? `${b.act.baseNumber}.ВОР` : docNumber(b.act.baseNumber, kind as "aosr" | "rim" | "vd")) + ".pdf";
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
