import { useMemo, useState } from "react";
import type { ActFull, ActMaterialInput } from "@idk/shared/acts/schemas";
import type { Material, QualityDoc } from "@idk/shared/schemas";
import { vorTotals, MATERIALS_INLINE_LIMIT } from "@idk/shared/acts/rows";
import { formatNumber } from "@idk/shared/acts/format";
import { apiSend } from "../../api.ts";
import { useGuard } from "../../server.tsx";
import { useList } from "../common.tsx";

export function ActMaterials({ full, reload }: { full: ActFull; reload: () => void }) {
  const guard = useGuard();
  const [catalog] = useList<Material>("/api/materials");
  const [docs] = useList<QualityDoc>("/api/quality-docs");
  const [rows, setRows] = useState<ActMaterialInput[]>(() => [...full.materials].sort((a, b) => a.sortOrder - b.sortOrder));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog]);
  const withDocs = useMemo(() => new Set(docs.flatMap((d) => d.materialIds)), [docs]);
  const totals = useMemo(() => vorTotals(full.vor), [full.vor]);
  const change = (next: ActMaterialInput[]) => { setStatus(""); setRows(next.map((r, i) => ({ ...r, sortOrder: i }))); };
  const update = (i: number, patch: Partial<ActMaterialInput>) => change(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const n = [...rows]; [n[i], n[j]] = [n[j], n[i]]; change(n);
  };
  const q = query.trim().toLowerCase();
  const found = q ? catalog.filter((m) => !rows.some((r) => r.materialId === m.id) && `${m.name} ${m.mark} ${m.article}`.toLowerCase().includes(q)).slice(0, 8) : [];
  const save = async () => {
    setError("");
    const r = await guard(apiSend("PUT", `/api/acts/${full.act.id}/materials`, rows), setError);
    if (r) { setStatus("Сохранено"); reload(); }
  };

  return (
    <div>
      <p className="muted">
        {rows.length > MATERIALS_INLINE_LIMIT
          ? `Материалов ${rows.length} — в п.3 будет ссылка на РИМ и ВД.`
          : `Материалов ${rows.length} — перечисляются прямо в п.3 (до ${MATERIALS_INLINE_LIMIT}).`}
      </p>
      <ul className="list">
        {rows.map((r, i) => {
          const m = byId.get(r.materialId);
          const vor = totals.get(r.materialId);
          return (
            <li key={r.materialId} style={{ flexWrap: "wrap" }}>
              <span className="grow" title={m?.name}>{i + 1}. {m?.name ?? "…"}</span>
              <button className="btn btn-icon" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn btn-icon" aria-label="Ниже" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn btn-icon btn-danger" aria-label={`Убрать ${m?.name ?? ""}`} onClick={() => change(rows.filter((_, k) => k !== i))}>✕</button>
              <div className="pair mini" style={{ width: "100%" }}>
                <label className="muted">№ поз по УСР
                  <input value={r.position} onChange={(e) => update(i, { position: e.target.value })} />
                </label>
                <label className="muted">Кол-во, {m?.unit || "ед."}
                  <input inputMode="decimal" value={r.quantity === null ? "" : String(r.quantity).replace(".", ",")}
                    placeholder={vor !== undefined ? `по ВОР: ${formatNumber(vor)}` : "по ВОР"}
                    onChange={(e) => {
                      const v = e.target.value.trim().replace(",", ".");
                      update(i, { quantity: v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : r.quantity });
                    }} />
                </label>
              </div>
              {!withDocs.has(r.materialId) && <span className="warn">нет документов качества</span>}
            </li>
          );
        })}
      </ul>
      <input className="search" placeholder="Найти материал в общей таблице, чтобы добавить" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="list">
        {found.map((m) => (
          <li key={m.id}>
            <span className="grow">{m.name} <span className="muted">{m.article || m.mark}</span></span>
            <button className="btn" onClick={() => { change([...rows, { materialId: m.id, position: "б/н", quantity: null, sortOrder: rows.length }]); setQuery(""); }}>Добавить</button>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-actions">
        <button className="btn btn-primary" onClick={() => void save()}>Сохранить материалы</button>
        {status && <span className="muted" role="status">{status}</span>}
      </div>
    </div>
  );
}
