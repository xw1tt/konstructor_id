// «Проверить перед сдачей»: то, за что технадзор обычно возвращает ИД (сроки сертификатов, даты, подписанты, сканы).
// Только предупреждения — печать и сборку не блокирует. Щелчок по строке — к ячейке книги.
import { useEffect, useState } from "react";
import { checkActs, warningsText } from "@idk/shared/check/predelivery";
import type { BookPort } from "../../book/bookPort.ts";
import type { BookState } from "../useBook.ts";
import { sheetIssueLines, type IssueLine } from "../print.ts";
import { IssueList } from "./IssueList.tsx";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** trigger — 0.32: проверка запускается сама, когда число меняется (печать акта, сборка комплекта). */
export function PreDelivery({ port, state, acts, what, trigger = 0 }: { port: BookPort; state: BookState; acts: string[]; what: string; trigger?: number }) {
  const [lines, setLines] = useState<IssueLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const key = acts.join("\n");
  useEffect(() => setLines(null), [key]);
  const run = async () => {
    if (!state.book || !acts.length) return;
    setBusy(true);
    try {
      setLines(await sheetIssueLines(port, checkActs(state.book, acts, today())));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (trigger > 0) void run();
  }, [trigger]);
  if (!state.book || !acts.length) return null;
  return (
    <div className="predelivery">
      <div className="row-actions">
        <button
          className="btn"
          disabled={busy}
          onClick={() => void run()}
          title="Сроки сертификатов, даты документов и работ, полномочия подписантов, материалы без документов, сканы. Печать не блокирует."
        >
          {busy ? "Проверяю…" : `Проверить ${what} перед сдачей`}
        </button>
        {lines && (
          <button className="btn btn-link" onClick={() => setLines(null)}>
            Скрыть
          </button>
        )}
      </div>
      {lines && !lines.length && (
        <p className="notice" role="status">
          Замечаний нет.
        </p>
      )}
      {lines && lines.length > 0 && (
        <IssueList
          port={port}
          lines={lines}
          tone="warn"
          title={`${warningsText(lines.length)} — печать и сборку это не блокирует, но технадзор может вернуть документы:`}
        />
      )}
    </div>
  );
}
