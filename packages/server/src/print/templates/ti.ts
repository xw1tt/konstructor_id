// План 14: формы набора «ТИ» по образцам ООО «Техноинжиниринг» — ВД, реестр применённых материалов (РМ), реестр приложений (РП).
import type { TiData, TiHeader, TiSign } from "../tiData.ts";
import type { TiJournal } from "@idk/shared/acts/cableDocs";
import { e, page } from "./common.ts";

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

const nums = (n: number) => `<tr class="nums">${Array.from({ length: n }, (_, i) => `<td>${i + 1}</td>`).join("")}</tr>`;

export function tiVdHtml(d: TiData): string {
  const rows = d.vd.map((r) => `<tr class="row"><td class="c">${r.n}</td><td class="l">${e(r.name)}</td><td class="c">${e(r.type)}</td><td class="c">${e(r.quantity)}</td><td class="c">${e(r.unit)}</td><td></td></tr>`).join("");
  return page(`ВД ${d.vdNumber}`, `${TI_STYLE}${tiHeaderHtml(d.header)}
    <div class="ti-title">ВЕДОМОСТЬ № ${e(d.vdNumber)}</div>
    <div class="ti-title" style="margin-top:0">СМОНТИРОВАННОГО ЭЛЕКТРООБОРУДОВАНИЯ И МАТЕРИАЛОВ</div>
    <table class="grid ti-t" style="margin-top:6pt">
      <colgroup><col style="width:6%"><col style="width:42%"><col style="width:20%"><col style="width:8%"><col style="width:8%"><col style="width:16%"></colgroup>
      <thead><tr><th>№ п/п</th><th>Наименование электрооборудования, комплекта</th><th>Тип, марка</th><th>Кол-во</th><th>Ед. изм.</th><th>Примечания</th></tr>${nums(6)}</thead>
      <tbody>${rows}</tbody>
    </table>${tiSignsHtml(d.signs)}`, "ti");
}

const appendixHead = (title: string, sub: string, number: string, d: TiData) =>
  `<div class="ti-title">${e(title)}</div><div class="ti-title" style="margin-top:0">${e(sub)}</div>
   <div class="ti-title" style="margin-top:0">№${e(number)}</div>
   <div class="ti-sub">к АОСР ${e(d.aosrNumber)} от ${e(d.actDate)}г.</div>`;

export function tiRmHtml(d: TiData): string {
  const rows = d.rm.map((g) =>
    g.docs.map((x) => `<tr class="ti-doc"><td></td><td class="l">${e(x.type)}</td><td class="c">${e(x.date)}</td><td class="c">${e(x.number)}</td></tr>`).join("") +
    g.items.map((i) => `<tr class="row"><td class="c">${i.n}.</td><td class="l" colspan="3">${e(i.name)}</td></tr>`).join("")).join("");
  return page(`РМ ${d.rmNumber}`, `${TI_STYLE}${appendixHead("РЕЕСТР", "применённых материалов", d.rmNumber, d)}
    <table class="grid ti-t">
      <colgroup><col style="width:6%"><col style="width:54%"><col style="width:14%"><col style="width:26%"></colgroup>
      <thead><tr><th>№</th><th>Наименование</th><th>Дата документа</th><th>Номер документа</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>${tiSignsHtml(d.signs)}`, "ti");
}

export function tiRpHtml(d: TiData): string {
  const rows = d.rp.map((r) => `<tr class="row"><td class="c">${r.n}</td><td class="l">${e(r.type)}</td><td class="c">${e(r.date)}</td><td class="c">${e(r.number)}</td><td class="c">${r.sheets || ""}</td></tr>`).join("");
  return page(`РП ${d.rpNumber}`, `${TI_STYLE}${appendixHead("РЕЕСТР", "документов, подтверждающих соответствие работ", d.rpNumber, d)}
    <table class="grid ti-t">
      <colgroup><col style="width:6%"><col style="width:40%"><col style="width:14%"><col style="width:32%"><col style="width:8%"></colgroup>
      <thead><tr><th>№</th><th>Наименование</th><th>Дата документа</th><th>Номер документа</th><th>Лист</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>${tiSignsHtml(d.signs)}`, "ti");
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

/** Кабельный журнал «ТИ»: шапка, таблица по образцу, итоги, запас, «Сдал/Принял». */
export function tiKjHtml(d: { header: TiHeader; number: string; journal: TiJournal }): string {
  const j = d.journal;
  const body = j.lines.map((l) => l.kind === "group"
    ? `<tr class="grp"><td colspan="9">${e(l.title)}</td></tr>`
    : `<tr class="row"><td>${e(l.designation)}</td><td>${e(l.from)}</td><td>${e(l.to)}</td><td>${e(l.mark)}</td><td>${e(l.project)}</td><td>${e(l.fact)}</td><td>${e(l.tray)}</td><td>${e(l.smooth)}</td><td>${e(l.corrugated)}</td></tr>`).join("");
  const totals = `<tr class="tot"><td colspan="3"></td><td>Итого всего</td><td></td><td></td><td>${e(j.total.tray)}</td><td>${e(j.total.smooth)}</td><td>${e(j.total.corrugated)}</td></tr>` +
    j.byMark.map((m) => `<tr class="tot"><td colspan="3"></td><td>в т.ч. ${e(m.mark)}</td><td>${e(m.project)}</td><td>${e(m.fact)}</td><td></td><td></td><td></td></tr>`).join("") +
    `<tr class="tot"><td colspan="3"></td><td>с учетом кф запаса ${e(j.reserve.pct)}%</td><td></td><td>${e(j.reserve.fact)}</td><td>${e(j.reserve.tray)}</td><td>${e(j.reserve.smooth)}</td><td>${e(j.reserve.corrugated)}</td></tr>`;
  const sign = (label: string) => `<div class="kj-sign"><div>${label}</div><div class="line"></div><div></div><div class="line"></div><div></div><div class="line"></div>
    <div></div><div></div><div></div><div class="cap">Подпись</div><div></div><div class="cap">Дата</div></div>`;
  return page(`КЖ ${d.number}`, `${TI_STYLE}${KJ_STYLE}${tiHeaderHtml(d.header)}
    <div class="ti-title" style="font-size:12pt">Кабельный журнал №${e(d.number)}</div>
    <table class="grid ti-kj" style="margin-top:6pt">
      <colgroup><col style="width:12%"><col style="width:10%"><col style="width:10%"><col style="width:22%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:10%"></colgroup>
      <thead><tr><th rowspan="2">Обозначение кабеля, провода</th><th colspan="2">Трасса</th><th colspan="3">Кабель</th><th colspan="3">Способ прокладки</th></tr>
        <tr><th>Начало</th><th>Конец</th><th>Марка</th><th>Длина по проекту, м</th><th>Длина фактическая, м</th><th>Лоток</th><th>Труба гладкая</th><th>Труба гофрированная</th></tr></thead>
      <tbody>${body}${totals}</tbody>
    </table><div class="kj-signs">${sign("Сдал:")}${sign("Принял:")}</div>`, "ti");
}
