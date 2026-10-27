import { createServer } from "node:https";
import { setLogFile } from "./diag/log.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { runDailyBackup } from "./backup.ts";
import { ensureCerts } from "./tls/ensureCerts.ts";
import { createApp, defaultOrigins } from "./app.ts";
import { installShutdown } from "./shutdown.ts";
import { closeBrowser } from "./print/browser.ts";

const cfg = loadConfig();
// Установленная программа (установщик) задаёт папку панели явно; при запуске из исходников — packages/addin/dist.
const addinDir = process.env.IDK_ADDIN_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "addin", "dist");

// «--setup»: только подготовить сертификаты (для установщика) и выйти; печатает путь корневого сертификата.
if (process.argv.includes("--setup")) {
  console.log(ensureCerts(cfg.dataDir).caCertPath);
  process.exit(0);
}

try {
  const backup = runDailyBackup(cfg.dataDir);
  if (backup) console.log(`Резервная копия: ${backup}`);
} catch (e) {
  console.error("Не удалось сделать резервную копию:", (e as Error).message);
}
setLogFile(join(cfg.dataDir, "logs", "server.log"));
const db = openDb(join(cfg.dataDir, "db.sqlite"));
const tls = ensureCerts(cfg.dataDir);
const server = createServer({ key: tls.key, cert: tls.cert }, createApp({ db, dataDir: cfg.dataDir, addinDir, allowedOrigins: defaultOrigins(cfg.port) }));

installShutdown(db, server, process, closeBrowser);

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") console.error(`Порт ${cfg.port} занят: сервер уже запущен?`);
  else console.error(e);
  process.exit(1);
});
server.listen(cfg.port, "127.0.0.1", () => {
  console.log(`Конструктор ИД: https://localhost:${cfg.port}/addin/  (данные: ${cfg.dataDir})`);
  console.log(`Корневой сертификат: ${tls.caCertPath}`);
});
