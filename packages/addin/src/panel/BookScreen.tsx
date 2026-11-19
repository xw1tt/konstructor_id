// 0.42: «Книга» в окне программы по макету — оглавление разделов с состоянием и листы Excel; вкладки разделов:
// список строк (поиск, +1, +10, копия, вверх/вниз, удалить) | карточка строки (поля книги) | как будет напечатано / инструменты.
import { docIssues } from "./docCheck.ts";
import type { CellTarget } from "./cellNav.ts";
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SHEETS, TABLES, isObjectFieldRequired, type TableName } from "@idk/shared/workbook/schema";
import type { TableData } from "@idk/shared/workbook/store";
import { tableRows } from "@idk/shared/workbook/store";
import { addRows, deleteRows, duplicateRow, moveRow } from "@idk/shared/workbook/rowOps";
import type { BookRow } from "@idk/shared/workbook/records";
import { sheetPlan } from "@idk/shared/workbook/sheets";
import { actsOverview, shortNumbers, statusText } from "@idk/shared/acts/overview";
import { findReferences, renameKey } from "@idk/shared/workbook/refs";
import { cellText, parseDateCell, parseNumberCell } from "@idk/shared/workbook/values";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import type { ScreenId } from "./screens.ts";
import { RowCard, colLetter, effectiveColumn, keysOf, type PendingRename } from "./card/RowCard.tsx";
import { Field } from "./card/fields.tsx";
import { toCellFor } from "./card/editValue.ts";
import { ImportantDialog } from "./ImportantDialog.tsx";
import { IssueIcon } from "./IssueTable.tsx";
import { ScanImport } from "./extras/ScanImport.tsx";
import { SpecExtras, SpecMatchTool } from "./extras/SpecExtras.tsx";
import { OjrExtras } from "./extras/OjrExtras.tsx";
import { PreDelivery } from "./extras/PreDelivery.tsx";
import { PrintOptionsContext, TemplateContext, UserTemplateContext } from "./templateContext.ts";
import { bundleFor, previewJob } from "./print.ts";
import { point4Lines } from "@idk/shared/acts/rows";
import { todayIso } from "./today.ts";
import type { UserTemplate } from "@idk/shared/forms/template";

type TabId = "toc" | "requisites" | "reps" | "acts" | "materials" | "schemes" | "cables" | "kits" | "ojr";
interface Tab {
  id: TabId;
  label: string;
  tables: TableName[];
  sheet: string;
}
const TABS: Tab[] = [
  { id: "requisites", label: "Реквизиты", tables: ["Объект", "Организации", "Шифры"], sheet: "Реквизиты" },
  { id: "reps", label: "Представители", tables: ["Представители"], sheet: "Представители" },
  { id: "acts", label: "Акты", tables: ["Акты"], sheet: "База актов" },
  { id: "materials", label: "Материалы", tables: ["Материалы"], sheet: "Материалы" },
  { id: "schemes", label: "Схемы", tables: ["Схемы"], sheet: "Исполнительные схемы" },
  { id: "cables", label: "Кабельный журнал", tables: ["КабельныйЖурнал"], sheet: "Кабельный журнал" },
  { id: "kits", label: "Комплекты", tables: ["Комплекты", "АктыКомплектов", "РеестрИД"], sheet: "Комплекты" },
  { id: "ojr", label: "ОЖР", tables: ["ОЖР3", "ОЖР5"], sheet: "ОЖР Раздел 3" },
];
/** Вспомогательные таблицы — на какой вкладке показать их строку при переходе к исправлению. */
const TAB_OF: Partial<Record<TableName, TabId>> = {
  МатериалыАктов: "acts",
  ВОР: "acts",
  ДокументыКачества: "materials",
  Спецификация: "materials",
  Электролаборатория: "cables",
  СредстваИзмерений: "cables",
  ИзмеренияМарок: "cables",
  ДокументыКабелей: "cables",
  Протоколы: "acts",
  ПереченьОборудования: "acts",
};

const GROUP: Partial<Record<TableName, string>> = {
  МатериалыАктов: "Материалы в актах",
  ВОР: "ВОР",
  Протоколы: "Протоколы",
  ИзмеренияМарок: "Измерения марок",
  Объект: "Объект",
  Организации: "Организации",
  Шифры: "Шифры",
  Комплекты: "Комплекты",
  АктыКомплектов: "Акты комплектов",
  РеестрИД: "Реестр ИД",
  ОЖР3: "Раздел 3",
  ОЖР5: "Раздел 5",
};

const word = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const t = (v: BookRow["v"][string]) => cellText(v ?? null);
const dm = (v: BookRow["v"][string]) => {
  const p = parseDateCell(v ?? null);
  return p.ok && p.value ? `${p.value.slice(8, 10)}.${p.value.slice(5, 7)}` : "";
};

type Level = "ok" | "warn" | "critical";

/** Пустые важные ячейки строки (подсвечиваются в Excel и в карточке; акт с ними не собирается). */
function emptyImportant(state: BookState, table: TableName, r: BookRow): number {
  const imp = state.important[table] ?? [];
  if (!imp.length || table === "Объект") return 0;
  return TABLES[table].columns.filter((c) => imp.includes(c.header) && !t(r.v[c.key])).length;
}

/** Заголовок, подзаголовок и дата строки в списке. */
function rowView(table: TableName, r: BookRow, short: Map<string, string>): { title: string; sub: string; right: string; mono?: boolean } {
  const v = r.v;
  switch (table) {
    case "Организации":
      return { title: t(v.shortName) || t(v.fullName), sub: [t(v.inn) && `ИНН ${t(v.inn)}`, t(v.address)].filter(Boolean).join(" · "), right: "" };
    case "Шифры":
      return { title: t(v.code), sub: t(v.name), right: "", mono: true };
    case "Представители":
      return { title: t(v.fullName), sub: t(v.role), right: [dm(v.validFrom), dm(v.validTo)].filter(Boolean).join(" – ") };
    case "Акты":
      return {
        title: `№ ${short.get(t(v.baseNumber)) ?? t(v.baseNumber)}`,
        sub: t(v.works),
        right: [dm(v.dateStart), dm(v.dateEnd)].filter(Boolean).join(" – "),
        mono: true,
      };
    case "Материалы":
      return { title: t(v.name), sub: [t(v.mark), t(v.unit)].filter(Boolean).join(" · "), right: "" };
    case "Схемы":
      return { title: `Акт № ${short.get(t(v.act)) ?? t(v.act)} · ${t(v.kind) || "схема"} ${t(v.number)}`, sub: t(v.name), right: dm(v.date), mono: true };
    case "КабельныйЖурнал":
      return {
        title: t(v.designation) || t(v.cableMark),
        sub: [t(v.cableMark), t(v.cableLength) && `${t(v.cableLength)} м`].filter(Boolean).join(" · "),
        right: short.get(t(v.act)) ?? t(v.act),
      };
    case "Комплекты":
      return { title: `Комплект ${t(v.number)}${t(v.volume) ? ` · том ${t(v.volume)}` : ""}`, sub: t(v.works), right: "" };
    case "АктыКомплектов":
      return { title: `Акт № ${short.get(t(v.act)) ?? t(v.act)}`, sub: `комплект ${t(v.kit)}`, right: "", mono: true };
    case "МатериалыАктов":
      return {
        title: t(v.material),
        sub: [`акт № ${short.get(t(v.act)) ?? t(v.act)}`, t(v.quantity) && `кол-во ${t(v.quantity)}`].filter(Boolean).join(" · "),
        right: "",
      };
    case "ВОР":
      return {
        title: t(v.material),
        sub: [`акт № ${short.get(t(v.act)) ?? t(v.act)}`, t(v.group), t(v.quantity) && `объём ${t(v.quantity)}`].filter(Boolean).join(" · "),
        right: "",
      };
    case "РеестрИД":
      return {
        title: t(v.name),
        sub: [t(v.number) && `№ ${t(v.number).replace(/^№\s*/, "")}`, `комплект ${t(v.kit)}`].filter(Boolean).join(" · "),
        right: dm(v.date),
      };
    case "ОЖР3":
      return {
        title: (() => {
          const p = parseDateCell(v.date ?? null);
          return p.ok && p.value ? `${p.value.slice(8, 10)}.${p.value.slice(5, 7)}.${p.value.slice(0, 4)}` : "—";
        })(),
        sub: t(v.works),
        right: "",
        mono: true,
      };
    case "ОЖР5":
      return { title: t(v.name), sub: t(v.signed), right: "" };
    default: {
      const cols = TABLES[table].columns;
      return { title: t(v[cols[0].key]), sub: t(v[cols[1]?.key ?? ""]), right: "" };
    }
  }
}

/** Карточка «Объект»: таблица «Поле — Значение» одной формой. */
function ObjectCard({ port, state, data, origin }: { port: BookPort; state: BookState; data: TableData; origin?: { col: number; row: number } | null }) {
  const [errors, setErrors] = useState<Record<number, string>>({});
  const col = TABLES["Объект"].columns.find((c) => c.key === "value")!;
  const iField = data.headers.indexOf("Поле");
  const iValue = data.headers.indexOf(col.header);
  return (
    <div className="form bk-object">
      {data.rows.map((row, i) => {
        const label = cellText(row[iField] ?? null);
        if (!label) return null;
        const c = effectiveColumn("Объект", col, row, data.headers);
        return (
          <Field
            key={i}
            col={{
              ...c,
              header: label,
              important: isObjectFieldRequired(label),
            }}
            value={row[iValue] ?? null}
            link={null}
            address={origin ? colLetter(origin.col + iValue) + (origin.row + i) : undefined}
            options={c.ref ? keysOf(state.book, c.ref) : []}
            error={errors[i] ?? ""}
            onCommit={(v) => {
              const parsed = toCellFor("Объект", c, v);
              if (!parsed.ok) return setErrors((e) => ({ ...e, [i]: parsed.message }));
              setErrors((e) => ({ ...e, [i]: "" }));
              void port.write("Объект", i, { [col.header]: parsed.value }).then(() => state.refresh());
            }}
          />
        );
      })}
    </div>
  );
}

/** Подсветка значений карточки в предпросмотре (iframe того же сервера): текст значений — синим. */
function highlight(doc: Document, marks: string[]) {
  const list = [...new Set(marks.map((m) => m.trim()).filter((m) => m.length >= 3))].sort((a, b) => b.length - a.length);
  if (!list.length || !doc.body) return;
  if (!doc.getElementById("idk-hl")) {
    const st = doc.createElement("style");
    st.id = "idk-hl";
    st.textContent = "mark.idk-hl{background:#e3e9fb;color:#2747a8;padding:0 1px;border-radius:2px}";
    doc.head.appendChild(st);
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const text = node.data;
    const m = list.find((x) => text.includes(x));
    if (!m || node.parentElement?.closest("mark")) continue;
    const at = text.indexOf(m);
    const mid = node.splitText(at);
    mid.splitText(m.length);
    const mark = doc.createElement("mark");
    mark.className = "idk-hl";
    mid.parentNode!.replaceChild(mark, mid);
    mark.appendChild(mid);
  }
}

/** Предпросмотр первой страницы АОСР акта из книги; значения карточки подсвечены. */
function ActPreview({
  state,
  act,
  title = "Так акт будет напечатан",
  marks = [],
  note: foot,
}: {
  state: BookState;
  act: string;
  title?: string;
  marks?: string[];
  note?: string;
}) {
  const template = useContext(TemplateContext);
  const options = useContext(PrintOptionsContext);
  const [src, setSrc] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!state.book || !act) return;
    let alive = true;
    setNote("");
    const timer = setTimeout(() => {
      void previewJob(state.book!, act, state.important, "aosr", template, options)
        .then((r) => {
          if (!alive) return;
          if (r.id) setSrc(`/api/print-jobs/${r.id}/aosr?format=html`);
          else setNote(r.issues[0]?.message ?? "Акт пока не собирается");
        })
        .catch(() => alive && setNote("Предпросмотр недоступен — сервер не отвечает"));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [state.book, act, template, options, state.important]);
  const key = marks.join("\u0001");
  return (
    <section className="bk-side-card">
      <header>
        <h3>{title}</h3>
        <span className="muted">АОСР · л. 1</span>
      </header>
      <div className="bk-sheet">
        {src ? (
          <iframe
            key={src + key}
            title="Предпросмотр АОСР"
            src={src}
            onLoad={(e) => {
              try {
                const d = (e.target as HTMLIFrameElement).contentDocument;
                if (d) highlight(d, marks);
              } catch {
                /* предпросмотр с другого адреса — без подсветки */
              }
            }}
          />
        ) : (
          <p className="muted">{note || "Готовлю предпросмотр…"}</p>
        )}
      </div>
      <p className="muted">{foot ?? "Синим — значения этой карточки; пустая важная ячейка подсвечена розовым и в Excel, и здесь."}</p>
    </section>
  );
}

const num = (v: BookRow["v"][string]) => {
  const p = parseNumberCell(v ?? null);
  return p.ok && p.value ? p.value : 0;
};
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ru");

/** 0.43: количество материала — по проекту, закрыто актами (по актам), остаток. */
function MaterialQuantity({ book, material, short }: { book: BookState["book"]; material: BookRow; short: Map<string, string> }) {
  const name = t(material.v.name);
  const unit = t(material.v.unit);
  const plan = num(material.v.quantity);
  const parts = (book?.tables["МатериалыАктов"] ?? [])
    .filter((r) => t(r.v.material) === name)
    .map((r) => ({ act: t(r.v.act), q: num(r.v.quantity) || num(r.v.vorSum) }))
    .filter((x) => x.q > 0);
  const closed = parts.reduce((x, p) => x + p.q, 0);
  if (!plan && !closed) return null;
  const scale = Math.max(plan, closed) || 1;
  const rest = plan - closed;
  return (
    <section className="bk-qty">
      <span className="wn-cap">Количество</span>
      <div className="bk-qty-nums">
        <div>
          <span className="wn-cap">По проекту</span>
          <strong>
            {plan ? fmt(plan) : "—"} <small>{unit}</small>
          </strong>
        </div>
        <div>
          <span className="wn-cap">Закрыто актами</span>
          <strong>
            {fmt(closed)} <small>{unit}</small>
          </strong>
        </div>
        {plan > 0 && (
          <div>
            <span className="wn-cap">{rest < 0 ? "Перерасход" : "Остаток"}</span>
            <strong className={rest < 0 ? "bk-over" : undefined}>
              {fmt(Math.abs(rest))} <small>{unit}</small>
            </strong>
          </div>
        )}
        {t(material.v.section) && (
          <div className="bk-qty-sec">
            <span className="wn-cap">Раздел РКЦ</span>
            <b>{t(material.v.section)}</b>
          </div>
        )}
      </div>
      <div className="bk-qty-bar" aria-label="Закрыто по актам">
        {parts.map((p, i) => (
          <span key={i} style={{ width: `${(p.q / scale) * 100}%` }} title={`Акт № ${p.act}: ${fmt(p.q)} ${unit}`}>
            № {short.get(p.act) ?? p.act} · {fmt(p.q)} {unit}
          </span>
        ))}
        {rest > 0 && (
          <span className="bk-qty-rest" style={{ width: `${(rest / scale) * 100}%` }}>
            остаток {fmt(rest)} {unit}
          </span>
        )}
      </div>
    </section>
  );
}

/** 0.43: дни работ ОЖР календарём — оттенок по числу актов в работе; щелчок — запись дня. */
function OjrCalendar({ rows, onPick, picked }: { rows: BookRow[]; onPick(row: number): void; picked: number | null }) {
  const days = new Map<string, { row: number; acts: number }>();
  for (const r of rows) {
    const p = parseDateCell(r.v.date ?? null);
    if (p.ok && p.value)
      days.set(p.value, {
        row: r.row,
        acts:
          t(r.v.acts)
            .split(/[;,]/)
            .filter((x) => x.trim()).length || 1,
      });
  }
  const keys = [...days.keys()].sort();
  if (!keys.length) return <p className="muted bk-pad">Дней в разделе 3 пока нет — «Обновить из актов» соберёт их по датам работ.</p>;
  const d0 = new Date(keys[0] + "T00:00:00Z");
  d0.setUTCDate(d0.getUTCDate() - ((d0.getUTCDay() + 6) % 7));
  const end = new Date(keys[keys.length - 1] + "T00:00:00Z");
  const weeks: Date[][] = [];
  for (const d = new Date(d0); d <= end;) {
    const w: Date[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(new Date(d));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(w);
  }
  const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  return (
    <section className="ojr-cal">
      <header>
        <span className="wn-cap">
          Дни работ · {keys[0].split("-").reverse().join(".")} — {keys[keys.length - 1].split("-").reverse().join(".")}
        </span>
        <span className="ojr-legend">
          актов в работе: <i className="oc-1">1</i>
          <i className="oc-2">2</i>
          <i className="oc-3">3</i>
          <i className="oc-4">4</i>
          <i className="oc-5">5+</i> <i className="oc-0" /> в журнал не попадает
        </span>
      </header>
      <div className="ojr-grid">
        <div className="ojr-dow">
          <span />
          {DOW.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        {weeks.map((w, i) => {
          const m = w[0].getUTCMonth();
          const newMonth = i === 0 || weeks[i - 1][0].getUTCMonth() !== m;
          return (
            <div key={i} className="ojr-week">
              <span className="ojr-mon">{newMonth ? MON[m] : ""}</span>
              {w.map((d) => {
                const k = d.toISOString().slice(0, 10);
                const x = days.get(k);
                const n = x ? Math.min(x.acts, 5) : 0;
                return (
                  <button
                    key={k}
                    className={`oc-${n}${x && x.row === picked ? " oc-on" : ""}`}
                    disabled={!x}
                    onClick={() => x && onPick(x.row)}
                    title={x ? `${k.split("-").reverse().join(".")}: актов в работе ${x.acts}` : undefined}
                  >
                    {d.getUTCDate()}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** 0.43: срок полномочий представителя и даты актов — попадают ли акты в срок. */
function RepTimeline({ book, rep }: { book: BookState["book"]; rep: BookRow }) {
  const iso = (v: BookRow["v"][string]) => {
    const p = parseDateCell(v ?? null);
    return p.ok ? (p.value ?? "") : "";
  };
  const from = iso(rep.v.validFrom),
    to = iso(rep.v.validTo);
  const dates = (book?.tables["Акты"] ?? [])
    .map((r) => iso(r.v.date))
    .filter(Boolean)
    .sort();
  if (!dates.length) return null;
  const year = Number((dates[0] || from || "2026").slice(0, 4));
  const y0 = Date.UTC(year, 0, 1),
    y1 = Date.UTC(year + 1, 0, 1);
  const pos = (d: string) => Math.min(100, Math.max(0, ((Date.parse(d + "T00:00:00Z") - y0) / (y1 - y0)) * 100));
  const inside = dates.filter((d) => (!from || from <= d) && (!to || d <= to)).length;
  const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return (
    <section className="rep-tl">
      <p className={inside === dates.length ? "rep-ok" : "rep-bad"}>
        <IssueIcon level={inside === dates.length ? "ok" : "warn"} />{" "}
        {inside === dates.length
          ? `все ${dates.length} ${word(dates.length, "акт попадает", "акта попадают", "актов попадают")} в срок`
          : `в срок ${inside} из ${dates.length} актов — для остальных нужна строка с другими датами`}
      </p>
      <div className="rep-track">
        <i className="rep-span" style={{ left: `${from ? pos(from) : 0}%`, right: `${100 - (to ? pos(to) : 100)}%` }} />
        {dates.map((d, i) => (
          <b
            key={i}
            style={{ left: `${pos(d)}%` }}
            className={(!from || from <= d) && (!to || d <= to) ? undefined : "rep-out"}
            title={d.split("-").reverse().join(".")}
          />
        ))}
      </div>
      <div className="rep-months">
        {MON.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </section>
  );
}

/** Значения строки для подсветки в предпросмотре: даты — ДД.ММ.ГГГГ, остальное — текстом. */
function rowMarks(table: TableName, r: BookRow): string[] {
  return TABLES[table].columns.flatMap((c) => {
    const v = r.v[c.key];
    if (c.type === "date") {
      const p = parseDateCell(v ?? null);
      if (!p.ok || !p.value) return [];
      const [y, m, d] = p.value.split("-");
      const GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
      return [`${d}.${m}.${y}`, `${Number(d)} ${GEN[Number(m) - 1]} ${y}`, `«${d}» ${GEN[Number(m) - 1]} ${y}`];
    }
    return cellText(v ?? null)
      .split(/\s*;\s*/)
      .filter((x) => x.length >= 3);
  });
}

/** 0.44: скан схемы — PDF или картинка из «Скана» строки. */
function ScanCard({ row, title }: { row: BookRow; title: string }) {
  const url = row.link.file;
  const name = t(row.v.file);
  const isImg = /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
  return (
    <section className="bk-side-card">
      <header>
        <h3>{title}</h3>
        <span className="muted">{name || "нет скана"}</span>
      </header>
      <div className="bk-scan">
        {url ? (
          isImg ? (
            <img src={url} alt={name} />
          ) : (
            <iframe title={name} src={`${url}#toolbar=0&navpanes=0&view=Fit`} />
          )
        ) : (
          <p className="muted">Скан не приложен — загрузите его в поле «Скан» карточки.</p>
        )}
      </div>
    </section>
  );
}

/** 0.44: схемы акта листами и проверка схем книги. */
function SchemesSide({ book, row, onPick, short }: { book: BookState["book"]; row: BookRow; onPick(r: number): void; short: Map<string, string> }) {
  const all = book?.tables["Схемы"] ?? [];
  const act = t(row.v.act);
  const same = all.filter((r) => t(r.v.act) === act);
  const actRow = (book?.tables["Акты"] ?? []).find((r) => t(r.v.baseNumber) === act);
  const iso = (v: BookRow["v"][string]) => {
    const p = parseDateCell(v ?? null);
    return p.ok ? (p.value ?? "") : "";
  };
  const late = (r: BookRow) => {
    const a = (book?.tables["Акты"] ?? []).find((x) => t(x.v.baseNumber) === t(r.v.act));
    const d = iso(r.v.date),
      ad = a ? iso(a.v.date) : "";
    return !!d && !!ad && d > ad;
  };
  const noScan = all.filter((r) => !r.link.file && !t(r.v.file)).length;
  const lateN = all.filter(late).length;
  return (
    <>
      <section className="bk-side-card">
        <header>
          <span className="wn-cap">Схемы акта № {short.get(act) ?? act}</span>
          {actRow && <span className="muted">{same.length}</span>}
        </header>
        <div className="ac-docs">
          {same.map((r) => {
            const st = !r.link.file && !t(r.v.file) ? "warn" : late(r) ? "warn" : "ok";
            return (
              <button key={r.row} className={`ac-doc ac-doc-${st}${r.row === row.row ? " ac-doc-on" : ""}`} onClick={() => onPick(r.row)} title={t(r.v.name)}>
                <span className="ac-page ac-page-wide" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <b>{st === "ok" ? "✓" : "!"}</b>
                </span>
                <span className="ac-doc-label">№ {t(r.v.number) || "—"}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="bk-side-card">
        <span className="wn-cap">Проверка схем книги</span>
        <p className="bk-check">
          <IssueIcon level={noScan ? "warn" : "ok"} />
          {noScan ? `Без скана: ${noScan} из ${all.length}` : `Сканы приложены ко всем ${all.length} схемам`}
        </p>
        <p className="bk-check">
          <IssueIcon level={lateN ? "warn" : "ok"} />
          {lateN
            ? `${lateN} ${word(lateN, "схема датирована", "схемы датированы", "схем датированы")} позже своего акта`
            : "Все схемы датированы не позже своих актов"}
        </p>
      </section>
    </>
  );
}

/** 0.44: как схема попадёт в п. 4 АОСР её акта — строки п. 4, текущая выделена. */
function Point4({ state, row, short }: { state: BookState; row: BookRow; short: Map<string, string> }) {
  const options = useContext(PrintOptionsContext);
  const act = t(row.v.act);
  if (!state.book || !act) return null;
  const { bundle } = bundleFor(state.book, act, {}, "aosr", options);
  // Акт пока не собирается — п. 4 по строкам «Схем» этого акта (как его соберёт печать).
  const docs =
    bundle?.documents ??
    (state.book.tables["Схемы"] ?? [])
      .filter((r) => t(r.v.act) === act)
      .map((r, i) => {
        const p = parseDateCell(r.v.date ?? null);
        return {
          kind: /схем/i.test(t(r.v.kind) || "схема") ? ("scheme" as const) : ("other" as const),
          number: t(r.v.number),
          name: t(r.v.name),
          date: p.ok && p.value ? p.value : null,
          fileId: null,
          sortOrder: i,
        };
      });
  const lines = point4Lines(docs as never, { schemeEach: options?.schemeEach });
  const num = t(row.v.number);
  const name = t(row.v.name);
  return (
    <section className="bk-p4">
      <span className="wn-cap">Так в п. 4 акта № {short.get(act) ?? act}</span>
      <p>
        Предъявлены документы, подтверждающие соответствие работ предъявляемым к ним требованиям:{" "}
        {lines.map((l, i) => {
          const mine = (!!num && l.includes(num)) || (!!name && l.includes(name));
          return (
            <span key={i} className={mine ? "bk-p4-mine" : undefined}>
              {l}{" "}
            </span>
          );
        })}
      </p>
    </section>
  );
}

/** 0.44: где печатаются реквизиты объекта. */
function WherePrinted({ book }: { book: BookState["book"] }) {
  const acts = (book?.tables["Акты"] ?? []).length;
  return (
    <section className="bk-side-card">
      <span className="wn-cap">Где печатаются реквизиты</span>
      <div className="ac-chips bk-where">
        <span className="chip">
          АОСР <span className="mono">{acts}</span>
        </span>
        <span className="chip">ВОР</span>
        <span className="chip">Реестр ИД</span>
        <span className="chip">Титул комплекта</span>
        <span className="chip">ОЖР</span>
      </div>
    </section>
  );
}

export function BookScreen({
  port,
  state,
  template,
  needed,
  onScreen,
  onRowsAdded,
  focus,
}: {
  port: BookPort;
  state: BookState;
  template: UserTemplate;
  needed: { on: boolean; set(v: boolean): Promise<void> };
  onScreen(s: ScreenId): void;
  onRowsAdded?: (t: TableName, first: number, n: number) => Promise<void>;
  /** 0.45: открыть место исправления — вкладку, строку и поле. */
  focus?: (CellTarget & { n: number }) | null;
}) {
  const book = state.book!;
  const [tab, setTab] = useState<TabId>("toc");
  const [extra, setExtra] = useState<TableName | null>(null);
  const [sel, setSel] = useState<{ table: TableName; row: number } | null>(null);
  const [data, setData] = useState<Map<TableName, TableData | null>>(new Map());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [askDelete, setAskDelete] = useState(false);
  const [important, setImportant] = useState<TableName | null>(null);
  const [rename, setRename] = useState<PendingRename | null>(null);
  const [checkAll, setCheckAll] = useState(0);
  const printOptions = useContext(PrintOptionsContext);
  // Для «Шапки каждого акта» — первый акт, который собирается (шапка у всех актов одна).
  const headerAct = useMemo(() => {
    const nums = (book.tables["Акты"] ?? []).map((r) => t(r.v.baseNumber)).filter(Boolean);
    return nums.find((n) => !!bundleFor(book, n, {}, "aosr", printOptions).bundle) ?? nums[0] ?? null;
  }, [book, printOptions]);
  const current = TABS.find((x) => x.id === tab);
  const tabTables: TableName[] = current ? (extra && !current.tables.includes(extra) ? [...current.tables, extra] : current.tables) : [];
  const short = useMemo(() => shortNumbers((book.tables["Акты"] ?? []).map((r) => t(r.v.baseNumber)).filter(Boolean)), [book]);
  const tplCtx = useContext(UserTemplateContext);
  const optCtx = useContext(PrintOptionsContext);
  const overview = useMemo(
    () => actsOverview(book, state.important, todayIso(), docIssues(book, state.important, tplCtx.template, optCtx)),
    [book, state.important, tplCtx.template, optCtx],
  );
  const actStatus = useMemo(() => new Map(overview.map((a) => [a.number, a])), [overview]);

  // Таблицы вкладки — из книги (с гиперссылками и порядком столбцов листа).
  useEffect(() => {
    if (!current) return;
    let alive = true;
    void port
      .readMany(tabTables)
      .then((m) => alive && setData(m))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [port, book, tab, extra]);
  // Место исправления: вкладка таблицы (или ближайшая, со вспомогательной таблицей группой), строка и поле.
  const [flash, setFlash] = useState<{ column: string; n: number } | null>(null);
  const pending = useRef<{ table: TableName; row: number | null; tab: TabId } | null>(null);
  useEffect(() => {
    if (!focus) return;
    const own = TABS.find((x) => x.tables.includes(focus.table));
    const id = own?.id ?? TAB_OF[focus.table] ?? "acts";
    setExtra(own ? null : focus.table);
    pending.current = { table: focus.table, row: focus.row, tab: id };
    if (id === tab) applyPending();
    else setTab(id);
    const label = focus.table === "Объект" && focus.row !== null ? t((book.tables["Объект"] ?? [])[focus.row]?.v.field ?? null) : focus.column;
    setFlash({ column: label, n: focus.n });
  }, [focus?.n]);
  const applyPending = () => {
    const p = pending.current;
    pending.current = null;
    setQuery("");
    if (!p) return setSel(null);
    if (p.table === "Объект") return setSel({ table: "Объект", row: 0 });
    setSel(p.row !== null ? { table: p.table, row: p.row } : null);
  };
  useEffect(() => {
    if (pending.current) {
      if (pending.current.tab === tab) applyPending();
    } else {
      setSel(null);
      setQuery("");
      setExtra(null);
    }
    setAskDelete(false);
    setError("");
  }, [tab]);
  // Подсветить поле с ошибкой в карточке (после отрисовки карточки).
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => {
      const fields = [...document.querySelectorAll<HTMLElement>(".bk-card .field")];
      const want = flash.column.trim().toLowerCase();
      const f =
        fields.find((el) => (el.querySelector(".field-label")?.firstChild?.textContent ?? "").trim().toLowerCase() === want) ??
        fields.find((el) => (el.querySelector(".field-label")?.textContent ?? "").toLowerCase().startsWith(want));
      if (!f) return;
      f.closest("details")?.setAttribute("open", "");
      f.scrollIntoView({ block: "center", behavior: "smooth" });
      f.classList.add("field-flash");
      (f.querySelector("input,textarea,select") as HTMLElement | null)?.focus({ preventScroll: true });
      setTimeout(() => f.classList.remove("field-flash"), 2500);
    }, 350);
    return () => clearTimeout(timer);
  }, [flash, sel, data]);

  const levelOf = (table: TableName, r: BookRow): Level => {
    if (table === "Акты") {
      const a = actStatus.get(t(r.v.baseNumber));
      return a?.status === "blocked" ? "critical" : a?.status === "warn" ? "warn" : "ok";
    }
    return emptyImportant(state, table, r) ? "critical" : "ok";
  };
  const tabLevel = (x: Tab): Level | null => {
    let lv: Level | null = null;
    for (const table of x.tables)
      for (const r of book.tables[table] ?? []) {
        const l = levelOf(table, r);
        if (l === "critical") return "critical";
        if (l === "warn") lv = "warn";
      }
    return lv;
  };

  const rowsOf = (table: TableName) => book.tables[table] ?? [];
  const visibleRows = (table: TableName) => {
    const q = query.trim().toLowerCase();
    return rowsOf(table).filter((r) => {
      if (table === "Объект") return false;
      if (!q) return true;
      return Object.values(r.v).some((v) =>
        cellText(v ?? null)
          .toLowerCase()
          .includes(q),
      );
    });
  };
  const firstTable = tabTables[0];
  const selected =
    sel ??
    (current && firstTable
      ? firstTable === "Объект"
        ? { table: "Объект" as TableName, row: 0 }
        : rowsOf(firstTable)[0]
          ? { table: firstTable, row: rowsOf(firstTable)[0].row }
          : null
      : null);
  const selData = selected ? data.get(selected.table) : null;
  // 0.44: адреса ячеек в карточке — первый столбец таблицы и строка листа первой строки данных.
  const [origin, setOrigin] = useState<{ table: TableName; col: number; row: number } | null>(null);
  const selTable = selected?.table ?? null;
  useEffect(() => {
    if (!selTable) return;
    let alive = true;
    void Promise.all([port.tableStartColumn(selTable), port.tableSheetOffset(selTable)])
      .then(([col, row]) => alive && setOrigin({ table: selTable, col, row }))
      .catch(() => alive && setOrigin(null));
    return () => {
      alive = false;
    };
  }, [port, selTable]);
  const org = origin && origin.table === selTable && origin.col >= 0 ? { col: origin.col, row: origin.row } : null;
  const total = current ? tabTables.reduce((n, x) => n + (x === "Объект" ? 0 : rowsOf(x).length), 0) : 0;

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await f();
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const target = (table: TableName) => tableRows(port, table);
  const add = (n: number) =>
    run(async () => {
      const table = selected?.table && selected.table !== "Объект" ? selected.table : (current?.tables.find((x) => x !== "Объект") ?? null);
      if (!table) return;
      if (await port.isFiltered(table)) await port.clearFilters(table);
      const first = await addRows(target(table), selected?.table === table ? selected.row : null, n);
      await onRowsAdded?.(table, first, n);
      setSel({ table, row: first });
    });
  const canEdit = !!selected && selected.table !== "Объект";

  const confirmRename = async () => {
    if (!rename) return;
    const r = await renameKey(port, book, rename.table, rename.from, rename.to);
    setRename(null);
    setError(r.ok ? "" : r.message);
    state.refresh();
  };

  // ---------- Оглавление ----------
  const toc = () => {
    const plan = sheetPlan(template, book, needed.on);
    const n = (x: TableName) => (book.tables[x] ?? []).length;
    const acts = overview;
    const blocked = acts.filter((a) => a.status === "blocked").length;
    const warn = acts.filter((a) => a.status === "warn").length;
    const docs = book.tables["ДокументыКачества"] ?? [];
    const noScan = docs.filter((r) => (t(r.v.number) || t(r.v.type)) && !r.link.file && !t(r.v.file)).length;
    const schemesNoScan = (book.tables["Схемы"] ?? []).filter((r) => !r.link.file && !t(r.v.file)).length;
    const cableM = (book.tables["КабельныйЖурнал"] ?? []).reduce((s, r) => {
      const p = parseNumberCell(r.v.cableLength ?? null);
      return s + (p.ok && p.value ? p.value : 0);
    }, 0);
    const marks = new Set((book.tables["КабельныйЖурнал"] ?? []).map((r) => t(r.v.cableMark)).filter(Boolean)).size;
    const crit = (tabId: TabId) => {
      const x = TABS.find((y) => y.id === tabId)!;
      return x.tables.reduce((s, table) => s + (book.tables[table] ?? []).filter((r) => table !== "Акты" && emptyImportant(state, table, r)).length, 0);
    };
    const items: { id: TabId; text: ReactNode; count: number | null; level: Level }[] = [
      {
        id: "requisites",
        text: (
          <>
            объект, <b>{n("Организации")}</b> {word(n("Организации"), "организация", "организации", "организаций")}, <b>{n("Шифры")}</b>{" "}
            {word(n("Шифры"), "шифр", "шифра", "шифров")}
          </>
        ),
        count: null,
        level: !t(book.object.name) ? "critical" : crit("requisites") ? "critical" : "ok",
      },
      {
        id: "reps",
        text: crit("reps") ? (
          <>
            <b>{crit("reps")}</b> строк с пустыми важными ячейками
          </>
        ) : (
          "полномочия — по датам «Действует с/по»"
        ),
        count: n("Представители"),
        level: crit("reps") ? "critical" : n("Представители") ? "ok" : "warn",
      },
      {
        id: "acts",
        text:
          blocked || warn ? (
            <>
              {blocked > 0 && (
                <>
                  <b>{blocked}</b> не {word(blocked, "собирается", "собираются", "собираются")}
                </>
              )}
              {blocked > 0 && warn > 0 && " · "}
              {warn > 0 && (
                <>
                  <b>{warn}</b> с замечаниями
                </>
              )}
            </>
          ) : (
            "все акты собираются"
          ),
        count: acts.length,
        level: blocked ? "critical" : warn ? "warn" : "ok",
      },
      {
        id: "materials",
        text: noScan ? (
          <>
            <b>{noScan}</b> {word(noScan, "документ", "документа", "документов")} качества без скана
          </>
        ) : (
          "документы качества со сканами"
        ),
        count: n("Материалы"),
        level: crit("materials") ? "critical" : noScan ? "warn" : "ok",
      },
      {
        id: "schemes",
        text: schemesNoScan ? (
          <>
            <b>{schemesNoScan}</b> без скана
          </>
        ) : (
          "сканы приложены"
        ),
        count: n("Схемы"),
        level: schemesNoScan ? "warn" : "ok",
      },
      {
        id: "cables",
        text: cableM ? (
          <>
            всего <b>{Math.round(cableM).toLocaleString("ru")} м</b> кабеля, <b>{marks}</b> {word(marks, "марка", "марки", "марок")}
          </>
        ) : (
          "кабельные линии актов"
        ),
        count: n("КабельныйЖурнал"),
        level: "ok",
      },
      {
        id: "kits",
        text: (
          <>
            в реестре <b>{n("РеестрИД")}</b> {word(n("РеестрИД"), "документ", "документа", "документов")}
          </>
        ),
        count: new Set((book.tables["Комплекты"] ?? []).map((r) => t(r.v.number)).filter(Boolean)).size,
        level: "ok",
      },
      { id: "ojr", text: "разделы 3 и 5 собираются из актов", count: n("ОЖР3"), level: "ok" },
    ];
    const sheetRows = (name: string) => SHEETS.find((s) => s.name === name)!.tables.reduce((s, x) => s + (book.tables[x]?.length ?? 0), 0);
    const toggleSheet = (name: string, show: boolean) => void run(async () => port.setSheetsVisible(show ? [name] : [], show ? [] : [name]));
    return (
      <div className="bk-toc-grid">
        <section className="bk-toc">
          <ol>
            {items.map((x, i) => (
              <li key={x.id}>
                <button onClick={() => setTab(x.id)}>
                  <span className="bk-toc-n mono">{String(i + 1).padStart(2, "0")}</span>
                  <span className="bk-toc-title">
                    {TABS.find((y) => y.id === x.id)!.label === "ОЖР" ? "Общий журнал работ" : TABS.find((y) => y.id === x.id)!.label}
                  </span>
                  <span className="bk-toc-lead" />
                  <span className="bk-toc-text">{x.text}</span>
                  <span className="bk-toc-count mono">{x.count ?? ""}</span>
                  <IssueIcon level={x.level} />
                </button>
              </li>
            ))}
          </ol>
          <footer className="bk-toc-foot">
            <button className="btn" onClick={() => onScreen("wizard")}>
              Мастер первого акта
            </button>
            <button className="btn" onClick={() => setCheckAll((v) => v + 1)}>
              Проверить книгу целиком
            </button>
            <span className="muted">Щелчок по разделу открывает его карточки. Число справа — строк на листе.</span>
          </footer>
          {checkAll > 0 && (
            <div className="bk-pad">
              <PreDelivery port={port} state={state} acts={overview.map((a) => a.number)} what="все акты" trigger={checkAll} />
            </div>
          )}
        </section>
        <aside className="bk-side">
          <section className="bk-side-card bk-sheets">
            <header>
              <h3>
                Листы Excel{" "}
                <span className="mono muted">
                  {plan.visible.length} из {SHEETS.length}
                </span>
              </h3>
              <label className="switch" title="Только нужные листы: служебные и не нужные шаблону — скрыты">
                <input type="checkbox" checked={needed.on} disabled={busy} onChange={(e) => void run(() => needed.set(e.target.checked))} />
                <span />
              </label>
            </header>
            <ul>
              {SHEETS.map((s) => {
                const on = plan.visible.includes(s.name);
                return (
                  <li key={s.name} className={on ? undefined : "bk-sheet-off"}>
                    <span className={`bk-swatch bk-sw-${TABS.find((x) => x.tables.some((tb) => s.tables.includes(tb)))?.id ?? "other"}`} />
                    <button className="bk-sheet-name" onClick={() => void port.activateSheet(s.name)} title="Открыть лист в Excel">
                      {s.name}
                    </button>
                    <span className="mono muted">{sheetRows(s.name) || ""}</span>
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => toggleSheet(s.name, !on)}
                      title={on ? "Скрыть лист в Excel" : "Показать лист в Excel"}
                    >
                      {on ? "◉" : "◌"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="muted">«Только нужные листы» прячет служебные и не нужные шаблону листы; показать любой — кнопкой справа.</p>
          </section>
          <section className="bk-side-card">
            <h3>
              <span className="bk-pink" /> Важные столбцы
            </h3>
            <p className="muted">Пустая важная ячейка подсвечена розовым и в Excel, и в карточке. Пока она пуста, акт не собирается.</p>
          </section>
        </aside>
      </div>
    );
  };

  // ---------- Вкладка раздела ----------
  const editor = () => {
    if (!current) return null;
    const groups = tabTables;
    const view = selected && selected.table !== "Объект" ? rowsOf(selected.table).find((r) => r.row === selected.row) : null;
    const head = view ? rowView(selected!.table, view, short) : null;
    const level = view ? levelOf(selected!.table, view) : null;
    const a = selected?.table === "Акты" && view ? actStatus.get(t(view.v.baseNumber)) : undefined;
    const list = selected ? rowsOf(selected.table) : [];
    const pos = view ? list.findIndex((r) => r.row === view.row) : -1;
    const go = (d: -1 | 1) => {
      const r = list[pos + d];
      if (r && selected) setSel({ table: selected.table, row: r.row });
    };
    return (
      <div className="bk-ed">
        <section className="bk-list">
          <header>
            <strong>
              {total} {current.id === "acts" && !extra ? word(total, "акт", "акта", "актов") : word(total, "строка", "строки", "строк")}
            </strong>
            <span className="muted"> · {current.sheet}</span>
            <input type="search" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по строкам" />
          </header>
          <div className="bk-rows">
            {groups.map((table) => (
              <div key={table}>
                {groups.length > 1 && (
                  <div className="bk-group">
                    <span className="wn-cap">{GROUP[table] ?? table}</span>
                    <span className="mono muted">{table === "Объект" ? `${(book.tables["Объект"] ?? []).length} полей` : rowsOf(table).length}</span>
                  </div>
                )}
                {table === "Объект" ? (
                  <button className={`bk-row${selected?.table === "Объект" ? " bk-row-on" : ""}`} onClick={() => setSel({ table: "Объект", row: 0 })}>
                    <IssueIcon level={t(book.object.name) ? "ok" : "critical"} />
                    <span className="bk-row-body">
                      <b>Объект</b>
                      <span>наименование, адрес, договор, участники</span>
                    </span>
                  </button>
                ) : (
                  visibleRows(table).map((r) => {
                    const v = rowView(table, r, short);
                    const on = selected?.table === table && selected.row === r.row;
                    return (
                      <button key={r.row} className={`bk-row${on ? " bk-row-on" : ""}`} onClick={() => setSel({ table, row: r.row })}>
                        <IssueIcon level={levelOf(table, r)} />
                        <span className="bk-row-body">
                          <span className="bk-row-top">
                            <b className={v.mono ? "mono" : undefined}>{v.title || <span className="muted">(пусто)</span>}</b>
                            {v.right && <span className="mono muted">{v.right}</span>}
                          </span>
                          {v.sub && <span className="bk-row-sub">{v.sub}</span>}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ))}
          </div>
          <footer className="bk-list-tools">
            <button className="btn" disabled={busy} onClick={() => void add(1)} title="Добавить строку">
              + 1
            </button>
            <button className="btn" disabled={busy} onClick={() => void add(10)} title="Добавить 10 строк">
              + 10
            </button>
            <button
              className="btn btn-icon"
              disabled={busy || !canEdit}
              onClick={() => void run(async () => setSel({ table: selected!.table, row: await duplicateRow(target(selected!.table), selected!.row) }))}
              title="Копия строки"
            >
              ⧉
            </button>
            <button
              className="btn btn-icon"
              disabled={busy || !canEdit}
              onClick={() => void run(async () => setSel({ table: selected!.table, row: await moveRow(target(selected!.table), selected!.row, -1) }))}
              title="Вверх"
            >
              ↑
            </button>
            <button
              className="btn btn-icon"
              disabled={busy || !canEdit}
              onClick={() => void run(async () => setSel({ table: selected!.table, row: await moveRow(target(selected!.table), selected!.row, 1) }))}
              title="Вниз"
            >
              ↓
            </button>
            <button className="btn btn-icon bk-del" disabled={busy || !canEdit} onClick={() => setAskDelete(true)} title="Удалить строку">
              🗑
            </button>
          </footer>
        </section>

        <section className="bk-card">
          {rename && (
            <div className="confirm confirm-float" role="alertdialog" aria-label="Обновление ссылок">
              <p>
                «{rename.from}» → «{rename.to}». Обновить ссылки: {rename.hits.length} строк на {new Set(rename.hits.map((h) => h.table)).size} листах?
              </p>
              <div className="row-actions">
                <button className="btn btn-primary" onClick={() => void confirmRename()}>
                  Обновить
                </button>
                <button className="btn" onClick={() => setRename(null)}>
                  Не обновлять
                </button>
              </div>
            </div>
          )}
          {askDelete && selected && (
            <div className="confirm confirm-float" role="alertdialog" aria-label="Подтверждение удаления">
              <p>
                Удалить строку «{head?.title}»?
                {(() => {
                  const k = TABLES[selected.table].columns.find((c) => c.isKey);
                  const hits = k && view ? findReferences(book, selected.table, t(view.v[k.key])).length : 0;
                  return hits ? ` На неё ссылаются ${hits} строк — ссылки останутся без пары.` : "";
                })()}
              </p>
              <div className="row-actions">
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    setAskDelete(false);
                    void run(async () => {
                      await deleteRows(target(selected.table), [selected.row]);
                      setSel(null);
                    });
                  }}
                >
                  Удалить
                </button>
                <button className="btn" onClick={() => setAskDelete(false)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
          {current.id === "ojr" && (
            <OjrCalendar rows={rowsOf("ОЖР3")} picked={selected?.table === "ОЖР3" ? selected.row : null} onPick={(row) => setSel({ table: "ОЖР3", row })} />
          )}
          {selected?.table === "Объект" ? (
            <>
              <header className="bk-card-head">
                <h2>Объект</h2>
                <span className={`acts-badge ${t(book.object.name) ? "acts-ready" : "acts-blocked"}`}>
                  {t(book.object.name) ? "заполнено" : "не заполнено"}
                </span>
                <span className="muted mono bk-pos">{(book.tables["Объект"] ?? []).length} полей · таблица «Объект»</span>
              </header>
              {selData && <ObjectCard port={port} state={state} data={selData} origin={org} />}
            </>
          ) : view && selData ? (
            <>
              <header className="bk-card-head">
                <h2 title={head?.title}>
                  {selected!.table === "Акты"
                    ? `Акт ${head?.title}`
                    : selected!.table === "Схемы"
                      ? `${t(view.v.kind) || "Схема"} № ${t(view.v.number) || "—"}`
                      : head?.title || "Новая строка"}
                </h2>
                {a && a.status !== "ready" && <span className={`acts-badge acts-${a.status}`}>{statusText(a)}</span>}
                {!a && level === "critical" && <span className="acts-badge acts-blocked">пустые важные ячейки</span>}
                <span className="muted mono bk-pos">
                  строка {pos + 1} из {list.length}
                  <button className="btn btn-ghost btn-icon" disabled={pos <= 0} onClick={() => go(-1)} aria-label="Предыдущая строка">
                    ⌃
                  </button>
                  <button className="btn btn-ghost btn-icon" disabled={pos >= list.length - 1} onClick={() => go(1)} aria-label="Следующая строка">
                    ⌄
                  </button>
                </span>
              </header>
              {selected!.table === "Материалы" && <MaterialQuantity book={book} material={view} short={short} />}
              {selected!.table === "Представители" && <RepTimeline book={book} rep={view} />}
              <RowCard
                port={port}
                state={state}
                at={{ data: selData, row: selected!.row }}
                onRename={setRename}
                title={false}
                layout={{ groups: true, origin: org }}
              />
              {selected!.table === "Схемы" && <Point4 state={state} row={view} short={short} />}
            </>
          ) : (
            <p className="notice bk-pad">{total ? "Выберите строку слева." : "На листе пока нет строк — «+ 1» добавит первую."}</p>
          )}
          {error && (
            <p className="error bk-pad" role="alert">
              {error}
            </p>
          )}
          <footer className="bk-card-foot">
            <span className="muted">
              {selected && selected.table !== "Объект"
                ? `Поля карточки — ячейки строки ${selected.row + 1} таблицы «${GROUP[selected.table] ?? selected.table}» в Excel`
                : "Поля карточки — ячейки листа «Реквизиты» в Excel"}
            </span>
            {selected && selected.table !== "Объект" && (
              <button className="btn btn-link" onClick={() => void port.selectCell(selected.table, selected.row, TABLES[selected.table].columns[0].header)}>
                Строка в Excel ↗
              </button>
            )}
          </footer>
        </section>

        <aside className="bk-side">
          {current.id === "acts" && view && <ActPreview state={state} act={t(view.v.baseNumber)} marks={rowMarks("Акты", view)} />}
          {current.id === "requisites" && headerAct && (
            <ActPreview
              state={state}
              act={headerAct}
              title="Шапка каждого акта"
              marks={[
                ...(book.tables["Объект"] ?? []).map((r) => t(r.v.value)),
                ...(view && selected?.table !== "Объект" ? rowMarks(selected!.table, view) : []),
              ]}
              note="Синим — значения реквизитов: объект, организации, шифры. Организации подтягиваются из «Организаций»."
            />
          )}
          {current.id === "requisites" && <WherePrinted book={book} />}
          {current.id === "schemes" && view && (
            <>
              <ScanCard row={view} title="Скан схемы" />
              <SchemesSide book={book} row={view} short={short} onPick={(row) => setSel({ table: "Схемы", row })} />
            </>
          )}
          {current.id === "materials" && (
            <section className="bk-side-card bk-tools">
              <h3>Инструменты раздела</h3>
              <ScanImport port={port} state={state} />
              <SpecExtras port={port} state={state} />
              <SpecMatchTool port={port} state={state} />
            </section>
          )}
          {current.id === "ojr" && (
            <section className="bk-side-card">
              <OjrExtras port={port} state={state} card />
            </section>
          )}
          <section className="bk-side-card">
            <h3>Важные столбцы</h3>
            <p className="muted">Пустая важная ячейка подсвечена и в Excel, и в карточке; пока она пуста, документ не собирается.</p>
            <button
              className="btn"
              onClick={() => setImportant(selected && selected.table !== "Объект" ? selected.table : (groups.find((x) => x !== "Объект") ?? null))}
            >
              ✳ Выбрать важные столбцы
            </button>
            {important && <ImportantDialog port={port} state={state} table={important} onClose={() => setImportant(null)} />}
          </section>
        </aside>
      </div>
    );
  };

  return (
    <div className="bk">
      <header className="bk-head">
        <span className="wn-cap">Книга объекта{current ? ` · лист «${current.sheet}»` : ""}</span>
        <span className="bk-head-actions">
          <label className="switch-label">
            <span className="switch">
              <input type="checkbox" checked={needed.on} disabled={busy} onChange={(e) => void run(() => needed.set(e.target.checked))} />
              <span />
            </span>
            Только нужные листы
          </label>
          {current && (
            <button className="btn" onClick={() => setImportant(current.tables.find((x) => x !== "Объект") ?? null)}>
              ✳ Важные столбцы
            </button>
          )}
          <button className="btn" onClick={() => void port.activateSheet(current?.sheet ?? "Реквизиты")}>
            Лист в Excel ↗
          </button>
        </span>
      </header>
      <nav className="bk-tabs" role="tablist" aria-label="Разделы книги">
        <button role="tab" aria-selected={tab === "toc"} className={tab === "toc" ? "bk-tab-on" : undefined} onClick={() => setTab("toc")}>
          Оглавление
        </button>
        {TABS.map((x) => {
          const lv = tabLevel(x);
          return (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "bk-tab-on" : undefined} onClick={() => setTab(x.id)}>
              {x.label}
              {lv && lv !== "ok" && <i className={`bk-dot bk-dot-${lv}`} aria-label={lv === "critical" ? "есть ошибки" : "есть замечания"} />}
            </button>
          );
        })}
      </nav>
      {tab === "toc" ? toc() : editor()}
      {tab === "toc" && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
