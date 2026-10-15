import { useEffect, useState } from "react";
import type { Material, MaterialInput, QualityDoc, QualityDocInput } from "@idk/shared/schemas";
import { QUALITY_DOC_LABELS } from "@idk/shared/roles";
import { apiGet, apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import { Field, Section, useList } from "./common.tsx";
import { QualityDocForm } from "./materials/QualityDocForm.tsx";
import { inExcel, readActiveSheetUsedRange, writeToNewSheet } from "../excel.ts";
import { rowsToMaterials, materialsToRows, splitNew } from "../sheetMapping.ts";

const EMPTY: MaterialInput = { name: "", mark: "", article: "", manufacturer: "", unit: "" };
const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join(".") : "");

export function MaterialsTab() {
  const guard = useGuard();
  const [materials, reload] = useList<Material>("/api/materials");
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<{ id: number | null; data: MaterialInput } | null>(null);
  const [docs, setDocs] = useState<QualityDoc[]>([]);
  const [docEdit, setDocEdit] = useState<{ id: number | null; data: QualityDocInput } | null>(null);
  const [error, setError] = useState("");
  const [importPreview, setImportPreview] = useState<{ add: MaterialInput[]; skipped: number } | null>(null);
  const [status, setStatus] = useState("");

  const loadDocs = (id: number | null) => {
    if (id === null) return setDocs([]);
    void guard(apiGet<QualityDoc[]>(`/api/materials/${id}/quality-docs`)).then((d) => d && setDocs(d));
  };
  useEffect(() => loadDocs(edit?.id ?? null), [edit?.id]);

  const q = query.trim().toLowerCase();
  const shown = q ? materials.filter((m) => `${m.name} ${m.mark} ${m.article}`.toLowerCase().includes(q)) : materials;
  const set = (k: keyof MaterialInput) => (v: string) => setEdit((e) => e && { ...e, data: { ...e.data, [k]: v } });

  const save = async () => {
    if (!edit) return;
    setError("");
    const r = await guard(
      edit.id === null ? apiSend<Material>("POST", "/api/materials", edit.data) : apiSend<Material>("PUT", `/api/materials/${edit.id}`, edit.data),
      setError,
    );
    if (r) { reload(); setEdit({ id: r.id, data: { ...r } }); setStatus("Сохранено"); }
  };
  const remove = async () => {
    if (!edit?.id) return;
    const ok = await guard(apiSend("DELETE", `/api/materials/${edit.id}`).then(() => true), setError);
    if (ok) { setEdit(null); reload(); }
  };
  const startImport = async () => {
    setStatus("");
    const rows = await readActiveSheetUsedRange().catch((e) => { setStatus("Не удалось прочитать лист: " + e.message); return null; });
    if (!rows) return;
    const r = rowsToMaterials(rows);
    if (r.errors.length) return setStatus(r.errors.join("; "));
    setImportPreview(splitNew(r.materials, materials));
  };
  const confirmImport = async () => {
    if (!importPreview) return;
    for (const m of importPreview.add) await guard(apiSend("POST", "/api/materials", m));
    setStatus(`Добавлено: ${importPreview.add.length}`);
    setImportPreview(null);
    reload();
  };

  return (
    <>
      <Section title={`Материалы (${materials.length})`} open>
        <input className="search" placeholder="Поиск по наименованию или марке" value={query} onChange={(e) => setQuery(e.target.value)} />
        {materials.length === 0 && <p className="muted">Добавьте материалы вручную{inExcel() ? " или загрузите их с листа Excel" : ""}.</p>}
        <ul className="list">
          {shown.map((m) => (
            <li key={m.id} className={edit?.id === m.id ? "selected" : ""}>
              <button className="link" title={m.name} onClick={() => { setError(""); setStatus(""); setDocEdit(null); setEdit({ id: m.id, data: { ...m } }); }}>
                {m.name} <span className="muted">{m.mark || m.article}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="row-actions">
          <button className="btn" onClick={() => { setDocEdit(null); setEdit({ id: null, data: EMPTY }); }}>Добавить материал</button>
          {inExcel() && <button className="btn" onClick={() => void startImport()}>Загрузить с листа</button>}
          {inExcel() && <button className="btn" onClick={() => void writeToNewSheet("Материалы", materialsToRows(materials))}>Выгрузить на лист</button>}
        </div>
        {importPreview && (
          <div className="form">
            <p style={{ margin: 0 }}>Будет добавлено: {importPreview.add.length}, пропущено (уже есть): {importPreview.skipped}</p>
            <div className="row-actions">
              <button className="btn btn-primary" disabled={!importPreview.add.length} onClick={() => void confirmImport()}>Добавить</button>
              <button className="btn" onClick={() => setImportPreview(null)}>Отмена</button>
            </div>
          </div>
        )}
        {status && <p className="muted" role="status">{status}</p>}
      </Section>

      {edit && (
        <Section title={edit.id === null ? "Новый материал" : "Карточка материала"} open>
          <div className="form">
            <Field label="Наименование" value={edit.data.name} onChange={set("name")} />
            <div className="pair">
              <Field label="Марка, тип" value={edit.data.mark} onChange={set("mark")} />
              <Field label="Артикул" value={edit.data.article} onChange={set("article")} />
            </div>
            <div className="pair">
              <Field label="Производитель" value={edit.data.manufacturer} onChange={set("manufacturer")} />
              <Field label="Ед. изм." value={edit.data.unit} onChange={set("unit")} />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="row-actions">
              <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
              <button className="btn" onClick={() => { setEdit(null); setError(""); }}>Закрыть</button>
              {edit.id !== null && <button className="btn btn-danger" onClick={() => void remove()}>Удалить</button>}
            </div>
          </div>

          {edit.id !== null && (
            <>
              <h4 style={{ margin: "12px 0 4px", fontSize: 12 }}>Документы качества ({docs.length})</h4>
              {docs.length === 0 && <p className="muted">Нет документов. Без них материал не попадёт в реестр с подтверждающими документами.</p>}
              <ul className="list">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button className="link" onClick={() => { const { id, ...data } = d; setDocEdit({ id, data }); }}>
                      {QUALITY_DOC_LABELS[d.type]} {d.number}{" "}
                      <span className="muted">{[fmtDate(d.issueDate), d.sheets ? `л. ${d.sheets}` : ""].filter(Boolean).join(", ")}</span>
                    </button>
                    {d.fileId === null
                      ? <span className="warn">нет скана</span>
                      : <a className="muted" href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer">открыть</a>}
                  </li>
                ))}
              </ul>
              {!docEdit && (
                <div className="row-actions">
                  <button className="btn" onClick={() => setDocEdit({
                    id: null,
                    data: { type: "certificate", number: "", issueDate: null, validUntil: null, sheets: 0, fileId: null, materialIds: [edit.id!] },
                  })}>Добавить документ</button>
                </div>
              )}
              {docEdit && (
                <QualityDocForm key={docEdit.id ?? "new"} doc={docEdit} materials={materials}
                  onDone={(saved) => { setDocEdit(null); if (saved) loadDocs(edit.id); }} />
              )}
            </>
          )}
        </Section>
      )}
    </>
  );
}
