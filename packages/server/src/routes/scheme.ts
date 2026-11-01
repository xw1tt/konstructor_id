// Исполнительная схема трассы: JSON схемы (собран панелью из листа «Схемы трасс») → PDF листа в масштабе.
import { Router } from "../http/router.ts";
import { RouteScheme } from "@idk/shared/scheme/route";
import { renderRouteSvg } from "@idk/shared/scheme/render";
import { htmlToPdf } from "../print/browser.ts";

/** HTML листа: размер страницы — формат схемы, без полей (рамка — в самом SVG). */
export function schemeHtml(scheme: RouteScheme): string {
  const r = renderRouteSvg(scheme);
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${r.width}mm ${r.height}mm;margin:0}html,body{margin:0}svg{display:block}</style></head><body>${r.svg}</body></html>`;
}

export function schemeRoutes(r: Router) {
  r.post("/api/scheme/pdf", async (c) => {
    const scheme = await c.body(RouteScheme);
    const pdf = await htmlToPdf(schemeHtml(scheme));
    c.res.writeHead(200, { "content-type": "application/pdf", "content-length": pdf.length, "cache-control": "no-store" });
    c.res.end(pdf);
  });
}
