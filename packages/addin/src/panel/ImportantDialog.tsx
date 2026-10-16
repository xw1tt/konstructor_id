// Отметка важных столбцов текущей таблицы: сохраняется в книге, перекрашивает заголовки и правила.
import { useState } from "react";
import { TABLES, type TableName } from "@idk/shared/workbook/schema";
import { loadImportant, saveImportant } from "@idk/shared/workbook/important";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";

export function ImportantDialog({ port, state, table, onClose }: { port: ExcelPort; state: BookState; table: TableName; onClose: () => void }) {
  const cols = TABLES[table].columns.filter((c) => c.type !== "formula");
  const [checked, setChecked] = useState<Set<string>>(new Set(state.important[table] ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (h: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(h)) next.delete(h); else next.add(h);
    return next;
  });

  const save = async () => {
    setBusy(true);
    try {
      await saveImportant(port, { [table]: cols.map((c) => c.header).filter((h) => checked.has(h)) });
      await port.applyImportant(await loadImportant(port));
      state.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form" role="group" aria-label={`Важные столбцы таблицы «${table}»`}>
      {cols.map((c) => (
        <label key={c.header} className="check">
          <input type="checkbox" checked={checked.has(c.header)} onChange={() => toggle(c.header)} /> {c.header}
        </label>
      ))}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Сохранить</button>
        <button className="btn" onClick={onClose}>Отмена</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
