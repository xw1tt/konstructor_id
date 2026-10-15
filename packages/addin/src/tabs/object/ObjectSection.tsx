import { useEffect, useState } from "react";
import type { ObjectInfo, Organization } from "@idk/shared/schemas";
import { ORG_ROLE_CODES, ORG_ROLE_LABELS } from "@idk/shared/roles";
import { apiGet, apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { Field, Section, Select, dateIn, dateOut } from "../common.tsx";

export function ObjectSection({ orgs }: { orgs: Organization[] }) {
  const guard = useGuard();
  const [obj, setObj] = useState<ObjectInfo | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void guard(apiGet<ObjectInfo>("/api/object")).then((o) => o && setObj(o)); }, []);
  if (!obj) return <Section title="Объект и роли"><p className="muted">Загрузка…</p></Section>;
  const set = (k: keyof ObjectInfo) => (v: string) => { setStatus(""); setObj({ ...obj, [k]: v }); };

  const save = async () => {
    setError("");
    const r = await guard(apiSend<ObjectInfo>("PUT", "/api/object", obj), setError);
    if (r) { setObj(r); setStatus("Сохранено"); }
  };
  const orgOptions = orgs.map((o) => ({ value: o.id, label: o.shortName }));

  return (
    <Section title="Объект и роли">
      <div className="form">
        <label>
          Наименование объекта
          <textarea rows={3} value={obj.name} onChange={(e) => set("name")(e.target.value)} />
        </label>
        <Field label="Адрес" value={obj.address} onChange={set("address")} />
        <div className="pair">
          <Field label="Договор №" value={obj.contractNumber} onChange={set("contractNumber")} />
          <Field label="Дата договора" type="date" value={dateIn(obj.contractDate)}
            onChange={(v) => { setStatus(""); setObj({ ...obj, contractDate: dateOut(v) }); }} />
        </div>
        <Field label="Город" value={obj.city} onChange={set("city")} />
        {ORG_ROLE_CODES.map((role) => (
          <Select key={role} label={ORG_ROLE_LABELS[role]} value={obj.roles[role]} options={orgOptions} empty="— не выбрано —"
            onChange={(v) => { setStatus(""); setObj({ ...obj, roles: { ...obj.roles, [role]: v } }); }} />
        ))}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-actions">
          <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
          {status && <span className="muted" role="status">{status}</span>}
        </div>
      </div>
    </Section>
  );
}
