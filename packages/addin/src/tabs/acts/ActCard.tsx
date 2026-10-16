import { useEffect, useState, type ReactNode } from "react";
import type { Act, ActInput, ActFull } from "@idk/shared/acts/schemas";
import type { Organization, Representative, Section as Sec } from "@idk/shared/schemas";
import { apiGet, apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { Field, Section, Select, useList, dateIn, dateOut } from "../common.tsx";

export type ActCardSlots = {
  materials?: (full: ActFull, reload: () => void) => ReactNode;
  documents?: (full: ActFull, reload: () => void) => ReactNode;
  vor?: (full: ActFull, reload: () => void) => ReactNode;
  print?: (act: Act) => ReactNode;
};

export function ActCard({ id, onClose, onChanged, slots = {} }: {
  id: number; onClose: () => void; onChanged: () => void; slots?: ActCardSlots;
}) {
  const guard = useGuard();
  const [full, setFull] = useState<ActFull | null>(null);
  const [form, setForm] = useState<ActInput | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [orgs] = useList<Organization>("/api/organizations");
  const [sections] = useList<Sec>("/api/sections");
  const [reps] = useList<Representative>("/api/representatives");

  const load = () => void guard(apiGet<ActFull>(`/api/acts/${id}/full`), setError).then((f) => {
    if (!f) return;
    setFull(f);
    const { id: _id, ...data } = f.act;
    setForm(data);
  });
  useEffect(load, [id]);
  if (!form || !full) return <p className="muted">Загрузка…</p>;

  const set = <K extends keyof ActInput>(k: K, v: ActInput[K]) => { setStatus(""); setForm({ ...form, [k]: v }); };
  const txt = (k: keyof ActInput) => (v: string) => set(k, v as never);
  const save = async () => {
    setError("");
    const r = await guard(apiSend<Act>("PUT", `/api/acts/${id}`, form), setError);
    if (r) { setStatus("Сохранено"); onChanged(); load(); }
  };
  const remove = async () => {
    const ok = await guard(apiSend("DELETE", `/api/acts/${id}`).then(() => true), setError);
    if (ok) { onChanged(); onClose(); }
  };
  const area = (label: string, k: keyof ActInput, rows = 3, placeholder = "") => (
    <label>{label}<textarea rows={rows} value={String(form[k] ?? "")} placeholder={placeholder}
      onChange={(e) => set(k, e.target.value as never)} /></label>
  );
  const repOptions = reps.map((r) => ({ value: r.id, label: `${r.fullName} — ${r.position || "без должности"}` }));
  const section = sections.find((s) => s.id === form.sectionId);
  const designer = orgs.find((o) => o.id === section?.designerOrgId);

  return (
    <>
      <Section title={`Акт №${form.baseNumber}.АОСР`} open>
        <div className="row-actions">
          <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
          <button className="btn" onClick={onClose}>К списку актов</button>
          {status && <span className="muted" role="status">{status}</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {slots.print?.(full.act)}
      </Section>
      <Section title="Номер и даты" open>
        <div className="form">
          <Field label="Номер акта (без «.АОСР»)" value={form.baseNumber} onChange={txt("baseNumber")} />
          <Field label="Дата акта" type="date" value={dateIn(form.date)} onChange={(v) => v && set("date", v)} />
          <div className="pair">
            <Field label="Начало работ" type="date" value={dateIn(form.dateStart)} onChange={(v) => set("dateStart", dateOut(v))} />
            <Field label="Окончание работ" type="date" value={dateIn(form.dateEnd)} onChange={(v) => set("dateEnd", dateOut(v))} />
          </div>
          <Select label="Раздел РД" value={form.sectionId} empty="— не выбран —"
            options={sections.map((s) => ({ value: s.id, label: s.code }))} onChange={(v) => set("sectionId", v)} />
          <Select label="Работы выполнила организация" value={form.performerOrgId} empty="— не выбрана —"
            options={orgs.map((o) => ({ value: o.id, label: o.shortName }))} onChange={(v) => set("performerOrgId", v)} />
        </div>
      </Section>
      <Section title="П.1–2 Работы и проект">
        <div className="form">
          {area("1. Предъявленные работы", "works", 4, "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К…")}
          <div className="pair">
            <Field label="Листы РД" value={form.sheets} onChange={txt("sheets")} placeholder="0210-0230" />
            <Field label="Ревизия" value={form.revision} onChange={txt("revision")} placeholder="рев.1" />
          </div>
          <div className="preview">
            Шифр рабочей документации: {section?.code ?? "—"}{form.sheets && ` листы ${form.sheets}`}
            {form.revision && `, ${form.revision}`}{designer && `, ${designer.shortName}`}
          </div>
        </div>
      </Section>
      {slots.materials && <Section title="П.3 Материалы">{slots.materials(full, load)}</Section>}
      {slots.documents && <Section title="П.4 Документы">{slots.documents(full, load)}</Section>}
      <Section title="П.6–7">
        <div className="form">
          {area("6. Работы выполнены в соответствии с", "normative", 4)}
          {area("7. Разрешается производство последующих работ", "nextWorks", 3)}
        </div>
      </Section>
      {slots.vor && <Section title="ВОР по этажам">{slots.vor(full, load)}</Section>}
      <Section title="Подписи ВОР">
        <div className="form">
          {area("Комплекс работ (строка в шапке ВОР)", "vorTitle", 2)}
          <Select label="Представитель заказчика" value={form.vorCustomerRepId} empty="— не выбран —" options={repOptions}
            onChange={(v) => set("vorCustomerRepId", v)} />
          <Select label="Представитель монтажной организации" value={form.vorContractorRepId} empty="— не выбран —" options={repOptions}
            onChange={(v) => set("vorContractorRepId", v)} />
        </div>
      </Section>
      <Section title="Прочее">
        <div className="form">
          <Field label="Дополнительные сведения" value={form.extraInfo} onChange={txt("extraInfo")} />
          <label>Число экземпляров
            <input type="number" min={1} value={form.copies} onChange={(e) => set("copies", Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <Field label="Приложения" value={form.attachments} onChange={txt("attachments")} />
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
            <button className="btn btn-danger" onClick={() => void remove()}>Удалить акт</button>
          </div>
        </div>
      </Section>
    </>
  );
}
