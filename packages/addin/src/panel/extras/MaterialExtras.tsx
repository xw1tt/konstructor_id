// Дополнение карточки материала: его документы качества и добавление нового документа.
import { useState } from "react";
import { cellText } from "@idk/shared/workbook/values";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { docsOfMaterial } from "./summaries.ts";

export function MaterialExtras({ port, state, name }: { port: ExcelPort; state: BookState; name: string }) {
  const [error, setError] = useState("");
  if (!name || !state.book) return null;
  const docs = docsOfMaterial(state.book, name);

  const add = async () => {
    try {
      const t = await port.read("ДокументыКачества");
      if (!t) throw new Error("Таблица «ДокументыКачества» не найдена");
      const emptyOnly = t.rows.length === 1 && t.rows[0].every((v) => cellText(v) === "");
      const index = emptyOnly ? 0 : t.rows.length;
      await port.insert("ДокументыКачества", index, [{ "Материалы": name }]);
      await port.selectCell("ДокументыКачества", index, "Тип");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="extras">
      <h3 className="tools-title">Документы качества ({docs.length})</h3>
      <ul className="list">
        {docs.map((d) => (
          <li key={d.row}>
            <button className="link" onClick={() => void port.selectCell("ДокументыКачества", d.row, "Номер")}>
              {cellText(d.v.type) || "—"} {cellText(d.v.number)}
            </button>
          </li>
        ))}
      </ul>
      <div className="row-actions"><button className="btn" onClick={() => void add()}>Добавить документ</button></div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
