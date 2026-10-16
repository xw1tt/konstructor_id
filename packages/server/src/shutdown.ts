import type { Server } from "node:net";
import type { EventEmitter } from "node:events";
import type { Db } from "./db.ts";

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const;

/**
 * Корректная остановка: закрыть сервер и базу (WAL сбрасывается в db.sqlite).
 * На Windows закрытие окна консоли присылает SIGHUP, Ctrl+Break — SIGBREAK.
 */
export function installShutdown(
  db: Db,
  server: Server,
  proc: EventEmitter & { exit: (code?: number) => void } = process,
  cleanup: () => Promise<void> = async () => {},
) {
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    server.close();
    try { db.close(); } catch { /* уже закрыта */ }
    void cleanup().catch(() => {}).finally(() => proc.exit(0));
  };
  for (const s of SIGNALS) proc.on(s, stop);
}
