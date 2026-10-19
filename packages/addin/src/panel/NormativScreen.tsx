// Экран «Норматив»: справочник нормативов портала protect.gost.ru (сведения из списков разделов).
// Тексты нормативов программа не хранит: «Читать» открывает карточку документа на портале.
import { useCallback, useEffect, useRef, useState } from "react";
import { NORM_SECTIONS, statusTone, type NormItem, type NormSearchResult, type NormSection, type RefreshState } from "@idk/shared/normCatalog";
import { formatDateShort } from "@idk/shared/acts/format";
import type { ExcelPort } from "../book/excelPort.ts";
import { apiGet, apiSend } from "../api.ts";
import { useGuard } from "../server.tsx";
import { openPortal } from "./portal.ts";
import { cellAppend, docsCount, latestOnly, normInsertText, normsQuery, refreshText, NORM_INSERT_KEY, type NormInsertMode } from "./normsApi.ts";

export const TERMS = "Программа не хранит и не распространяет тексты нормативов. В справочнике — только сведения из открытых списков портала protect.gost.ru (обозначение, наименование, число страниц, статус). Документы открываются напрямую с портала; окно лишь показывает страницы, полученные порталом для вашей сессии.";
const EMPTY = "Справочник пуст — нажмите «Обновить базу». Понадобится доступ к интернету, обновление займёт несколько минут.";

/** Режим «В ячейку» запоминается в браузере панели (у каждого пользователя свой). */
function loadInsertMode(): NormInsertMode {
  try { return localStorage.getItem(NORM_INSERT_KEY) === "full" ? "full" : "designation"; } catch { return "designation"; }
}

const lastUpdated = (u: NormSearchResult["updated"]) => {
  const all = Object.values(u).filter(Boolean) as string[];
  return all.length ? all.sort().at(-1)!.slice(0, 10) : null;
};

export function NormativScreen({ port }: { port: ExcelPort }) {
  // useGuard возвращает новую функцию на каждой отрисовке — держим стабильную обёртку для эффектов.
  const guardNow = useGuard();
  const guardRef = useRef(guardNow);
  guardRef.current = guardNow;
  const guard = useCallback(<T,>(p: Promise<T>, onError?: (m: string) => void) => guardRef.current(p, onError), []);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<NormSection | null>(null);
  const [data, setData] = useState<NormSearchResult | null>(null);
  const [items, setItems] = useState<NormItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [card, setCard] = useState(false);
  const [terms, setTerms] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [refresh, setRefresh] = useState<RefreshState | null>(null);
  const [error, setError] = useState("");
  const [insertMode, setInsertMode] = useState<NormInsertMode>(loadInsertMode);
  const chooseInsert = (m: NormInsertMode) => {
    setInsertMode(m);
    try { localStorage.setItem(NORM_INSERT_KEY, m); } catch { /* без памяти — только на этот сеанс */ }
  };
  const loading = useRef(false);

  useEffect(() => { const t = setTimeout(() => setQuery(q), 250); return () => clearTimeout(t); }, [q]);

  const seq = useRef(latestOnly());
  const load = useCallback(async (offset: number) => {
    // Подгрузка при прокрутке — по одной; новый поиск или раздел всегда запрашиваются заново,
    // а ответ на устаревший запрос отбрасывается.
    if (offset > 0 && loading.current) return;
    loading.current = true;
    const r = await seq.current.run(guard(apiGet<NormSearchResult>(normsQuery({ section, q: query, offset })), setError));
    loading.current = false;
    if (!r) return;
    setError("");
    setData(r);
    setItems((prev) => (offset === 0 ? r.items : [...prev, ...r.items]));
    if (offset === 0) setSelected(null);
  }, [guard, section, query]);

  useEffect(() => { void load(0); }, [load]);

  // Ход обновления: опрос раз в секунду, пока сервер обходит портал.
  useEffect(() => {
    if (!refresh?.running) return;
    const t = setInterval(async () => {
      const s = await guard(apiGet<RefreshState>("/api/norms/refresh"), setError);
      if (!s) return;
      setRefresh(s);
      if (!s.running) void load(0);
    }, 1000);
    return () => clearInterval(t);
  }, [refresh?.running, guard, load]);

  useEffect(() => { void guard(apiGet<RefreshState>("/api/norms/refresh"), () => undefined).then((s) => s && setRefresh(s)); }, [guard]);

  const startRefresh = async () => {
    setNote(null);
    try {
      setRefresh(await apiSend<RefreshState>("POST", "/api/norms/refresh"));
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    }
  };

  const item = items.find((i) => i.id === selected) ?? null;

  const toCell = async () => {
    if (!item) return;
    setNote(null);
    let message = "";
    try {
      const insert = normInsertText(item, insertMode);
      const r = await port.writeActiveCell((cur) => {
        const res = cellAppend(cur, item.designation, insert);
        if ("error" in res) { message = res.error; return null; }
        return res.value;
      });
      setNote(r.written ? { text: `Вписано: ${insert}` } : { text: message || "Ячейка не изменена", error: true });
    } catch (e) {
      setNote({ text: (e as Error).message, error: true });
    }
  };

  const onScroll = (e: React.UIEvent<HTMLUListElement>) => {
    const el = e.currentTarget;
    if (data && items.length < data.total && el.scrollTop + el.clientHeight > el.scrollHeight - 80) void load(items.length);
  };

  const totalAll = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  const updated = data ? lastUpdated(data.updated) : null;
  const empty = data && !updated && totalAll === 0 && !query;

  return (
    <main className="content norms">
      <input className="search" type="search" placeholder="Поиск по обозначению и названию" value={q}
        onChange={(e) => setQ(e.target.value)} aria-label="Поиск по справочнику" />
      <div className="chips norm-chips" role="group" aria-label="Разделы">
        {NORM_SECTIONS.map((s) => (
          <button key={s.code} className={`chip${section === s.code ? " chip-active" : ""}`} aria-pressed={section === s.code}
            onClick={() => setSection((cur) => (cur === s.code ? null : s.code))}>
            {s.label} <span className="chip-count">{data?.counts[s.code] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="row-actions norm-actions">
        <button className="btn btn-small" disabled={!item} onClick={() => item && openPortal(item.url)}>Читать</button>
        <button className="btn btn-small" disabled={!item} onClick={() => setCard((v) => !v)} aria-pressed={card}>Карточка</button>
        <button className="btn btn-small" disabled={!item} onClick={() => void toCell()}>В ячейку</button>
        <button className="btn btn-small" disabled={!!refresh?.running} onClick={() => void startRefresh()}>Обновить базу</button>
        <button className="btn btn-small" disabled title="Скоро" aria-label="Настройки">⚙</button>
        <button className="btn btn-small" onClick={() => setTerms((v) => !v)} aria-pressed={terms}>Условия</button>
      </div>
      <div className="chips norm-insert" role="radiogroup" aria-label="Что вставлять в ячейку">
        <span className="muted">Вставлять:</span>
        {([["designation", "только обозначение"], ["full", "обозначение и наименование"]] as const).map(([m, label]) => (
          <button key={m} className={`chip${insertMode === m ? " chip-active" : ""}`} role="radio" aria-checked={insertMode === m}
            onClick={() => chooseInsert(m)}>{label}</button>
        ))}
      </div>
      {terms && <p className="muted norm-terms">{TERMS}</p>}
      {refresh && refreshText(refresh) && (
        <p className={refresh.error && !refresh.running ? "error" : "notice"} role="status">{refreshText(refresh)}</p>
      )}
      {note && <p className={note.error ? "error" : "notice"} role="status">{note.text}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {data && (
        <p className="muted norm-total">
          {docsCount(data.total)}{updated ? `, обновлён ${formatDateShort(updated).replace(/ г\.$/, "")}` : ""}
        </p>
      )}
      {card && item && (
        <section className="card norm-card" aria-label="Карточка документа">
          <h3 className="tools-title">{item.designation}</h3>
          <p>{item.title}</p>
          <p className="muted">
            {NORM_SECTIONS.find((s) => s.code === item.section)?.label} · {item.status || "статус не указан"} · {item.pages} с.
          </p>
          <p className="muted norm-url">{item.url}</p>
          <button className="btn btn-small" onClick={() => openPortal(item.url)}>Открыть на портале</button>
        </section>
      )}
      {empty ? <p className="notice">{EMPTY}</p> : (
        <ul className="list norm-list" onScroll={onScroll} aria-label="Нормативы">
          {items.map((i) => (
            <li key={i.id} className={`norm-row${i.id === selected ? " selected" : ""}`}>
              <button className="link" aria-pressed={i.id === selected} onClick={() => setSelected(i.id)}>
                <span className="norm-head">
                  <strong>{i.designation}</strong>
                  {i.status && <span className={`badge badge-${statusTone(i.status)}`}>{i.status}</span>}
                  <span className="norm-pages">{i.pages} с.</span>
                </span>
                <span className="norm-title">{i.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
