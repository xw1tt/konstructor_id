// 0.52: «Сервер сканов» на стороне компьютера — настройка, фоновая сверка сканов открытой книги, состояние.
import { useEffect, useRef, useState } from "react";
import type { Book } from "@idk/shared/workbook/records";
import { apiGet, apiSend } from "../api.ts";

export interface HubStatus {
  configured: boolean;
  url: string;
  running: boolean;
  pulled: number;
  pushed: number;
  missing: number;
  errors: string[];
  at: string | null;
  online: boolean | null;
}

/** Отпечатки сканов во всех ссылках книги. */
export function bookShas(book: Book): string[] {
  const out = new Set<string>();
  for (const rows of Object.values(book.tables))
    for (const r of rows ?? [])
      for (const l of Object.values(r.link ?? {})) for (const m of String(l ?? "").matchAll(/[?&]sha=([0-9a-f]{64})/gi)) out.add(m[1].toLowerCase());
  return [...out].sort();
}

/** Сверка сканов книги с сервером сканов — при открытии книги и когда в ней появились новые сканы. */
export function useHubSync(book: Book | null) {
  const last = useRef("");
  useEffect(() => {
    if (!book) return;
    const shas = bookShas(book);
    const sig = shas.join(",");
    if (sig === last.current) return;
    last.current = sig;
    const t = setTimeout(() => void apiSend("POST", "/api/hub/sync", { shas }).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [book]);
}

/** Состояние сервера сканов (опрос, пока идёт сверка). */
export function useHubStatus(): HubStatus | null {
  const [s, setS] = useState<HubStatus | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const v = await apiGet<HubStatus>("/api/hub/status");
        if (!alive) return;
        setS(v);
        timer = setTimeout(() => void tick(), v.running ? 1500 : 15000);
      } catch {
        if (alive) timer = setTimeout(() => void tick(), 30000);
      }
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return s;
}

export function hubLine(s: HubStatus | null): string {
  if (!s?.configured) return "";
  if (s.running) return `Общие сканы: сверяю… скачано ${s.pulled}, отправлено ${s.pushed}`;
  if (s.online === false)
    return `Общие сканы недоступны${s.errors.length ? `: ${s.errors.at(-1)}` : ""} — сканы этого компьютера отправятся, когда связь появится`;
  const parts = [s.pulled || s.pushed ? `Общие сканы: скачано ${s.pulled}, отправлено ${s.pushed}` : "Общие сканы: совпадают"];
  if (s.missing) parts.push(`нет ни здесь, ни в общем хранилище: ${s.missing} — привяжите их из «Папки сканов» на компьютере, где они есть`);
  if (s.errors.length) parts.push(`ошибки: ${s.errors.join("; ")}`);
  return parts.join("; ");
}

export function HubSettings() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const status = useHubStatus();
  useEffect(() => {
    void apiGet<{ url: string; hasToken: boolean }>("/api/hub/config")
      .then((c) => {
        setUrl(c.url);
        setHasToken(c.hasToken);
      })
      .catch(() => undefined);
  }, []);
  const save = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const c = await apiSend<{ url: string; hasToken: boolean }>("PUT", "/api/hub/config", { url, ...(token ? { token } : {}) });
      setHasToken(c.hasToken);
      setToken("");
      if (!c.url) return setNote("Общий доступ к сканам выключен.");
      const t = await apiSend<{ ok: boolean; message: string }>("POST", "/api/hub/test", {});
      if (t.ok) {
        setNote(`${t.message}. Сканы этого компьютера отправляются туда в фоне.`);
        void apiSend("POST", "/api/hub/sync", { shas: [] }).catch(() => undefined);
      } else setError(t.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="setting">
      <h3 className="tools-title">Сканы на всех компьютерах</h3>
      <p className="muted">
        Сканы, загруженные на одном компьютере (рабочем, ноутбуке), сами появляются на другом — книгу .xlsx переносите как обычно, сотни мегабайт сканов
        копировать не нужно. Укажите <b>общую папку</b> на рабочем сервере — путь вида \\сервер\Общая\ИД или папку на сетевом диске (ноутбук вне офиса видит её
        через VPN) — или адрес своего сервера сканов (https://…, с ключом).
      </p>
      <label className="field">
        <span className="field-label">Общая папка или адрес сервера</span>
        <input className="mono" value={url} placeholder="\\server\Общая\ИД  или  https://сервер.пример.ru" onChange={(e) => setUrl(e.target.value)} />
      </label>
      {/^https:/i.test(url.trim()) && (
        <label className="field">
          <span className="field-label">Ключ доступа</span>
          <input
            type="password"
            className="mono"
            value={token}
            placeholder={hasToken ? "сохранён — оставьте пустым" : ""}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Проверяю…" : "Сохранить и проверить"}
        </button>
        {url && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void apiSend("POST", "/api/hub/sync", { shas: [] }).then(() => setNote("Сверка запущена."))}
          >
            Отправить сканы сейчас
          </button>
        )}
      </div>
      {note && <p className="notice">{note}</p>}
      {error && <p className="error">{error}</p>}
      {hubLine(status) && <p className="muted">{hubLine(status)}</p>}
    </section>
  );
}
