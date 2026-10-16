// Панель «Конструктор ИД»: разделы (листы книги), «Функционал листа», «Функционал таблицы», карточка строки.
import { useState, type ReactNode } from "react";
import { TABLE_NAMES, type TableName } from "@idk/shared/workbook/schema";
import type { ExcelPort } from "../book/excelPort.ts";
import { ServerDownContext } from "../server.tsx";
import { SECTIONS, sectionForSheet } from "./sections.ts";
import { useBook, type BookState } from "./useBook.ts";
import { SheetTools } from "./SheetTools.tsx";
import { TableTools } from "./TableTools.tsx";

export interface PanelSlots {
  /** Экран создания книги (нет ни одной таблицы программы) и восстановления разметки. */
  create?: (state: BookState, missing: TableName[]) => ReactNode;
  /** Карточка текущей строки. */
  card?: (state: BookState) => ReactNode;
  onRowsAdded?: (state: BookState, table: TableName, first: number, n: number) => Promise<void>;
}

export function Panel({ port, slots = {} }: { port: ExcelPort; slots?: PanelSlots }) {
  const host = port.host();
  if (host !== "ok") {
    return (
      <div className="app">
        <Header />
        <p className="banner" role="alert">
          {host === "old"
            ? "Нужен Excel 2019, 2021 или Microsoft 365. В этой версии Excel панель работать не может."
            : "Панель открыта вне Excel или не загрузилась библиотека Office.js (нужно подключение к интернету). Откройте панель в Excel."}
        </p>
      </div>
    );
  }
  return <Supported port={port} slots={slots} />;
}

function Header() {
  return (
    <header className="app-head">
      <h1 className="app-title">Конструктор ИД</h1>
    </header>
  );
}

function Supported({ port, slots }: { port: ExcelPort; slots: PanelSlots }) {
  const state = useBook(port);
  const [serverDown, setServerDown] = useState(false);
  const { book, selection } = state;
  const active = selection ? sectionForSheet(selection.sheet) : null;
  const allMissing = !!book && book.missing.length === TABLE_NAMES.length;

  return (
    <ServerDownContext.Provider value={() => setServerDown(true)}>
      <div className="app">
        <Header />
        {serverDown && (
          <div className="banner" role="alert">
            <p>Сервер не запущен: листы работают, печать и сканы недоступны. Запустите «Конструктор ИД» на компьютере.</p>
            <button className="btn" onClick={() => setServerDown(false)}>Скрыть</button>
          </div>
        )}
        {state.error && <p className="error" role="alert">{state.error}</p>}
        {!book ? <p className="notice">Читаю книгу…</p> : allMissing ? slots.create?.(state, book.missing) : (
          <>
            <nav className="stamp" role="tablist" aria-label="Разделы">
              {SECTIONS.map((s) => (
                <button key={s.id} role="tab" aria-selected={s.id === active} onClick={() => void port.activateSheet(s.sheets[0])}>
                  {s.label}
                </button>
              ))}
            </nav>
            {book.missing.length > 0 && slots.create?.(state, book.missing)}
            <main className="content">
              <SheetTools port={port} state={state} onRowsAdded={slots.onRowsAdded && ((t, f, n) => slots.onRowsAdded!(state, t, f, n))} />
              <TableTools port={port} state={state} />
              {slots.card?.(state)}
            </main>
          </>
        )}
      </div>
    </ServerDownContext.Provider>
  );
}
