import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "../api.ts";
import { useGuard } from "../server.tsx";

/** Загружает список с сервера; reload() перечитывает. */
export function useList<T>(path: string): [T[], () => void] {
  const guard = useGuard();
  const [items, setItems] = useState<T[]>([]);
  const reload = useCallback(() => {
    void guard(apiGet<T[]>(path)).then((d) => d && setItems(d));
  }, [path]);
  useEffect(reload, [reload]);
  return [items, reload];
}

export function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Select<V extends string | number>({ label, value, options, onChange, empty }: {
  label: string; value: V | null; options: { value: V; label: string }[]; onChange: (v: V | null) => void; empty?: string;
}) {
  return (
    <label>
      {label}
      <select
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const opt = options.find((o) => String(o.value) === raw);
          onChange(opt ? opt.value : null);
        }}
      >
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Дата в поле <input type=date>: '' ↔ null. */
export const dateIn = (v: string | null) => v ?? "";
export const dateOut = (v: string) => (v ? v : null);
