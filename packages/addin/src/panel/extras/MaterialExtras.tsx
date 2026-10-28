// Дополнение карточки материала: его документы качества — добавить прямо здесь (вид, номер, даты, листы, скан),
// привязать общий сертификат, отвязать. План 31: документ — группа столбцов «Док.1…3» строки материала; общий
// сертификат — те же вид и номер в строках нескольких материалов. 0.28: «Документ по скану…» — скан распознаётся
// (текст PDF или распознавание Windows, поля — нейросетью или по правилам) и заполняет форму для проверки.
import { useState } from "react";
import { cellText } from "@idk/shared/workbook/values";
import { QUALITY_DOC_LABELS, QUALITY_DOC_TYPES } from "@idk/shared/roles";
import { DOC_SLOTS } from "@idk/shared/workbook/schema";
import { docMaterials } from "@idk/shared/acts/actMaterials";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { docsOfMaterial } from "./summaries.ts";
import { apiUpload, apiSend } from "../../api.ts";
import { addQualityDoc } from "./addDoc.ts";
import type { DocFields } from "@idk/shared/scan/docText";

interface Recognized {
  fields: DocFields; pages: number; method: "pdf-text" | "ocr"; via: "ai" | "rules"; provider: string; seen?: boolean; warnings: string[]; text: string;
  materials?: { name: string; score: number; why: string[]; checked: boolean }[];
}

const LABELS = QUALITY_DOC_TYPES.map((t) => QUALITY_DOC_LABELS[t]);
const empty = () => ({
  type: LABELS[0], number: "", date: "", validUntil: "", sheets: "1", scan: null as File | null,
  /** Скан уже загружен при распознавании — второй раз не загружается. */
  uploaded: null as { id: number; name: string } | null,
  recog: null as Recognized | null,
  /** 0.29: другие материалы, к которым по скану относится документ (отмеченные — добавить вместе). */
  also: [] as string[],
});

export function MaterialExtras({ port, state, name }: { port: ExcelPort; state: BookState; name: string }) {
  const [error, setError] = useState("");
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null);
  const [link, setLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  if (!name || !state.book) return null;
  const docs = docsOfMaterial(state.book, name);
  const others = (state.book.tables["ДокументыКачества"] ?? []).filter((r) => !docs.includes(r));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); state.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const create = () => run(async () => {
    if (!form) return;
    const f = form.uploaded ?? (form.scan ? await apiUpload(form.scan, form.scan.name) : null);
    await addQualityDoc(port, {
      type: form.type, number: form.number, date: form.date, valid: form.validUntil, sheets: form.sheets,
      materials: [name, ...form.also], scan: f ? { id: f.id, name: f.name } : null,
    });
    setForm(null);
  });

  /** Скан → загрузка → распознавание → поля формы (вид, номер, даты, листы). Поля, которых нет в скане, не трогаются. */
  const recognize = async (file: File, base = form ?? empty()) => {
    setError("");
    setReading(true);
    let next = { ...base, scan: file, uploaded: null as { id: number; name: string } | null, recog: null as Recognized | null };
    setForm(next);
    try {
      const up = await apiUpload(file, file.name);
      next = { ...next, uploaded: { id: up.id, name: up.name } };
      setForm(next);
      const mats = (state.book!.tables["Материалы"] ?? []).map((m) => ({ name: cellText(m.v.name), mark: cellText(m.v.mark), article: cellText(m.v.article), manufacturer: cellText(m.v.manufacturer) })).filter((m) => m.name);
      const t = new Date();
      const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
      const r = await apiSend<Recognized>("POST", `/api/files/${up.id}/identify`, { materials: mats, today });
      const f = r.fields;
      setForm({
        ...next, recog: r, also: (r.materials ?? []).filter((m) => m.checked && m.name !== name).map((m) => m.name),
        type: f.type ?? next.type, number: f.number ?? next.number,
        date: f.issueDate ?? next.date, validUntil: f.validUntil ?? next.validUntil,
        sheets: r.pages ? String(r.pages) : next.sheets,
      });
    } catch (e) {
      setError(`Скан не распознан: ${(e as Error).message}. Заполните поля вручную — скан будет приложен.`);
    } finally {
      setReading(false);
    }
  };
  const matRow = (state.book.tables["Материалы"] ?? []).find((m) => cellText(m.v.name) === name);
  const setManufacturer = (v: string) => run(async () => { if (matRow) await port.write("Материалы", matRow.row, { "Завод-изготовитель": v }); });

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
          <label className={"btn" + (busy || docs.length >= DOC_SLOTS.length ? " disabled" : "")} title="Выберите PDF или фото паспорта/сертификата — программа прочитает вид, номер, даты и листы">
            Документ по скану…
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden disabled={busy || docs.length >= DOC_SLOTS.length}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void recognize(f, empty()); }} />
          </label>
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
          {reading && <p className="notice" role="status">Читаю скан{form.scan ? ` «${form.scan.name}»` : ""}… (распознавание страниц может занять до минуты)</p>}
          {form.recog && (
            <div className="notice" role="status">
              Поля заполнены по скану ({form.recog.method === "pdf-text" ? "текст PDF" : "распознавание Windows"}
              {form.recog.via === "ai" ? `, разбор — нейросеть «${form.recog.provider}»${form.recog.seen ? " (видела скан)" : ""}` : ", разбор по правилам"}) — <b>проверьте их</b> перед «Добавить».
              {form.recog.warnings.map((w) => <span key={w} className="warn" style={{ display: "block" }}>{w}</span>)}
              {form.recog.fields.manufacturer && matRow && cellText(matRow.v.manufacturer) !== form.recog.fields.manufacturer && (
                <span style={{ display: "block" }}>Изготовитель по скану: {form.recog.fields.manufacturer}{" "}
                  <button className="btn btn-small" disabled={busy} onClick={() => void setManufacturer(form.recog!.fields.manufacturer!)}>
                    {cellText(matRow.v.manufacturer) ? "Заменить в материале" : "Записать в материал"}
                  </button>
                </span>
              )}
              {(form.recog.materials ?? []).some((m) => m.name !== name) && (
                <span style={{ display: "block" }}>Документ подходит и к другим материалам — отметьте, к каким добавить:
                  {(form.recog.materials ?? []).filter((m) => m.name !== name).map((m) => (
                    <label key={m.name} className="check" style={{ display: "block" }}>
                      <input type="checkbox" checked={form.also.includes(m.name)}
                        onChange={(e) => setForm({ ...form, also: e.target.checked ? [...form.also, m.name] : form.also.filter((x) => x !== m.name) })} />
                      {" "}{m.name}<span className="muted"> — {m.why.join(", ")}</span>
                    </label>
                  ))}
                </span>
              )}
              <details><summary>Распознанный текст</summary><pre className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 200, overflow: "auto" }}>{form.recog.text}</pre></details>
            </div>
          )}
          <label>Вид{" "}
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>Номер <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
          <label>Дата <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label>Действует до <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></label>
          <label>Листов <input type="number" min={1} style={{ width: "5em" }} value={form.sheets} onChange={(e) => setForm({ ...form, sheets: e.target.value })} /></label>
          <label>Скан (PDF, JPG, PNG) <input type="file" accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setForm({ ...form, scan: e.target.files?.[0] ?? null, uploaded: null, recog: null })} /></label>
          {form.scan && !form.recog && !reading && (
            <button className="btn btn-small" onClick={() => void recognize(form.scan!)}>Распознать скан и заполнить поля</button>
          )}
          {form.scan && <span className="muted"> {form.scan.name}</span>}
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy || reading} onClick={() => void create()}>{busy ? "Добавляю…" : "Добавить"}</button>
            <button className="btn" disabled={busy} onClick={() => setForm(null)}>Отмена</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
