// Дополнение карточки исполнительной схемы: ведомость объёмов на этом листе и передача листа в AutoCAD
// (плагин вставляет ведомость в чертёж и заполняет основную надпись).
import { useState } from "react";
import { column } from "@idk/shared/workbook/schema";
import { proposeSheetRows, sheetJob, sheetRows } from "@idk/shared/scheme/sheetJob";
import type { ExcelPort } from "../../book/excelPort.ts";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { sheetIssueLines, type IssueLine } from "../print.ts";
import { IssueList } from "./IssueList.tsx";

const H = (key: string) => column("ВедомостиСхем", key).header;
const qty = (v: unknown) => String(v ?? "").replace(".", ",");

export function SchemeExtras({ port, state, act, number }: { port: ExcelPort; state: BookState; act: string; number: string }) {
  const guard = useGuard();
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!state.book) return null;
  if (!act || !number) return <p className="muted extras">Укажите акт и номер схемы — появится ведомость объёмов на листе.</p>;
  const rows = sheetRows(state.book, act, number);

  const fill = async () => {
    setNote(null);
    const proposed = proposeSheetRows(state.book!, act, number);
    if (!proposed.length) { setNote({ text: "Остатков по материалам акта нет: всё уже разнесено по схемам акта." }); return; }
    const have = new Set(rows.map((r) => String(r.v.material ?? "").trim()));
    const add = proposed.filter((p) => !have.has(p.material));
    if (!add.length) { setNote({ text: "Все материалы акта уже есть в ведомости схемы." }); return; }
    const t = await port.read("ВедомостиСхем");
    if (!t) { setNote({ text: "Нет таблицы «Ведомости схем» — нажмите «Обновить разметку».", error: true }); return; }
    if (await port.isFiltered("ВедомостиСхем")) await port.clearFilters("ВедомостиСхем");
    await port.insert("ВедомостиСхем", t.rows.length, add.map((p) => ({
      [H("act")]: act, [H("scheme")]: number, [H("material")]: p.material, [H("quantity")]: p.quantity,
    })));
    setNote({ text: `Добавлено строк: ${add.length}. Оставьте только то, что изображено на этом листе, и поправьте количества.` });
    state.refresh();
  };

  const send = async () => {
    setNote(null);
    setLines([]);
    const { job, issues } = sheetJob(state.book!, act, number);
    if (!job) { setLines(await sheetIssueLines(port, issues)); return; }
    setBusy(true);
    const ok = await guard(apiSend("POST", "/api/acad/sheet", job), (m) => setNote({ text: m, error: true }));
    setBusy(false);
    if (ok) setNote({ text: `Схема ${job.number} передана. В AutoCAD на листе с рамкой: IDKVED — ведомость, IDKSTAMP — основная надпись.` });
  };

  return (
    <div className="extras">
      <h3 className="tools-title">Ведомость объёмов на листе схемы {number}</h3>
      {rows.length ? (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.row}>
              <button className="link" onClick={() => void port.selectCell("ВедомостиСхем", r.row, H("quantity"))}>
                {String(r.v.material ?? "")} — {qty(r.v.quantity)}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Пусто. Заполните из материалов акта и оставьте то, что изображено на этом листе.</p>}
      <div className="row-actions">
        <button className="btn" onClick={() => void fill()}>Заполнить из материалов акта</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>{busy ? "Передаю…" : "В AutoCAD"}</button>
      </div>
      <IssueList port={port} lines={lines} title="Не передать схему в AutoCAD:" />
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
