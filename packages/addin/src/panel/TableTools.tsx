// «Функционал таблицы»: столбцы таблицы; клик ставит курсор в ячейку столбца на текущей строке.
import type { TableName } from "@idk/shared/workbook/schema";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { columnStatus, tablesOnSheet } from "./tableTools.ts";

export function TableTools({ port, state }: { port: ExcelPort; state: BookState }) {
  const { selection: s, table } = state;
  if (!s || !table) return null;
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
    </section>
  );
}
