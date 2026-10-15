import { useState } from "react";
import type { Organization, OrganizationInput } from "@idk/shared/schemas";
import { orgFullForm } from "@idk/shared/rules";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { Field, Section } from "../common.tsx";

const EMPTY: OrganizationInput = {
  shortName: "", fullName: "", ogrn: "", inn: "", address: "", phone: "", sroName: "", sroOgrn: "", sroInn: "",
};

export function OrganizationsSection({ orgs, onChange }: { orgs: Organization[]; onChange: () => void }) {
  const guard = useGuard();
  const [edit, setEdit] = useState<{ id: number | null; data: OrganizationInput } | null>(null);
  const [error, setError] = useState("");
  const set = (k: keyof OrganizationInput) => (v: string) => setEdit((e) => e && { ...e, data: { ...e.data, [k]: v } });

  const save = async () => {
    if (!edit) return;
    setError("");
    const r = await guard(
      edit.id === null ? apiSend("POST", "/api/organizations", edit.data) : apiSend("PUT", `/api/organizations/${edit.id}`, edit.data),
      setError,
    );
    if (r) { setEdit(null); onChange(); }
  };
  const remove = async () => {
    if (!edit?.id) return;
    setError("");
    const ok = await guard(apiSend("DELETE", `/api/organizations/${edit.id}`).then(() => true), setError);
    if (ok) { setEdit(null); onChange(); }
  };

  return (
    <Section title={`Организации (${orgs.length})`} open>
      {orgs.length === 0 && <p className="muted">Добавьте заказчика, подрядчиков и проектировщика объекта.</p>}
      <ul className="list">
        {orgs.map((o) => (
          <li key={o.id} className={edit?.id === o.id ? "selected" : ""}>
            <button className="link" onClick={() => { setError(""); setEdit({ id: o.id, data: { ...o } }); }}>{o.shortName}</button>
          </li>
        ))}
      </ul>
      {!edit && <div className="row-actions"><button className="btn" onClick={() => setEdit({ id: null, data: EMPTY })}>Добавить организацию</button></div>}
      {edit && (
        <div className="form">
          <Field label="Краткое наименование" value={edit.data.shortName} onChange={set("shortName")} placeholder='ООО "СБД"' />
          <Field label="Полное наименование" value={edit.data.fullName} onChange={set("fullName")} />
          <div className="pair">
            <Field label="ОГРН" value={edit.data.ogrn} onChange={set("ogrn")} />
            <Field label="ИНН" value={edit.data.inn} onChange={set("inn")} />
          </div>
          <Field label="Адрес" value={edit.data.address} onChange={set("address")} />
          <Field label="Телефон" value={edit.data.phone} onChange={set("phone")} />
          <Field label="СРО: наименование" value={edit.data.sroName} onChange={set("sroName")} />
          <div className="pair">
            <Field label="СРО: ОГРН" value={edit.data.sroOgrn} onChange={set("sroOgrn")} />
            <Field label="СРО: ИНН" value={edit.data.sroInn} onChange={set("sroInn")} />
          </div>
          <div>
            <span className="muted">Так реквизиты будут выглядеть в АОСР:</span>
            <div className="preview">{orgFullForm({ id: 0, ...edit.data })}</div>
          </div>
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
