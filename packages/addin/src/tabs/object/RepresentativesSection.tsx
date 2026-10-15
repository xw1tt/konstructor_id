import { useState } from "react";
import type { Organization, Representative, RepresentativeInput } from "@idk/shared/schemas";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@idk/shared/roles";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { Field, Section, Select, useList, dateIn, dateOut } from "../common.tsx";
import { moveRep } from "./repOrder.ts";

const empty = (role: RoleCode, orgId: number, sortOrder: number): RepresentativeInput => ({
  role, position: "", fullName: "", orgId, authorityDoc: "", nrsNumber: "", nrsDate: null,
  validFrom: null, validTo: null, sortOrder,
});

export function RepresentativesSection({ orgs }: { orgs: Organization[] }) {
  const guard = useGuard();
  const [reps, reload] = useList<Representative>("/api/representatives");
  const [edit, setEdit] = useState<{ id: number | null; data: RepresentativeInput } | null>(null);
  const [error, setError] = useState("");
  const orgName = (id: number) => orgs.find((o) => o.id === id)?.shortName ?? "";
  const set = <K extends keyof RepresentativeInput>(k: K, v: RepresentativeInput[K]) =>
    setEdit((e) => e && { ...e, data: { ...e.data, [k]: v } });

  const save = async () => {
    if (!edit) return;
    setError("");
    const r = await guard(edit.id === null ? apiSend("POST", "/api/representatives", edit.data) : apiSend("PUT", `/api/representatives/${edit.id}`, edit.data), setError);
    if (r) { setEdit(null); reload(); }
  };
  const remove = async () => {
    if (!edit?.id) return;
    const ok = await guard(apiSend("DELETE", `/api/representatives/${edit.id}`).then(() => true), setError);
    if (ok) { setEdit(null); reload(); }
  };
  const move = async (role: RoleCode, id: number, dir: -1 | 1) => {
    const group = reps.filter((r) => r.role === role);
    for (const ch of moveRep(group, id, dir)) {
      const r = group.find((x) => x.id === ch.id)!;
      const { id: _id, ...data } = r;
      await guard(apiSend("PUT", `/api/representatives/${ch.id}`, { ...data, sortOrder: ch.sortOrder }));
    }
    reload();
  };

  return (
    <Section title={`Представители (${reps.length})`}>
      {orgs.length === 0 && <p className="muted">Сначала добавьте организации.</p>}
      {ROLE_CODES.map((role) => {
        const group = reps.filter((r) => r.role === role).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
        return (
          <div className="role-group" key={role}>
            <h4>{ROLE_LABELS[role]}</h4>
            {group.length === 0 && <p className="muted">Никого нет</p>}
            <ul className="list">
              {group.map((r, i) => (
                <li key={r.id} className={edit?.id === r.id ? "selected" : ""}>
                  <button className="link" title={`${r.position}, ${orgName(r.orgId)}`}
                    onClick={() => { setError(""); const { id, ...data } = r; setEdit({ id, data }); }}>
                    {r.fullName} <span className="muted">{orgName(r.orgId)}</span>
                  </button>
                  <button className="btn btn-icon" aria-label={`Поднять ${r.fullName}`} disabled={i === 0} onClick={() => void move(role, r.id, -1)}>↑</button>
                  <button className="btn btn-icon" aria-label={`Опустить ${r.fullName}`} disabled={i === group.length - 1} onClick={() => void move(role, r.id, 1)}>↓</button>
                </li>
              ))}
            </ul>
            {orgs.length > 0 && !edit && (
              <button className="btn" onClick={() => { setError(""); setEdit({ id: null, data: empty(role, orgs[0].id, group.length + 1) }); }}>
                Добавить
              </button>
            )}
            {edit && edit.data.role === role && (
              <div className="form">
                <Field label="Должность" value={edit.data.position} onChange={(v) => set("position", v)} placeholder="Начальник участка" />
                <Field label="ФИО" value={edit.data.fullName} onChange={(v) => set("fullName", v)} placeholder="Востров В.П." />
                <Select label="Организация" value={edit.data.orgId} options={orgs.map((o) => ({ value: o.id, label: o.shortName }))}
                  onChange={(v) => v !== null && set("orgId", v)} />
                <Field label="Документ о полномочиях" value={edit.data.authorityDoc} onChange={(v) => set("authorityDoc", v)}
                  placeholder="приказ №006 от 06.05.2026г." />
                <div className="pair">
                  <Field label="№ в НРС" value={edit.data.nrsNumber} onChange={(v) => set("nrsNumber", v)} />
                  <Field label="Дата НРС" type="date" value={dateIn(edit.data.nrsDate)} onChange={(v) => set("nrsDate", dateOut(v))} />
                </div>
                <div className="pair">
                  <Field label="Полномочия с" type="date" value={dateIn(edit.data.validFrom)} onChange={(v) => set("validFrom", dateOut(v))} />
                  <Field label="по" type="date" value={dateIn(edit.data.validTo)} onChange={(v) => set("validTo", dateOut(v))} />
                </div>
                {error && <p className="error" role="alert">{error}</p>}
                <div className="row-actions">
                  <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
                  <button className="btn" onClick={() => { setEdit(null); setError(""); }}>Отмена</button>
                  {edit.id !== null && <button className="btn btn-danger" onClick={() => void remove()}>Удалить</button>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Section>
  );
}
