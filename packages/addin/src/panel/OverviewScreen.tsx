// 0.38 / редизайн 0.40: главный экран окна программы — объект, готовность актов (квадрат на акт), «Требует внимания»
// таблицей с местом в книге, справа — комплекты, документы качества и общий журнал работ.
import { PrintOptionsContext, UserTemplateContext } from "./templateContext.ts";
import { docIssues } from "./docCheck.ts";
import { useContext, useEffect, useMemo, useState } from "react";
import { objectSummary, type ObjectSummary } from "@idk/shared/acts/objectSummary";
import { actDates, shortNumbers, statusText, type ActOverview } from "@idk/shared/acts/overview";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import type { ScreenId } from "./screens.ts";
import { sheetIssueLines } from "./print.ts";
import { IssueTable, IssueIcon, type IssueItem } from "./IssueTable.tsx";
import { SparkIcon } from "./icons.tsx";
import { todayIso } from "./today.ts";
import { useRelink, RelinkNote } from "./relinkScans.tsx";
import { cellText } from "@idk/shared/workbook/values";
import { column } from "@idk/shared/workbook/schema";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function OjrBars({ weeks }: { weeks: ObjectSummary["ojrWeeks"] }) {
  if (!weeks.length) return null;
  const max = Math.max(...weeks.map((w) => w.days), 1);
  let lastMonth = -1;
  return (
    <div className="ov-bars" aria-hidden="true">
      {weeks.map((w) => {
        const m = Number(w.week.slice(5, 7)) - 1;
        const label = m !== lastMonth ? MONTHS[m] : "";
        lastMonth = m;
        return (
          <span key={w.week} className="ov-bar" title={`неделя с ${w.week.slice(8)}.${w.week.slice(5, 7)}: ${w.days} дн.`}>
            <i style={{ height: `${Math.round((w.days / max) * 100)}%` }} />
            {label && <b>{label}</b>}
          </span>
        );
      })}
    </div>
  );
}

export function OverviewScreen({
  port,
  state,
  onScreen,
  onAct,
}: {
  port: BookPort;
  state: BookState;
  bookName?: string;
  onScreen(s: ScreenId): void;
  /** Открыть акт на экране «Акты». */
  onAct?: (act: string) => void;
}) {
  const book = state.book;
  const tplState = useContext(UserTemplateContext);
  const printOptions = useContext(PrintOptionsContext);
  const s = useMemo(
    () => (book ? objectSummary(book, state.important, todayIso(), 8, docIssues(book, state.important, tplState.template, printOptions)) : null),
    [book, state.important, tplState.template, printOptions],
  );
  const [items, setItems] = useState<IssueItem[]>([]);
  const [tip, setTip] = useState<ActOverview | null>(null);
  useEffect(() => {
    if (!s) return;
    let alive = true;
    void sheetIssueLines(port, s.attention)
      .then((lines) => alive && setItems(lines.map((line, i) => ({ line, act: s.attention[i].act, level: s.attention[i].level }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [s, port]);

  if (!book || !s) return <p className="notice">Читаю книгу…</p>;

  const nCritical = s.attention.filter((x) => x.level === "critical").length;
  const nWarn = s.attentionTotal - nCritical;
  const period = actDates(s.period.start, s.period.end);
  const short = shortNumbers(s.actList.map((a) => a.number));
  const named = items.map((x) => ({ ...x, act: x.act ? (short.get(x.act) ?? x.act) : undefined }));
  const critical = named.filter((x) => x.level === "critical");
  const warn = named.filter((x) => x.level === "warn");
  const kit = s.kitList[0];
  return (
    <div className="ov">
      <header className="ov-head">
        <div className="ov-title">
          <span className="wn-cap">Объект</span>
          <h1 className={s.name.length > 90 ? "ov-long" : undefined}>{s.name || "Наименование объекта не заполнено"}</h1>
          <p className="ov-meta">{[s.city || s.address, period && `работы ${period}`, s.performer].filter(Boolean).join("  •  ")}</p>
        </div>
        <div className="ov-actions">
          <button className="btn btn-ghost" onClick={() => onScreen("assistant")}>
            <SparkIcon /> Спросить помощника
          </button>
          <button className="btn" onClick={() => onScreen("acts")}>
            Проверить акты
          </button>
          <button className="btn btn-primary" onClick={() => onScreen("delivery")}>
            Собрать комплект
          </button>
        </div>
      </header>
      {!s.name && (
        <p className="warn" role="status">
          Заполните реквизиты объекта на листе «Реквизиты» — без них акты не напечатать.{" "}
          <button className="btn btn-link" onClick={() => void port.activateSheet("Реквизиты")}>
            Открыть «Реквизиты»
          </button>
        </p>
      )}

      <section className="ov-ready">
        <div className="ov-ready-num">
          <span className="wn-cap">Готовность актов</span>
          <p>
            <strong>{s.acts.ready}</strong> <span>из {s.acts.total}</span>
          </p>
          <span className="ov-sub">актов готовы к печати</span>
        </div>
        <div className="ov-ready-grid">
          <div className="ov-ready-top">
            <span className="wn-cap">Акты по порядку — один квадрат на акт</span>
            <button className="btn btn-link" onClick={() => onScreen("acts")}>
              Все акты →
            </button>
          </div>
          {s.actList.length ? (
            <div className="ov-tiles" onMouseLeave={() => setTip(null)}>
              {s.actList.map((a) => (
                <button
                  key={a.number}
                  className={`ov-tile ov-tile-${a.status}${tip?.number === a.number ? " ov-tile-on" : ""}`}
                  onMouseEnter={() => setTip(a)}
                  onFocus={() => setTip(a)}
                  onClick={() => (onAct ? onAct(a.number) : onScreen("acts"))}
                  aria-label={`Акт № ${a.number}: ${statusText(a)}`}
                >
                  {short.get(a.number)}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Актов пока нет — первый акт добавляется на листе «База актов» или мастером на экране «Книга».</p>
          )}
          <p className="ov-legend">
            {tip ? (
              <span className="ov-tip mono">
                № {tip.number} · {statusText(tip)}
                {tip.works ? ` — ${tip.works.slice(0, 90)}${tip.works.length > 90 ? "…" : ""}` : ""}
              </span>
            ) : (
              <>
                <span className="ov-key ov-key-ready" /> <b>{s.acts.ready}</b> готовы <span className="ov-key ov-key-warn" /> <b>{s.acts.warn}</b> с замечаниями
                — печать не блокируют <span className="ov-key ov-key-blocked" /> <b>{s.acts.blocked}</b> не собираются
              </>
            )}
          </p>
        </div>
      </section>

      <div className="ov-cols">
        <section className="ov-card ov-attn">
          <header className="ov-card-head">
            <h3>
              Требует внимания <sup className="mono">{s.attentionTotal || ""}</sup>
            </h3>
            <span className="muted">щелчок по строке — к месту исправления</span>
          </header>
          {!s.attentionTotal && (
            <p className="ov-clean">
              <IssueIcon level="ok" /> Замечаний нет: все акты собираются, проверка перед сдачей чистая.
            </p>
          )}
          {nCritical > 0 && (
            <>
              <div className="ov-group">
                <IssueIcon level="critical" /> <b>Не собираются</b> <span className="mono">{nCritical}</span>
                <span className="muted">печать покажет все ошибки</span>
              </div>
              <IssueTable port={port} items={critical} />
            </>
          )}
          {warn.length > 0 && (
            <>
              <div className="ov-group">
                <IssueIcon level="warn" /> <b>Проверка перед сдачей</b> <span className="mono">{nWarn}</span>
                <span className="muted">печать не блокируют</span>
              </div>
              <IssueTable port={port} items={warn} />
            </>
          )}
          {s.attentionTotal > s.attention.length && (
            <footer className="ov-card-foot">
              <button className="btn btn-link" onClick={() => onScreen("acts")}>
                Ещё {s.attentionTotal - s.attention.length} — на экране «Акты» →
              </button>
            </footer>
          )}
        </section>

        <aside className="ov-side">
          <section className="ov-block">
            <header>
              <span className="wn-cap">Комплекты</span>
              <button className="btn btn-link" onClick={() => onScreen("delivery")}>
                Печать и сдача →
              </button>
            </header>
            <div className="ov-big">
              <strong>{s.kits.total}</strong>
              <span>
                {s.kits.total ? `с реестром — ${s.kits.withRegistry}` : "комплектов пока нет"}
                {kit && (
                  <>
                    <br />
                    Комплект {kit.number}
                    {kit.volume ? ` · том ${kit.volume}` : ""} · {kit.registry} документов
                  </>
                )}
              </span>
            </div>
            {kit && kit.registry > 0 && (
              <div className="ov-docs" aria-hidden="true">
                {Array.from({ length: Math.min(kit.registry, 24) }, (_, i) => (
                  <i key={i} className={i === 0 ? "ov-doc-title" : i === 1 ? "ov-doc-reg" : undefined} />
                ))}
              </div>
            )}
          </section>
          <section className="ov-block">
            <header>
              <span className="wn-cap">Документы качества</span>
              <button className="btn btn-link" onClick={() => void port.activateSheet("Материалы")}>
                Материалы →
              </button>
            </header>
            <div className="ov-big">
              <strong>{s.quality.total}</strong>
              <span>
                {s.quality.noScan > 0 && (
                  <>
                    <IssueIcon level="warn" /> без скана — {s.quality.noScan}
                    <br />
                  </>
                )}
                {s.quality.expiring > 0 && (
                  <>
                    <IssueIcon level="warn" /> истекают до конца работ — {s.quality.expiring}
                  </>
                )}
                {!s.quality.noScan && !s.quality.expiring && s.quality.total > 0 && "все со сканами и действуют"}
              </span>
            </div>
          </section>
          <ScanFolderBlock port={port} state={state} />
          <section className="ov-block">
            <header>
              <span className="wn-cap">Общий журнал работ</span>
              <button className="btn btn-link" onClick={() => onScreen("delivery")}>
                ОЖР →
              </button>
            </header>
            <div className="ov-big">
              <strong>
                {s.ojrDays || "—"}
                {s.ojrDays ? <small> дн.</small> : null}
              </strong>
              <span>раздел 3 собирается из актов, без воскресений</span>
            </div>
            <OjrBars weeks={s.ojrWeeks} />
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * 0.46.10: «Сканы» на главном экране — где лежат паспорта, сертификаты и схемы на этом компьютере («Папка сканов»
 * объекта; несколько — через «;», подпапки просматриваются) и «Привязать сканы» для книги с другого компьютера.
 */
function ScanFolderBlock({ port, state }: { port: BookPort; state: BookState }) {
  const saved = cellText(state.book?.object.scanFolder ?? null);
  const [value, setValue] = useState(saved);
  const [error, setError] = useState("");
  useEffect(() => setValue(saved), [saved]);
  const relink = useRelink(port, state, async () => undefined);
  const save = async () => {
    setError("");
    if (value.trim() === saved) return;
    const t = await port.read("Объект");
    const label = "Папка сканов";
    const i = t ? t.rows.findIndex((r) => cellText(r[t.headers.indexOf("Поле")] ?? null) === label) : -1;
    if (!t || i < 0) return setError("В книге нет строки «Папка сканов» на листе «Объект» — нажмите «Обновить разметку» в панели Excel");
    await port.write("Объект", i, { [column("Объект", "value").header]: value.trim() });
    state.refresh();
  };
  return (
    <section className="ov-block">
      <header>
        <span className="wn-cap">Сканы на этом компьютере</span>
      </header>
      <label className="ov-folder">
        <span className="muted">Папка сканов (паспорта, сертификаты, схемы; несколько — через «;», с подпапками)</span>
        <input
          className="mono"
          value={value}
          placeholder="D:\\Объект\\Сканы"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => e.key === "Enter" && void save()}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row-actions">
        <button
          className="btn"
          disabled={relink.busy}
          onClick={() => void save().then(() => relink.run(value.trim()))}
          title="Книга с другого компьютера: найти сканы в этой папке и переписать ссылки «Скан» книги на файлы этого компьютера"
        >
          {relink.busy ? "Ищу сканы…" : "Привязать сканы"}
        </button>
      </div>
      <RelinkNote port={port} relink={relink} />
    </section>
  );
}
