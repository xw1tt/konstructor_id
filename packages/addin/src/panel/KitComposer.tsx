// 0.47: «Состав комплекта» в окне программы — свойства комплекта (том, часть, шифр, перечень работ) и акты по порядку:
// слева все акты книги с галочками и поиском, справа — акты комплекта (порядок стрелками или перетаскиванием).
// «Сохранить» переписывает «Акты комплектов» и сверяет реестр.
import { useEffect, useMemo, useState } from "react";
import { column, TABLES } from "@idk/shared/workbook/schema";
import { cellText } from "@idk/shared/workbook/values";
import { kitActs } from "@idk/shared/kit/registry";
import { planKitActs } from "@idk/shared/kit/compose";
import { actsOverview, shortNumbers, statusText } from "@idk/shared/acts/overview";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import { toCellFor } from "./card/editValue.ts";
import { keysOf } from "./card/RowCard.tsx";
import { todayIso } from "./today.ts";

const KIT_FIELDS = ["volume", "part", "section", "building", "works", "city", "year"] as const;

export function KitComposer({ port, state, kit, onSaved }: { port: BookPort; state: BookState; kit: string; onSaved(): Promise<unknown> }) {
  const book = state.book!;
  const saved = useMemo(() => kitActs(book, kit).acts, [book, kit]);
  const [list, setList] = useState<string[]>(saved);
  const [query, setQuery] = useState("");
  const [others, setOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setList(saved), [saved.join("\n")]);
  const dirty = list.join("\n") !== saved.join("\n");

  const overview = useMemo(() => actsOverview(book, state.important, todayIso()), [book, state.important]);
  const short = useMemo(() => shortNumbers(overview.map((a) => a.number)), [overview]);
  const kitOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of book.tables["АктыКомплектов"] ?? []) {
      const a = cellText(r.v.act);
      const k = cellText(r.v.kit);
      if (a && k && k !== kit) m.set(a, [...(m.get(a) ?? []), k]);
    }
    return m;
  }, [book, kit]);
  const q = query.trim().toLowerCase();
  const all = overview.filter(
    (a) => (others || !kitOf.has(a.number) || list.includes(a.number)) && (!q || a.number.toLowerCase().includes(q) || a.works.toLowerCase().includes(q)),
  );
  const byNumber = new Map(overview.map((a) => [a.number, a]));

  const toggle = (n: string) => setList((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]));
  const moveTo = (from: number, to: number) =>
    setList((l) => {
      if (to < 0 || to >= l.length) return l;
      const next = [...l];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  const sortBy = (how: "number" | "date") =>
    setList((l) =>
      [...l].sort((a, b) => {
        const x = byNumber.get(a);
        const y = byNumber.get(b);
        if (how === "date") return (x?.start ?? "").localeCompare(y?.start ?? "") || overview.indexOf(x!) - overview.indexOf(y!);
        return overview.indexOf(x!) - overview.indexOf(y!);
      }),
    );

  const save = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const plan = planKitActs(book, kit, list);
      const H = (k: "kit" | "act") => column("АктыКомплектов", k).header;
      for (const w of plan.write) await port.write("АктыКомплектов", w.row, { [H("kit")]: kit, [H("act")]: w.act });
      if (plan.insert) {
        const at = plan.insert.after === null ? (book.tables["АктыКомплектов"] ?? []).length : plan.insert.after + 1;
        await port.insert(
          "АктыКомплектов",
          at,
          plan.insert.acts.map((a) => ({ [H("kit")]: kit, [H("act")]: a })),
        );
      }
      if (plan.remove.length)
        await port.remove(
          "АктыКомплектов",
          [...plan.remove].sort((a, b) => b - a),
        );
      state.refresh();
      await onSaved();
      const n = list.length;
      const w = n % 10 === 1 && n % 100 !== 11 ? "акт" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "акта" : "актов";
      setNote(`Состав комплекта ${kit} сохранён: ${n} ${w}; реестр сверен.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Свойства комплекта — строка «Комплектов».
  const kitRow = (book.tables["Комплекты"] ?? []).find((r) => cellText(r.v.number) === kit);
  const writeProp = async (key: (typeof KIT_FIELDS)[number], text: string) => {
    if (!kitRow) return;
    const col = column("Комплекты", key);
    if (text === cellText(kitRow.v[key] ?? null)) return;
    const p = toCellFor("Комплекты", col, text);
    if (!p.ok) return setError(`${col.header}: ${p.message}`);
    await port.write("Комплекты", kitRow.row, { [col.header]: p.value });
    state.refresh();
  };

  return (
    <section className="kc">
      {kitRow && (
        <div className="kc-props">
          {KIT_FIELDS.map((key) => {
            const col = TABLES["Комплекты"].columns.find((c) => c.key === key)!;
            const value = cellText(kitRow.v[key] ?? null);
            const opts = col.type === "ref" && col.ref ? keysOf(book, col.ref) : [];
            return (
              <label key={key} className={key === "works" ? "kc-wide" : undefined}>
                <span>{col.header}</span>
                {key === "works" ? (
                  <textarea key={value} defaultValue={value} rows={2} onBlur={(e) => void writeProp(key, e.target.value)} />
                ) : (
                  <input key={value} defaultValue={value} list={opts.length ? `kc-${key}` : undefined} onBlur={(e) => void writeProp(key, e.target.value)} />
                )}
                {opts.length > 0 && (
                  <datalist id={`kc-${key}`}>
                    {opts.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                )}
              </label>
            );
          })}
        </div>
      )}
      <div className="kc-cols">
        <div className="kc-all">
          <header>
            <span className="wn-cap">Акты книги</span>
            <input type="search" placeholder="Номер или работы…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="muted">
              <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} /> и из других комплектов
            </label>
          </header>
          <div className="kc-list">
            {all.map((a) => (
              <label key={a.number} className={`kc-act${list.includes(a.number) ? " kc-act-on" : ""}`}>
                <input type="checkbox" checked={list.includes(a.number)} onChange={() => toggle(a.number)} />
                <b className="mono">{short.get(a.number) ?? a.number}</b>
                <span className="kc-works">{a.works || "—"}</span>
                <span className="muted mono">{a.dates}</span>
                {kitOf.has(a.number) && <span className="kc-tag">компл. {kitOf.get(a.number)!.join(", ")}</span>}
                <span className={`kc-st kc-st-${a.status}`}>{statusText(a)}</span>
              </label>
            ))}
            {!all.length && <p className="muted">Нет актов{q ? " по запросу" : ""}.</p>}
          </div>
          <div className="row-actions">
            <button className="btn btn-ghost" onClick={() => setList((l) => [...l, ...all.map((a) => a.number).filter((n) => !l.includes(n))])}>
              Отметить все показанные
            </button>
          </div>
        </div>
        <div className="kc-kit">
          <header>
            <span className="wn-cap">
              В комплекте {kit} — {list.length}
            </span>
            <span className="kc-sort">
              <button className="btn btn-ghost" onClick={() => sortBy("number")}>
                по порядку книги
              </button>
              <button className="btn btn-ghost" onClick={() => sortBy("date")}>
                по дате начала
              </button>
            </span>
          </header>
          <ol className="kc-list">
            {list.map((n, i) => (
              <li
                key={n}
                draggable
                className={drag === i ? "kc-drag" : undefined}
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drag !== null) moveTo(drag, i);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <span className="kc-grip" aria-hidden="true">
                  ⠿
                </span>
                <b className="mono">{short.get(n) ?? n}</b>
                <span className="kc-works">{byNumber.get(n)?.works ?? <span className="error">нет в «Базе актов»</span>}</span>
                <span className="kc-btns">
                  <button className="btn btn-icon btn-ghost" disabled={i === 0} onClick={() => moveTo(i, i - 1)} aria-label="Выше">
                    ↑
                  </button>
                  <button className="btn btn-icon btn-ghost" disabled={i === list.length - 1} onClick={() => moveTo(i, i + 1)} aria-label="Ниже">
                    ↓
                  </button>
                  <button className="btn btn-icon btn-ghost" onClick={() => toggle(n)} aria-label="Убрать из комплекта">
                    ✕
                  </button>
                </span>
              </li>
            ))}
            {!list.length && <p className="muted">Отметьте акты слева — они встанут сюда по порядку.</p>}
          </ol>
          <div className="row-actions">
            <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? "Сохраняю…" : dirty ? "Сохранить состав" : "Состав сохранён"}
            </button>
            {dirty && (
              <button className="btn" disabled={busy} onClick={() => setList(saved)}>
                Отменить изменения
              </button>
            )}
          </div>
          {note && <p className="notice">{note}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
