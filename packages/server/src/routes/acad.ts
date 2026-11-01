// Обмен с плагином AutoCAD: панель отправляет данные листа схемы (ведомость и штамп), плагин забирает последние.
// Хранится одно задание — последнее отправленное; файл переживает перезапуск сервера.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Router, Reply, HttpError } from "../http/router.ts";
import { SheetJob } from "@idk/shared/scheme/sheetJob";

export function acadRoutes(r: Router, dataDir: string) {
  const file = join(dataDir, "acad", "sheet.json");
  r.post("/api/acad/sheet", async (c) => {
    const job = await c.body(SheetJob);
    mkdirSync(join(dataDir, "acad"), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...job, sentAt: new Date().toISOString() }));
    return new Reply(201, { ok: true });
  });
  r.get("/api/acad/sheet", () => {
    let raw: string;
    try { raw = readFileSync(file, "utf8"); } catch { throw new HttpError(404, "Нет данных схемы: в панели Конструктора ИД нажмите «В AutoCAD» в карточке схемы"); }
    return new Reply(200, JSON.parse(raw));
  });
}
