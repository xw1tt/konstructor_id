// План 14: формы набора «ТИ» по образцам ООО «Техноинжиниринг» — ВД, реестр применённых материалов (РМ), реестр приложений (РП).
import type { TiData, TiHeader, TiSign } from "../tiData.ts";
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
.ti-sign .name { font-style: italic; border-bottom: 0.6pt solid #000; width: 75%; min-height: 11pt; margin-top: 3pt; }
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
    `<tr class="ti-doc"><td></td><td class="l">${e(g.type)}</td><td class="c">${e(g.date)}</td><td class="c">${e(g.number)}</td></tr>` +
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
