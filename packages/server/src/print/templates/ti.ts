// План 14: формы набора «ТИ» по образцам ООО «Техноинжиниринг» — ВД, реестр применённых материалов (РМ), реестр приложений (РП).
import type { TiData, TiHeader, TiSign } from "../tiData.ts";
import type { TiJournal } from "@idk/shared/acts/cableDocs";
import { e, page } from "./common.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { htmlBlankTable, type BodyRow } from "../blankTable.ts";
import { withNo } from "@idk/shared/acts/format";

export const TI_STYLE = `<style>
body.ti { font-size: 9pt; }
.ti-head { display: grid; grid-template-columns: 1fr 60mm 1fr; column-gap: 6mm; margin-bottom: 6pt; }
.ti-cell { text-align: center; margin-bottom: 4pt; }
.ti-val { font-weight: bold; border-bottom: 0.6pt solid #000; min-height: 11pt; white-space: pre-line; }
.ti-cap { font-size: 6pt; }
.ti-title { text-align: center; font-weight: bold; font-size: 10.5pt; margin-top: 6pt; }
.ti-sub { text-align: center; font-size: 9pt; margin-bottom: 6pt; }
table.grid.ti-t th { font-size: 8.5pt; }
table.grid.ti-t td { font-size: 8.5pt; }
table.grid.ti-t td.l { text-align: left; }
table.grid.ti-t tr.ti-doc td { background: #d9d9d9; }
.ti-signs { margin-top: 10pt; }
.ti-sign { break-inside: avoid; margin-top: 6pt; }
.ti-sign .lbl { font-weight: bold; }
.ti-sign .name { font-style: italic; border-bottom: 0.6pt solid #000; min-height: 11pt; margin-top: 3pt; }
.ti-sign .cap { font-size: 6pt; }
</style>`;

const cell = (value: string, caption: string) => `<div class="ti-cell"><div class="ti-val">${e(value) || "&nbsp;"}</div><div class="ti-cap">${e(caption)}</div></div>`;

/** Шапка ВД и КЖ: подрядчик и город, участок и заказчик, объект, дата. */
export function tiHeaderHtml(h: TiHeader): string {
  return `<div class="ti-head">
    <div>${cell(h.contractor, "(подрядная организация)")}${cell([h.sectionName, h.sectionCode].filter(Boolean).join("\n"), "(участок)")}</div>
    <div></div>
    <div>${cell(h.city, "(город)")}${cell(h.customer, "(заказчик)")}${cell(h.object, "(объект)")}
      ${cell(h.day ? `"${h.day}" ${h.month} ${h.year}г.` : "", "(дата)")}</div>
  </div>`;
}

export const tiSignsHtml = (signs: TiSign[]) => `<div class="ti-signs">${signs.map((s) =>
  `<div class="ti-sign"><div class="lbl">${e(s.label)}</div>${s.names.map((n) => `<div class="name">${e(n) || "&nbsp;"}</div><div class="cap">(фамилия, инициалы, подпись)</div>`).join("")}</div>`).join("")}</div>`;

export const tiVdRows = (d: TiData): BodyRow[] => d.vd.map((r) => ({ cls: "row", cells: { n: r.n, name: r.name, type: r.type, quantity: r.quantity, unit: r.unit, note: "" } }));

/** РМ: строки документов (серые), под ними материалы этих документов — наименование до конца строки. */
export const tiRmRows = (d: TiData): BodyRow[] => d.rm.flatMap((g) => [
  ...g.docs.map((x): BodyRow => ({ cls: "ti-doc", style: { fill: "D9D9D9" }, cells: { n: "", name: x.type, date: x.date, number: x.number } })),
  ...g.items.map((i): BodyRow => ({ cls: "row", cells: { n: `${i.n}.`, name: { text: i.name, rest: true } } })),
]);

export const tiRpRows = (d: TiData): BodyRow[] => d.rp.map((r) => ({ cls: "row", cells: { n: r.n, type: r.type, date: r.date, number: r.number, sheets: r.sheets || "" } }));

export function tiVdHtml(d: TiData, view: BlankView = blankView("vd:ti")): string {
  return page(`ВД ${d.vdNumber}`, `${TI_STYLE}${tiHeaderHtml(d.header)}
    <div class="ti-title">ВЕДОМОСТЬ № ${e(d.vdNumber)}</div>
    <div class="ti-title" style="margin-top:0">СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ И МАТЕРИАЛОВ</div>
    ${htmlBlankTable(view, tiVdRows(d), { cls: "ti-t", nums: true, style: "margin-top:6pt" })}${tiSignsHtml(d.signs)}`, "ti");
}

const appendixHead = (title: string, sub: string, number: string, d: TiData) =>
  `<div class="ti-title">${e(title)}</div><div class="ti-title" style="margin-top:0">${e(sub)}</div>
   <div class="ti-title" style="margin-top:0">${e(withNo(String(number ?? "")))}</div>
   <div class="ti-sub">к АОСР ${e(d.aosrNumber)} от ${e(d.actDate)}г.</div>`;

export function tiRmHtml(d: TiData, view: BlankView = blankView("rim:ti")): string {
  return page(`РМ ${d.rmNumber}`, `${TI_STYLE}${appendixHead("РЕЕСТР", "применённых материалов", d.rmNumber, d)}
    ${htmlBlankTable(view, tiRmRows(d), { cls: "ti-t" })}${tiSignsHtml(d.signs)}`, "ti");
}

export function tiRpHtml(d: TiData, view: BlankView = blankView("rp:ti")): string {
  return page(`РП ${d.rpNumber}`, `${TI_STYLE}${appendixHead("РЕЕСТР", "документов, подтверждающих соответствие работ", d.rpNumber, d)}
    ${htmlBlankTable(view, tiRpRows(d), { cls: "ti-t" })}${tiSignsHtml(d.signs)}`, "ti");
}

const KJ_STYLE = `<style>
@page { size: A4 landscape; margin: 10mm 10mm 10mm 12mm; }
table.grid.ti-kj th, table.grid.ti-kj td { font-size: 8pt; text-align: center; }
table.grid.ti-kj tr.grp td { font-weight: bold; }
table.grid.ti-kj tr.tot td { font-weight: bold; }
.kj-sign { display: grid; grid-template-columns: 20mm 70mm 10mm 40mm 10mm 30mm; align-items: end; margin-top: 10pt; break-inside: avoid; }
.kj-sign .line { border-bottom: 0.6pt solid #000; height: 11pt; }
.kj-sign .cap { font-size: 6pt; text-align: center; }
.kj-signs { break-inside: avoid; }
</style>`;

/** Строки КЖ «ТИ»: кабели по группам, итоги (по настройке бланка). Подпись итога — в графе «Марка», без неё — в первой. */
export function tiKjRows(j: TiJournal, view: BlankView): BodyRow[] {
  const rows: BodyRow[] = j.lines.map((l) => l.kind === "group"
    ? { full: l.title, cls: "grp", style: { b: true } }
    : { cls: "row", cells: { designation: l.designation, from: l.from, to: l.to, mark: l.mark, project: l.project, fact: l.fact, tray: l.tray, smooth: l.smooth, corrugated: l.corrugated } });
  const label = view.shown("mark") ? "mark" : "designation";
  const tot = (cells: Record<string, string>): BodyRow => ({ cls: "tot", style: { b: true }, cells });
  if (view.shown("total")) rows.push(tot({ [label]: "Итого всего", tray: j.total.tray, smooth: j.total.smooth, corrugated: j.total.corrugated }));
  // 0.28.1: запас — в строке каждой марки (фактическая длина × кф, вверх до целого), а не отдельной строкой.
  const withReserve = view.shown("reserve") && j.reserve.pct !== "0" && j.reserve.pct !== "";
  if (view.shown("byMark")) for (const m of j.byMark) rows.push(tot(withReserve
    ? { [label]: `в т.ч. ${m.mark} с учетом кф запаса ${j.reserve.pct}%`, project: m.project, fact: m.factReserve }
    : { [label]: `в т.ч. ${m.mark}`, project: m.project, fact: m.fact }));
  return rows;
}

/** Кабельный журнал «ТИ»: шапка, таблица по образцу (графы — по настройке бланка), итоги, запас, «Сдал/Принял». */
export function tiKjHtml(d: { header: TiHeader; number: string; journal: TiJournal }, view: BlankView = blankView("kj:ti")): string {
  const sign = (label: string) => `<div class="kj-sign"><div>${label}</div><div class="line"></div><div></div><div class="line"></div><div></div><div class="line"></div>
    <div></div><div></div><div></div><div class="cap">Подпись</div><div></div><div class="cap">Дата</div></div>`;
  return page(`КЖ ${d.number}`, `${TI_STYLE}${KJ_STYLE}${tiHeaderHtml(d.header)}
    <div class="ti-title" style="font-size:12pt">Кабельный журнал ${e(withNo(String(d.number ?? "")))}</div>
    ${htmlBlankTable(view, tiKjRows(d.journal, view), { cls: "ti-kj", style: "margin-top:6pt" })}${view.shown("signs") ? `<div class="kj-signs">${sign("Сдал:")}${sign("Принял:")}</div>` : ""}`, "ti");
}
