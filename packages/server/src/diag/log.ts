// Журнал ошибок сервера: последние ошибки в памяти и в файле <данные>/logs/server.log (до 1 МБ, затем — .old).
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

export interface LoggedError { at: string; where: string; message: string; stack: string }
const ring: LoggedError[] = [];
const MAX = 200;
let file: string | null = null;

export function setLogFile(path: string | null) {
  file = path;
  if (path) try { mkdirSync(dirname(path), { recursive: true }); } catch { /* журнал — не главное */ }
}

export function logError(where: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(where, err);
  const item: LoggedError = { at: new Date().toISOString(), where, message: err.message, stack: (err.stack ?? "").split("\n").slice(0, 12).join("\n") };
  ring.push(item);
  if (ring.length > MAX) ring.shift();
  if (!file) return;
  try {
    try { if (statSync(file).size > 1024 * 1024) renameSync(file, `${file}.old`); } catch { /* файла ещё нет */ }
    appendFileSync(file, `${item.at} ${where}\n${item.stack || item.message}\n\n`);
  } catch { /* диск недоступен — остаётся журнал в памяти */ }
}

export const recentErrors = () => [...ring];
export const logFile = () => file;
