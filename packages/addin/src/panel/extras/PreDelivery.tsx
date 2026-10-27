// «Проверить перед сдачей»: то, за что технадзор обычно возвращает ИД (сроки сертификатов, даты, подписанты, сканы).
// Только предупреждения — печать и сборку не блокирует. Щелчок по строке — к ячейке книги.
import { useEffect, useState } from "react";
import { checkActs, warningsText } from "@idk/shared/check/predelivery";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { sheetIssueLines, type IssueLine } from "../print.ts";
import { IssueList } from "./IssueList.tsx";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function PreDelivery({ port, state, acts, what }: { port: ExcelPort; state: BookState; acts: string[]; what: string }) {
  const [lines, setLines] = useState<IssueLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const key = acts.join("\n");
  useEffect(() => setLines(null), [key]);
  if (!state.book || !acts.length) return null;
  const run = async () => {
    setBusy(true);
    try { setLines(await sheetIssueLines(port, checkActs(state.book!, acts, today()))); } finally { setBusy(false); }
  };
  return (
    <div className="predelivery">
      <div className="row-actions">
        <button className="btn" disabled={busy} onClick={() => void run()}
          title="Сроки сертификатов, даты документов и работ, полномочия подписантов, материалы без документов, сканы. Печать не блокирует.">
          {busy ? "Проверяю…" : `Проверить ${what} перед сдачей`}
        </button>
        {lines && <button className="btn btn-link" onClick={() => setLines(null)}>Скрыть</button>}
      </div>
      {lines && !lines.length && <p className="notice" role="status">Замечаний нет.</p>}
      {lines && lines.length > 0 && (
        <IssueList port={port} lines={lines} tone="warn"
          title={`${warningsText(lines.length)} — печать и сборку это не блокирует, но технадзор может вернуть документы:`} />
      )}
    </div>
  );
}
