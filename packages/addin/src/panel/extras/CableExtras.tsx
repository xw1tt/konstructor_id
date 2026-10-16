// Дополнение карточки кабельного журнала: итог длин по акту, переход на лист «Изоляция», сбор марок.
import { useState } from "react";
import { collectMarks } from "@idk/shared/workbook/cables";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { cableTotal } from "./summaries.ts";

export function CableExtras({ port, state, act }: { port: ExcelPort; state: BookState; act: string }) {
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  if (!state.book) return null;
  const collect = async () => {
    setNote(null);
    try {
      const n = await collectMarks(port, state.book!);
      setNote({ text: `Добавлено марок: ${n}` });
      state.refresh();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    }
  };
  return (
    <div className="extras">
      {act && <p className="muted">Длина кабеля по акту {act}: {String(cableTotal(state.book, act)).replace(".", ",")} м</p>}
      <div className="row-actions">
        <button className="btn" onClick={() => void port.activateSheet("Изоляция")}>Изоляция</button>
        <button className="btn" onClick={() => void collect()}>Собрать марки из журнала</button>
      </div>
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
