// Список ошибок проверки: каждая строка — ссылка на ячейку книги.
import type { ExcelPort } from "../../book/excelPort.ts";
import type { IssueLine } from "../print.ts";

export function IssueList({ port, lines, title, tone }: { port: ExcelPort; lines: IssueLine[]; title: string; tone?: "warn" }) {
  if (!lines.length) return null;
  return (
    <div className={"issues" + (tone === "warn" ? " issues-warn" : "")} role={tone === "warn" ? "status" : "alert"}>
      <p>{title}</p>
      <ul className="list">
        {lines.map((l, i) => (
          <li key={i}>
            <button className="link" onClick={() => void port.selectCell(l.table, l.row, l.table === "Объект" ? "Значение" : l.column)}>{l.text}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
