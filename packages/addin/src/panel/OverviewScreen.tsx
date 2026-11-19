// 0.38: главный экран окна программы — объект, сводка по актам, комплектам, документам качества и ОЖР,
// быстрые действия и то, что требует внимания (щелчок по замечанию — к ячейке в Excel).
import { useContext, useEffect, useMemo, useState } from "react";
import { objectSummary } from "@idk/shared/acts/objectSummary";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import type { ScreenId } from "./screens.ts";
import { UserTemplateContext } from "./templateContext.ts";
import { sheetIssueLines, type IssueLine } from "./print.ts";
import { IssueList } from "./extras/IssueList.tsx";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function Stat({ title, value, lines, onClick }: { title: string; value: number | string; lines: string[]; onClick?: () => void }) {
  return (
    <button className="ov-stat" onClick={onClick} disabled={!onClick}>
      <span className="wn-cap">{title}</span>
      <strong>{value}</strong>
      {lines.map((l) => (
        <span key={l} className="hint">
          {l}
        </span>
      ))}
    </button>
  );
}

export function OverviewScreen({ port, state, bookName, onScreen }: { port: BookPort; state: BookState; bookName?: string; onScreen(s: ScreenId): void }) {
  const tpl = useContext(UserTemplateContext);
  const book = state.book;
  const s = useMemo(() => (book ? objectSummary(book, state.important, today()) : null), [book, state.important]);
  const [critical, setCritical] = useState<IssueLine[]>([]);
  const [warn, setWarn] = useState<IssueLine[]>([]);
  useEffect(() => {
    if (!s) return;
    let alive = true;
    const label = (x: (typeof s.attention)[number]) => ({ ...x, message: `${x.message} (акт ${x.act})` });
    void Promise.all([
      sheetIssueLines(port, s.attention.filter((a) => a.level === "critical").map(label)),
      sheetIssueLines(port, s.attention.filter((a) => a.level === "warn").map(label)),
    ])
      .then(([c, w]) => {
        if (alive) {
          setCritical(c);
          setWarn(w);
        }
      })
      .catch((e) => console.error("overview", e));
    return () => {
      alive = false;
    };
  }, [s, port]);

  if (!book || !s) return <p className="notice">Читаю книгу…</p>;
  const pct = s.acts.total ? Math.round((s.acts.ready / s.acts.total) * 100) : 0;
  return (
    <div className="ov">
      <header className="ov-head">
        <div>
          <span className="wn-cap">
            Объект{s.codes.length ? ` · шифр ${s.codes.slice(0, 3).join(", ")}${s.codes.length > 3 ? "…" : ""}` : ""} · шаблон «{tpl.template.name}»
          </span>
          <h2>{s.name || "Наименование объекта не заполнено"}</h2>
          <span className="hint">
            {s.address ? `${s.address} · ` : ""}
            {bookName ? `книга: ${bookName}` : ""}
          </span>
        </div>
        <div className="ov-actions">
          <button className="btn" onClick={() => onScreen("assistant")}>
            Спросить помощника
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
      <div className="ov-stats">
        <Stat
          title="Акты"
          value={s.acts.total}
          lines={s.acts.total ? [`${s.acts.ready} готовы · ${s.acts.warn} с замечаниями`, `${s.acts.blocked} не собираются`] : ["актов пока нет"]}
          onClick={() => onScreen("acts")}
        />
        <Stat
          title="Комплекты"
          value={s.kits.total}
          lines={[s.kits.total ? `с реестром: ${s.kits.withRegistry}` : "комплектов пока нет"]}
          onClick={() => onScreen("delivery")}
        />
        <Stat
          title="Документы качества"
          value={s.quality.total}
          lines={[`без скана: ${s.quality.noScan}`, `истекают до конца работ: ${s.quality.expiring}`]}
          onClick={() => void port.activateSheet("Материалы")}
        />
        <Stat
          title="Общий журнал работ"
          value={s.ojrDays ? `${s.ojrDays} дн.` : "—"}
          lines={["раздел 3 собирается из актов"]}
          onClick={() => onScreen("delivery")}
        />
      </div>
      {s.acts.total > 0 && (
        <div className="ov-progress" aria-label={`Готовы к сдаче ${pct}% актов`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <section className="ov-card">
        <h3 className="tools-title">Требует внимания</h3>
        {!s.attentionTotal && <p className="notice">Замечаний нет: все акты собираются, проверка перед сдачей чистая.</p>}
        <IssueList port={port} lines={critical} title="Не собираются (печать покажет все ошибки):" />
        <IssueList port={port} lines={warn} tone="warn" title="Проверка перед сдачей (печать не блокирует):" />
        {s.attentionTotal > s.attention.length && (
          <button className="btn btn-link" onClick={() => onScreen("acts")}>
            Ещё {s.attentionTotal - s.attention.length} — на экране «Акты»
          </button>
        )}
      </section>
    </div>
  );
}
