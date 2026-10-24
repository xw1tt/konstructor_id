// План 12, задача 7: блок «Полнота» карточки акта — какие документы нужны акту (по «Виду работ») и что из них есть.
import { useContext, useState } from "react";
import { actDocs, completeness, docCode, type Status } from "@idk/shared/catalog/need";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { UserTemplateContext } from "../templateContext.ts";
import { CatalogContext, skipDoc, statusText } from "../catalogApi.ts";

const MARK: Record<Status, string> = { print: "✓", scan: "✓", noScan: "✗", noForm: "✗" };

export function Completeness({ port, state, act }: { port: ExcelPort; state: BookState; act: string }) {
  const catalog = useContext(CatalogContext);
  const { template } = useContext(UserTemplateContext);
  const [error, setError] = useState("");
  if (!state.book) return null;
  if (!catalog) return <p className="muted">Полнота: справочник ещё не загружен с сервера.</p>;
  const list = completeness(template, catalog, state.book, act);
  const { unknown } = actDocs(template, catalog, state.book, act);
  const skip = async (code: string) => {
    setError("");
    try { await skipDoc(port, state.book!, act, code); state.refresh(); } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <h3 className="tools-title">Полнота</h3>
      {unknown.length > 0 && (
        <p className="warn" role="status">Нет в справочнике: {unknown.join("; ")} — для этих видов работ документы не подобраны.</p>
      )}
      {list.length === 0 ? <p className="muted">Шаблону не нужны документы для этого акта.</p> : (
        <ul className="list completeness" aria-label="Полнота акта">
          {list.map((s) => (
            <li key={docCode(s.doc)}>
              <span className={s.status === "noScan" || s.status === "noForm" ? "warn" : "ok"}>
                {MARK[s.status]} {statusText(s.status, s.label)}{s.status === "noScan" ? ` (№${s.number} в «Реестре ИД»)` : ""}
              </span>{" "}
              <button className="btn btn-link" onClick={() => void skip(docCode(s.doc))} title="Записать код в «Без документов»">не нужен для этого акта</button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
