/**
 * Загружает контрольный пример (акт №К32.В.СТ.АОВ1.01.00.1, ООО «СБД») в базу конструктора.
 * Запуск: npm run seed:sbd   (сервер лучше остановить). В непустую базу не загружает.
 */
import { join } from "node:path";
import { loadConfig } from "../packages/server/src/config.ts";
import { openDb } from "../packages/server/src/db.ts";
import { seedSbdAov1 } from "../packages/server/src/seed/sbdAov1.ts";

const cfg = loadConfig();
const db = openDb(join(cfg.dataDir, "db.sqlite"));
const n = (db.prepare("SELECT COUNT(*) n FROM organizations").get() as { n: number }).n;
if (n > 0) {
  console.error(`База не пустая (организаций: ${n}). Контрольный пример загружается только в новую базу.`);
  console.error(`Чтобы попробовать на чистой базе, задайте другую папку данных: set IDK_DATA_DIR=C:\\temp\\idk-demo`);
  process.exit(1);
}
const { actId } = seedSbdAov1(db);
db.close();
console.log(`Контрольный пример загружен (акт id=${actId}) в ${cfg.dataDir}`);
