import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
import { HttpError } from "../http/router.ts";

const NO_BROWSER = "Не найден браузер для печати: установите Microsoft Edge или укажите IDK_BROWSER";
let browser: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const exe = process.env.IDK_BROWSER;
  if (exe) {
    if (!existsSync(exe)) throw new HttpError(503, NO_BROWSER);
    return chromium.launch({ executablePath: exe });
  }
  if (process.platform === "win32") return chromium.launch({ channel: "msedge" });
  return chromium.launch();
}

function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = launch().catch((e) => {
      browser = null;
      throw e instanceof HttpError ? e : new HttpError(503, NO_BROWSER);
    });
  }
  return browser;
}

export interface PdfOptions {
  /** Колонтитул «Страница N из M». */
  pageNumbers?: boolean;
}

/** Печать HTML в PDF A4 (поля задаются в CSS @page). */
export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: !!opts.pageNumbers,
      headerTemplate: "<span></span>",
      footerTemplate: opts.pageNumbers
        ? `<div style="width:100%;text-align:center;font-family:Arial,sans-serif;font-size:8px">Страница&nbsp; <span class="pageNumber"></span> из <span class="totalPages"></span></div>`
        : "<span></span>",
    });
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = null;
  if (b) await (await b.catch(() => null))?.close();
}
