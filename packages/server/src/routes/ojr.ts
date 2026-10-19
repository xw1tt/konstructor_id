// Печать разделов общего журнала работ: задание (POST) и PDF (GET) для окна предпросмотра.
import { randomUUID } from "node:crypto";
import { OjrRequest } from "@idk/shared/ojrPrint";
import { Router, Reply, HttpError } from "../http/router.ts";
import { ojrHtml } from "../print/templates/ojr.ts";
import { htmlToPdf } from "../print/browser.ts";

export const OJR_JSON_LIMIT = 10 * 1024 * 1024;

export function ojrRoutes(r: Router, now: () => number = Date.now) {
  const jobs = new Map<string, { q: OjrRequest; at: number }>();
  r.post("/api/ojr-jobs", async (c) => {
    const q = await c.body(OjrRequest, OJR_JSON_LIMIT);
    const id = randomUUID();
    jobs.set(id, { q, at: now() });
    while (jobs.size > 20) jobs.delete(jobs.keys().next().value!);
    return new Reply(201, { id });
  });
  r.get("/api/ojr-jobs/:job", async (c) => {
    const j = jobs.get(c.params.job);
    if (!j || now() - j.at > 30 * 60_000) throw new HttpError(404, "Задание печати не найдено или устарело");
    const pdf = await htmlToPdf(ojrHtml(j.q), { pageNumbers: true });
    const name = `ОЖР Раздел ${j.q.section}.pdf`;
    c.res.writeHead(200, {
      "content-type": "application/pdf", "content-length": pdf.length,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    c.res.end(pdf);
  });
}
