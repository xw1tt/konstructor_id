// Этап 1: команды сервера. create-owner <почта> — ссылка для первого входа владельца сервиса.
import type { Db } from "./db.ts";
import { Auth } from "./auth.ts";

export async function createOwner(db: Db, email: string, publicUrl: string): Promise<string> {
  const token = await new Auth(db).invite(null, null, email, "owner");
  return `${publicUrl.replace(/\/$/, "")}/console/#/invite/${token}`;
}
