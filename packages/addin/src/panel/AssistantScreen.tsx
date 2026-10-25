// План 19: «Помощник» — чат с нейросетью; правки книги — карточкой «Предлагаемые изменения» с подтверждением и отменой.
import { useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { resolveProvider, type Provider, type ProviderPublic } from "@idk/shared/ai/model";
import type { ExcelPort } from "../book/excelPort.ts";
import type { BookState } from "./useBook.ts";
import { UserTemplateContext } from "./templateContext.ts";
import { CatalogContext } from "./catalogApi.ts";
import { aiApi } from "./aiApi.ts";
import type { AssistantSession } from "./assistant.ts";

const today = () => new Date().toLocaleDateString("ru-RU");

export function AssistantScreen({ state, session, onSettings, extra }: {
  port: ExcelPort; state: BookState; session: AssistantSession; onSettings(): void;
  /** План 20: вложение файла и прочее над полем ввода. */
  extra?: ReactNode;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [providers, setProviders] = useState<{ active: string | null; providers: ProviderPublic[] } | null>(null);
  const [error, setError] = useState("");
  const tpl = useContext(UserTemplateContext);
  const catalog = useContext(CatalogContext);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { void aiApi.providers().then(setProviders).catch((e) => setError((e as Error).message)); }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); });

  const active = providers?.providers.find((p) => p.id === providers.active) ?? null;
  const masked = active ? resolveProvider({ ...active, key: "" } as Provider).maskNames : false;

  const send = async () => {
    const q = text.trim();
    if (!q || busy || !state.book) return;
    setText(""); setBusy(true); setError("");
    const s = state.selection;
    await session.ask(q, {
      book: state.book, important: state.important, catalog, template: tpl.template, masked,
      prompt: { today: today(), sheet: s?.sheet ?? null, table: s?.table ?? null, row: s?.row ?? null, act: state.lastAct },
    }, rerender);
    setChecked(new Set(session.pending.map((p) => p.id)));
    setBusy(false);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); state.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); rerender(); }
  };

  if (providers && !providers.providers.length) {
    return (
      <main className="content">
        <h2 className="app-title">Помощник</h2>
        <p className="notice">Подключите нейросеть: YandexGPT, GigaChat, локальную модель или любую OpenAI-совместимую.</p>
        <button className="btn btn-primary" onClick={onSettings}>Настройки → Нейросети</button>
      </main>
    );
  }

  return (
    <main className="content assistant">
      <div className="as-head">
        <h2 className="app-title">Помощник</h2>
        {providers && (
          <select aria-label="Нейросеть" value={providers.active ?? ""} onChange={(e) => void aiApi.setActive(e.target.value || null).then(setProviders).catch((x) => setError((x as Error).message))}>
            {!providers.active && <option value="">— нейросеть —</option>}
            {providers.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button className="btn" disabled={busy || !session.items.length} onClick={() => { session.reset(); rerender(); }}>Новый разговор</button>
      </div>
      {masked && <p className="muted">ФИО представителей в запросы не отправляются.</p>}
      {!session.items.length && (
        <div className="muted as-hints">
          <p>Напишите задачу словами, например:</p>
          <ul>
            <li>«Проверь акт {state.lastAct ?? "ЭОМ-1"} — чего не хватает для печати?»</li>
            <li>«Добавь акт на прокладку кабеля на П3 по образцу акта {state.lastAct ?? "АОВ1.01.00.1"}, даты 10–12 ноября»</li>
            <li>«Поменяй в актах раздела ЭОМ норматив п.6 на СП 76.13330.2016»</li>
          </ul>
          <p>Помощник предложит изменения — вы примените их кнопкой и сможете отменить.</p>
        </div>
      )}
      <div className="as-log" aria-live="polite">
        {session.items.map((m, i) => <div key={i} className={`as-msg as-${m.kind}`}>{m.text}</div>)}
        {busy && <div className="as-msg as-tool">Думаю…</div>}
        <div ref={end} />
      </div>
      {session.pending.length > 0 && !busy && (
        <section className="as-card" aria-label="Предлагаемые изменения">
          <h3 className="tools-title">Предлагаемые изменения</h3>
          {session.pending.map((p) => (
            <label key={p.id} className="as-prop">
              <input type="checkbox" checked={checked.has(p.id)} onChange={() => setChecked((c) => { const n = new Set(c); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
              <span><b>№{p.id}.</b> {p.lines.map((l, j) => <span key={j} className="as-line">{l}</span>)}</span>
            </label>
          ))}
          <div className="row-actions">
            <button className="btn btn-primary" disabled={!checked.size} onClick={() => void run(() => session.apply([...checked]))}>Применить ({checked.size})</button>
            <button className="btn" onClick={() => { session.reject(); rerender(); }}>Отклонить</button>
          </div>
        </section>
      )}
      {session.applied && !session.pending.length && !busy && (
        <div className="row-actions"><button className="btn" onClick={() => void run(() => session.revert())}>Отменить применённое</button></div>
      )}
      {extra}
      <div className="as-input">
        <textarea rows={3} placeholder="Задача для помощника (Ctrl+Enter — отправить)" value={text} disabled={busy}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send(); }} />
        <button className="btn btn-primary" disabled={busy || !text.trim() || !state.book} onClick={() => void send()}>Отправить</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
