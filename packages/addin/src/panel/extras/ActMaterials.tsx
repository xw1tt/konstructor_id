// План 30: материалы акта — галочки и количество прямо в карточке акта (лист «Материалы в актах» — служебный).
import { useEffect, useMemo, useState } from "react";
import { cellText } from "@idk/shared/workbook/values";
import { actMaterialRows, describeActMaterials, planActMaterials, type ActMaterialPick } from "@idk/shared/acts/actMaterials";
import { applyChanges } from "@idk/shared/ai/changes";
import type { ExcelPort } from "../../book/excelPort.ts";
import type { BookState } from "../useBook.ts";

interface Line { material: string; mark: string; unit: string; on: boolean; quantity: string; position: string }

const qty = (s: string): number | null => {
  const t = s.replace(",", ".").replace(/\s/g, "");
  return t && Number.isFinite(Number(t)) ? Number(t) : null;
};

export function ActMaterials({ port, state, act }: { port: ExcelPort; state: BookState; act: string }) {
  const book = state.book!;
  const initial = useMemo((): Line[] => {
    const cur = actMaterialRows(book, act);
    const byName = new Map(cur.map((r) => [r.material.toLowerCase(), r]));
    const all = (book.tables["Материалы"] ?? []).map((r) => ({ material: cellText(r.v.name), mark: cellText(r.v.mark), unit: cellText(r.v.unit) })).filter((m) => m.material);
    const lines = all.map((m) => {
      const c = byName.get(m.material.toLowerCase());
      return { ...m, on: !!c, quantity: c?.quantity !== null && c?.quantity !== undefined ? String(c.quantity).replace(".", ",") : "", position: c?.position ?? "" };
    });
    // Материал акта, которого нет в справочнике, — тоже в списке (его можно снять).
    for (const c of cur) if (!all.some((m) => m.material.toLowerCase() === c.material.toLowerCase()))
      lines.push({ material: c.material, mark: "", unit: "", on: true, quantity: c.quantity !== null ? String(c.quantity) : "", position: c.position });
    // Выбранные — сверху, в порядке акта.
    const order = new Map(cur.map((c, i) => [c.material.toLowerCase(), i]));
    return lines.sort((a, b) => (order.get(a.material.toLowerCase()) ?? 1e9) - (order.get(b.material.toLowerCase()) ?? 1e9));
  }, [book, act]);
  const [lines, setLines] = useState(initial);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { setLines(initial); }, [initial]);

  const picks: ActMaterialPick[] = lines.filter((l) => l.on).map((l) => ({ material: l.material, quantity: qty(l.quantity), position: l.position }));
  const changes = planActMaterials(book, act, picks);
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const shown = lines.map((l, i) => ({ l, i })).filter(({ l }) => !q.trim() || `${l.material} ${l.mark}`.toLowerCase().includes(q.trim().toLowerCase()));

  const save = async () => {
    setBusy(true); setNote(null);
    try {
      if (await port.isFiltered("МатериалыАктов")) await port.clearFilters("МатериалыАктов");
      await applyChanges(port, changes);
      setNote({ text: `Материалы акта сохранены: ${describeActMaterials(changes)}.` });
      state.refresh();
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="act-materials">
      <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        Материалы акта: {picks.length}{open ? " ▴" : " ▾"}
      </button>
      {open && (
        <div className="setting">
          <input placeholder="Найти материал" value={q} onChange={(e) => setQ(e.target.value)} />
          {!lines.length && <p className="muted">Справочник «Материалы» пуст — сначала заполните его на листе «Материалы».</p>}
          <ul className="list act-mat-list">
            {shown.map(({ l, i }) => (
              <li key={l.material} className={l.on ? "on" : ""}>
                <label className="setting-option">
                  <input type="checkbox" checked={l.on} onChange={(e) => set(i, { on: e.target.checked })} />
                  <span>{l.material}{l.mark ? <span className="muted"> · {l.mark}</span> : null}</span>
                </label>
                {l.on && (
                  <div className="act-mat-qty">
                    <input aria-label={`Кол-во: ${l.material}`} placeholder="по ВОР" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                    <span className="muted">{l.unit}</span>
                    <input aria-label={`№ поз.: ${l.material}`} placeholder="№ поз. (б/н)" value={l.position} onChange={(e) => set(i, { position: e.target.value })} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy || !changes.length} onClick={() => void save()}>
              {busy ? "Сохраняю…" : changes.length ? `Сохранить (${describeActMaterials(changes)})` : "Без изменений"}
            </button>
            <button className="btn" disabled={busy} onClick={() => setLines(initial)}>Сбросить</button>
          </div>
          <p className="muted">Пустое количество — берётся сумма по ВОР. Новые материалы встают в конец списка акта.</p>
        </div>
      )}
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
    </div>
  );
}
