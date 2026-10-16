// Поля карточки строки. Пока поле в фокусе, внешнее изменение ячейки не перетирает ввод.
import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@idk/shared/workbook/schema";
import { cellText, parseDateCell, splitRefs, type CellValue } from "@idk/shared/workbook/values";
import { fromCell } from "./editValue.ts";

export interface FieldProps {
  col: ColumnDef;
  value: CellValue;
  link: string | null;
  /** Ключи целевой таблицы для ссылок. */
  options: string[];
  error: string;
  onCommit: (input: string | string[]) => void;
  onUpload?: (file: File) => void;
}

function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  return {
    draft, setDraft,
    bind: { onFocus: () => { focused.current = true; }, onBlurCapture: () => { focused.current = false; } },
  };
}

export function Field(p: FieldProps) {
  const { col } = p;
  return (
    <label className={"field" + (p.error ? " field-error" : "")}>
      <span className="field-label">{col.header}{col.important ? " *" : ""}</span>
      <Input {...p} />
      {col.hint && <span className="field-hint">{col.hint}</span>}
      {p.error && <span className="error" role="alert">{p.error}</span>}
    </label>
  );
}

function Input(p: FieldProps) {
  const { col, value } = p;
  const text = fromCell(col, value);
  const d = useDraft(text);
  const commitText = () => { if (d.draft !== text) p.onCommit(d.draft); };

  switch (col.type) {
    case "formula":
      return <output className="readonly">{text || "—"}</output>;
    case "longtext":
      return <textarea rows={3} value={d.draft} {...d.bind} onChange={(e) => d.setDraft(e.target.value)} onBlur={commitText} />;
    case "date": {
      const iso = parseDateCell(value);
      return (
        <input type="date" value={iso.ok && iso.value ? iso.value : ""}
          onChange={(e) => p.onCommit(e.target.value ? e.target.value.split("-").reverse().join(".") : "")} />
      );
    }
    case "enum":
      return (
        <select value={cellText(value)} onChange={(e) => p.onCommit(e.target.value)}>
          <option value="">—</option>
          {!col.values!.includes(cellText(value)) && cellText(value) && <option value={cellText(value)}>{cellText(value)} (не из списка)</option>}
          {col.values!.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    case "ref": {
      const cur = cellText(value);
      return (
        <select value={cur} onChange={(e) => p.onCommit(e.target.value)}>
          <option value="">—</option>
          {cur && !p.options.includes(cur) && <option value={cur}>{cur} (нет в списке)</option>}
          {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    case "refs":
      return <MultiRef selected={splitRefs(value)} options={p.options} onCommit={p.onCommit} />;
    case "file":
      return (
        <span className="file">
          {p.link ? <a href={p.link} target="_blank" rel="noreferrer">{text || "файл"}</a> : <span className="muted">{text || "нет файла"}</span>}
          {p.onUpload && (
            <label className="btn btn-small">
              Загрузить
              <input type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onUpload!(f); e.target.value = ""; }} />
            </label>
          )}
        </span>
      );
    default:
      return (
        <input type="text" inputMode={col.type === "number" || col.type === "int" ? "decimal" : undefined}
          value={d.draft} {...d.bind} onChange={(e) => d.setDraft(e.target.value)} onBlur={commitText}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      );
  }
}

/** Выбор нескольких материалов галочками, с поиском по наименованию. */
function MultiRef({ selected, options, onCommit }: { selected: string[]; options: string[]; onCommit: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const missing = selected.filter((s) => !options.includes(s));
  const shown = [...missing, ...options].filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (o: string) => onCommit(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  return (
    <div className="multi">
      <input type="search" placeholder="Найти материал" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="multi-list">
        {shown.map((o) => (
          <li key={o}>
            <label className="check">
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              <span className={missing.includes(o) ? "error" : undefined}>{o}{missing.includes(o) ? " (нет на листе «Материалы»)" : ""}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
