// Дополнение карточки материала: его документы качества — добавить прямо здесь (вид, номер, даты, листы, скан),
// привязать общий сертификат, отвязать. План 31: документ — группа столбцов «Док.1…3» строки материала; общий
// сертификат — те же вид и номер в строках нескольких материалов.
import { useState } from "react";
import { cellText, isoToExcelSerial } from "@idk/shared/workbook/values";
import { QUALITY_DOC_LABELS, QUALITY_DOC_TYPES } from "@idk/shared/roles";
import { DOC_SLOTS } from "@idk/shared/workbook/schema";
import { newQualityDoc, docMaterials } from "@idk/shared/acts/actMaterials";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { docsOfMaterial } from "./summaries.ts";
import { apiUpload } from "../../api.ts";

const LABELS = QUALITY_DOC_TYPES.map((t) => QUALITY_DOC_LABELS[t]);
const empty = () => ({ type: LABELS[0], number: "", date: "", validUntil: "", sheets: "1", scan: null as File | null });

export function MaterialExtras({ port, state, name }: { port: ExcelPort; state: BookState; name: string }) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null);
  const [link, setLink] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!name || !state.book) return null;
  const docs = docsOfMaterial(state.book, name);
  const others = (state.book.tables["ДокументыКачества"] ?? []).filter((r) => !docs.includes(r));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); state.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const create = () => run(async () => {
    if (!form) return;
    if (!form.number.trim()) throw new Error("Укажите номер документа");
    const sheets = Number(form.sheets);
    const values = newQualityDoc(name, {
      type: form.type, number: form.number,
      date: form.date ? isoToExcelSerial(form.date) : null, validUntil: form.validUntil ? isoToExcelSerial(form.validUntil) : null,
      sheets: Number.isInteger(sheets) && sheets > 0 ? sheets : null,
    });
    if (await port.isFiltered("ДокументыКачества")) await port.clearFilters("ДокументыКачества");
    const t = await port.read("ДокументыКачества");
    if (!t) throw new Error("Таблица «Материалы» не найдена — нажмите «Обновить разметку»");
    const row = await port.insert("ДокументыКачества", t.rows.length, [values]);
    if (form.scan) {
      const f = await apiUpload(form.scan, form.scan.name);
      await port.write("ДокументыКачества", row, { "Скан": f.name }, { "Скан": `${location.origin}/api/files/${f.id}` });
    }
    setForm(null);
  });

  /** Привязать документ (общий сертификат) к материалу или отвязать; отвязать от единственного материала — удалить. */
  const toggle = (row: number, on: boolean) => run(async () => {
    const r = (state.book!.tables["ДокументыКачества"] ?? []).find((x) => x.row === row);
    if (!r) return;
    const next = docMaterials(r.v.materials ?? null, name, on);
    if (!next) await port.remove("ДокументыКачества", [row]);
    else await port.write("ДокументыКачества", row, { "Материалы": next });
    setLink(false);
  });
  const only = (d: (typeof docs)[number]) => docMaterials(d.v.materials ?? null, name, false) === "";

  const label = (r: (typeof docs)[number]) => `${cellText(r.v.type) || "—"} ${cellText(r.v.number)}`.trim();
  return (
    <div className="extras">
      <h3 className="tools-title">Документы качества ({docs.length} из {DOC_SLOTS.length})</h3>
      <ul className="list">
        {docs.map((d) => (
          <li key={d.row} className="mat-doc">
            <button className="link" onClick={() => void port.selectCell("ДокументыКачества", d.row, "Номер")}>{label(d)}</button>
            {d.link["file"] ? <span className="muted"> · скан</span> : <span className="warn"> · нет скана</span>}
            <button className="btn btn-small" disabled={busy} title={only(d) ? "Очистить столбцы документа в строке материала" : "Убрать этот материал из документа"}
              onClick={() => void toggle(d.row, false)}>{only(d) ? "Удалить" : "Отвязать"}</button>
          </li>
        ))}
      </ul>
      {!form && (
        <div className="row-actions">
          <button className="btn" disabled={busy || docs.length >= DOC_SLOTS.length} title={docs.length >= DOC_SLOTS.length ? `У материала уже ${DOC_SLOTS.length} документа` : undefined} onClick={() => setForm(empty())}>Новый документ…</button>
          <button className="btn" disabled={busy || !others.length || docs.length >= DOC_SLOTS.length} onClick={() => setLink(!link)} title="Общий сертификат на несколько материалов">Привязать имеющийся{link ? " ▴" : " ▾"}</button>
        </div>
      )}
      {link && !form && (
        <ul className="list">
          {others.map((d) => (
            <li key={d.row}>
              <button className="link" disabled={busy} onClick={() => void toggle(d.row, true)}>{label(d)}</button>
              <span className="muted"> · {cellText(d.v.materials)}</span>
            </li>
          ))}
        </ul>
      )}
      {form && (
        <div className="setting mat-doc-form">
          <label>Вид{" "}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>Номер <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
          <label>Дата <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Действует до <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></label>
          <label>Листов <input type="number" min={1} style={{ width: "5em" }} value={form.sheets} onChange={(e) => setForm({ ...form, sheets: e.target.value })} /></label>
          <label>Скан (PDF, JPG, PNG) <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setForm({ ...form, scan: e.target.files?.[0] ?? null })} /></label>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void create()}>{busy ? "Добавляю…" : "Добавить"}</button>
            <button className="btn" disabled={busy} onClick={() => setForm(null)}>Отмена</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
