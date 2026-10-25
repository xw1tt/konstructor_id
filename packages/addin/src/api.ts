import type { FileRow } from "@idk/shared/schemas";

/** Сервер недоступен (не запущен или нет сети) — отличается от ошибок, которые вернул сам сервер. */
export class ServerUnavailableError extends Error {
  constructor() {
    super("Сервер не запущен");
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ServerUnavailableError();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = undefined;
  if (text) {
    try { data = JSON.parse(text); } catch { data = undefined; }
  }
  if (!res.ok) throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
  return data as T;
}

export const apiGet = <T>(path: string) => call<T>(path, { method: "GET" });

export const apiSend = <T>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
  call<T>(path, body === undefined
    ? { method }
    : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const apiUpload = (file: Blob, name: string) =>
  call<FileRow>("/api/files", {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(name) },
    body: file,
  });

/** Файл РКЦ (.xlsx) — в память сервера; ответ — id и листы книги. */
export const apiUploadRkc = (file: Blob) =>
  call<{ id: string; sheets: string[] }>("/api/rkc", {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
