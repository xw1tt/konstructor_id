import { useState } from "react";
import type { FileRow, Material, QualityDoc, QualityDocInput } from "@idk/shared/schemas";
import { QUALITY_DOC_TYPES, QUALITY_DOC_LABELS, type QualityDocType } from "@idk/shared/roles";
import { apiSend, apiUpload } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { Field, Select, dateIn, dateOut } from "../common.tsx";

export function QualityDocForm({ doc, materials, onDone }: {
  doc: { id: number | null; data: QualityDocInput };
  materials: Material[];
  onDone: (saved: boolean) => void;
}) {
  const guard = useGuard();
  const [data, setData] = useState(doc.data);
  const [file, setFile] = useState<FileRow | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const set = <K extends keyof QualityDocInput>(k: K, v: QualityDocInput[K]) => setData((d) => ({ ...d, [k]: v }));

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    setBusy(true);
    const row = await guard(apiUpload(f, f.name), setError);
    setBusy(false);
    if (row) { setFile(row); setData((d) => ({ ...d, fileId: row.id, sheets: row.pages })); }
  };
  const save = async () => {
    setError("");
    const r = await guard(
      doc.id === null ? apiSend<QualityDoc>("POST", "/api/quality-docs", data) : apiSend<QualityDoc>("PUT", `/api/quality-docs/${doc.id}`, data),
      setError,
    );
    if (r) onDone(true);
  };
  const remove = async () => {
    if (doc.id === null) return;
    const ok = await guard(apiSend("DELETE", `/api/quality-docs/${doc.id}`).then(() => true), setError);
    if (ok) onDone(true);
  };
  const toggle = (id: number) =>
    set("materialIds", data.materialIds.includes(id) ? data.materialIds.filter((x) => x !== id) : [...data.materialIds, id]);
  const shown = materials.filter((m) => data.materialIds.includes(m.id) || (filter && `${m.name} ${m.mark}`.toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="form">
      <Select label="Тип документа" value={data.type}
        options={QUALITY_DOC_TYPES.map((t) => ({ value: t, label: QUALITY_DOC_LABELS[t] }))}
        onChange={(v) => v && set("type", v as QualityDocType)} />
      <Field label="Номер" value={data.number} onChange={(v) => set("number", v)} placeholder="ЕАЭС RU C-RU.ПБ68.В.00389/21" />
      <div className="pair">
        <Field label="Дата выдачи" type="date" value={dateIn(data.issueDate)} onChange={(v) => set("issueDate", dateOut(v))} />
        <Field label="Действует до" type="date" value={dateIn(data.validUntil)} onChange={(v) => set("validUntil", dateOut(v))} />
      </div>
      <label
        className={"drop" + (over ? " over" : "")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]); }}
      >
        {busy ? "Загрузка…" : file ? `Скан: ${file.name}, листов: ${file.pages}` : data.fileId ? "Скан загружен. Перетащите другой файл, чтобы заменить" : "Перетащите скан (PDF, JPG, PNG) или нажмите, чтобы выбрать"}
        <input type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      </label>
      <label>
        Количество листов
        <input type="number" min={0} value={data.sheets} onChange={(e) => set("sheets", Math.max(0, Number(e.target.value) || 0))} />
      </label>
      <div>
        <span className="muted">Относится к материалам ({data.materialIds.length}):</span>
        <input className="search" placeholder="Найти материал, чтобы добавить" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="list">
          {shown.map((m) => (
            <li key={m.id}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", color: "inherit", fontSize: 13 }}>
                <input type="checkbox" checked={data.materialIds.includes(m.id)} onChange={() => toggle(m.id)} />
                <span className="grow">{m.name} <span className="muted">{m.mark || m.article}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Сохранить документ</button>
        <button className="btn" onClick={() => onDone(false)}>Отмена</button>
        {doc.id !== null && <button className="btn btn-danger" onClick={() => void remove()}>Удалить</button>}
      </div>
    </div>
  );
}
