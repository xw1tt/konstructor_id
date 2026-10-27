// «Сообщить о проблеме»: отчёт для разработчика — описание, сведения о панели и книге (без данных — только счётчики),
// по выбору — разговор с помощником. Сервер добавляет свои сведения и последние ошибки и сохраняет архив.
import { useContext, useState } from "react";
import { TABLE_NAMES } from "@idk/shared/workbook/schema";
import { apiSend } from "../api.ts";
import type { BookState } from "./useBook.ts";
import type { AssistantSession } from "./assistant.ts";
import { UserTemplateContext } from "./templateContext.ts";

declare const Office: any;

/** Сведения о панели и книге для отчёта: версия Excel, шаблон, сколько строк в таблицах — без самих данных. */
export function panelInfo(state: BookState | null, template: { id: string; name: string; print: unknown }) {
  const diag = typeof Office !== "undefined" ? Office?.context?.diagnostics : null;
  const book = state?.book;
  return {
    excel: diag ? { host: diag.host, version: diag.version, platform: diag.platform } : null,
    panelUrl: typeof location !== "undefined" ? location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    template: { id: template.id, name: template.name, print: template.print },
    book: book ? {
      outdated: state?.outdated ?? false,
      missing: book.missing,
      rows: Object.fromEntries(TABLE_NAMES.filter((t) => !book.missing.includes(t)).map((t) => [t, book.tables[t]?.length ?? 0])),
      sheet: state?.selection?.sheet ?? null,
    } : null,
  };
}

export function ReportProblem({ state, assistant }: { state: BookState | null; assistant: AssistantSession | null }) {
  const tpl = useContext(UserTemplateContext).template;
  const [text, setText] = useState("");
  const [withChat, setWithChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; name: string; path: string | null } | null>(null);
  const [error, setError] = useState("");
  const send = async () => {
    setBusy(true); setError(""); setDone(null);
    try {
      const r = await apiSend<{ id: string; name: string; path: string | null }>("POST", "/api/report", {
        description: text, panel: panelInfo(state, tpl),
        ...(withChat && assistant?.items.length ? { assistant: assistant.items.map((m) => ({ kind: m.kind, text: m.text })) } : {}),
      });
      setDone(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <h3 className="tools-title">Сообщить о проблеме</h3>
      <p className="muted">Опишите, что делали и что пошло не так. Программа соберёт отчёт: версия, настройки, шаблон, сколько строк в таблицах книги (без самих данных) и последние ошибки сервера. Пришлите файл разработчику.</p>
      <textarea rows={4} placeholder="Например: печатаю КЖ по акту 19 — окно предпросмотра пустое" value={text} onChange={(e) => setText(e.target.value)} />
      <label className="setting-option">
        <input type="checkbox" checked={withChat} onChange={(e) => setWithChat(e.target.checked)} disabled={!assistant?.items.length} />
        Приложить разговор с помощником{assistant?.items.length ? "" : " (разговора нет)"}
      </label>
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>{busy ? "Собираю…" : "Собрать отчёт"}</button>
      </div>
      {done && (
        <p className="notice" role="status">
          Отчёт готов{done.path ? <> и сохранён: <b>{done.path}</b></> : null}. <a href={`/api/report/${done.id}`} download={done.name}>Скачать {done.name}</a>
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
