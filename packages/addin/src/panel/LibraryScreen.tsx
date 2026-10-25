// План 16: раздел «Библиотека» — записи компании (организации, представители, материалы, документы качества);
// отмеченные — «Добавить в книгу» вместе с зависимостями.
import { useEffect, useState } from "react";
import { LIB_KINDS, LIB_LABELS, type LibKind, type LibRecord } from "@idk/shared/library/model";
import { cellText } from "@idk/shared/workbook/values";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { libraryApi } from "./libraryApi.ts";
import { addToBook, loadAll } from "./library.ts";

const t = (r: LibRecord, k: string) => cellText(r.values[k] ?? null);
const line = (r: LibRecord): [string, string] => {
  switch (r.kind) {
    case "org": return [t(r, "shortName"), [t(r, "inn") && `ИНН ${t(r, "inn")}`, t(r, "address")].filter(Boolean).join(", ")];
    case "rep": return [t(r, "fullName"), [t(r, "position"), t(r, "org")].filter(Boolean).join(", ")];
    case "material": return [[t(r, "name"), t(r, "mark")].filter(Boolean).join(" "), [t(r, "manufacturer"), t(r, "unit")].filter(Boolean).join(", ")];
    default: return [`${t(r, "type")} ${t(r, "number")}`, [t(r, "materials"), r.scan ? "скан есть" : "без скана"].filter(Boolean).join(" · ")];
  }
};

export function LibraryScreen({ port, state }: { port: ExcelPort; state: BookState }) {
  const [kind, setKind] = useState<LibKind>("material");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibRecord[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    const timer = setTimeout(() => {
      libraryApi.list(kind, q).then((l) => { if (alive) setItems(l); }).catch((e) => { if (alive) { setItems([]); setError((e as Error).message); } });
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [kind, q]);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const add = async () => {
    if (!state.book) return;
    setBusy(true); setError(""); setNote("");
    try {
      const all = await loadAll(libraryApi);
      const chosen = all.filter((r) => picked.has(r.id));
      const r = await addToBook(port, state.book, chosen, all, libraryApi, location.origin);
      setNote(`Добавлено в книгу: ${r.added}${r.skipped ? `, уже были: ${r.skipped}` : ""}. Материалы — вместе с документами качества, представители — с организацией.`);
      setPicked(new Set());
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="content library">
      <h2 className="app-title">Библиотека компании</h2>
      <p className="muted">Общие для всех объектов записи. Пополняется кнопкой «В библиотеку» в «Функционале таблицы»; папка — в «Настройках».</p>
      <div className="stamp" role="tablist" aria-label="Разделы библиотеки">
        {LIB_KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={k === kind} onClick={() => { setKind(k); setItems(null); }}>{LIB_LABELS[k]}</button>
        ))}
      </div>
      <input className="lib-search" type="search" placeholder="Поиск" aria-label="Поиск в библиотеке" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="error" role="alert">{error}</p>}
      {items === null ? <p className="notice">Загружаю…</p> : !items.length ? <p className="muted">Пусто{q ? " — ничего не найдено" : ""}.</p> : (
        <ul className="lib-list">
          {items.map((r) => {
            const [main, sub] = line(r);
            return (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                  <span><b>{main}</b>{sub && <span className="muted"> — {sub}</span>}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="row-actions">
        <button className="btn btn-primary" disabled={busy || !picked.size || !state.book} onClick={() => void add()}>
          Добавить в книгу{picked.size ? ` (${picked.size})` : ""}
        </button>
      </div>
      {note && <p className="notice">{note}</p>}
    </main>
  );
}
