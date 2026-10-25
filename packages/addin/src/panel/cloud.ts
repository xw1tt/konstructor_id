// План 25: облако в панели — адрес, вход, проверка доступа (при запуске и раз в 10 минут), работа без связи 24 часа.
export interface CloudMe {
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; name: string; balanceRub?: number; access?: "active" | "readonly" | "suspended"; accessLabel?: string } | null;
}
export interface CloudCache { url: string; token: string; me: CloudMe | null; checkedAt: number | null }

export type CloudMode =
  | { kind: "off" }
  | { kind: "login"; error?: string }
  | { kind: "ok" | "readonly" | "suspended"; me: CloudMe; offline: boolean }
  | { kind: "expired"; me: CloudMe | null };

export const OFFLINE_MS = 24 * 3600_000;
export const CHECK_MS = 10 * 60_000;
const KEY = "idk.cloud";

export const emptyCache = (): CloudCache => ({ url: "", token: "", me: null, checkedAt: null });
export function loadCache(storage: Storage | null): CloudCache {
  try { return { ...emptyCache(), ...JSON.parse(storage?.getItem(KEY) ?? "{}") }; } catch { return emptyCache(); }
}
export function saveCache(storage: Storage | null, c: CloudCache) { try { storage?.setItem(KEY, JSON.stringify(c)); } catch { /* недоступно */ } }

export const normUrl = (u: string) => u.trim().replace(/\/+$/, "").replace(/^(?!https?:\/\/)/, "https://");

const modeOf = (me: CloudMe, offline: boolean): CloudMode => {
  const a = me.tenant?.access ?? "active";
  return { kind: a === "active" ? "ok" : a, me, offline };
};

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Проверка доступа: ответ облака → режим; нет связи — последний известный статус ещё 24 часа. */
export async function checkCloud(c: CloudCache, fetcher: Fetcher, now: number): Promise<{ mode: CloudMode; cache: CloudCache }> {
  if (!c.url) return { mode: { kind: "off" }, cache: c };
  if (!c.token) return { mode: { kind: "login" }, cache: c };
  let res: Response | null = null;
  try { res = await fetcher(`${c.url}/api/me`, { headers: { authorization: `Bearer ${c.token}` } }); } catch { res = null; }
  if (res && res.status === 401) {
    const cache = { ...c, token: "", me: null, checkedAt: null };
    return { mode: { kind: "login", error: "Сессия закончилась — войдите заново" }, cache };
  }
  if (res && res.ok) {
    const me = (await res.json()) as CloudMe;
    const cache = { ...c, me, checkedAt: now };
    return { mode: modeOf(me, false), cache };
  }
  // Нет связи или сбой сервера: работаем по последнему статусу до суток.
  if (c.me && c.checkedAt !== null && now - c.checkedAt < OFFLINE_MS) return { mode: modeOf(c.me, true), cache: c };
  return { mode: { kind: "expired", me: c.me }, cache: c };
}

export async function cloudLogin(c: CloudCache, email: string, password: string, fetcher: Fetcher, now: number): Promise<{ mode: CloudMode; cache: CloudCache }> {
  let res: Response;
  try {
    res = await fetcher(`${c.url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, client: "panel" }) });
  } catch {
    return { mode: { kind: "login", error: `Нет связи с облаком (${c.url}) — проверьте адрес и интернет` }, cache: c };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) return { mode: { kind: "login", error: data?.error ?? `Ошибка входа (${res.status})` }, cache: c };
  return checkCloud({ ...c, token: data.token }, fetcher, now);
}

/** Можно ли печатать и пользоваться помощником; иначе — причина. */
export function blockReason(m: CloudMode): string | null {
  switch (m.kind) {
    case "off": case "ok": return null;
    case "login": return "Войдите в облако «Конструктора ИД» («Настройки» → «Облако»)";
    case "readonly": return "Баланс компании исчерпан — доступ только на чтение. Пополните баланс у владельца сервиса";
    case "suspended": return "Доступ компании приостановлен владельцем сервиса";
    case "expired": return "Нет связи с облаком больше суток — печать и помощник недоступны до восстановления связи";
  }
}
