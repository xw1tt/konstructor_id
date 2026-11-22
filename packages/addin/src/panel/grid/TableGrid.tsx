// 0.47: таблица в окне программы — как в Excel: правка в ячейке, стрелки/Tab/Enter, выделение диапазона, вставка блока
// из Excel (Ctrl+V; не хватает строк — добавляются), копирование (Ctrl+C), «заполнить вниз» (Ctrl+D), очистка (Delete),
// добавление и удаление строк, выбор столбцов. Пишет в книгу построчно (одна запись на строку).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import type { ColumnDef, TableName } from "@idk/shared/workbook/schema";
import type { BookRow } from "@idk/shared/workbook/records";
import { cellText, type CellValue } from "@idk/shared/workbook/values";
import { tableRows } from "@idk/shared/workbook/store";
import { addRows, deleteRows } from "@idk/shared/workbook/rowOps";
import type { BookPort } from "../../book/bookPort.ts";
import type { BookState } from "../useBook.ts";
import { keysOf } from "../card/RowCard.tsx";
import { libKindOf } from "@idk/shared/library/model";
import { libraryApi } from "../libraryApi.ts";
import { sendToLibrary } from "../library.ts";
import { cellShown, editable, fillDownEdits, inRange, parseTsv, pasteEdits, rangeOf, rowWrites, toTsv, type CellEdit, type Pos } from "./gridModel.ts";

export interface TableGridProps {
  port: BookPort;
  state: BookState;
  table: TableName;
  /** Строки таблицы по порядку (уже отобранные, например кабели одного акта). */
  rows: BookRow[];
  /** Все столбцы, которые можно показать. */
  columns: ColumnDef[];
  /** Ключи столбцов, показанных по умолчанию (выбор пользователя помнится). */
  defaultVisible?: string[];
  /** Значения новой строки (акт, группа). */
  newRow?: () => Record<string, CellValue>;
  /** Значения по умолчанию новых строк книги (как в панели). */
  onRowsAdded?: (t: TableName, first: number, n: number) => Promise<void>;
  /** Ключ для запоминания столбцов. */
  storageKey: string;
  /** Открыть строку карточкой (сканы, дополнения). */
  onOpenRow?: (row: number) => void;
}

const load = (key: string): string[] | null => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
};
const save = (key: string, v: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* без памяти — по умолчанию */
  }
};

export function TableGrid(p: TableGridProps) {
  const { port, state, table, rows } = p;
  const vkey = `idk.grid.${p.storageKey}`;
  const [visible, setVisible] = useState<string[]>(() => load(vkey) ?? p.defaultVisible ?? p.columns.map((c) => c.key));
  const cols = useMemo(() => p.columns.filter((c) => visible.includes(c.key)), [p.columns, visible]);
  const [active, setActive] = useState<Pos>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [edit, setEdit] = useState<{ r: number; c: number; text: string } | null>(null);
  const [overlay, setOverlay] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ r: number; c: number; message: string }[]>([]);
  const [askDelete, setAskDelete] = useState(false);
  const [pickCols, setPickCols] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const important = state.important[table] ?? [];

  // Книга перечитана — свои значения уже в ней.
  useEffect(() => setOverlay(new Map()), [state.book]);
  const sel = rangeOf(anchor, active);
  const okey = (r: number, c: number) => `${rows[r]?.row ?? `new${r}`}:${cols[c]?.key}`;
  const text = (r: number, c: number) => {
    const o = overlay.get(okey(r, c));
    if (o !== undefined) return o;
    const row = rows[r];
    return row ? cellShown(cols[c], row.v[cols[c].key]) : "";
  };
  const optionsOf = (col: ColumnDef): string[] => {
    if (col.type === "enum") return [...(col.values ?? [])];
    if ((col.type === "ref" || col.type === "refs") && col.ref) return keysOf(state.book, col.ref);
    return [];
  };

  const focus = () => box.current?.focus({ preventScroll: true });
  const move = (r: number, c: number, extend = false) => {
    const nr = Math.max(0, Math.min(rows.length, r));
    const nc = Math.max(0, Math.min(cols.length - 1, c));
    setActive({ r: nr, c: nc });
    if (!extend) setAnchor({ r: nr, c: nc });
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-cell="${nr}:${nc}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  };

  /** Записать правки: строки за концом списка — новые строки книги сразу после последней строки списка. */
  const apply = async (edits: CellEdit[]) => {
    if (!edits.length) return;
    const { byRow, errors: bad } = rowWrites(table, edits, cols);
    setErrors(bad);
    const shown = new Map(overlay);
    for (const e of edits) if (!bad.some((b) => b.r === e.r && b.c === e.c)) shown.set(okey(e.r, e.c), e.text);
    setOverlay(shown);
    if (!byRow.size) return;
    setBusy(true);
    try {
      const fresh = [...byRow.keys()].filter((r) => r >= rows.length);
      const target = tableRows(port, table);
      let first = -1;
      if (fresh.length) {
        const n = Math.max(...fresh) - rows.length + 1;
        if (await port.isFiltered(table)) await port.clearFilters(table);
        const after = rows.length ? rows[rows.length - 1].row : null;
        first = await addRows(target, after, n);
        await p.onRowsAdded?.(table, first, n);
        const base = p.newRow?.() ?? {};
        for (let i = 0; i < n; i++) {
          const own = byRow.get(rows.length + i) ?? {};
          await port.write(table, first + i, { ...base, ...own });
        }
      }
      for (const [r, values] of byRow) if (r < rows.length) await port.write(table, rows[r].row, values);
      state.refresh();
    } catch (e) {
      setErrors([{ r: active.r, c: active.c, message: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  const editRef = useRef(edit);
  editRef.current = edit;
  const commitEdit = async (dr: number, dc: number) => {
    const e = editRef.current;
    if (!e) return;
    editRef.current = null;
    setEdit(null);
    if (e.text !== text(e.r, e.c)) await apply([{ r: e.r, c: e.c, text: e.text }]);
    move(e.r + dr, e.c + dc);
    focus();
  };

  const startEdit = (r: number, c: number, initial?: string) => {
    if (!cols[c] || !editable(cols[c])) return;
    const next = { r, c, text: initial ?? text(r, c) };
    editRef.current = next;
    setEdit(next);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== box.current) return;
    // Правка начата, а поле ввода ещё не появилось (быстрый набор): буквы — в правку, не теряются.
    if (editRef.current) {
      if (e.target === box.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const next = { ...editRef.current, text: editRef.current.text + e.key };
        editRef.current = next;
        setEdit(next);
      }
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === "ArrowDown") return (e.preventDefault(), move(active.r + 1, active.c, e.shiftKey));
    if (k === "ArrowUp") return (e.preventDefault(), move(active.r - 1, active.c, e.shiftKey));
    if (k === "ArrowRight") return (e.preventDefault(), move(active.r, active.c + 1, e.shiftKey));
    if (k === "ArrowLeft") return (e.preventDefault(), move(active.r, active.c - 1, e.shiftKey));
    if (k === "Tab") return (e.preventDefault(), move(active.r, active.c + (e.shiftKey ? -1 : 1)));
    if (k === "Enter" || k === "F2") return (e.preventDefault(), startEdit(active.r, active.c));
    if (k === "Escape") return setAnchor(active);
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      const edits: CellEdit[] = [];
      for (let r = sel.r1; r <= Math.min(sel.r2, rows.length - 1); r++)
        for (let c = sel.c1; c <= sel.c2; c++) if (editable(cols[c])) edits.push({ r, c, text: "" });
      return void apply(edits);
    }
    if (ctrl && (k === "d" || k === "в" || k === "D" || k === "В")) {
      e.preventDefault();
      return void apply(fillDownEdits({ ...sel, r2: Math.min(sel.r2, rows.length - 1) }, text, cols));
    }
    if (ctrl && (k === "a" || k === "ф")) {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setActive({ r: Math.max(0, rows.length - 1), c: cols.length - 1 });
      return;
    }
    if (!ctrl && !e.altKey && k.length === 1) {
      e.preventDefault();
      startEdit(active.r, active.c, k);
    }
  };

  const onCopy = (e: ClipboardEvent<HTMLDivElement>) => {
    if (edit) return;
    e.preventDefault();
    const out: string[][] = [];
    for (let r = sel.r1; r <= Math.min(sel.r2, rows.length - 1); r++) {
      const line: string[] = [];
      for (let c = sel.c1; c <= sel.c2; c++) line.push(text(r, c));
      out.push(line);
    }
    e.clipboardData.setData("text/plain", toTsv(out));
  };
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (edit) return;
    e.preventDefault();
    const block = parseTsv(e.clipboardData.getData("text/plain"));
    if (!block.length) return;
    void apply(pasteEdits(block, { r: sel.r1, c: sel.c1 }, cols, sel));
  };

  const addN = async (n: number) => {
    setBusy(true);
    try {
      const target = tableRows(port, table);
      if (await port.isFiltered(table)) await port.clearFilters(table);
      const first = await addRows(target, rows.length ? rows[rows.length - 1].row : null, n);
      await p.onRowsAdded?.(table, first, n);
      const base = p.newRow?.() ?? {};
      if (Object.keys(base).length) for (let i = 0; i < n; i++) await port.write(table, first + i, base);
      state.refresh();
      move(rows.length, 0);
    } catch (e) {
      setErrors([{ r: 0, c: 0, message: (e as Error).message }]);
    } finally {
      setBusy(false);
      focus();
    }
  };
  const selectedRows = () => {
    const out: number[] = [];
    for (let r = sel.r1; r <= Math.min(sel.r2, rows.length - 1); r++) out.push(rows[r].row);
    return out;
  };
  const remove = async () => {
    setAskDelete(false);
    setBusy(true);
    try {
      await deleteRows(tableRows(port, table), selectedRows());
      state.refresh();
      move(Math.min(sel.r1, Math.max(0, rows.length - 2)), active.c);
    } catch (e) {
      setErrors([{ r: 0, c: 0, message: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleCol = (key: string) => {
    const next = visible.includes(key) ? visible.filter((k) => k !== key) : p.columns.map((c) => c.key).filter((k) => k === key || visible.includes(k));
    if (!next.length) return;
    setVisible(next);
    save(vkey, next);
  };

  const nSel = selectedRows().length;
  // «В библиотеку» (как в панели): выделенные строки — в библиотеку компании.
  const libKind = libKindOf(table);
  const [libNote, setLibNote] = useState("");
  const toLibrary = async () => {
    if (!state.book) return;
    setBusy(true);
    setLibNote("");
    try {
      const r = await sendToLibrary(state.book, table, selectedRows(), libraryApi);
      setLibNote(`В библиотеке: добавлено ${r.added}, обновлено ${r.updated}${r.empty ? `, пропущено пустых ${r.empty}` : ""}.`);
    } catch (e) {
      setErrors([{ r: 0, c: 0, message: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };
  const cellError = (r: number, c: number) => errors.find((x) => x.r === r && x.c === c);
  return (
    <div className="grid-wrap">
      <div className="grid-tools">
        <button className="btn" disabled={busy} onClick={() => void addN(1)}>
          + 1
        </button>
        <button className="btn" disabled={busy} onClick={() => void addN(10)}>
          + 10
        </button>
        <button className="btn bk-del" disabled={busy || !nSel} onClick={() => setAskDelete(true)} title="Удалить выделенные строки">
          Удалить строки{nSel > 1 ? ` (${nSel})` : ""}
        </button>
        {p.onOpenRow && rows[active.r] && (
          <button className="btn" onClick={() => p.onOpenRow!(rows[active.r].row)} title="Открыть строку карточкой: сканы и дополнения">
            Карточка строки
          </button>
        )}
        {libKind && (
          <button
            className="btn"
            disabled={busy || !nSel}
            onClick={() => void toLibrary()}
            title="Сохранить выделенные строки в библиотеку компании (документ — со сканом)"
          >
            В библиотеку{nSel > 1 ? ` (${nSel})` : ""}
          </button>
        )}
        {libNote && <span className="muted">{libNote}</span>}
        <span className="grid-tools-gap" />
        <button className="btn btn-ghost" onClick={() => setPickCols((v) => !v)} aria-expanded={pickCols}>
          Столбцы ({cols.length} из {p.columns.length})
        </button>
        <span className="muted grid-hint">Ctrl+V — вставить из Excel · Ctrl+D — заполнить вниз · Delete — очистить · Enter — править</span>
      </div>
      {pickCols && (
        <div className="grid-cols">
          {p.columns.map((c) => (
            <label key={c.key}>
              <input type="checkbox" checked={visible.includes(c.key)} onChange={() => toggleCol(c.key)} /> {c.header}
            </label>
          ))}
        </div>
      )}
      {askDelete && (
        <div className="confirm" role="alertdialog" aria-label="Удаление строк">
          <p>Удалить строк: {nSel}? Их нельзя будет вернуть кнопкой «Отменить» Excel.</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => void remove()}>
              Удалить
            </button>
            <button className="btn" onClick={() => setAskDelete(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <p className="error" role="alert">
          {errors
            .slice(0, 3)
            .map((x) => `строка ${x.r + 1}: ${x.message}`)
            .join("; ")}
          {errors.length > 3 ? ` и ещё ${errors.length - 3}` : ""}
        </p>
      )}
      <div
        ref={box}
        className={`grid${busy ? " grid-busy" : ""}`}
        tabIndex={0}
        role="grid"
        aria-label={`Таблица «${table}»`}
        aria-rowcount={rows.length + 1}
        onKeyDown={onKey}
        onCopy={onCopy}
        onPaste={onPaste}
      >
        <table>
          <thead>
            <tr>
              <th className="grid-n">№</th>
              {cols.map((c) => (
                <th key={c.key} style={{ minWidth: `${Math.max(5, Math.min(c.width ?? 12, 40)) * 0.6}em` }} title={c.hint ?? c.header}>
                  {important.includes(c.header) && <span className="grid-imp" aria-label="важный столбец" />}
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows, null].map((row, r) => (
              <tr key={row ? row.row : "new"} className={row ? undefined : "grid-new"}>
                <th
                  className="grid-n"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (e.shiftKey) setActive({ r, c: cols.length - 1 });
                    else {
                      setAnchor({ r, c: 0 });
                      setActive({ r, c: cols.length - 1 });
                    }
                    focus();
                  }}
                >
                  {row ? r + 1 : "+"}
                </th>
                {cols.map((col, c) => {
                  const on = active.r === r && active.c === c;
                  const isEdit = edit && edit.r === r && edit.c === c;
                  const val = text(r, c);
                  const err = cellError(r, c);
                  const empty = row && important.includes(col.header) && !cellText(row.v[col.key] ?? null) && !val;
                  const cls = [
                    on ? "grid-on" : "",
                    inRange(sel, r, c) && (sel.r1 !== sel.r2 || sel.c1 !== sel.c2) ? "grid-sel" : "",
                    !editable(col) ? "grid-ro" : "",
                    empty ? "grid-empty" : "",
                    err ? "grid-err" : "",
                    col.type === "number" || col.type === "int" || col.type === "formula" ? "grid-num" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td
                      key={col.key}
                      data-cell={`${r}:${c}`}
                      className={cls}
                      title={err?.message ?? (val.length > 30 ? val : undefined)}
                      onMouseDown={(e) => {
                        if (isEdit) return;
                        e.preventDefault();
                        if (edit) void commitEdit(0, 0);
                        if (e.shiftKey) setActive({ r, c });
                        else move(r, c);
                        focus();
                      }}
                      onDoubleClick={() => startEdit(r, c)}
                    >
                      {isEdit ? (
                        <>
                          <input
                            autoFocus
                            className="grid-input"
                            value={edit.text}
                            list={optionsOf(col).length ? `grid-opt-${col.key}` : undefined}
                            onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                            onKeyDown={(e) => {
                              // Клавиши поля ввода — не таблице (иначе Enter снова открыл бы правку).
                              e.stopPropagation();
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void commitEdit(1, 0);
                              } else if (e.key === "Tab") {
                                e.preventDefault();
                                void commitEdit(0, e.shiftKey ? -1 : 1);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setEdit(null);
                                focus();
                              }
                            }}
                            onBlur={() => void commitEdit(0, 0)}
                          />
                          {optionsOf(col).length > 0 && (
                            <datalist id={`grid-opt-${col.key}`}>
                              {optionsOf(col).map((o) => (
                                <option key={o} value={o} />
                              ))}
                            </datalist>
                          )}
                        </>
                      ) : (
                        val
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
