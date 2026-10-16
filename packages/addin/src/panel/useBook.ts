// Состояние панели, синхронизированное с книгой через события Excel. Копии данных панель не хранит:
// выделение и текущая таблица перечитываются при смене выделения, вся книга — при изменении ячеек.
import { useCallback, useEffect, useRef, useState } from "react";
import type { TableName } from "@idk/shared/workbook/schema";
import type { TableData } from "@idk/shared/workbook/store";
import { readBook, type Book } from "@idk/shared/workbook/records";
import { loadImportant, type ImportantMap } from "@idk/shared/workbook/important";
import type { ChangeEvent, ExcelPort, Selection } from "../book/excelPort.ts";
import { tablesOnSheet } from "./tableTools.ts";

export interface BookState {
  selection: Selection | null;
  /** Таблица под курсором, а вне таблицы — выбранная в «Функционале таблицы». */
  table: TableData | null;
  book: Book | null;
  important: ImportantMap;
  error: string;
  pickTable(t: TableName | null): void;
  refresh(): void;
  /** Подписка на изменения ячеек (для переименования ключей). */
  onCellChange(cb: (e: ChangeEvent) => void): () => void;
}

const DEBOUNCE_MS = 150;

export function useBook(port: ExcelPort): BookState {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [table, setTable] = useState<TableData | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [important, setImportant] = useState<ImportantMap>({});
  const [error, setError] = useState("");
  const picked = useRef<TableName | null>(null);
  const listeners = useRef(new Set<(e: ChangeEvent) => void>());
  const timers = useRef<{ sel?: ReturnType<typeof setTimeout>; all?: ReturnType<typeof setTimeout> }>({});

  const readSelection = useCallback(async () => {
    try {
      const s = await port.getSelection();
      setSelection(s);
      const onSheet = tablesOnSheet(s.sheet);
      if (s.table) picked.current = null;
      const name = s.table ?? (picked.current && onSheet.includes(picked.current) ? picked.current : onSheet[0] ?? null);
      setTable(name ? await port.read(name) : null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [port]);

  const readAll = useCallback(async () => {
    try {
      setBook(await readBook(port));
      setImportant(await loadImportant(port));
    } catch (e) {
      setError((e as Error).message);
    }
    await readSelection();
  }, [port, readSelection]);

  const later = (key: "sel" | "all", fn: () => void) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, DEBOUNCE_MS);
  };

  useEffect(() => {
    let off: (() => Promise<void>)[] = [];
    let alive = true;
    void readAll();
    void (async () => {
      const a = await port.onSelection(() => later("sel", () => void readSelection()));
      const b = await port.onChange((e) => {
        for (const l of listeners.current) l(e);
        later("all", () => void readAll());
      });
      if (alive) off = [a, b];
      else { void a(); void b(); }
    })().catch((e) => setError((e as Error).message));
    return () => { alive = false; for (const f of off) void f(); };
  }, [port, readAll, readSelection]);

  return {
    selection, table, book, important, error,
    pickTable: (t) => { picked.current = t; void readSelection(); },
    refresh: () => void readAll(),
    onCellChange: (cb) => { listeners.current.add(cb); return () => listeners.current.delete(cb); },
  };
}
