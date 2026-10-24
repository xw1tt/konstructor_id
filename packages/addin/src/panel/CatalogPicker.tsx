// План 12, задача 7: «Из справочника» — дерево раздел → вид работ; галочка добавляет документы вида работ в шаблон.
import { useState } from "react";
import type { Catalog } from "@idk/shared/catalog/model";
import { addWork, removeWork, templateWorks } from "@idk/shared/catalog/template";
import type { UserTemplate } from "@idk/shared/forms/template";

export function CatalogPicker({ catalog, template, onApply }: {
  catalog: Catalog; template: UserTemplate; onApply(next: UserTemplate): void;
}) {
  const used = new Set(templateWorks(template));
  /** Снятая галочка убирает документы без оставшихся видов работ — после подтверждения. */
  const [pending, setPending] = useState<{ next: UserTemplate; removed: string[] } | null>(null);
  const doc = (code: string) => catalog.docs.find((d) => d.code === code);
  const toggle = (work: string) => {
    if (!used.has(work)) { onApply(addWork(template, catalog, work)); return; }
    const r = removeWork(template, work);
    if (r.removed.length) setPending({ next: r.template, removed: r.removed });
    else onApply(r.template);
  };
  return (
    <div className="extras catalog-picker" aria-label="Из справочника">
      {catalog.sections.map((s) => (
        <fieldset key={s.code} className="setting">
          <legend>{s.code} — {s.name}</legend>
          {s.works.map((w) => (
            <label key={w.code} className="setting-option">
              <input type="checkbox" checked={used.has(w.code)} onChange={() => toggle(w.code)} />
              <span><b>{w.name}</b><br /><span className="muted">{w.docs.map((c) => doc(c)?.code ?? c).join(", ")}</span></span>
            </label>
          ))}
        </fieldset>
      ))}
      {pending && (
        <div className="confirm" role="alertdialog" aria-label="Убрать документы">
          <p>Убрать из шаблона документы, не нужные другим видам работ: {pending.removed.join(", ")}?</p>
          <div className="row-actions">
            <button className="btn btn-danger" onClick={() => { onApply(pending.next); setPending(null); }}>Убрать</button>
            <button className="btn" onClick={() => setPending(null)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
