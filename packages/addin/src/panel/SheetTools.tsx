// «Функционал листа»: работает с активным листом — со строками таблицы или с обычными строками листа.
import { useState } from "react";
import { TABLES, keyColumn, type TableName } from "@idk/shared/workbook/schema";
import { tableRows, type RowsTarget } from "@idk/shared/workbook/store";
import { addRows, duplicateRow, moveRow, deleteRows } from "@idk/shared/workbook/rowOps";
import { findReferences } from "@idk/shared/workbook/refs";
import { cellText } from "@idk/shared/workbook/values";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { ImportantDialog } from "./ImportantDialog.tsx";

interface Props {
  port: ExcelPort;
  state: BookState;
  /** Вызывается после добавления строк в таблицу (значения новой строки по умолчанию). */
  onRowsAdded?: (table: TableName, first: number, n: number) => Promise<void>;
}

interface PendingDelete { rows: number[]; text: string }

export function SheetTools({ port, state, onRowsAdded }: Props) {
  const { selection: s, book } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [importantOpen, setImportantOpen] = useState(false);
  if (!s) return null;

  const inTable = s.table !== null;
  const target = (): RowsTarget => (inTable ? tableRows(port, s.table!) : port.sheetRows(s.sheet));
  const current = inTable ? s.row : s.sheetRow;
  const selected = inTable ? s.rows : s.sheetRows;

  const goTo = async (row: number) => {
    if (inTable) await port.selectCell(s.table!, row, s.column ?? TABLES[s.table!].columns[0].header);
    else await port.selectSheetCell(s.sheet, row, s.sheetCol);
  };

  const run = async (fn: () => Promise<number | void>) => {
    setBusy(true);
    setError("");
    try {
      const row = await fn();
      if (typeof row === "number") await goTo(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      state.refresh();
    }
  };

  const add = (n: number) => run(async () => {
    const first = await addRows(target(), inTable && s.row === null ? null : current, n);
    if (inTable) await onRowsAdded?.(s.table!, first, n);
    return first;
  });

  const askDelete = () => {
    const rows = selected.length ? selected : current !== null ? [current] : [];
    if (!rows.length) return;
    let text = `Удалить строк: ${rows.length}?`;
    if (inTable && book) {
      const key = keyColumn(s.table!);
      const data = book.tables[s.table!] ?? [];
      if (key) {
        const keys = rows.map((r) => cellText(data.find((x) => x.row === r)?.v[key.key] ?? null)).filter(Boolean);
        const hits = keys.flatMap((k) => findReferences(book, s.table!, k));
        if (hits.length) {
          const sheets = [...new Set(hits.map((h) => TABLES[h.table].sheet))].join(", ");
          text += ` На них ссылаются строки: ${hits.length} (листы: ${sheets}).`;
        }
      }
    }
    setPending({ rows, text });
  };

  const noRow = current === null;
  return (
    <section className="tools" aria-label="Функционал листа">
      <h2 className="tools-title">Функционал листа: «{s.sheet}»</h2>
      <div className="row-actions">
        <button className="btn" disabled={busy} onClick={() => void add(1)} title="Добавить строку под текущей">+1</button>
        <button className="btn" disabled={busy} onClick={() => void add(10)} title="Добавить 10 строк под текущей">+10</button>
        <button className="btn" disabled={busy || noRow} onClick={() => void run(() => duplicateRow(target(), current!))}>Дублировать</button>
        <button className="btn btn-icon" disabled={busy || noRow} onClick={() => void run(() => moveRow(target(), current!, -1))} title="Переместить строку вверх" aria-label="Вверх">↑</button>
        <button className="btn btn-icon" disabled={busy || noRow} onClick={() => void run(() => moveRow(target(), current!, 1))} title="Переместить строку вниз" aria-label="Вниз">↓</button>
        <button className="btn btn-danger" disabled={busy || noRow} onClick={askDelete}>Удалить</button>
        <button className="btn" disabled={!state.table} onClick={() => setImportantOpen((v) => !v)} aria-expanded={importantOpen}>Важные столбцы</button>
      </div>
      {pending && (
        <div className="confirm" role="alertdialog" aria-label="Подтверждение удаления">
          <p>{pending.text}</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => { const rows = pending.rows; setPending(null); void run(async () => { await deleteRows(target(), rows); }); }}>Удалить</button>
            <button className="btn" onClick={() => setPending(null)}>Отмена</button>
          </div>
        </div>
      )}
      {importantOpen && state.table && (
        <ImportantDialog port={port} state={state} table={state.table.name} onClose={() => setImportantOpen(false)} />
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
