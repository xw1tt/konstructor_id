// 0.29.3: отчёт «Сообщить о проблеме» — сразу разработчику в Телеграм (бот). Токен и чат — в файле telegram.json
// установщика (кладётся при сборке, в репозитории его нет) или в переменных IDK_TG_TOKEN / IDK_TG_CHAT.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface TgConfig { token: string; chatId: string }

/** Настройка бота: переменные окружения, иначе telegram.json рядом с сервером или выше по папкам. */
export function telegramConfig(): TgConfig | null {
  const env = { token: process.env.IDK_TG_TOKEN ?? "", chatId: process.env.IDK_TG_CHAT ?? "" };
  if (env.token && env.chatId) return env;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const f = join(dir, "telegram.json");
    if (existsSync(f)) {
      try {
        const o = JSON.parse(readFileSync(f, "utf8"));
        if (o.token && o.chatId) return { token: String(o.token), chatId: String(o.chatId) };
      } catch { /* битый файл — без отправки */ }
      return null;
    }
    dir = dirname(dir);
  }
  return null;
}

const TG_TIMEOUT_MS = 30_000;

/** Сообщение (до 4096 знаков) и архив документом. Ошибка — понятным текстом (сеть, блокировка, токен). */
export async function sendTelegram(cfg: TgConfig, text: string, file: { name: string; data: Buffer }, fetchImpl: typeof fetch = fetch): Promise<void> {
  const api = (m: string) => `https://api.telegram.org/bot${cfg.token}/${m}`;
  const call = async (m: string, body: FormData | string, json = false) => {
    let res: Response;
    try {
      res = await fetchImpl(api(m), {
        method: "POST", body, signal: AbortSignal.timeout(TG_TIMEOUT_MS),
        ...(json ? { headers: { "content-type": "application/json" } } : {}),
      });
    } catch (e) {
      throw new Error(`нет связи с Телеграмом (${(e as Error).message}) — возможно, он недоступен в сети компании`);
    }
    const o = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };
    if (!res.ok || !o.ok) throw new Error(`Телеграм ответил: ${o.description ?? res.status}`);
  };
  const msg = text.length > 4000 ? `${text.slice(0, 4000)}\n… (полностью — в архиве)` : text;
  await call("sendMessage", JSON.stringify({ chat_id: cfg.chatId, text: msg, disable_web_page_preview: true }), true);
  const form = new FormData();
  form.set("chat_id", cfg.chatId);
  form.set("document", new Blob([new Uint8Array(file.data)], { type: "application/zip" }), file.name);
  await call("sendDocument", form);
}
