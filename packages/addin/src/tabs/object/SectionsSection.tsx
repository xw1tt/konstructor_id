import { useState } from "react";
import type { Organization, Section as Sec, SectionInput } from "@idk/shared/schemas";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { Field, Section, Select, useList } from "../common.tsx";

export function SectionsSection({ orgs }: { orgs: Organization[] }) {
  const guard = useGuard();
  const [items, reload] = useList<Sec>("/api/sections");
  const [edit, setEdit] = useState<{ id: number | null; data: SectionInput } | null>(null);
  const [error, setError] = useState("");

  const save = async () => {
    if (!edit) return;
    setError("");
    const r = await guard(edit.id === null ? apiSend("POST", "/api/sections", edit.data) : apiSend("PUT", `/api/sections/${edit.id}`, edit.data), setError);
    if (r) { setEdit(null); reload(); }
  };
  const remove = async () => {
    if (!edit?.id) return;
    const ok = await guard(apiSend("DELETE", `/api/sections/${edit.id}`).then(() => true), setError);
    if (ok) { setEdit(null); reload(); }
  };

  return (
    <Section title={`Разделы РД (${items.length})`}>
      <ul className="list">
        {items.map((s) => (
          <li key={s.id} className={edit?.id === s.id ? "selected" : ""}>
            <button className="link" title={s.name} onClick={() => setEdit({ id: s.id, data: { ...s } })}>{s.code}</button>
          </li>
        ))}
      </ul>
      {!edit && <div className="row-actions"><button className="btn" onClick={() => setEdit({ id: null, data: { code: "", name: "", designerOrgId: null } })}>Добавить раздел</button></div>}
      {edit && (
        <div className="form">
          <Field label="Шифр" value={edit.data.code} placeholder="КУТ03-Р-ПИР-2-26-100-АОВ1.01.00"
            onChange={(v) => setEdit({ ...edit, data: { ...edit.data, code: v } })} />
          <Field label="Наименование системы" value={edit.data.name} onChange={(v) => setEdit({ ...edit, data: { ...edit.data, name: v } })} />
          <Select label="Проектировщик" value={edit.data.designerOrgId} empty="— не выбрано —"
            options={orgs.map((o) => ({ value: o.id, label: o.shortName }))}
            onChange={(v) => setEdit({ ...edit, data: { ...edit.data, designerOrgId: v } })} />
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
            <button className="btn" onClick={() => { setEdit(null); setError(""); }}>Отмена</button>
            {edit.id !== null && <button className="btn btn-danger" onClick={() => void remove()}>Удалить</button>}
          </div>
        </div>
      )}
    </Section>
  );
}
