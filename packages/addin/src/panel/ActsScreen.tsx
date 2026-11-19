// 0.37: экран «Акты» окна программы — все акты книги таблицей (поиск, статус, вид работ), выбор нескольких
// для печати одним PDF и файлов Word/Excel, справа — карточка выбранного акта (та же, что в панели).
import { useContext, useMemo, useState } from "react";
import { actsOverview, filterActs, statusText, type ActFilter, type ActOverview, type ActStatus } from "@idk/shared/acts/overview";
import type { Issue } from "@idk/shared/workbook/bundle";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import { ActExtras } from "./extras/ActExtras.tsx";
import { IssueList } from "./extras/IssueList.tsx";
import { PrintOptionsContext, TemplateContext, UserTemplateContext } from "./templateContext.ts";
import { templateButtons } from "./templatesApi.ts";
import { bundleFor, openPreview, sheetIssueLines, type IssueLine } from "./print.ts";
import { previewUrl } from "./kit.ts";
import { apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CHIPS: { id: ActFilter["status"]; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "ready", label: "Готовы" },
  { id: "warn", label: "Замечания" },
  { id: "blocked", label: "Не собираются" },
];

export function ActsScreen({ port, state }: { port: BookPort; state: BookState }) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const tpl = useContext(UserTemplateContext);
  const [filter, setFilter] = useState<ActFilter>({ query: "", status: "all", workKind: "" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState<"pdf" | "files" | null>(null);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [linesTitle, setLinesTitle] = useState("");
  const [note, setNote] = useState<{ text: string; href?: string; name?: string } | null>(null);
  const [error, setError] = useState("");

  const book = state.book;
  const all = useMemo(() => (book ? actsOverview(book, state.important, today()) : []), [book, state.important]);
  const kinds = useMemo(() => [...new Set(all.flatMap((a) => a.workKinds))].sort((a, b) => a.localeCompare(b, "ru")), [all]);
  const shown = filterActs(all, filter);
  const count = (s: ActStatus | "all") => (s === "all" ? all.length : all.filter((a) => a.status === s).length);
  const buttons = templateButtons(tpl.template);
  const printable = buttons.filter((b) => !b.form && b.doc);
  const docKey = printable.some((b) => b.key === doc) ? doc : (printable[0]?.key ?? "");
  const selected = all.filter((a) => picked.has(a.number));
  const has = (n: string | null): n is string => !!n && all.some((a) => a.number === n);
  // Карточка: выбранный в списке акт, иначе последний акт под курсором в Excel, иначе первый в списке.
  const open = has(current) ? current : has(state.lastAct) ? state.lastAct : (shown[0]?.number ?? null);

  if (!book) return <p className="notice">Читаю книгу…</p>;
  if (book.missing.includes("Акты")) return <p className="notice">В книге нет листа «База актов» — создайте разметку книги на экране «Книга».</p>;

  const toggle = (n: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  const allShownPicked = shown.length > 0 && shown.every((a) => picked.has(a.number));
  const pickShown = () =>
    setPicked((p) => {
      const next = new Set(p);
      for (const a of shown) {
        if (allShownPicked) next.delete(a.number);
        else next.add(a.number);
      }
      return next;
    });

  const reset = () => {
    setLines([]);
    setNote(null);
    setError("");
  };

  /** Один документ выбранных актов — одним PDF; акты, которые не собираются, — списком замечаний. */
  const printSelected = async () => {
    const b = printable.find((x) => x.key === docKey);
    if (!b?.doc) return;
    reset();
    setBusy("pdf");
    try {
      const issues: Issue[] = [];
      const bundles = selected.flatMap((a) => {
        const r = bundleFor(book, a.number, state.important, b.doc, options);
        if (!r.bundle) issues.push(...r.issues);
        return r.bundle ? [r.bundle] : [];
      });
      if (issues.length) {
        setLinesTitle(
          bundles.length ? "Эти акты не напечатаны — исправьте в книге (щелчок — к ячейке):" : "Не собраны — исправьте в книге (щелчок — к ячейке):",
        );
        setLines(await sheetIssueLines(port, issues));
      }
      if (!bundles.length) return;
      const r = await guard(apiSend<{ id: string }>("POST", "/api/print-batch", { template, options, kind: b.doc, bundles }), setError);
      if (!r) return;
      openPreview(previewUrl(`/api/print-batch/${r.id}`, location.origin));
      setNote({
        text: `${b.label}: актов ${bundles.length}${issues.length ? ` (не собраны: ${selected.length - bundles.length})` : ""} — открыт предпросмотр.`,
      });
    } finally {
      setBusy(null);
    }
  };

  /** Все документы выбранных актов файлами (свои формы — Word/Excel, встроенные — Excel) одним архивом. */
  const filesSelected = async () => {
    reset();
    setBusy("files");
    try {
      const issues: Issue[] = [];
      const items = selected.flatMap((a) =>
        buttons.flatMap((b) => {
          const r = bundleFor(book, a.number, state.important, b.doc, options);
          if (!r.bundle) {
            issues.push(...r.issues);
            return [];
          }
          return [{ bundle: r.bundle, kind: b.doc, form: b.form ? { template: tpl.template.id, doc: b.key } : null }];
        }),
      );
      if (issues.length) {
        setLinesTitle(items.length ? "Не вошли в архив (остальные документы — в архиве):" : "Документы не собраны — исправьте в книге (щелчок — к ячейке):");
        setLines(await sheetIssueLines(port, issues));
      }
      if (!items.length) return;
      const r = await guard(
        apiSend<{ id: string; name: string; files: string[]; errors: string[] }>("POST", "/api/act-files", {
          name: `Акты (${selected.length})`,
          options,
          items: items.slice(0, 300),
        }),
        setError,
      );
      if (!r) return;
      setNote({
        text: ` — файлов ${r.files.filter((f) => f !== "Ошибки.txt").length}${r.errors.length ? `, не собраны: ${r.errors.join("; ")}` : ""}`,
        href: `/api/act-files/${r.id}`,
        name: r.name,
      });
    } finally {
      setBusy(null);
    }
  };

  const row = (a: ActOverview) => (
    <tr key={a.number} className={a.number === open ? "acts-current" : undefined} onClick={() => setCurrent(a.number)}>
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`Выбрать акт ${a.number}`} checked={picked.has(a.number)} onChange={() => toggle(a.number)} />
      </td>
      <td className="acts-num">{a.number}</td>
      <td className="acts-works" title={a.works}>
        {a.works || <span className="hint">работы не указаны</span>}
      </td>
      <td className="acts-dates">{a.dates}</td>
      <td>{a.kits.join(", ") || "—"}</td>
      <td>
        <span className={`acts-badge acts-${a.status}`} title={a.status === "blocked" ? `Ошибок: ${a.problems}` : undefined}>
          {statusText(a)}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="acts">
      <header className="acts-head">
        <h2>Акты</h2>
        <span className="hint">{all.length ? `в книге ${all.length}` : "в книге пока нет актов"}</span>
        <button className="btn" onClick={() => void port.activateSheet("База актов")}>
          Открыть «Базу актов» в Excel
        </button>
      </header>
      <div className="acts-layout">
        <section className="acts-list">
          <div className="acts-tools">
            <input
              type="search"
              placeholder="Поиск: номер, работы, комплект"
              aria-label="Поиск по актам"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            />
            <div className="acts-chips" role="group" aria-label="Статус">
              {CHIPS.map((c) => (
                <button
                  key={c.id}
                  className={filter.status === c.id ? "chip chip-on" : "chip"}
                  aria-pressed={filter.status === c.id}
                  onClick={() => setFilter({ ...filter, status: c.id })}
                >
                  {c.label} · {count(c.id)}
                </button>
              ))}
            </div>
            {kinds.length > 0 && (
              <select aria-label="Вид работ" value={filter.workKind} onChange={(e) => setFilter({ ...filter, workKind: e.target.value })}>
                <option value="">Все виды работ</option>
                {kinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            )}
          </div>
          <div className="acts-table-wrap">
            <table className="acts-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" aria-label="Выбрать все показанные" checked={allShownPicked} onChange={pickShown} />
                  </th>
                  <th>Номер</th>
                  <th>Работы</th>
                  <th>Даты</th>
                  <th>Компл.</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>{shown.map(row)}</tbody>
            </table>
            {!shown.length && (
              <p className="notice">
                {all.length ? "Нет актов под условия поиска." : "Добавьте первый акт на листе «База актов» или мастером на экране «Книга»."}
              </p>
            )}
          </div>
          {selected.length > 0 && (
            <div className="acts-bar" role="region" aria-label="Выбранные акты">
              <span>
                Выбрано актов: <strong>{selected.length}</strong>
              </span>
              <button className="btn btn-link" onClick={() => setPicked(new Set())}>
                Снять выбор
              </button>
              <span className="acts-bar-gap" />
              <button
                className="btn"
                disabled={busy !== null}
                onClick={() => void filesSelected()}
                title="Все документы выбранных актов: свои формы — Word/Excel, встроенные — Excel, одним архивом"
              >
                {busy === "files" ? "Собираю…" : "Файлы Word/Excel"}
              </button>
              {printable.length > 0 && (
                <>
                  <select aria-label="Документ для печати" value={docKey} onChange={(e) => setDoc(e.target.value)}>
                    {printable.map((b) => (
                      <option key={b.key} value={b.key}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" disabled={busy !== null} onClick={() => void printSelected()}>
                    {busy === "pdf" ? "Готовлю…" : "Печать выбранных (PDF)"}
                  </button>
                </>
              )}
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className="notice" role="status">
              {note.href ? (
                <a href={note.href} download={note.name}>
                  Скачать {note.name}
                </a>
              ) : null}
              {note.text}
            </p>
          )}
          <IssueList port={port} lines={lines} title={linesTitle} />
          {printable.length < buttons.length && selected.length > 0 && (
            <p className="hint">Документы по своим формам шаблона печатаются из карточки акта или забираются архивом «Файлы Word/Excel».</p>
          )}
        </section>
        <aside className="acts-card" aria-label="Карточка акта">
          {open ? (
            <>
              <div className="row-actions">
                <button
                  className="btn btn-link"
                  onClick={() => {
                    const a = all.find((x) => x.number === open);
                    if (a) void port.selectCell("Акты", a.row, "Номер акта");
                  }}
                >
                  Показать в Excel
                </button>
              </div>
              <ActExtras key={open} port={port} state={state} act={open} />
            </>
          ) : (
            <p className="notice">Выберите акт в списке.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
