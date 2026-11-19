// Печать из пакета акта, собранного панелью в книге Excel.
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import { Router, Reply, HttpError } from "../http/router.ts";
import { PRINT_KINDS, type PrintKind } from "@idk/shared/acts/schemas";
import type { ActDocKind } from "@idk/shared/docs/defs";
import { renderActDoc, view } from "../print/docs.ts";
import { z } from "zod";
import { ActBundle } from "@idk/shared/workbook/bundle";
import { DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "@idk/shared/templates";
import { protoHtml } from "../print/templates/proto.ts";
import { isProtoKind } from "@idk/shared/protocols/defs";
import { htmlToPdf } from "../print/browser.ts";
import { renderActXlsx } from "../print/xlsx/index.ts";
import { protoXlsx } from "../print/xlsx/proto.ts";
import { applyDocStyle, cleanStyle, styleKeyFor, type DocStyle } from "@idk/shared/docStyle";

/** Тело запроса печати: пакет акта и код шаблона (форма заказчика); без кода — СБД. */
export const PrintRequest = ActBundle.extend({ template: z.string().default(DEFAULT_TEMPLATE), options: PrintOptions.default({}) });

interface PrintJob {
  bundle: ActBundle;
  template: TemplateCode;
  options: PrintOptions;
}

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
      if (now() - j.at > JOB_TTL_MS) {
        jobs.delete(id);
        return undefined;
      }
      return j.job;
    },
  };
}

const kindOf = (doc: string): PrintKind => {
  if (!PRINT_KINDS.includes(doc as PrintKind)) throw new HttpError(400, "Неизвестный документ: " + doc);
  return doc as PrintKind;
};

/** HTML документа пакета с оформлением шаблона (0.33) и имя PDF. */
export function renderBundleHtml(b: ActBundle, kind: PrintKind, options: Partial<PrintOptions> = {}): { html: string; name: string } {
  // Набор форм и нумерация — из опций шаблона (план 14); код шаблона сам по себе не влияет на печать.
  // Документы акта — по описаниям (план 15, print/docs.ts); протоколы плана 13 — по PROTO_DEFS.
  let html: string, name: string;
  if (isProtoKind(kind)) {
    if (b.proto?.kind !== kind) throw new HttpError(400, "В пакете нет данных документа " + kind);
    html = protoHtml(b, view(kind, options));
    name = `${b.proto.code} №${b.proto.number}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
  } else {
    const r = renderActDoc(b, kind as ActDocKind, options);
    html = r.html;
    name = r.name;
  }
  // 0.33: оформление документа из шаблона — поверх встроенной формы.
  return { html: applyDocStyle(html, options.styles?.[styleKeyFor(kind, options) ?? ""]), name };
}

/** PDF документа пакета и имя файла (как у прежней печати из базы). */
export async function renderBundlePdf(
  b: ActBundle,
  kind: PrintKind,
  _template: TemplateCode = DEFAULT_TEMPLATE,
  options: Partial<PrintOptions> = {},
): Promise<{ pdf: Buffer; name: string }> {
  const { html, name } = renderBundleHtml(b, kind, options);
  return { pdf: await htmlToPdf(html, { pageNumbers: kind === "vor" }), name };
}

/** 0.33: лист для живого предпросмотра в панели — HTML формы на «бумаге» с полями (поля @page браузер на экране не
 *  показывает). Ориентация и поля — из последних правил @page: формы, затем оформления. */
export function previewPage(html: string): string {
  const page = /@page\s*\{[^}]*\}/g;
  let landscape = false,
    margins = [10, 10, 10, 20];
  for (const m of html.match(page) ?? []) {
    if (/landscape/.test(m)) landscape = true;
    else if (/portrait/.test(m)) landscape = false;
    const mm = /margin:\s*([\d.]+)mm(?:\s+([\d.]+)mm)?(?:\s+([\d.]+)mm)?(?:\s+([\d.]+)mm)?/.exec(m);
    if (mm) {
      const v = mm.slice(1).filter(Boolean).map(Number);
      margins = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v.length === 3 ? [v[0], v[1], v[2], v[1]] : v;
    }
  }
  const w = landscape ? 297 : 210;
  const css =
    `<style>html{background:#8a8a8a}body{width:${w}mm;min-height:${landscape ? 210 : 297}mm;margin:8px auto!important;background:#fff;` +
    `padding:${margins.map((v) => `${v}mm`).join(" ")};box-shadow:0 1px 6px rgba(0,0,0,.4)}</style>`;
  const i = html.lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + css + html.slice(i) : html + css;
}

/** Excel документа пакета: та же форма и те же данные, что у PDF; имя — как у PDF, с .xlsx. */
export function renderBundleXlsx(b: ActBundle, kind: PrintKind, options: Partial<PrintOptions> = {}): { xlsx: Buffer; name: string } {
  if (isProtoKind(kind)) {
    if (b.proto?.kind !== kind) throw new HttpError(400, "В пакете нет данных документа " + kind);
    return protoXlsx(b, view(kind, options), options.styles?.[kind]);
  }
  return renderActXlsx(b, kind as ActDocKind, options);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const attachment = (name: string) =>
  `attachment; filename*=UTF-8''${encodeURIComponent(name.replace(/[\\/:*?"<>|]/g, "_")).replace(/['()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())}`;

/** PDF документа пакета в ответ. */
export async function sendBundlePdf(
  res: ServerResponse,
  b: ActBundle,
  kind: PrintKind,
  template: TemplateCode = DEFAULT_TEMPLATE,
  options: Partial<PrintOptions> = {},
) {
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
    const kind = kindOf(c.params.doc);
    if (c.query.get("format") === "html") {
      // 0.33: живой предпросмотр оформления — style в запросе заменяет оформление документа в задании.
      let options = j.options;
      const raw = c.query.get("style");
      if (raw !== null) {
        let style: DocStyle;
        try {
          style = cleanStyle(JSON.parse(raw));
        } catch {
          throw new HttpError(400, "Неверное оформление документа");
        }
        const key = styleKeyFor(kind, options) ?? kind;
        options = { ...options, styles: { ...(options.styles ?? {}), [key]: style } };
      }
      const html = previewPage(renderBundleHtml(j.bundle, kind, options).html);
      c.res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      c.res.end(html);
      return;
    }
    if (c.query.get("format") === "xlsx") {
      const { xlsx, name } = renderBundleXlsx(j.bundle, kind, j.options);
      c.res.writeHead(200, { "content-type": XLSX_MIME, "content-length": xlsx.length, "content-disposition": attachment(name), "cache-control": "no-store" });
      c.res.end(xlsx);
      return;
    }
    await sendBundlePdf(c.res, j.bundle, kind, j.template, j.options);
  });
}
