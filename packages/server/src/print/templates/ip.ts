// Протокол проверки сопротивления изоляции: альбомный лист, таблица без ограничения страниц, как стр. 20–23 образца.
import type { IpData } from "../cableData.ts";
import { e, page } from "./common.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { htmlBlankTable, type BodyRow } from "../blankTable.ts";

const STYLE = `<style>
@page { size: A4 landscape; margin: 10mm 10mm 10mm 10mm; }
body.ip { font-size: 9pt; }
.ip-head { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 8pt; }
.ip-head > div { border: 0.6pt solid #000; padding: 3pt 5pt; }
.ip-head > div:first-child b { font-size: 10pt; }
.ip-b { font-weight: bold; }
.ip-head .cap { font-size: 6pt; }
.ip-c { text-align: center; }
.ip-title { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 6pt; }
table.grid.ip-t th, table.grid.ip-t td { font-size: 8pt; text-align: center; }
table.grid.ip-t tbody td { height: 10mm; }
table.grid.ip-t td.l { text-align: left; }
table.grid.ip-si th, table.grid.ip-si td { font-size: 7.5pt; text-align: center; }
.ip-signs { margin-top: 12pt; display: grid; grid-template-columns: 60mm 60mm; row-gap: 10pt; break-inside: avoid; }
.ip-tail { break-inside: avoid; }
</style>`;

export const ipRowsOf = (d: IpData): BodyRow[] => d.rows.map((r) => ({
  cells: { n: r.n, line: r.line, mark: r.mark, voltage: r.voltage, allowed: r.allowed, ...Object.fromEntries(r.values.map((v, i) => [`p${i}`, v])) },
}));

export function ipHtml(d: IpData, view: BlankView = blankView("ip:sbd")): string {
  const si = d.instruments.map((i) => `<tr><td>${e(i.name)}</td><td>${e(i.type)}</td><td>${e(i.range)}</td><td>${e(i.accuracy)}</td><td>${e(i.serial)}</td><td>${e(i.certificate)}</td><td>${e(i.checkedOn)}</td><td>${e(i.nextCheck)}</td><td>${e(i.authority)}</td></tr>`).join("");
  const body = `
  <div class="ip-head">
    <div class="ip-c"><div><b>${e(d.lab.nameAddress)}</b></div><div class="cap">(наименование организации, предприятия)</div><div>${e(d.lab.certificate)}</div></div>
    <div>Заказчик: ${e(d.customer)} Объект: ${e(d.object)}. Проектная документация: ${e(d.project)} Дата проведения измерений: ${e(d.dates)}</div>
  </div>
  <div class="ip-title">Протокол №${e(d.number)}</div>
  <div class="ip-c ip-b">проверки сопротивления изоляции проводов, кабелей и обмоток электрических машин.</div>
  <div class="ip-c ip-b" style="margin-top:6pt">Климатические условия при проведении измерений</div>
  <div class="ip-c">Температура воздуха ${e(d.temperature)} °C Влажность воздуха ${e(d.humidity)} %</div>
  <div class="ip-c ip-b" style="margin-top:6pt">Цель измерений (испытаний)</div>
  <div class="ip-c ip-b"><u>${e(d.purpose)}</u></div>
  <div class="ip-c cap">(приемо-сдаточные, сличительные, контрольные испытания, эксплуатационные, для целей сертификации)</div>
  <p class="ip-b" style="margin-top:6pt">Нормативные и технические документы, на соответствие требованиям которых проведены измерения (испытания): ${e(d.normative)}</p>
  <p class="ip-b" style="margin:4pt 0">Результаты измерений:</p>
  ${htmlBlankTable(view, ipRowsOf(d), { cls: "ip-t", nums: true })}
  <div class="ip-tail">
    <p>${e(d.integrity)}</p>
    <p style="margin-top:4pt">Заключение на соответствие требованиям НТД: ${e(d.conclusion)}</p>
    ${view.shown("instruments") ? `<p style="margin-top:6pt">Перечень используемых средств измерений.</p>` : ""}
  </div>
  ${view.shown("instruments") ? `<table class="grid ip-si">
    <thead><tr><th rowspan="2">Наименование СИ</th><th rowspan="2">Тип применяемого СИ</th><th rowspan="2">Диапазон измерений</th><th rowspan="2">Точность измерений</th>
      <th rowspan="2">Заводской номер</th><th rowspan="2">№ свидетельства о поверке</th><th colspan="2">Дата поверки</th><th rowspan="2">Орган государственной метрологической службы, проводивший поверку</th></tr>
      <tr><th>последней</th><th>очередной</th></tr></thead>
    <tbody>${si}</tbody>
  </table>` : ""}
  <div class="ip-signs"><div>Руководитель электролаборатории:</div><div>${e(d.lab.head)}</div><div>Испытания провел:</div><div>${e(d.lab.tester)}</div></div>`;
  return page(`Протокол №${d.number}`, STYLE + body, "ip");
}
