// Акт входного контроля технических средств и материалов — альбомный лист, как стр. 27–28 образца «Монтаж кабеля».
import type { AvkData } from "../data.ts";
import { e, page } from "./common.ts";

const STYLE = `<style>
@page { size: A4 landscape; margin: 10mm 12mm 10mm 15mm; }
body.avk { font-size: 9.5pt; }
.avk-title { text-align: center; font-weight: bold; font-size: 13pt; margin: 4pt 0 8pt; }
.avk-row { display: flex; justify-content: space-between; margin: 0 12mm; }
.avk-right { text-align: right; margin: 0 12mm 10pt; }
.avk-obj { margin-bottom: 8pt; }
.avk-b { font-weight: bold; margin: 6pt 0 2pt; }
.avk-rep { font-weight: bold; border-bottom: 0.6pt solid #000; margin: 6pt 0 2pt; }
.avk-text { margin-bottom: 10pt; }
.avk-text u { text-decoration: underline; }
table.grid.avk-t th { font-size: 9pt; }
table.grid.avk-t td { font-size: 9pt; }
table.grid.avk-t td.l { text-align: left; }
.avk-sign { break-inside: avoid; margin-top: 12pt; }
.avk-sign .who { font-weight: bold; border-bottom: 0.6pt solid #000; }
.avk-sign .cap { font-size: 6.5pt; }
</style>`;

export function avkHtml(d: AvkData): string {
  const rows = d.rows.map((r, i) =>
    `<tr class="row"><td class="c">${i + 1}</td><td class="l">${e(r.name)}</td><td class="c">${e(r.manufacturer)}</td><td class="c">${e(r.quantity)}</td><td class="c">${e(r.docs)}</td></tr>`).join("");
  const sign = (label: string, who: string) =>
    `<div class="avk-sign"><div class="who">${e(label)}: ${e(who)}</div><div class="cap">Должность/ФИО/Подпись</div></div>`;
  return page(`АВК ${d.number}`, `${STYLE}
    <div class="avk-title">Акт входного контроля, технических средств и материалов № ${e(d.number)}</div>
    <div class="avk-row"><div>${d.city ? `Адрес : ${e(d.city)}` : ""}</div><div>Дата составления: ${e(d.date)}</div></div>
    <div class="avk-right">${d.customer ? `Заказчик: ${e(d.customer)}` : ""}</div>
    <div class="avk-obj">Наименование объекта: ${e(d.objectName)}</div>
    <div class="avk-b">Комиссия в составе</div>
    <div class="avk-rep">Представитель заказчика: ${e(d.customerRep)}</div>
    <div class="avk-rep">Представитель монтажной организации: ${e(d.contractorRep)}</div>
    <div class="avk-text">Составили настоящий акт о том, что поступившие на строительный объект следующие технические средства и материалы для зоны ${e(d.sectionName)}
      прошедшие входной контроль соответствуют технической документации. Спецификации РД, Техническим решениям авторского надзора : <u>${e(d.sectionCode)}</u></div>
    <table class="grid avk-t">
      <colgroup><col style="width:4%"><col style="width:30%"><col style="width:17%"><col style="width:9%"><col style="width:40%"></colgroup>
      <thead><tr><th>п/п</th><th>Наименование оборудования, материала</th><th>Производитель</th><th>Кол-во / Единица</th><th>Номера Сертификатов, отказных писем, паспортов</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${sign("Представитель заказчика", d.customerRep)}${sign("Представитель монтажной организации", d.contractorRep)}`, "avk");
}
