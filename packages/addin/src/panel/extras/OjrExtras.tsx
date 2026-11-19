// Общий журнал работ: разделы 3 и 5 собираются из актов (0.32 — сами, перед печатью) и печать по форме приказа № 1026/пр.
import { useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import { ojrPrintRequest, syncOjr } from "@idk/shared/ojr";
import { readBook } from "@idk/shared/workbook/records";
import type { BookPort } from "../../book/bookPort.ts";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { issueLines, openPreview, type IssueLine } from "../print.ts";
import { previewUrl } from "../kit.ts";
import { IssueList } from "./IssueList.tsx";

export function OjrExtras({ port, state }: { port: BookPort; state: BookState }) {
  const guard = useGuard();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  if (!state.book) return null;

  /** 0.32: журнал сверяется с актами сам — перестраивается, только если акты изменились (условия по датам сохраняются). */
  const sync = async (): Promise<boolean> => {
    for (const t of ["ОЖР3", "ОЖР5"] as TableName[]) if (await port.isFiltered(t)) await port.clearFilters(t);
    const r = await syncOjr(port, state.book!);
    if (r.rows.issues.length) setLines(issueLines(r.rows.issues, { Акты: await port.tableSheetOffset("Акты").catch(() => undefined as any) }));
    if (r.changed) state.refresh();
    return r.changed;
  };

  const update = async () => {
    setBusy(true);
    setNote(null);
    setLines([]);
    try {
      const changed = await sync();
      const b = await readBook(port);
      const n3 = b.tables["ОЖР3"]?.length ?? 0,
        n5 = b.tables["ОЖР5"]?.length ?? 0;
      setNote({ text: `${changed ? "Журнал обновлён из актов" : "Журнал уже совпадает с актами"}. Раздел 3: дней ${n3}. Раздел 5: документов ${n5}.` });
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const print = async (section: 3 | 5) => {
    setBusy(true);
    setNote(null);
    setLines([]);
    try {
      const changed = await sync();
      const q = ojrPrintRequest(changed ? await readBook(port) : state.book!, section);
      if (!q) {
        setNote({ text: `Раздел ${section} пуст — в актах нет дат работ или документов.`, error: true });
        return;
      }
      const r = await guard(apiSend<{ id: string }>("POST", "/api/ojr-jobs", q), (m) => setNote({ text: m, error: true }));
      if (r) openPreview(previewUrl(`/api/ojr-jobs/${r.id}`, location.origin));
      if (changed) setNote({ text: "Перед печатью журнал обновлён из актов." });
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="extras">
      <h3 className="tools-title">Общий журнал работ</h3>
      <p className="muted">
        Собирается из актов сам: раздел 3 — по датам работ (без воскресений), раздел 5 — исполнительная документация. Условия производства работ, исправленные
        на листе, сохраняются.
      </p>
      <div className="row-actions">
        <button className="btn" disabled={busy} onClick={() => void print(3)}>
          Печать раздела 3
        </button>
        <button className="btn" disabled={busy} onClick={() => void print(5)}>
          Печать раздела 5
        </button>
        <button className="btn" disabled={busy} onClick={() => void update()}>
          {busy ? "Сверяю…" : "Обновить из актов"}
        </button>
      </div>
      <IssueList port={port} lines={lines} title="Не попали в журнал:" />
      {note && (
        <p className={note.error ? "error" : "notice"} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}
