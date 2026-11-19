// 0.41: «Печать и сдача» в окне программы по макету — комплекты слева, выбранный комплект: пять шагов сдачи,
// «Так будет сшит PDF», реестр комплекта; журналы и реестры, акты без комплекта.
import { useContext, useMemo, useState } from "react";
import { kitActs } from "@idk/shared/kit/registry";
import { checkActs } from "@idk/shared/check/predelivery";
import { shortNumbers } from "@idk/shared/acts/overview";
import { cellText, parseDateCell, parseNumberCell } from "@idk/shared/workbook/values";
import type { BookRow } from "@idk/shared/workbook/records";
import type { BookPort } from "../book/bookPort.ts";
import type { BookState } from "./useBook.ts";
import { useKit } from "./extras/KitExtras.tsx";
import { OjrExtras } from "./extras/OjrExtras.tsx";
import { IssueList } from "./extras/IssueList.tsx";
import { PreDelivery } from "./extras/PreDelivery.tsx";
import { IssueIcon } from "./IssueTable.tsx";
import { UserTemplateContext } from "./templateContext.ts";
import { shortageText, statusText } from "./catalogApi.ts";
import { todayIso } from "./today.ts";

const word = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const ru = (v: BookRow["v"][string]) => {
  const p = parseDateCell(v ?? null);
  if (p.ok && p.value) return `${p.value.slice(8, 10)}.${p.value.slice(5, 7)}.${p.value.slice(0, 4)}`;
  return cellText(v ?? null);
};
/** Листов документа: из графы «Листов», пусто — 1 (точно посчитает сборка). */
const sheetsOf = (r: BookRow) => {
  const p = parseNumberCell(r.v.sheets ?? null);
  return p.ok && p.value && p.value > 0 ? Math.round(p.value) : 1;
};
/** Короткая подпись листа в «Так будет сшит PDF». */
const docShort = (r: BookRow) => {
  const kind = cellText(r.v.kind);
  const name = cellText(r.v.name);
  if (/^акт освидетельствования скрытых/i.test(name)) return "АОСР";
  if (/^реестр приложений/i.test(name)) return "РП";
  if (/^реестр используемых материалов/i.test(name)) return "РМ";
  if (/^исполнительная схема/i.test(name)) return name.match(/№\s*\S+/)?.[0] ? `Схема ${name.match(/№\s*(\S+?)[.,]?(\s|$)/)?.[1] ?? ""}` : "Схема";
  if (/^ведомость смонтированного/i.test(name)) return "ВД";
  if (/^кабельный журнал/i.test(name)) return "КЖ";
  if (/^протокол/i.test(name)) return "Протокол";
  if (/сертификат/i.test(name)) return "Сертификат";
  if (/паспорт/i.test(name)) return "Паспорт";
  return kind || name.split(/\s+/)[0] || "Документ";
};

export function DeliveryWide({ port, state, kits, kit, setKit }: { port: BookPort; state: BookState; kits: string[]; kit: string; setKit(k: string): void }) {
  const book = state.book!;
  const tpl = useContext(UserTemplateContext);
  const k = useKit(port, state, kit);
  const [checkAll, setCheckAll] = useState(0);
  const [newKitBusy, setNewKitBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = (t: "Комплекты" | "АктыКомплектов" | "РеестрИД" | "Акты") => book.tables[t] ?? [];
  const short = useMemo(
    () =>
      shortNumbers(
        rows("Акты")
          .map((r) => cellText(r.v.baseNumber))
          .filter(Boolean),
      ),
    [book],
  );

  const info = useMemo(
    () =>
      kits.map((n) => {
        const { acts } = kitActs(book, n);
        return {
          number: n,
          volume: cellText(rows("Комплекты").find((r) => cellText(r.v.number) === n)?.v.volume ?? null),
          acts: acts.length,
          registry: rows("РеестрИД").filter((r) => cellText(r.v.kit) === n).length,
          warnings: acts.length ? checkActs(book, acts, todayIso()).length : 0,
        };
      }),
    [book, kits.join("\n")],
  );
  const inKits = new Set(rows("АктыКомплектов").map((r) => cellText(r.v.act)));
  const loose = rows("Акты").filter((r) => cellText(r.v.baseNumber) && !inKits.has(cellText(r.v.baseNumber))).length;
  const cur = info.find((x) => x.number === kit);
  const kitRow = rows("Комплекты").find((r) => cellText(r.v.number) === kit);
  const registry = rows("РеестрИД").filter((r) => cellText(r.v.kit) === kit);
  const cover = !!kitRow && !!cellText(kitRow.v.cover ?? null) && !/^(нет|0|false)$/i.test(cellText(kitRow.v.cover ?? null));
  // Страницы: титул (если есть), реестр (1 лист на 25 строк), затем документы по порядку реестра.
  let page = 1;
  const front: { label: string; pages: string; dark?: boolean }[] = [];
  if (cover) front.push({ label: "Титул", pages: `л. ${page++}`, dark: true });
  const regPages = Math.max(1, Math.ceil(registry.length / 25));
  front.push({ label: "Реестр", pages: regPages > 1 ? `л. ${page}–${page + regPages - 1}` : `л. ${page}` });
  page += regPages;
  const docs = registry.map((r) => {
    const n = sheetsOf(r);
    const from = page;
    page += n;
    return { r, label: docShort(r), pages: n > 1 ? `${from}–${from + n - 1}` : `${from}`, many: n > 1 };
  });
  const total = page - 1;

  const newKit = async () => {
    setNewKitBusy(true);
    setError("");
    try {
      const nums = kits.map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const next = String(nums.length ? Math.max(...nums) + 1 : kits.length + 1);
      const base = rows("Комплекты")[rows("Комплекты").length - 1];
      await port.insert("Комплекты", rows("Комплекты").length, [
        {
          "№ реестра": next,
          ...(base ? { Шифр: cellText(base.v.section ?? null), Город: cellText(base.v.city ?? null), Год: cellText(base.v.year ?? null) } : {}),
        },
      ]);
      setKit(next);
      state.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setNewKitBusy(false);
    }
  };

  const steps = cur
    ? [
        {
          title: "Сверка с актами",
          ok: registry.length > 0,
          text:
            k.note && !k.note.error && /Реестр/.test(k.note.text)
              ? k.note.text
              : registry.length
                ? `в реестре ${registry.length} ${word(registry.length, "документ", "документа", "документов")}`
                : "реестр соберётся из актов",
        },
        {
          title: "Проверка",
          ok: cur.warnings === 0,
          text: cur.warnings ? `${cur.warnings} ${word(cur.warnings, "замечание", "замечания", "замечаний")}, сдаче не мешает` : "замечаний нет",
        },
        { title: "Печать", text: `${registry.length} ${word(registry.length, "документ", "документа", "документов")} по шаблону «${tpl.template.name}»` },
        { title: "Нумерация", text: `сквозная, листы 1–${total}` },
        { title: "Один PDF", text: `${cover ? "титул, корешки и реестр" : "реестр"} — в начале` },
      ]
    : [];

  return (
    <div className="dl dl2">
      <header className="acts-head acts-head-big">
        <div>
          <h2>Печать и сдача</h2>
          <p className="muted">Комплект — акты, которые сдаются вместе: реестр, сквозная нумерация, один PDF</p>
        </div>
        <div className="acts-head-actions">
          <button className="btn btn-link" onClick={() => void port.activateSheet("Комплекты")}>
            Открыть «Комплекты» в Excel ↗
          </button>
          <button className="btn" onClick={() => setCheckAll((n) => n + 1)}>
            Проверить все акты перед сдачей
          </button>
        </div>
      </header>
      {checkAll > 0 && (
        <div className="dl-check">
          <PreDelivery
            port={port}
            state={state}
            acts={rows("Акты")
              .map((r) => cellText(r.v.baseNumber))
              .filter(Boolean)}
            what="все акты"
            trigger={checkAll}
          />
        </div>
      )}
      <div className="dl2-grid">
        <aside className="dl2-left">
          <span className="wn-cap">Комплекты ИД</span>
          {info.map((x) => (
            <button
              key={x.number}
              className={`dl2-kit${x.number === kit ? " dl2-kit-on" : ""}`}
              aria-current={x.number === kit ? "true" : undefined}
              onClick={() => setKit(x.number)}
            >
              <strong>
                Комплект {x.number}
                {x.volume ? ` · том ${x.volume}` : ""}
              </strong>
              <span>
                {x.acts} {word(x.acts, "акт", "акта", "актов")} ·{" "}
                {x.registry ? `в реестре ${x.registry} ${word(x.registry, "документ", "документа", "документов")}` : "реестр пуст"}
              </span>
              {x.warnings > 0 && (
                <span className="dl2-warn">
                  <IssueIcon level="warn" /> {x.warnings} {word(x.warnings, "замечание", "замечания", "замечаний")} перед сдачей
                </span>
              )}
            </button>
          ))}
          <button className="dl2-new" disabled={newKitBusy} onClick={() => void newKit()}>
            + {newKitBusy ? "Добавляю…" : "Новый комплект"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <span className="wn-cap dl2-cap2">Журналы и реестры</span>
          <section className="dl2-card">
            <OjrExtras port={port} state={state} card />
          </section>
          <section className="dl2-card">
            <div className="jr-head">
              <h3>Общий реестр</h3>
              <span className="wn-cap">комплектов: {kits.length}</span>
            </div>
            <p className="muted">Один реестр по всем комплектам объекта</p>
            <button className="btn" disabled={k.busy !== null || !kits.length} onClick={() => void k.common()}>
              {k.busy === "common" ? "Собираю…" : "Собрать общий реестр"}
            </button>
          </section>
          {loose > 0 && (
            <div className="dl2-loose">
              <span className="wn-cap">Без комплекта</span>
              <p>
                {loose} {word(loose, "акт ещё не разложен", "акта ещё не разложены", "актов ещё не разложены")} по комплектам. Номер комплекта ставится на
                экране «Акты» («В комплект…») или на листе «Акты комплектов».
              </p>
            </div>
          )}
        </aside>

        <section className="dl2-main">
          {!cur ? (
            <div className="dl2-empty">
              <h3>Комплектов пока нет</h3>
              <p className="muted">
                Комплект — номер и акты, которые сдаются вместе. Добавьте комплект слева, затем отметьте акты на экране «Акты» → «В комплект…».
              </p>
            </div>
          ) : (
            <>
              <header className="dl2-head">
                <div>
                  <span className="wn-cap">Комплект ИД</span>
                  <h2>
                    Комплект {cur.number}
                    {cur.volume ? ` · том ${cur.volume}` : ""}
                  </h2>
                  <span className="muted">
                    {cur.acts} {word(cur.acts, "акт", "акта", "актов")} · {registry.length} {word(registry.length, "документ", "документа", "документов")} · ~
                    {total} {word(total, "лист", "листа", "листов")}
                  </span>
                </div>
                <div className="acts-head-actions">
                  <button className="btn" onClick={() => k.check()}>
                    Проверить перед сдачей
                  </button>
                  <button className="btn btn-primary" disabled={k.busy !== null} onClick={() => void k.build()}>
                    {k.busy === "build" ? "Собираю…" : "Сдать: собрать комплект"}
                  </button>
                </div>
              </header>
              <ol className="dl2-steps">
                {steps.map((s, i) => (
                  <li key={s.title}>
                    <b>
                      {s.ok === true ? <IssueIcon level="ok" /> : s.ok === false ? <IssueIcon level="warn" /> : <span className="dl2-num">{i + 1}</span>}{" "}
                      {s.title}
                    </b>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
              {registry.length > 0 && (
                <section className="dl2-pdf">
                  <span className="wn-cap">
                    Так будет сшит PDF{" "}
                    <span className="dl2-pdf-name">
                      ~{total} {word(total, "лист", "листа", "листов")} · Комплект {cur.number}
                      {cur.volume ? `, том ${cur.volume}` : ""}.pdf
                    </span>
                  </span>
                  <div className="dl2-sheets">
                    {front.map((f) => (
                      <figure key={f.label} className={f.dark ? "dl2-sheet dl2-sheet-dark" : "dl2-sheet"}>
                        <span className="dl2-page" />
                        <figcaption>
                          <b>{f.label}</b>
                          <span className="mono">{f.pages}</span>
                        </figcaption>
                      </figure>
                    ))}
                    <span className="dl2-divider" aria-hidden="true" />
                    {docs.map((d, i) => (
                      <figure
                        key={i}
                        className={`dl2-sheet${d.many ? " dl2-sheet-many" : ""}${cellText(d.r.v.code ?? null) ? " dl2-sheet-wide" : ""}`}
                        title={cellText(d.r.v.name)}
                      >
                        <span className="dl2-page" />
                        <figcaption>
                          <b>{d.label}</b>
                          <span className="mono">л. {d.pages}</span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
              {k.kitButtons.length > 0 && (
                <div className="dl2-kitdocs">
                  <span className="wn-cap">Документы на комплект</span>
                  {k.kitButtons.map((b) => (
                    <button key={b.key} className="btn" disabled={k.busy !== null} onClick={() => void k.print(b)}>
                      {k.busy === b.key ? "Готовлю…" : b.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="dl2-msgs">
                {k.busy === "build" && <p className="notice">Печатаю документы и склеиваю комплект — это может занять минуту.</p>}
                <IssueList port={port} lines={k.lines} title="Перед сборкой исправьте:" />
                {k.note && (
                  <p className={k.note.error ? "error" : "notice"} role="status">
                    {k.note.text}
                  </p>
                )}
                {k.shortage.length > 0 && (
                  <div className="warn" role="status">
                    <b>{shortageText(k.shortage.length)}</b> — сборку это не блокирует:{" "}
                    {k.shortage
                      .slice(0, 6)
                      .map((s) => `${s.act ? `акт ${short.get(s.act) ?? s.act}` : "комплект"} — ${statusText(s.status, s.label)}`)
                      .join("; ")}
                    {k.shortage.length > 6 ? "…" : ""}
                  </div>
                )}
                {k.checked > 0 && <PreDelivery port={port} state={state} acts={kitActs(book, kit).acts} what="комплект" trigger={k.checked} />}
              </div>
              <section className="dl2-reg">
                <header>
                  <h3>
                    Реестр комплекта <sup className="mono">{registry.length}</sup>
                  </h3>
                  <span className="acts-head-actions">
                    <button className="btn" onClick={() => void port.filterBy("АктыКомплектов", "Комплект", kit)}>
                      Акты комплекта
                    </button>
                    <button className="btn" disabled={k.busy !== null} onClick={() => void k.fill()}>
                      {k.busy === "fill" ? "Сверяю…" : "⟳ Обновить из актов"}
                    </button>
                  </span>
                </header>
                {registry.length ? (
                  <table className="dl2-table">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Наименование документа</th>
                        <th>Номер</th>
                        <th>Дата</th>
                        <th className="num">Листов</th>
                        <th className="num">Стр.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((d, i) => (
                        <tr key={i} onClick={() => void port.selectCell("РеестрИД", d.r.row, "Наименование")} title="Строка в «Реестре ИД» в Excel">
                          <td className="mono muted">{i + 1}</td>
                          <td>{cellText(d.r.v.name)}</td>
                          <td className="mono">{cellText(d.r.v.number) ? `№ ${cellText(d.r.v.number).replace(/^№\s*/, "")}` : "—"}</td>
                          <td className="mono">{ru(d.r.v.date)}</td>
                          <td className="mono num">{sheetsOf(d.r)}</td>
                          <td className="mono num">{d.pages}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted dl2-pad">Реестр пуст — «Обновить из актов» соберёт его из актов комплекта (при сборке это происходит само).</p>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
