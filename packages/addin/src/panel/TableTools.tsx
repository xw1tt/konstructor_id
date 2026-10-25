// «Функционал таблицы»: столбцы таблицы; клик ставит курсор в ячейку столбца на текущей строке.
import type { TableName } from "@idk/shared/workbook/schema";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { columnStatus, tablesOnSheet } from "./tableTools.ts";
import { useState } from "react";
import { libKindOf } from "@idk/shared/library/model";
import { libraryApi } from "./libraryApi.ts";
import { sendToLibrary } from "./library.ts";

export function TableTools({ port, state }: { port: ExcelPort; state: BookState }) {
  const { selection: s, table } = state;
  const [lib, setLib] = useState<{ busy: boolean; note: string; error: string }>({ busy: false, note: "", error: "" });
  if (!s || !table) return null;
  const libKind = libKindOf(table.name);
  // «В библиотеку» (план 16): выделенные строки этой таблицы, иначе строка под курсором.
  const libRows = s.table === table.name ? (s.rows.length ? s.rows : s.row !== null ? [s.row] : []) : [];
  const toLibrary = async () => {
    if (!state.book) return;
    setLib({ busy: true, note: "", error: "" });
    try {
      const r = await sendToLibrary(state.book, table.name, libRows, libraryApi);
      setLib({ busy: false, error: "", note: `В библиотеке: добавлено ${r.added}, обновлено ${r.updated}${r.empty ? `, пропущено пустых ${r.empty}` : ""}.` });
    } catch (e) {
      setLib({ busy: false, note: "", error: (e as Error).message });
    }
  };
  const onSheet = tablesOnSheet(s.sheet);
  const row = s.table === table.name && s.row !== null ? table.rows[s.row] ?? null : null;
  const cols = columnStatus(table.headers, state.important[table.name] ?? [], row);

  return (
    <section className="tools" aria-label="Функционал таблицы">
      <h2 className="tools-title">
        Функционал таблицы:{" "}
        {!s.table && onSheet.length > 1 ? (
          <select value={table.name} onChange={(e) => state.pickTable(e.target.value as TableName)} aria-label="Таблица">
            {onSheet.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : `«${table.name}»`}
      </h2>
      <div className="chips">
        {cols.map((c) => (
          <button
            key={c.header}
            className={"chip" + (c.important ? " chip-important" : "") + (c.important && c.empty ? " chip-empty" : "")}
            onClick={() => void port.selectCell(table.name, s.table === table.name ? s.row : null, c.header)}
            title={c.important ? (c.empty ? "Важный столбец — не заполнен" : "Важный столбец") : undefined}
          >
            {c.important && <span className="dot" aria-hidden="true" />}
            {c.header}
          </button>
        ))}
      </div>
      {libKind && (
        <div className="row-actions">
          <button className="btn" disabled={lib.busy || !libRows.length} onClick={() => void toLibrary()}
            title="Сохранить выделенные строки в библиотеку компании (документ — со сканом)">
            В библиотеку{libRows.length > 1 ? ` (${libRows.length})` : ""}
          </button>
          {lib.note && <span className="muted">{lib.note}</span>}
          {lib.error && <span className="error">{lib.error}</span>}
        </div>
      )}
    </section>
  );
}
