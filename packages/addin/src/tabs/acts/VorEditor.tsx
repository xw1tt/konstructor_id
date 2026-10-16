import { useMemo, useState } from "react";
import type { ActFull, VorLineInput } from "@idk/shared/acts/schemas";
import type { Material } from "@idk/shared/schemas";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { useList } from "../common.tsx";
import { cloneGroup, groupsOf, normalize, renameGroup } from "./vorMath.ts";
import { parseDecimalDraft, showDecimal } from "./decimal.ts";

export function VorEditor({ full, reload }: { full: ActFull; reload: () => void }) {
  const guard = useGuard();
  const [catalog] = useList<Material>("/api/materials");
  const [lines, setLines] = useState<VorLineInput[]>(() => normalize(full.vor));
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog]);
  const actMats = [...full.materials].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.materialId);
  const change = (next: VorLineInput[]) => { setStatus(""); setDrafts({}); setLines(normalize(next)); };
  // строки материалов, которых уже нет в акте, не показываем и не сохраняем
  const valid = lines.filter((l) => actMats.includes(l.materialId));
  const groups = groupsOf(valid);
  const indexed = lines.map((l, idx) => ({ l, idx })).filter((x) => actMats.includes(x.l.materialId));
  const save = async () => {
    setError("");
    const r = await guard(apiSend("PUT", `/api/acts/${full.act.id}/vor`, normalize(valid)), setError);
    if (r) { setStatus("Сохранено"); reload(); }
  };
  if (!actMats.length) return <p className="muted">Сначала добавьте материалы акта (п.3) и сохраните их.</p>;

  return (
    <div>
      {groups.map((g) => {
        const own = indexed.filter((x) => x.l.group === g);
        const free = actMats.filter((id) => !own.some((x) => x.l.materialId === id));
        return (
          <div className="form" key={g}>
            <label>Этаж / участок
              <input defaultValue={g} onBlur={(e) => e.target.value.trim() && e.target.value !== g && change(renameGroup(lines, g, e.target.value.trim()))} />
            </label>
            <ul className="list">
              {own.map(({ l, idx }) => (
                <li key={idx}>
                  <span className="grow" title={byId.get(l.materialId)?.name}>{byId.get(l.materialId)?.name ?? "…"}</span>
                  <input style={{ width: 70 }} inputMode="decimal" aria-label={`Объём ${byId.get(l.materialId)?.name ?? ""} (${g})`}
                    value={drafts[idx] ?? showDecimal(l.quantity)}
                    onChange={(e) => {
                      const p = parseDecimalDraft(e.target.value);
                      if (!p.ok) return;
                      setStatus("");
                      setDrafts({ ...drafts, [idx]: e.target.value });
                      setLines(lines.map((x, k) => (k === idx ? { ...x, quantity: p.value ?? 0 } : x)));
                    }}
                    onBlur={() => { const { [idx]: _d, ...rest } = drafts; setDrafts(rest); }} />
                  <span className="muted">{byId.get(l.materialId)?.unit}</span>
                  <button className="btn btn-icon btn-danger" aria-label="Убрать строку" onClick={() => change(lines.filter((_, k) => k !== idx))}>✕</button>
                </li>
              ))}
            </ul>
            <div className="row-actions">
              {free.length > 0 && (
                <select aria-label={`Добавить материал в ${g}`} value="" onChange={(e) => e.target.value &&
                  change([...lines, { group: g, materialId: Number(e.target.value), quantity: 0, sortOrder: lines.length }])}>
                  <option value="">+ материал…</option>
                  {free.map((id) => <option key={id} value={id}>{byId.get(id)?.name}</option>)}
                </select>
              )}
              <button className="btn" onClick={() => newName.trim() && (change(cloneGroup(lines, g, newName)), setNewName(""))}
                title="Создать новую группу с теми же материалами">Скопировать в новую группу</button>
            </div>
          </div>
        );
      })}
      <label className="muted">Название новой группы
        <input className="search" placeholder="Этаж П3" value={newName} onChange={(e) => setNewName(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions">
        <button className="btn" onClick={() => {
          const name = newName.trim();
          if (!name || groups.includes(name)) return;
          change([...lines, ...actMats.map((materialId, i) => ({ group: name, materialId, quantity: 0, sortOrder: lines.length + i }))]);
          setNewName("");
        }}>Добавить группу со всеми материалами</button>
        <button className="btn btn-primary" onClick={() => void save()}>Сохранить ВОР</button>
        {status && <span className="muted" role="status">{status}</span>}
      </div>
    </div>
  );
}
