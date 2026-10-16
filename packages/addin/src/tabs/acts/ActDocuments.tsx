import { useState } from "react";
import type { ActDocumentInput, ActFull } from "@idk/shared/acts/schemas";
import { apiSend, apiUpload } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { dateIn, dateOut } from "../common.tsx";

type Row = ActDocumentInput & { fileName?: string };

export function ActDocuments({ full, reload }: { full: ActFull; reload: () => void }) {
  const guard = useGuard();
  const [rows, setRows] = useState<Row[]>(() => [...full.documents].sort((a, b) => a.sortOrder - b.sortOrder));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const change = (next: Row[]) => { setStatus(""); setRows(next.map((r, i) => ({ ...r, sortOrder: i }))); };
  const update = (i: number, patch: Partial<Row>) => change(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addScheme = () => {
    const n = rows.filter((r) => r.kind === "scheme").length + 1;
    change([...rows, { kind: "scheme", number: `${full.act.baseNumber}.${n}`, name: "", date: full.act.dateEnd, fileId: null, sortOrder: rows.length }]);
  };
  const upload = async (i: number, f: File | undefined) => {
    if (!f) return;
    const r = await guard(apiUpload(f, f.name), setError);
    if (r) update(i, { fileId: r.id, fileName: `${r.name}, листов: ${r.pages}` });
  };
  const save = async () => {
    setError("");
    const r = await guard(apiSend("PUT", `/api/acts/${full.act.id}/documents`, rows.map(({ fileName: _f, ...d }) => d)), setError);
    if (r) { setStatus("Сохранено"); reload(); }
  };

  return (
    <div>
      {rows.length === 0 && <p className="muted">Добавьте исполнительные схемы и другие документы для п.4.</p>}
      {rows.map((r, i) => (
        <div className="form" key={i}>
          <div className="pair">
            <label>Вид
              <select value={r.kind} onChange={(e) => update(i, { kind: e.target.value as Row["kind"] })}>
                <option value="scheme">Исполнительная схема</option>
                <option value="other">Другой документ</option>
              </select>
            </label>
            <label>Дата<input type="date" value={dateIn(r.date)} onChange={(e) => update(i, { date: dateOut(e.target.value) })} /></label>
          </div>
          <label>Номер<input value={r.number} onChange={(e) => update(i, { number: e.target.value })} /></label>
          <label>Наименование<textarea rows={2} value={r.name} onChange={(e) => update(i, { name: e.target.value })}
            placeholder={r.kind === "scheme" ? "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К" : "Протокол проверки сопротивления изоляции"} /></label>
          <label className="drop">
            {r.fileName ?? (r.fileId ? "Файл загружен. Выберите другой, чтобы заменить" : "Выберите PDF документа (для сборки комплекта)")}
            <input type="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => void upload(i, e.target.files?.[0])} />
          </label>
          <div className="row-actions">
            <button className="btn btn-icon" aria-label="Выше" disabled={i === 0} onClick={() => { const n = [...rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; change(n); }}>↑</button>
            <button className="btn btn-icon" aria-label="Ниже" disabled={i === rows.length - 1} onClick={() => { const n = [...rows]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; change(n); }}>↓</button>
            <button className="btn btn-danger" onClick={() => change(rows.filter((_, k) => k !== i))}>Убрать</button>
          </div>
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions">
        <button className="btn" onClick={addScheme}>Добавить схему</button>
        <button className="btn" onClick={() => change([...rows, { kind: "other", number: "", name: "", date: null, fileId: null, sortOrder: rows.length }])}>Добавить документ</button>
        <button className="btn btn-primary" onClick={() => void save()}>Сохранить документы</button>
        {status && <span className="muted" role="status">{status}</span>}
      </div>
    </div>
  );
}
