// Настройка бланка встроенного документа в шаблоне: какие графы и строки печатать и как называются графы.
import { useState } from "react";
import { blankDef, blankView, describeBlank } from "@idk/shared/blanks";

export interface BlankValue { hide: string[]; headers: Record<string, string> }

export function BlankEditor({ blankKey, value, disabled, onChange }: {
  blankKey: string; value: BlankValue | null; disabled?: boolean; onChange(v: BlankValue): void;
}) {
  const def = blankDef(blankKey);
  const [open, setOpen] = useState(false);
  if (!def) return null;
  const v: BlankValue = { hide: value?.hide ?? [], headers: value?.headers ?? {} };
  const view = blankView(blankKey, v);
  const diff = describeBlank(blankKey, v);
  const toggle = (key: string, on: boolean) => onChange({ ...v, hide: on ? v.hide.filter((k) => k !== key) : [...v.hide, key] });
  return (
    <div className="blank-editor">
      <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        Бланк{diff.length ? ` (изменён: ${diff.length})` : ""}{open ? " ▴" : " ▾"}
      </button>
      {open && (
        <fieldset className="setting" disabled={disabled}>
          <legend>{def.label}: графы таблицы</legend>
          {def.columns.map((c) => (
            <div key={c.key} className="blank-col">
              <label className="setting-option" title={c.fixed ? "Основная графа — её нельзя скрыть" : undefined}>
                <input type="checkbox" checked={view.shown(c.key)} disabled={c.fixed} onChange={(e) => toggle(c.key, e.target.checked)} />
                {c.group ? <span className="muted">{c.group}: </span> : null}
              </label>
              <input aria-label={`Заголовок графы «${c.header}»`} placeholder={c.header} defaultValue={v.headers[c.key] ?? ""} key={`${blankKey}-${c.key}-${v.headers[c.key] ?? ""}`}
                onBlur={(e) => { const h = e.target.value.trim(); if (h !== (v.headers[c.key] ?? "")) onChange({ ...v, headers: { ...v.headers, [c.key]: h === c.header ? "" : h } }); }} />
            </div>
          ))}
          {def.blocks.length > 0 && <p className="muted">Строки и блоки:</p>}
          {def.blocks.map((b) => (
            <label key={b.key} className="setting-option">
              <input type="checkbox" checked={view.shown(b.key)} onChange={(e) => toggle(b.key, e.target.checked)} /> {b.label}
            </label>
          ))}
          <div className="row-actions">
            <button className="btn" disabled={!diff.length} onClick={() => onChange({ hide: [], headers: {} })}>Исходный вид</button>
          </div>
          <p className="muted">Действует на PDF и Excel всех актов книги с этим шаблоном. Пустой заголовок — как в образце.</p>
        </fieldset>
      )}
    </div>
  );
}
