// Этап 1: запуск облачного сервера и команды.
//   npm run cloud                         — сервер (PORT, DATABASE_URL или PGLITE_DIR, PUBLIC_URL, ALLOWED_ORIGINS)
//   npm run cloud -- create-owner <почта>  — ссылка для первого входа владельца сервиса
import { createServer } from "node:http";
import { migrate, pgDb, pgliteDb, type Db } from "./db.ts";
import { createCloudApp } from "./app.ts";
import { createOwner } from "./cli.ts";
import { extendCloud } from "./extend.ts";
import { accrueFees } from "./billing.ts";

const env = process.env;
const publicUrl = env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 8080}`;
const origins = (env.ALLOWED_ORIGINS ?? "https://localhost:3443,https://127.0.0.1:3443").split(",").map((s) => s.trim()).filter(Boolean);

async function openDb(): Promise<Db> {
  const db = env.DATABASE_URL ? await pgDb(env.DATABASE_URL) : await pgliteDb(env.PGLITE_DIR ?? "./cloud-data");
  const applied = await migrate(db);
  if (applied.length) console.log("Миграции:", applied.join(", "));
  return db;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "create-owner") {
  if (!arg) { console.error("Укажите почту: create-owner <почта>"); process.exit(2); }
  const db = await openDb();
  console.log("Откройте ссылку и задайте пароль (действует 7 дней):\n" + await createOwner(db, arg, publicUrl));
  await db.close();
} else {
  const db = await openDb();
  const { handler } = createCloudApp({ db, allowedOrigins: [...origins, new URL(publicUrl).origin], extend: extendCloud(publicUrl) });
  const port = Number(env.PORT ?? 8080);
  createServer(handler).listen(port, () => console.log(`Облачный сервер: ${publicUrl} (порт ${port})`));
  // Абонентская плата: при запуске и каждый час (одна операция на компанию и московские сутки, пропуски догоняются).
  const bill = () => accrueFees(db, new Date()).then((n) => { if (n) console.log(`Списано абонентских плат: ${n}`); }).catch((e) => console.error("Списание:", e));
  void bill();
  setInterval(bill, 3600_000).unref();
}
