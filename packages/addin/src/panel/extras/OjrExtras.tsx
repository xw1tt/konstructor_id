// Общий журнал работ: заполнение разделов 3 и 5 из актов и печать по форме приказа № 1026/пр.
import { useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import { fillOjr, ojrPrintRequest } from "@idk/shared/ojr";
import type { ExcelPort } from "../../book/excelPort.ts";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { issueLines, type IssueLine } from "../print.ts";
import { previewUrl } from "../kit.ts";
import { IssueList } from "./IssueList.tsx";

declare const Office: any;

function openPreview(url: string) {
  if (typeof Office !== "undefined" && Office?.context?.ui?.displayDialogAsync) {
    Office.context.ui.displayDialogAsync(url, { height: 90, width: 70, displayInIframe: false });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export function OjrExtras({ port, state }: { port: ExcelPort; state: BookState }) {
  const guard = useGuard();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  if (!state.book) return null;
  const n3 = state.book.tables["ОЖР3"]?.length ?? 0, n5 = state.book.tables["ОЖР5"]?.length ?? 0;

  const fill = async () => {
    setConfirm(false);
    setBusy(true);
    setNote(null);
    setLines([]);
    try {
      for (const t of ["ОЖР3", "ОЖР5"] as TableName[]) if (await port.isFiltered(t)) await port.clearFilters(t);
      const r = await fillOjr(port, state.book!);
      setNote({ text: `Раздел 3: дней ${r.s3.length}. Раздел 5: документов ${r.s5.length}. Проверьте условия производства работ.` });
      if (r.issues.length) setLines(issueLines(r.issues, { "Акты": await port.tableSheetOffset("Акты").catch(() => undefined as any) }));
      state.refresh();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const print = async (section: 3 | 5) => {
    setNote(null);
    const q = ojrPrintRequest(state.book!, section);
    if (!q) { setNote({ text: `Раздел ${section} пуст — нажмите «Заполнить из актов».`, error: true }); return; }
    const r = await guard(apiSend<{ id: string }>("POST", "/api/ojr-jobs", q), (m) => setNote({ text: m, error: true }));
    if (r) openPreview(previewUrl(`/api/ojr-jobs/${r.id}`, location.origin));
  };

  return (
    <div className="extras">
      <h3 className="tools-title">Общий журнал работ</h3>
      <p className="muted">Раздел 3 — по датам работ актов (без воскресений), раздел 5 — исполнительная документация актов.</p>
      <div className="row-actions">
        <button className="btn" disabled={busy} onClick={() => (n3 + n5 ? setConfirm(true) : void fill())}>{busy ? "Заполняю…" : "Заполнить из актов"}</button>
        <button className="btn" onClick={() => void print(3)}>Печать раздела 3</button>
        <button className="btn" onClick={() => void print(5)}>Печать раздела 5</button>
      </div>
      {confirm && (
        <div className="confirm" role="alertdialog" aria-label="Заполнение журнала">
          <p>Листы «ОЖР Раздел 3» ({n3}) и «ОЖР Раздел 5» ({n5}) будут построены заново из актов. Исправленные условия
            производства работ сохранятся для тех же дат, остальные ручные правки пропадут.</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => void fill()}>Заполнить</button>
            <button className="btn" onClick={() => setConfirm(false)}>Отмена</button>
          </div>
        </div>
      )}
      <IssueList port={port} lines={lines} title="Не попали в журнал:" />
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
