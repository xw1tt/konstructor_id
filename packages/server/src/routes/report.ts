// «Сообщить о проблеме»: отчёт для разработчика одним архивом — описание, сведения о панели, сервере, шаблонах,
// последних ошибках сервера и (по выбору) разговор с помощником. Данных книги в отчёте нет — только счётчики.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir, platform, release, arch } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Router, Reply, HttpError } from "../http/router.ts";
import { writeZip } from "../zip/zip.ts";
import { recentErrors, logFile } from "../diag/log.ts";
import type { TemplateStore } from "../forms/store.ts";
import type { AiStore } from "../ai/store.ts";
import { attachment } from "./print.ts";

export const ReportRequest = z.object({
  description: z.string().max(20_000).default(""),
  panel: z.record(z.unknown()).default({}),
  assistant: z.array(z.object({ kind: z.string(), text: z.string() })).max(500).optional(),
});

/** Версия программы — файл VERSION установщика (рядом с сервером или выше по папкам). */
export function appVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const f = join(dir, "VERSION");
    if (existsSync(f)) return readFileSync(f, "utf8").trim();
    dir = dirname(dir);
  }
  return "разработка";
}

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
export const defaultReportsDir = () => join(homedir(), "Documents", "Конструктор ИД — отчёты");

export function reportRoutes(r: Router, deps: { dataDir: string; templates: TemplateStore; ai: AiStore; reportsDir?: string; now?: () => Date }) {
  const made = new Map<string, { zip: Buffer; name: string }>();
  // Установленная версия — для «Настроек» (0.29.2).
  r.get("/api/version", () => ({ version: appVersion() }));
  r.post("/api/report", async (c) => {
    const q = await c.body(ReportRequest, 5 * 1024 * 1024);
    const now = (deps.now ?? (() => new Date()))();
    const errors = recentErrors();
    let templates: unknown = [];
    try { templates = deps.templates.list().map((t) => ({ id: t.id, name: t.name, docs: t.docs.length, print: t.print })); } catch (e) { templates = `не прочитаны: ${(e as Error).message}`; }
    let ai: unknown = null;
    try { const l = deps.ai.list(); ai = { active: l.active, providers: l.providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, model: p.model })) }; } catch { /* нет подключений */ }
    const server = {
      version: appVersion(), node: process.version, os: `${platform()} ${release()} ${arch()}`, uptimeMin: Math.round(process.uptime() / 60),
      dataDir: deps.dataDir, browser: process.env.IDK_BROWSER || "Edge (по умолчанию)", logFile: logFile(), templates, ai,
    };
    const text = [
      `Отчёт «Конструктора ИД» — ${now.toLocaleString("ru-RU")}`,
      `Версия: ${server.version}; ${server.os}; Node ${server.node}`,
      "",
      "Что случилось:",
      q.description.trim() || "(не описано)",
      "",
      `Ошибок сервера за время работы: ${errors.length}`,
      ...errors.slice(-30).map((e) => `— ${e.at} ${e.where}: ${e.message}`),
      ...(q.assistant?.length ? ["", "Разговор с помощником:", ...q.assistant.map((m) => `[${m.kind}] ${m.text}`)] : []),
    ].join("\r\n");
    let logTail = "";
    const lf = logFile();
    if (lf && existsSync(lf)) { try { logTail = readFileSync(lf, "utf8").slice(-200_000); } catch { /* нет доступа */ } }
    const name = `Отчёт ${stamp(now)}.zip`;
    const zip = writeZip([
      ["Отчёт.txt", text],
      ["панель.json", JSON.stringify(q.panel, null, 2)],
      ["сервер.json", JSON.stringify(server, null, 2)],
      ["ошибки.json", JSON.stringify(errors, null, 2)],
      ...(logTail ? [["server.log", logTail] as [string, string]] : []),
      ...(q.assistant?.length ? [["помощник.json", JSON.stringify(q.assistant, null, 2)] as [string, string]] : []),
    ]);
    // Копия — в «Документы\Конструктор ИД — отчёты» (её проще найти и переслать); не вышло — только скачивание.
    let path: string | null = null;
    try {
      const dir = deps.reportsDir ?? defaultReportsDir();
      mkdirSync(dir, { recursive: true });
      path = join(dir, name);
      writeFileSync(path, zip);
    } catch { path = null; }
    const id = randomUUID();
    made.set(id, { zip, name });
    while (made.size > 5) made.delete(made.keys().next().value!);
    return new Reply(201, { id, name, path, errors: errors.length });
  });
  r.get("/api/report/:id", (c) => {
    const j = made.get(c.params.id);
    if (!j) throw new HttpError(404, "Отчёт не найден — соберите его заново");
    c.res.writeHead(200, { "content-type": "application/zip", "content-length": j.zip.length, "content-disposition": attachment(j.name), "cache-control": "no-store" });
    c.res.end(j.zip);
  });
}
