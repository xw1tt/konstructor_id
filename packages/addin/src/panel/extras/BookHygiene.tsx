// 0.51: «Проверить книгу целиком» — чистота данных (лишние пробелы, чужие акты, дубли, перерасход, опечатки в номерах,
// смешанные буквы). Щелчок по строке — к ячейке; лишние пробелы убираются одной кнопкой.
import { useEffect, useState } from "react";
import { checkBook, fixSpaces, spaceCells } from "@idk/shared/check/hygiene";
import { readBook } from "@idk/shared/workbook/records";
import type { BookPort } from "../../book/bookPort.ts";
import type { BookState } from "../useBook.ts";
import { sheetIssueLines, type IssueLine } from "../print.ts";
import { IssueList } from "./IssueList.tsx";

export function BookHygiene({ port, state, trigger }: { port: BookPort; state: BookState; trigger: number }) {
  const [lines, setLines] = useState<IssueLine[] | null>(null);
  const [spaces, setSpaces] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const run = async () => {
    setBusy(true);
    try {
      const book = await readBook(port);
      setSpaces(spaceCells(book).length);
      setLines(await sheetIssueLines(port, checkBook(book)));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (trigger > 0) void run();
  }, [trigger]);
  const fix = async () => {
    setBusy(true);
    try {
      const n = await fixSpaces(port, await readBook(port));
      setNote(`Лишние пробелы убраны: ${n}.`);
      state.refresh();
    } finally {
      setBusy(false);
    }
    await run();
  };
  if (!lines) return busy ? <p className="muted">Проверяю книгу…</p> : null;
  return (
    <div className="predelivery">
      {spaces > 0 && (
        <div className="row-actions">
          <button className="btn btn-primary" disabled={busy} onClick={() => void fix()}>
            Убрать лишние пробелы ({spaces})
          </button>
          <span className="muted">в начале и в конце текстов на всех листах (формулы и сканы не трогаются)</span>
        </div>
      )}
      {note && <p className="notice">{note}</p>}
      {!lines.length ? (
        <p className="notice" role="status">
          Данные книги в порядке.
        </p>
      ) : (
        <IssueList port={port} lines={lines} tone="warn" title={`Данные книги — ${lines.length} замечаний:`} />
      )}
    </div>
  );
}
