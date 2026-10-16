// Экран «Норматив»: реестр нормативов книги (лист «Нормативы») и переход на официальный портал.
// Тексты нормативов программа не хранит: страница открывается напрямую с protect.gost.ru.
import { useState, type ReactNode } from "react";
import { cellText } from "@idk/shared/workbook/values";
import { portalTarget } from "@idk/shared/normativ";
import { collectFromActs, filterNormativ, insertIntoP6 } from "@idk/shared/workbook/normativActions";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { normativState } from "./normativState.ts";
import { openPortal } from "./portal.ts";

export function NormativScreen({ port, state, restore }: { port: ExcelPort; state: BookState; restore: ReactNode }) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<{ row: number | null; text: string; error?: boolean } | null>(null);
  const book = state.book;
  if (!book) return <p className="notice">Читаю книгу…</p>;
  const mode = normativState(book);

  const run = async (row: number | null, fn: () => Promise<string>) => {
    setNote(null);
    try { setNote({ row, text: await fn() }); } catch (e) { setNote({ row, text: (e as Error).message, error: true }); }
  };

  const rows = filterNormativ(book.tables["Нормативы"] ?? [], query);
  const act = state.lastAct;

  return (
    <main className="content">
      <h2 className="app-title">Реестр нормативов</h2>
      <p className="muted">
        Программа не хранит и не распространяет тексты нормативов. Документы открываются напрямую с официального
        портала protect.gost.ru; окно лишь показывает страницы, полученные порталом для вашей сессии.
      </p>
      {mode === "missing" ? restore : (
        <>
          <div className="row-actions">
            <button className="btn" onClick={() => void run(null, async () => {
              const n = await collectFromActs(port, book);
              state.refresh();
              return `Добавлено: ${n}`;
            })}>Собрать из актов</button>
            <button className="btn" onClick={() => void port.activateSheet("Нормативы")}>Открыть лист</button>
          </div>
          {note?.row === null && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
          <input className="search" type="search" placeholder="Поиск по обозначению и наименованию" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по реестру" />
          {mode === "empty" && <p className="notice">Реестр пуст. Нажмите «Собрать из актов» или заполните лист «Нормативы».</p>}
          <ul className="list norm-list">
            {rows.map((r) => {
              const designation = cellText(r.v.designation);
              const target = portalTarget({ designation, kind: cellText(r.v.kind), link: cellText(r.v.link) });
              return (
                <li key={r.row} className="norm-row">
                  <button className="link" onClick={() => void port.selectCell("Нормативы", r.row, "Обозначение")}>
                    <strong>{designation || "—"}</strong> {cellText(r.v.title)}
                  </button>
                  <span className="muted"> {cellText(r.v.status)}</span>
                  <div className="row-actions">
                    <button className="btn btn-small" disabled={!target.ok} title={target.ok ? target.url : target.message}
                      onClick={() => target.ok && openPortal(target.url)}>Открыть на портале</button>
                    <button className="btn btn-small" disabled={!act || !designation}
                      title={act ? `Добавить в п.6 акта ${act}` : "Выделите строку акта на листе «База актов»"}
                      onClick={() => act && void run(r.row, async () => {
                        const res = await insertIntoP6(port, book, act, designation);
                        if (!res.ok) throw new Error(res.message);
                        state.refresh();
                        return `Добавлено в п.6 акта ${act}`;
                      })}>{act ? `Вставить в п.6 акта ${act}` : "Вставить в п.6"}</button>
                  </div>
                  {!target.ok && <p className="muted">{target.message}</p>}
                  {note?.row === r.row && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
