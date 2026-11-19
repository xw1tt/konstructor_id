// 0.40: замечания в окне программы — таблицей: значок, сообщение, место в книге (лист · строка · столбец), акт, переход.
import type { BookPort } from "../book/bookPort.ts";
import type { IssueLine } from "./print.ts";

export interface IssueItem {
  line: IssueLine;
  act?: string;
  level: "critical" | "warn";
}

export const IssueIcon = ({ level }: { level: "critical" | "warn" | "ok" }) =>
  level === "critical" ? (
    <svg className="ii ii-critical" viewBox="0 0 20 20" width="18" height="18" aria-label="не собирается">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ) : level === "warn" ? (
    <svg className="ii ii-warn" viewBox="0 0 20 20" width="18" height="18" aria-label="замечание">
      <path d="M10 2.5l8 14.5H2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 8v4.2M10 14.6v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ) : (
    <svg className="ii ii-ok" viewBox="0 0 20 20" width="18" height="18" aria-label="готов">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 10.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

/** Место в книге: «ВОР · стр. 7 · «Материал»». */
export function placeText(l: IssueLine): string {
  return [l.sheet ?? l.table, l.sheetRow != null ? `стр. ${l.sheetRow}` : null, l.column ? `«${l.column}»` : null].filter(Boolean).join(" · ");
}

export function IssueTable({ port, items, compact = false }: { port: BookPort; items: IssueItem[]; compact?: boolean }) {
  if (!items.length) return null;
  const go = (l: IssueLine) => void port.selectCell(l.table, l.row, l.table === "Объект" ? "Значение" : l.column);
  return (
    <ul className={`it${compact ? " it-compact" : ""}`}>
      {items.map((x, i) => (
        <li key={i}>
          <button className="it-row" onClick={() => go(x.line)} title="Перейти к ячейке в Excel">
            <IssueIcon level={x.level} />
            <span className="it-msg">{x.line.message ?? x.line.text}</span>
            <span className="it-place mono">{placeText(x.line)}</span>
            {x.act && <span className="it-act mono">№ {x.act}</span>}
            <span className="it-go" aria-hidden="true">
              ↗
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
