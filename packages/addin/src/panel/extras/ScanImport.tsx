// 0.29: «Документы по сканам…» на листе «Материалы»: несколько сканов сразу; программа определяет вид, номер, даты и
// материалы книги, к которым относится документ (нейросеть видит скан, если умеет; иначе — текст и совпадения).
// Пользователь проверяет и добавляет: документ ложится в «Док.N» строк выбранных материалов, скан прикладывается.
// Документ с тем же видом и номером уже есть — к нему добавляются материалы.
import { useState } from "react";
import { QUALITY_DOC_LABELS, QUALITY_DOC_TYPES } from "@idk/shared/roles";
import type { DocFields } from "@idk/shared/scan/docText";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";
import { apiUpload, apiSend } from "../../api.ts";
import { searchOptions } from "../card/search.ts";
import { cellText } from "@idk/shared/workbook/values";
import { addQualityDoc } from "./addDoc.ts";

const LABELS = QUALITY_DOC_TYPES.map((t) => QUALITY_DOC_LABELS[t]);
interface Hit { name: string; score: number; why: string[]; checked: boolean }
interface Identified { fields: DocFields; pages: number; method: "pdf-text" | "ocr"; via: "ai" | "rules"; provider: string; seen: boolean; warnings: string[]; materials: Hit[]; text: string }
interface Item {
  key: string; file: File; status: "reading" | "ready" | "error" | "added"; error: string; note: string;
  uploaded: { id: number; name: string } | null; res: Identified | null;
  type: string; number: string; date: string; valid: string; sheets: string;
  hits: Hit[]; picked: string[]; q: string;
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function ScanImport({ port, state }: { port: ExcelPort; state: BookState }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  if (!state.book) return null;
  const mats = (state.book.tables["Материалы"] ?? []).map((m) => ({
    name: cellText(m.v.name), mark: cellText(m.v.mark), article: cellText(m.v.article), manufacturer: cellText(m.v.manufacturer),
  })).filter((m) => m.name);
  const names = mats.map((m) => m.name);
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const pick = async (files: File[]) => {
    const fresh: Item[] = files.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`, file, status: "reading", error: "", note: "", uploaded: null, res: null,
      type: LABELS[0], number: "", date: "", valid: "", sheets: "1", hits: [], picked: [], q: "",
    }));
    setItems((xs) => [...xs, ...fresh]);
    setBusy(true);
    for (const it of fresh) {
      try {
        const up = await apiUpload(it.file, it.file.name);
        const r = await apiSend<Identified>("POST", `/api/files/${up.id}/identify`, { materials: mats, today: today() });
        patch(it.key, {
          status: "ready", uploaded: { id: up.id, name: up.name }, res: r,
          type: r.fields.type ?? LABELS[0], number: r.fields.number ?? "", date: r.fields.issueDate ?? "", valid: r.fields.validUntil ?? "",
          sheets: String(r.pages || 1), hits: r.materials, picked: r.materials.filter((m) => m.checked).map((m) => m.name),
        });
      } catch (e) {
        patch(it.key, { status: "error", error: (e as Error).message });
      }
    }
    setBusy(false);
  };

  const addOne = (it: Item) => addQualityDoc(port, {
    type: it.type, number: it.number, date: it.date, valid: it.valid, sheets: it.sheets, materials: it.picked, scan: it.uploaded,
  });
  const add = async (list: Item[]) => {
    setBusy(true);
    for (const it of list) {
      try { patch(it.key, { status: "added", note: await addOne(it), error: "" }); }
      catch (e) { patch(it.key, { error: (e as Error).message }); }
    }
    setBusy(false);
    state.refresh();
  };
  const ready = items.filter((x) => x.status === "ready");

  return (
    <div className="extras scan-import">
      <h3 className="tools-title">Документы качества по сканам</h3>
      <p className="muted">Выберите один или несколько сканов (PDF, JPG, PNG) — программа определит вид, номер, даты и материалы, к которым
        относится документ. Проверьте и нажмите «Добавить».</p>
      <div className="row-actions">
        <label className={"btn" + (busy ? " disabled" : "")}>
          Документы по сканам…
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" hidden disabled={busy}
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void pick(fs); }} />
        </label>
        {ready.length > 1 && <button className="btn btn-primary" disabled={busy} onClick={() => void add(ready)}>Добавить все ({ready.length})</button>}
        {items.length > 0 && !busy && <button className="btn btn-link" onClick={() => setItems(items.filter((x) => x.status !== "added"))}>Убрать добавленные</button>}
      </div>
      {items.map((it) => (
        <div key={it.key} className={"scan-card setting" + (it.status === "added" ? " scan-done" : "")}>
          <div className="scan-head"><b>{it.file.name}</b>{" "}
            {it.status === "reading" && <span className="muted">— читаю…</span>}
            {it.status === "added" && <span className="notice">— {it.note}</span>}
            <button className="btn btn-link" disabled={busy && it.status === "reading"} onClick={() => setItems(items.filter((x) => x.key !== it.key))} title="Убрать из списка">✕</button>
          </div>
          {it.status === "error" && <p className="error">Не распознан: {it.error}</p>}
          {it.res && it.status !== "added" && (
            <>
              <p className="muted">
                {it.res.method === "pdf-text" ? "Текст PDF" : "Распознавание Windows"}
                {it.res.via === "ai" ? `; разбор — нейросеть «${it.res.provider}»${it.res.seen ? " (видела скан)" : ""}` : "; разбор по правилам (нейросеть не подключена)"}. Проверьте поля.
              </p>
              {it.res.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
              <div className="mat-doc-form">
                <label>Вид{" "}<select value={it.type} onChange={(e) => patch(it.key, { type: e.target.value })}>{LABELS.map((l) => <option key={l}>{l}</option>)}</select></label>
                <label>Номер <input value={it.number} onChange={(e) => patch(it.key, { number: e.target.value })} /></label>
                <label>Дата <input type="date" value={it.date} onChange={(e) => patch(it.key, { date: e.target.value })} /></label>
                <label>Действует до <input type="date" value={it.valid} onChange={(e) => patch(it.key, { valid: e.target.value })} /></label>
                <label>Листов <input type="number" min={1} style={{ width: "5em" }} value={it.sheets} onChange={(e) => patch(it.key, { sheets: e.target.value })} /></label>
              </div>
              <p className="field-label">Материалы ({it.picked.length}):</p>
              <ul className="multi-list">
                {[...it.hits.map((h) => h.name), ...it.picked.filter((p) => !it.hits.some((h) => h.name === p))].map((n) => {
                  const h = it.hits.find((x) => x.name === n);
                  return (
                    <li key={n}><label className="check">
                      <input type="checkbox" checked={it.picked.includes(n)}
                        onChange={(e) => patch(it.key, { picked: e.target.checked ? [...it.picked, n] : it.picked.filter((x) => x !== n) })} />
                      <span>{n}{h ? <span className="muted"> — {h.why.join(", ") || "совпадение"}</span> : null}</span>
                    </label></li>
                  );
                })}
                {!it.hits.length && !it.picked.length && <li className="muted">Совпадений не найдено — добавьте материал поиском ниже.</li>}
              </ul>
              <input type="search" placeholder="Добавить материал: начните вводить" value={it.q} onChange={(e) => patch(it.key, { q: e.target.value })} />
              {it.q.trim() && (
                <ul className="ref-list">
                  {searchOptions(names.filter((n) => !it.picked.includes(n)), it.q, 15).map((n) => (
                    <li key={n}><button type="button" className="link" onClick={() => patch(it.key, { picked: [...it.picked, n], q: "" })}>{n}</button></li>
                  ))}
                </ul>
              )}
              <details><summary>Распознанный текст</summary><pre className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 200, overflow: "auto" }}>{it.res.text}</pre></details>
              {it.error && <p className="error">{it.error}</p>}
              <div className="row-actions">
                <button className="btn btn-primary" disabled={busy || it.status !== "ready"} onClick={() => void add([it])}>Добавить</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
