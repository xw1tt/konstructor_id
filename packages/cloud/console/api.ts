// Консоль: обращения к API облака с токеном из localStorage.
const KEY = "idk.console.token";
export const getToken = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
export const setToken = (t: string) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* нет хранилища */ } };

export class AuthError extends Error {}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (res.status === 401 && path !== "/api/auth/login") { setToken(""); throw new AuthError(data?.error ?? "Войдите заново"); }
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data as T;
}

export const money = (rub: number | null | undefined) =>
  rub === null || rub === undefined ? "—" : `${rub.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
export const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—");
export const ROLE: Record<string, string> = { owner: "владелец сервиса", admin: "администратор", engineer: "инженер", reviewer: "проверяющий" };
export const KIND: Record<string, string> = { topup: "Пополнение", fee: "Абонентская плата", ai: "Нейросеть", adjust: "Корректировка" };
