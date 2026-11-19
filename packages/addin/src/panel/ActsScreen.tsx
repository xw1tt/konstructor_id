// 0.37 / редизайн 0.40: экран «Акты» окна программы — таблица актов (статус, номер, работы, период, комплект, документы),
// поиск, отбор по статусу и виду работ, плавающая панель выбранных актов; справа — карточка акта: документы акта,
// замечания с местом в книге, подписанты, печать. «⋯» раскрывает полную карточку (материалы, подписанты, полнота).
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { actsOverview, filterActs, shortNumbers, statusText, type ActFilter, type ActOverview, type ActStatus } from "@idk/shared/acts/overview";
import { completeness, docCode } from "@idk/shared/catalog/need";
import { checkActs } from "@idk/shared/check/predelivery";
import { addNextAct } from "@idk/shared/acts/nextAct";
import { buildBundle, type Issue } from "@idk/shared/workbook/bundle";
import type { Book } from "@idk/shared/workbook/records";
import type { PrintKind } from "@idk/shared/acts/schemas";
import { ROLE_CODES, type RoleCode } from "@idk/shared/roles";
import { roleFromBook } from "@idk/shared/workbook/schema";
import { cellText, parseDateCell, splitRefs } from "@idk/shared/workbook/values";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import type { ScreenId } from "./screens.ts";
import { ActExtras } from "./extras/ActExtras.tsx";
import { IssueList } from "./extras/IssueList.tsx";
import { PreDelivery } from "./extras/PreDelivery.tsx";
import { CatalogContext } from "./catalogApi.ts";
import { PrintOptionsContext, TemplateContext, UserTemplateContext } from "./templateContext.ts";
import { templateButtons, type TemplateButton } from "./templatesApi.ts";
import { bundleFor, openPreview, printAct, printForm, sheetIssueLines, type IssueLine } from "./print.ts";
import { previewUrl } from "./kit.ts";
import { apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import { IssueIcon, IssueTable, type IssueItem } from "./IssueTable.tsx";
import { actDates } from "@idk/shared/acts/overview";
import { todayIso } from "./today.ts";

const CHIPS: { id: ActFilter["status"]; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "ready", label: "Готовы" },
  { id: "warn", label: "Замечания" },
  { id: "blocked", label: "Не собираются" },
];

type DocState = "ok" | "warn" | "bad" | "off";
const SHORT: Record<string, string> = { "Протокол изоляции": "Протокол" };
const shortLabel = (l: string) => SHORT[l] ?? l.replace(/^Протокол .*/, "Протокол");

/** Состояние документов шаблона для акта: не нужен по «Виду работ» — off; нет скана/формы/данных — warn; не собирается — bad. */
function docStates(
  book: Book,
  a: ActOverview,
  buttons: TemplateButton[],
  important: BookState["important"],
  needed: ReturnType<typeof completeness> | null,
): DocState[] {
  return buttons.map((b) => {
    const st = needed?.find((s) => docCode(s.doc) === b.label || docCode(s.doc) === b.key);
    if (needed && !st) return "off";
    if (st && (st.status === "noScan" || st.status === "noForm" || st.status === "noData")) return "warn";
    if (a.status === "blocked" && b.doc && !bundleFor(book, a.number, important, b.doc).bundle) return "bad";
    return "ok";
  });
}

function DocSquares({ states, labels }: { states: DocState[]; labels: string[] }) {
  return (
    <span className="dsq" aria-label={labels.map((l, i) => `${l}: ${states[i]}`).join(", ")}>
      {states.map((s, i) => (
        <i
          key={i}
          className={`dsq-${s}`}
          title={`${labels[i]}: ${s === "off" ? "не нужен" : s === "bad" ? "не собирается" : s === "warn" ? "нет скана или формы" : "печатается"}`}
        />
      ))}
    </span>
  );
}

const iso = (v: unknown) => {
  const p = parseDateCell((v ?? null) as never);
  return p.ok ? (p.value ?? "") : "";
};
const ru = (d: string) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "—");
const SIGN_SHORT: Record<RoleCode, string> = {
  developer_control: "Технадзор",
  builder: "Строительство",
  builder_control: "Стройконтроль",
  designer: "Проектировщик",
  performer: "Выполнивший",
  other: "Иные",
};
/** «Соколов Алексей Викторович» → «Соколов А. В.». */
const initials = (n: string) => {
  const [f, ...rest] = n.trim().split(/\s+/);
  return rest.length ? `${f} ${rest.map((x) => x[0] + ".").join(" ")}` : n;
};

/** Подписанты акта по ролям: отмеченные в «Подписантах», иначе действующие на дату акта. */
function signersOf(book: Book, act: string): { role: RoleCode; names: string[] }[] {
  const row = book.tables["Акты"]?.find((r) => cellText(r.v.baseNumber) === act);
  if (!row) return [];
  const date = iso(row.v.date);
  const chosen = new Set(splitRefs(row.v.signers ?? null).map((s) => s.trim().toLowerCase()));
  const by = new Map<RoleCode, { name: string; active: boolean }[]>();
  for (const r of book.tables["Представители"] ?? []) {
    const role = roleFromBook(cellText(r.v.role));
    const name = cellText(r.v.fullName);
    if (!role || !name) continue;
    const f = iso(r.v.validFrom),
      t = iso(r.v.validTo);
    const list = by.get(role) ?? [];
    list.push({ name, active: !date || ((!f || f <= date) && (!t || date <= t)) });
    by.set(role, list);
  }
  return ROLE_CODES.filter((r) => by.has(r)).map((role) => {
    const list = by.get(role)!;
    const manual = list.filter((p) => chosen.has(p.name.trim().toLowerCase()));
    return { role, names: [...new Set((manual.length ? manual : list.filter((p) => p.active)).map((p) => p.name))] };
  });
}

function ActCard({
  port,
  state,
  a,
  label,
  buttons,
  states,
  onPrev,
  onNext,
  onClose,
}: {
  port: BookPort;
  state: BookState;
  a: ActOverview;
  label: string;
  buttons: TemplateButton[];
  states: DocState[];
  onPrev?: () => void;
  onNext?: () => void;
  onClose(): void;
}) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const tpl = useContext(UserTemplateContext);
  const book = state.book!;
  const row = book.tables["Акты"]?.find((r) => cellText(r.v.baseNumber) === a.number);
  const [items, setItems] = useState<IssueItem[]>([]);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [more, setMore] = useState(false);
  const [check, setCheck] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const issues: { i: Issue; level: "critical" | "warn" }[] =
      a.status === "blocked"
        ? buildBundle(book, a.number, state.important).issues.map((i) => ({ i, level: "critical" as const }))
        : checkActs(book, [a.number], todayIso()).map((i) => ({ i, level: "warn" as const }));
    void sheetIssueLines(
      port,
      issues.map((x) => x.i),
    )
      .then((ls) => alive && setItems(ls.map((line, k) => ({ line, level: issues[k].level }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [book, a.number, a.status, state.important, port]);
  useEffect(() => {
    setLines([]);
    setFiles(null);
    setError("");
    setMore(false);
    setCheck(0);
  }, [a.number]);

  const code = row ? cellText(row.v.section) : "";
  const count = (t: "Схемы" | "МатериалыАктов" | "ВОР") => (book.tables[t] ?? []).filter((r) => cellText(r.v.act) === a.number).length;
  const chips = [
    { table: "Схемы" as const, label: "Схемы", n: count("Схемы") },
    { table: "МатериалыАктов" as const, label: "Материалы", n: count("МатериалыАктов") },
    { table: "ВОР" as const, label: "ВОР", n: count("ВОР") },
  ];
  const printing = states.filter((s) => s !== "off").length;
  const signers = signersOf(book, a.number);

  const print = async (b: TemplateButton) => {
    setBusy(b.key);
    setError("");
    setLines([]);
    let issues: Issue[] | undefined;
    if (b.form) issues = (await guard(printForm(book, a.number, state.important, tpl.template.id, b.key, b.doc, { act: a.number }, options), setError))?.issues;
    else issues = await guard(printAct(book, a.number, state.important, b.doc as PrintKind, template, options), setError);
    if (issues?.length) setLines(await sheetIssueLines(port, issues));
    setBusy(null);
  };
  const download = async () => {
    setBusy("files");
    setError("");
    setFiles(null);
    try {
      const all: Issue[] = [];
      const list = buttons.flatMap((b) => {
        const r = bundleFor(book, a.number, state.important, b.doc, options);
        if (!r.bundle) {
          all.push(...r.issues);
          return [];
        }
        return [{ bundle: r.bundle, kind: b.doc, form: b.form ? { template: tpl.template.id, doc: b.key } : null }];
      });
      if (!list.length) return setLines(await sheetIssueLines(port, all));
      const r = await apiSend<{ id: string; name: string }>("POST", "/api/act-files", { name: `Акт ${a.number}`, options, items: list });
      setFiles(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const main = buttons.find((b) => b.doc === "aosr") ?? buttons[0];

  return (
    <aside className="ac" aria-label={`Карточка акта ${a.number}`}>
      <header className="ac-top">
        <span className="wn-cap">
          {main?.label ?? "Акт"}
          {label !== a.number ? ` · ${a.number}` : code ? ` · ${code}` : ""}
        </span>
        <span className="ac-nav">
          <button className="btn btn-ghost btn-icon" onClick={onPrev} disabled={!onPrev} aria-label="Предыдущий акт">
            ⌃
          </button>
          <button className="btn btn-ghost btn-icon" onClick={onNext} disabled={!onNext} aria-label="Следующий акт">
            ⌄
          </button>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Закрыть карточку">
            ✕
          </button>
        </span>
      </header>
      <div className="ac-title">
        <h2 title={a.number}>№ {label}</h2>
        {a.status !== "ready" && <span className={`acts-badge acts-${a.status}`}>{statusText(a)}</span>}
      </div>
      <p className="ac-works">{a.works || <span className="muted">работы (п. 1) не указаны</span>}</p>
      <div className="ac-chips">
        {chips.map((c) => (
          <button
            key={c.table}
            className="chip"
            onClick={() => void port.filterBy(c.table, "Акт", a.number)}
            title={`Строки акта на листе «${c.label}» в Excel`}
          >
            {c.label} <span className="mono">{c.n}</span>
          </button>
        ))}
      </div>
      <dl className="ac-facts">
        <div>
          <dt className="wn-cap">Работы</dt>
          <dd>{actDates(a.start, a.end) || "—"}</dd>
        </div>
        <div>
          <dt className="wn-cap">Дата акта</dt>
          <dd>{ru(row ? iso(row.v.date) : "")}</dd>
        </div>
        <div>
          <dt className="wn-cap">Комплект</dt>
          <dd>{a.kits.join(", ") || "—"}</dd>
        </div>
      </dl>
      <section className="ac-sec">
        <h3>
          Документы акта{" "}
          <span className="muted">
            печатаются {printing} из {buttons.length}
          </span>
        </h3>
        <div className="ac-docs">
          {buttons.map((b, i) =>
            states[i] === "off" ? null : (
              <button key={b.key} className={`ac-doc ac-doc-${states[i]}`} disabled={busy !== null} onClick={() => void print(b)} title={`Печать: ${b.label}`}>
                <span className="ac-page" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <b>{states[i] === "ok" ? "✓" : states[i] === "warn" ? "!" : "✕"}</b>
                </span>
                <span className="ac-doc-label">{busy === b.key ? "…" : shortLabel(b.label)}</span>
              </button>
            ),
          )}
        </div>
      </section>
      {items.length > 0 && (
        <section className="ac-sec">
          <h3>
            {a.status === "blocked" ? "Не собирается" : "Замечания"}{" "}
            <span className="muted">{a.status === "blocked" ? "исправьте в книге" : "печать не блокируют"}</span>
          </h3>
          <IssueTable port={port} items={items.slice(0, 6)} compact />
          {items.length > 6 && <p className="muted">и ещё {items.length - 6} — «Проверить» покажет все</p>}
        </section>
      )}
      {signers.length > 0 && (
        <section className="ac-sec">
          <h3>
            Подписанты <span className="muted">по датам полномочий{row && iso(row.v.date) ? ` на ${ru(iso(row.v.date))}` : ""}</span>
          </h3>
          <dl className="ac-signers">
            {signers.map((s) => (
              <div key={s.role}>
                <dt className="wn-cap">{SIGN_SHORT[s.role]}</dt>
                <dd>{s.names.length ? s.names.map(initials).join(", ") : <span className="warn">нет на дату акта</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <IssueList port={port} lines={lines} title="Не собирается — исправьте в книге (щелчок — к ячейке):" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {files && (
        <p className="notice" role="status">
          <a href={`/api/act-files/${files.id}`} download={files.name}>
            Скачать {files.name}
          </a>
        </p>
      )}
      {check > 0 && <PreDelivery port={port} state={state} acts={[a.number]} what="акт" trigger={check} />}
      {more && (
        <div className="ac-more">
          <ActExtras key={a.number} port={port} state={state} act={a.number} />
        </div>
      )}
      <footer className="ac-foot">
        {main && (
          <button className="btn btn-primary" disabled={busy !== null} onClick={() => void print(main)}>
            {busy === main.key ? "Готовлю…" : `Печать ${main.doc === "aosr" ? "акта" : main.label}`}
          </button>
        )}
        <button className="btn" onClick={() => setCheck((n) => n + 1)}>
          Проверить
        </button>
        <button className="btn btn-icon" disabled={busy !== null} onClick={() => void download()} title="Файлы Word/Excel всех документов акта (архив)">
          {busy === "files" ? "…" : "⇩"}
        </button>
        <button
          className="btn btn-icon"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
          title="Полная карточка: материалы, подписанты, полнота, все документы"
        >
          ⋯
        </button>
        <button className="btn btn-link ac-excel" onClick={() => row && void port.selectCell("Акты", row.row, "Номер акта")}>
          В Excel ↗
        </button>
      </footer>
    </aside>
  );
}

export function ActsScreen({ port, state, focus, onScreen }: { port: BookPort; state: BookState; focus?: string | null; onScreen?: (s: ScreenId) => void }) {
  const guard = useGuard();
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const tpl = useContext(UserTemplateContext);
  const catalog = useContext(CatalogContext);
  const [filter, setFilter] = useState<ActFilter>({ query: "", status: "all", workKind: "" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(focus ?? null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState<"pdf" | "files" | "kit" | "next" | null>(null);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [linesTitle, setLinesTitle] = useState("");
  const [note, setNote] = useState<{ text: string; href?: string; name?: string } | null>(null);
  const [error, setError] = useState("");
  const [checkSel, setCheckSel] = useState(0);
  const [kitAsk, setKitAsk] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focus) {
      setCurrent(focus);
      setClosed(false);
    }
  }, [focus]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const book = state.book;
  const buttons = templateButtons(tpl.template);
  const all = useMemo(() => (book ? actsOverview(book, state.important, todayIso()) : []), [book, state.important]);
  const states = useMemo(() => {
    const m = new Map<string, DocState[]>();
    if (!book) return m;
    for (const a of all) m.set(a.number, docStates(book, a, buttons, state.important, catalog ? completeness(tpl.template, catalog, book, a.number) : null));
    return m;
  }, [all, book, catalog, tpl.template]);
  const short = useMemo(() => shortNumbers(all.map((a) => a.number)), [all]);
  const kinds = useMemo(() => [...new Set(all.flatMap((a) => a.workKinds))].sort((a, b) => a.localeCompare(b, "ru")), [all]);
  const shown = filterActs(all, filter);
  const count = (s: ActStatus | "all") => (s === "all" ? all.length : all.filter((a) => a.status === s).length);
  const printable = buttons.filter((b) => !b.form && b.doc);
  const selected = all.filter((a) => picked.has(a.number));
  const has = (n: string | null): n is string => !!n && all.some((a) => a.number === n);
  const open = closed ? null : has(current) ? current : has(state.lastAct) ? state.lastAct : (shown[0]?.number ?? null);
  const openAct = all.find((a) => a.number === open) ?? null;
  const idx = openAct ? shown.findIndex((a) => a.number === openAct.number) : -1;

  if (!book) return <p className="notice">Читаю книгу…</p>;
  if (book.missing.includes("Акты")) return <p className="notice">В книге нет листа «База актов» — создайте разметку книги на экране «Книга».</p>;
  const codes = (book.tables["Шифры"] ?? []).map((r) => cellText(r.v.code)).filter(Boolean);

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
  const choose = (n: string) => {
    setCurrent(n);
    setClosed(false);
  };

  /** Следующий акт — копия текущего (или последнего) акта: номер +1, даты продолжаются. */
  const nextAct = async () => {
    const base = openAct ?? all[all.length - 1];
    if (!base) return;
    reset();
    setBusy("next");
    try {
      if (await port.isFiltered("Акты")) await port.clearFilters("Акты");
      const r = await addNextAct(port, base.row);
      setNote({ text: `Добавлен акт ${r.number}. Проверьте «Работы (п.1)», даты и номера схем.` });
      setCurrent(r.number);
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const printSelected = async () => {
    const b = printable.find((x) => x.doc === "aosr") ?? printable[0];
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
      setNote({ text: `${b.label}: актов ${bundles.length} одним PDF — открыт предпросмотр.` });
    } finally {
      setBusy(null);
    }
  };

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
      setNote({ text: ` — файлов ${r.files.filter((f) => f !== "Ошибки.txt").length}`, href: `/api/act-files/${r.id}`, name: r.name });
    } finally {
      setBusy(null);
    }
  };

  /** «В комплект…»: строки «Акты комплектов» для выбранных актов, которых там ещё нет. */
  const toKit = async (kit: string) => {
    const k = kit.trim();
    if (!k) return;
    reset();
    setBusy("kit");
    try {
      const have = new Set((book.tables["АктыКомплектов"] ?? []).filter((r) => cellText(r.v.kit) === k).map((r) => cellText(r.v.act)));
      const add = selected.filter((a) => !have.has(a.number));
      if (add.length) {
        const n = (book.tables["АктыКомплектов"] ?? []).length;
        await port.insert(
          "АктыКомплектов",
          n,
          add.map((a) => ({ Комплект: k, Акт: a.number })),
        );
      }
      setNote({ text: add.length ? `В комплект ${k} добавлено актов: ${add.length}.` : `Все выбранные акты уже в комплекте ${k}.` });
      setKitAsk(null);
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const kits = [...new Set((book.tables["Комплекты"] ?? []).map((r) => cellText(r.v.number)).filter(Boolean))];

  const row = (a: ActOverview) => (
    <tr key={a.number} className={a.number === open ? "acts-current" : undefined} onClick={() => choose(a.number)}>
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`Выбрать акт ${a.number}`} checked={picked.has(a.number)} onChange={() => toggle(a.number)} />
      </td>
      <td>
        <IssueIcon level={a.status === "blocked" ? "critical" : a.status === "warn" ? "warn" : "ok"} />
      </td>
      <td className="acts-num mono" title={a.number}>
        {short.get(a.number)}
      </td>
      <td title={a.works}>
        <div className="acts-works">{a.works || <span className="muted">работы не указаны</span>}</div>
      </td>
      <td className="acts-dates mono">{actDates(a.start, a.end).replace(/\.\d{4}$/, "")}</td>
      <td className="mono">{a.kits.join(", ") || "—"}</td>
      <td className="acts-docs">
        <DocSquares states={states.get(a.number) ?? []} labels={buttons.map((b) => b.label)} />
        {a.status !== "ready" && <span className={`acts-badge acts-${a.status}`}>{statusText(a)}</span>}
      </td>
    </tr>
  );

  return (
    <div className="acts">
      <header className="acts-head acts-head-big">
        <div>
          <h2>Акты</h2>
          <p className="muted">
            {all.length ? `${all.length} ${all.length % 10 === 1 && all.length % 100 !== 11 ? "акт" : "акта"} на листе «База актов»` : "в книге пока нет актов"}
            {codes.length === 1 ? `  •  общий шифр ${codes[0]}` : codes.length > 1 ? `  •  шифров: ${codes.length}` : ""}
          </p>
        </div>
        <div className="acts-head-actions">
          <button className="btn btn-link" onClick={() => void port.activateSheet("База актов")}>
            Открыть «База актов» в Excel ↗
          </button>
          <button className="btn" onClick={() => onScreen?.("delivery")}>
            Проверить все перед сдачей
          </button>
          <button
            className="btn"
            disabled={busy !== null || !all.length}
            onClick={() => void nextAct()}
            title="Копия текущего акта: номер +1, работы — со следующего рабочего дня"
          >
            {busy === "next" ? "Добавляю…" : "+ Следующий акт"}
          </button>
        </div>
      </header>
      <div className="acts-tools">
        <label className="acts-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={search}
            type="search"
            placeholder="Номер, работы, шифр…"
            aria-label="Поиск по актам"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
          <kbd>Ctrl F</kbd>
        </label>
        <div className="seg" role="group" aria-label="Статус">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              className={filter.status === c.id ? "seg-on" : undefined}
              aria-pressed={filter.status === c.id}
              onClick={() => setFilter({ ...filter, status: c.id })}
            >
              {c.label} <span className="mono">{count(c.id)}</span>
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
        <span className="acts-legend">
          <DocSquares states={buttons.map(() => "ok")} labels={buttons.map((b) => b.label)} />
          {buttons.map((b) => shortLabel(b.label)).join(" · ")}
        </span>
      </div>
      <div className={openAct ? "acts-layout" : "acts-layout acts-layout-full"}>
        <section className="acts-list">
          <div className="acts-table-wrap">
            <table className="acts-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" aria-label="Выбрать все показанные" checked={allShownPicked} onChange={pickShown} />
                  </th>
                  <th aria-label="Статус" />
                  <th>№</th>
                  <th>Работы (п. 1)</th>
                  <th>Период</th>
                  <th>Компл.</th>
                  <th>Документы</th>
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
          {(error || note || lines.length > 0 || checkSel > 0) && (
            <div className="acts-msgs">
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
              {checkSel > 0 && selected.length > 0 && (
                <PreDelivery port={port} state={state} acts={selected.map((a) => a.number)} what="выбранные акты" trigger={checkSel} />
              )}
            </div>
          )}
          {selected.length > 0 && (
            <div className="acts-bar" role="region" aria-label="Выбранные акты">
              <span className="acts-bar-n">
                Выбрано {selected.length} {selected.length % 10 === 1 && selected.length % 100 !== 11 ? "акт" : "акта"}
              </span>
              <button
                className="acts-bar-btn acts-bar-main"
                disabled={busy !== null || !printable.length}
                onClick={() => void printSelected()}
                title="АОСР выбранных актов одним PDF"
              >
                {busy === "pdf" ? "Готовлю…" : "Печать"}
              </button>
              {kitAsk === null ? (
                <button className="acts-bar-btn" disabled={busy !== null} onClick={() => setKitAsk(kits[0] ?? "1")}>
                  В комплект…
                </button>
              ) : (
                <span className="acts-bar-kit">
                  комплект
                  <input list="acts-kits" value={kitAsk} onChange={(e) => setKitAsk(e.target.value)} aria-label="Номер комплекта" />
                  <datalist id="acts-kits">
                    {kits.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                  <button className="acts-bar-btn" disabled={busy !== null} onClick={() => void toKit(kitAsk)}>
                    {busy === "kit" ? "…" : "Добавить"}
                  </button>
                </span>
              )}
              <button className="acts-bar-btn" onClick={() => setCheckSel((n) => n + 1)}>
                Проверить
              </button>
              <button className="acts-bar-btn" disabled={busy !== null} onClick={() => void filesSelected()}>
                {busy === "files" ? "Собираю…" : "Файлы Word/Excel"}
              </button>
              <button className="acts-bar-x" onClick={() => setPicked(new Set())} aria-label="Снять выбор">
                ✕
              </button>
            </div>
          )}
        </section>
        {openAct && (
          <ActCard
            port={port}
            state={state}
            a={openAct}
            label={short.get(openAct.number) ?? openAct.number}
            buttons={buttons}
            states={states.get(openAct.number) ?? []}
            onPrev={idx > 0 ? () => choose(shown[idx - 1].number) : undefined}
            onNext={idx >= 0 && idx < shown.length - 1 ? () => choose(shown[idx + 1].number) : undefined}
            onClose={() => setClosed(true)}
          />
        )}
      </div>
    </div>
  );
}
