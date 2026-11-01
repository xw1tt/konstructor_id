import type { IncomingMessage, ServerResponse } from "node:http";
import { logError } from "./diag/log.ts";
import type { Db } from "./db.ts";
import { Router, sendJson } from "./http/router.ts";
import { serveStatic } from "./http/static.ts";
import { fileRoutes } from "./routes/files.ts";
import { printRoutes } from "./routes/print.ts";
import { acadRoutes } from "./routes/acad.ts";
import { normRoutes } from "./routes/norms.ts";
import { kitRoutes } from "./routes/kit.ts";
import { ojrRoutes } from "./routes/ojr.ts";
import { rkcRoutes } from "./routes/rkc.ts";
import { templateRoutes } from "./routes/templates.ts";
import { TemplateStore } from "./forms/store.ts";
import { CatalogStore } from "./catalog/store.ts";
import { catalogRoutes } from "./routes/catalog.ts";
import { formJobRoutes } from "./routes/formJobs.ts";
import { libraryRoutes } from "./routes/library.ts";
import { LibraryStore } from "./library/store.ts";
import { aiRoutes } from "./routes/ai.ts";
import { AiStore } from "./ai/store.ts";
import { reportRoutes } from "./routes/report.ts";
import { scanRoutes } from "./routes/scan.ts";
import type { OcrRunner } from "./scan/read.ts";
import type { Post } from "./ai/providers.ts";
import { powershellRunner, type OfficeRunner } from "./forms/convert.ts";

export const DEFAULT_UPLOAD_LIMIT = 200 * 1024 * 1024;

export interface AppOptions {
  db: Db;
  dataDir: string;
  addinDir?: string;
  uploadLimit?: number;
  /** Адреса, с которых разрешены изменяющие запросы (панель). */
  allowedOrigins?: string[];
  /** Для тестов: подмена доступа к порталу protect.gost.ru и пауз при обновлении справочника. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Перевод своих форм в PDF через Office (по умолчанию — PowerShell + COM на Windows). */
  officeRunner?: OfficeRunner;
  /** Для тестов: подмена HTTP-запросов к нейросетям. */
  aiPost?: Post;
  /** Для тестов: подмена распознавания текста сканов (по умолчанию — Windows OCR через PowerShell). */
  ocrRunner?: OcrRunner;
  /** Папка копий отчётов «Сообщить о проблеме» (по умолчанию «Документы\Конструктор ИД — отчёты»). */
  reportsDir?: string;
}

export const defaultOrigins = (port = 3443) => [`https://localhost:${port}`, `https://127.0.0.1:${port}`];

export function createApp(opts: AppOptions) {
  const api = new Router(opts.allowedOrigins ?? defaultOrigins());
  printRoutes(api);
  acadRoutes(api, opts.dataDir);
  normRoutes(api, opts.db, { fetchImpl: opts.fetchImpl, sleep: opts.sleep });
  fileRoutes(api, opts.db, opts.dataDir, opts.uploadLimit ?? DEFAULT_UPLOAD_LIMIT);
  ojrRoutes(api);
  rkcRoutes(api);
  const catalog = new CatalogStore(opts.dataDir);
  catalogRoutes(api, catalog);
  const templates = new TemplateStore(opts.dataDir, catalog);
  templateRoutes(api, templates);
  const runner = opts.officeRunner ?? powershellRunner();
  formJobRoutes(api, templates, runner);
  kitRoutes(api, opts.db, opts.dataDir, { templates, runner });
  const ai = new AiStore(opts.dataDir);
  aiRoutes(api, ai, { post: opts.aiPost });
  scanRoutes(api, opts.db, opts.dataDir, ai, { ocr: opts.ocrRunner, post: opts.aiPost });
  reportRoutes(api, { dataDir: opts.dataDir, templates, ai, reportsDir: opts.reportsDir });
  libraryRoutes(api, new LibraryStore(opts.dataDir), opts.db, opts.dataDir, opts.uploadLimit ?? DEFAULT_UPLOAD_LIMIT);
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (await api.handle(req, res)) return;
      if (opts.addinDir && serveStatic("/addin/", opts.addinDir, req, res)) return;
      sendJson(res, 404, { error: "Не найдено: " + (req.url ?? "") });
    } catch (e) {
      // Последний рубеж: одна плохая заявка не должна останавливать сервер.
      logError(`${req.method} ${req.url ?? ""}`, e);
      if (!res.headersSent) sendJson(res, 500, { error: "Внутренняя ошибка сервера" });
      else res.destroy();
    }
  };
}
