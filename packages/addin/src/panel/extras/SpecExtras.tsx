// Спецификация проекта: загрузка из РКЦ с предпросмотром, лист «Закрытие по актам», карточка позиции, подбор № п/п.
import { useState } from "react";
import { mergeSpec, applySpec } from "@idk/shared/spec/merge";
import type { RkcItem } from "@idk/shared/spec/rkc";
import { specClosed, positionOfMaterial, closedReport, CLOSED_SHEET } from "@idk/shared/spec/closed";
import { matchSpec, applyMatches, type SpecMatch } from "@idk/shared/spec/match";
import type { ExcelPort } from "../../book/excelPort.ts";
import { apiGet, apiUploadRkc } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import type { BookState } from "../useBook.ts";
import { diffText, positionLines, matchLine } from "../spec.ts";

type Note = { text: string; error?: boolean } | null;
interface Parsed { sheet: string; items: RkcItem[]; warnings: string[] }

/** Раздел «Спецификация»: загрузка РКЦ и лист «Закрытие по актам». */
export function SpecExtras({ port, state }: { port: ExcelPort; state: BookState }) {
  const guard = useGuard();
  const [upload, setUpload] = useState<{ id: string; sheets: string[]; sheet: string } | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  if (!state.book) return null;
  const fail = (text: string) => setNote({ text, error: true });

  const pick = async (file: File | undefined) => {
    setNote(null);
    setParsed(null);
    setUpload(null);
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { fail("Нужен файл .xlsx. Старый формат .xls сохраните в Excel как «Книга Excel (*.xlsx)»."); return; }
    setBusy(true);
    const r = await guard(apiUploadRkc(file), fail);
    setBusy(false);
    if (r) setUpload({ ...r, sheet: r.sheets[0] ?? "" });
  };

  const parse = async () => {
    if (!upload) return;
    setNote(null);
    setBusy(true);
    const r = await guard(apiGet<Parsed>(`/api/rkc/${upload.id}?sheet=${encodeURIComponent(upload.sheet)}`), fail);
    setBusy(false);
    if (r) setParsed(r);
  };

  const apply = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      if (await port.isFiltered("Спецификация")) await port.clearFilters("Спецификация");
      const d = await applySpec(port, state.book!, parsed.items);
      setNote({ text: `Спецификация обновлена. ${diffText(d)}` });
      setParsed(null);
      setUpload(null);
      state.refresh();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    setNote(null);
    try {
      const rep = closedReport(state.book!);
      await port.writeReport(rep);
      setNote({ text: `Лист «${CLOSED_SHEET}» обновлён: позиций ${specClosed(state.book!).length}, актов ${rep.rows[0].length - 6}.` });
    } catch (e) {
      fail((e as Error).message);
    }
  };

  const preview = parsed ? mergeSpec(state.book, parsed.items).diff : null;
  return (
    <div className="extras">
      <h3 className="tools-title">Спецификация проекта</h3>
      <p className="muted">Позиции из расчёта коммерческой стоимости (РКЦ) или вручную. «Закрыто» считается по «Материалам в актах»
        через «№ п/п РКЦ» материала.</p>
      <div className="row-actions">
        <label className="btn">
          {busy && !parsed ? "Загружаю…" : "Загрузить из РКЦ"}
          <input type="file" accept=".xlsx" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <button className="btn" onClick={() => void report()}>Обновить лист «{CLOSED_SHEET}»</button>
      </div>
      {upload && !parsed && (
        <div className="confirm" role="group" aria-label="Лист РКЦ">
          <label>Лист РКЦ{" "}
            <select value={upload.sheet} onChange={(e) => setUpload({ ...upload, sheet: e.target.value })}>
              {upload.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void parse()}>Разобрать</button>
            <button className="btn" onClick={() => setUpload(null)}>Отмена</button>
          </div>
        </div>
      )}
      {parsed && preview && (
        <div className="confirm" role="alertdialog" aria-label="Предпросмотр загрузки РКЦ">
          <p>Лист «{parsed.sheet}»: позиций {parsed.items.length}. {diffText(preview)}</p>
          {preview.changed.length > 0 && <p className="muted">Изменены: {preview.changed.map((c) => `${c.number} (${c.fields.join(", ")})`).join("; ")}</p>}
          {parsed.warnings.length > 0 && <ul className="list warn">{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <p className="muted">Строки «вручную» и привязки материалов не меняются; пропавшие из РКЦ позиции останутся с пометкой.</p>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void apply()}>Применить</button>
            <button className="btn" onClick={() => setParsed(null)}>Отмена</button>
          </div>
        </div>
      )}
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}

/** Карточка позиции: строки «Спецификации» (по № п/п) и «Материалов в актах» (по материалу). */
export function SpecPositionCard({ state, number, material }: { state: BookState; number?: string; material?: string }) {
  if (!state.book) return null;
  const p = number ? specClosed(state.book).find((x) => x.number === number.trim()) : material ? positionOfMaterial(state.book, material) : null;
  if (!p) return null;
  return (
    <div className="extras">
      <h3 className="tools-title">Позиция РКЦ {p.number}{material ? ` · ${p.name}` : ""}</h3>
      <ul className="list">
        {positionLines(p).map((l) => <li key={l} className={l.includes("больше, чем по проекту") ? "error" : undefined}>{l}</li>)}
      </ul>
    </div>
  );
}

/** «Подобрать № п/п» на экране «Материалы». */
export function SpecMatchTool({ port, state }: { port: ExcelPort; state: BookState }) {
  const [list, setList] = useState<SpecMatch[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  if (!state.book?.tables["Спецификация"]?.length) return null;
  const run = () => {
    setNote(null);
    const m = matchSpec(state.book!);
    if (!m.length) setNote({ text: "Подходящих позиций не найдено — заполните № п/п вручную." });
    setList(m.length ? m : null);
  };
  const apply = async () => {
    try {
      const n = await applyMatches(port, list!);
      setNote({ text: `Записано номеров: ${n}. Проверьте их в столбце «№ п/п РКЦ».` });
      setList(null);
      state.refresh();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    }
  };
  return (
    <div className="extras">
      <div className="row-actions"><button className="btn" onClick={run}>Подобрать № п/п</button></div>
      {list && (
        <div className="confirm" role="group" aria-label="Подбор № п/п">
          <ul className="list match-list">
            {list.map((m, i) => (
              <li key={m.materialRow}>
                <label>
                  <input type="checkbox" checked={m.checked}
                    onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} />{" "}
                  {matchLine(m)}
                </label>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void apply()}>Применить отмеченные</button>
            <button className="btn" onClick={() => setList(null)}>Отмена</button>
          </div>
        </div>
      )}
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
