// Состояние панели, синхронизированное с книгой через события Excel. Копии данных панель не хранит:
// выделение и текущая таблица перечитываются при смене выделения, вся книга — при изменении ячеек.
import { useCallback, useEffect, useRef, useState } from "react";
import { column, SCHEMA_VERSION, TABLE_NAMES, type TableName } from "@idk/shared/workbook/schema";
import { cellText } from "@idk/shared/workbook/values";
import type { TableData } from "@idk/shared/workbook/store";
import type { Book } from "@idk/shared/workbook/records";
import { BookCache } from "./bookCache.ts";
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
  /** Разметка книги прежней версии (idk.version меньше SCHEMA_VERSION) — нужно «Обновить разметку». */
  outdated: boolean;
  /** Номер акта последней выделенной строки «Базы актов» (для «Вставить в п.6»). */
  lastAct: string | null;
  pickTable(t: TableName | null): void;
  refresh(): void;
  /** Подписка на изменения ячеек (для переименования ключей). */
  onCellChange(cb: (e: ChangeEvent) => void): () => void;
}

const DEBOUNCE_MS = 150;
/** Выделение и смена листа — короче: панель должна успевать за пользователем. */
const SELECTION_DEBOUNCE_MS = 40;
export const VERSION_SETTING = "idk.version";

/** Книга размечена прежней версией программы (нет отметки — тоже прежняя: отметку пишет «Создать/Обновить разметку»). */
export const isOutdated = (v: string | null) => v !== null && Number(v) < SCHEMA_VERSION;

export function useBook(port: ExcelPort): BookState {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [table, setTable] = useState<TableData | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [important, setImportant] = useState<ImportantMap>({});
  const [error, setError] = useState("");
  const [lastAct, setLastAct] = useState<string | null>(null);
  const [outdated, setOutdated] = useState(false);
  const picked = useRef<TableName | null>(null);
  const listeners = useRef(new Set<(e: ChangeEvent) => void>());
  const timers = useRef<{ sel?: ReturnType<typeof setTimeout>; all?: ReturnType<typeof setTimeout> }>({});
  // Таблицы, прочитанные для карточки, до первого изменения ячеек: переход между строками и листами не перечитывает
  // таблицу целиком (со ссылками сканов это долго).
  const cache = useRef(new Map<TableName, TableData | null>());
  const seq = useRef(0);
  /** План 15: таблицы книги; после правки перечитываются только изменённые. */
  const books = useRef<BookCache | null>(null);
  if (!books.current) books.current = new BookCache(port);
  /** Таблицы изменённых ячеек с последнего перечитывания (null — изменение вне наших таблиц). */
  const changed = useRef<(TableName | null)[] | "all">("all");

  const readSelection = useCallback(async () => {
    const my = ++seq.current;
    try {
      const s = await port.getSelection();
      if (my !== seq.current) return; // пришло более новое выделение
      setSelection(s);
      const onSheet = tablesOnSheet(s.sheet);
      if (s.table) picked.current = null;
      const name = s.table ?? (picked.current && onSheet.includes(picked.current) ? picked.current : onSheet[0] ?? null);
      let data: TableData | null = null;
      if (name) {
        if (!cache.current.has(name)) cache.current.set(name, await port.read(name));
        data = cache.current.get(name) ?? null;
      }
      if (my !== seq.current) return;
      setTable(data);
      if (s.table === "Акты" && s.row !== null && data) {
        const n = cellText(data.rows[s.row]?.[data.headers.indexOf(column("Акты", "baseNumber").header)] ?? null);
        if (n) setLastAct(n);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [port]);

  const readAll = useCallback(async (all = true) => {
    cache.current.clear();
    const what = all ? "all" : changed.current;
    changed.current = [];
    try {
      const c = books.current!;
      setBook(what === "all" ? await c.full() : await c.refresh(what));
      // Прочитанные таблицы — сразу и для карточки строки.
      for (const n of TABLE_NAMES) { const t = c.table(n); if (t !== undefined) cache.current.set(n, t); }
      setImportant(await loadImportant(port));
      setOutdated(isOutdated(await port.setting(VERSION_SETTING)));
    } catch (e) {
      setError((e as Error).message);
    }
    await readSelection();
  }, [port, readSelection]);

  const later = (key: "sel" | "all", fn: () => void) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, key === "sel" ? SELECTION_DEBOUNCE_MS : DEBOUNCE_MS);
  };

  useEffect(() => {
    let off: (() => Promise<void>)[] = [];
    let alive = true;
    void readAll();
    void (async () => {
      const a = await port.onSelection(() => later("sel", () => void readSelection()));
      const b = await port.onChange((e) => {
        cache.current.clear(); // карточка не должна показать старые значения до перечитывания книги
        // Блок через несколько ячеек мог задеть соседнюю таблицу листа — тогда перечитать всё.
        if (changed.current !== "all") changed.current.push(e.multi ? null : e.table);
        for (const l of listeners.current) l(e);
        later("all", () => void readAll(false));
      });
      if (alive) off = [a, b];
      else { void a(); void b(); }
    })().catch((e) => setError((e as Error).message));
    return () => { alive = false; for (const f of off) void f(); };
  }, [port, readAll, readSelection]);

  return {
    selection, table, book, important, error, lastAct, outdated,
    pickTable: (t) => { picked.current = t; void readSelection(); },
    refresh: () => void readAll(),
    onCellChange: (cb) => { listeners.current.add(cb); return () => listeners.current.delete(cb); },
  };
}
