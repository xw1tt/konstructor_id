// План 13: печать протоколов лаборатории (альбомный лист, как протокол изоляции) и актов комиссии (книжный, или
// альбомный при широкой таблице) по описанию документа (protocols/defs.ts). Шапка таблицы повторяется на страницах.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import { PROTO_DEFS } from "@idk/shared/protocols/defs";
import type { ProtoData } from "@idk/shared/protocols/types";
import { formatDateShort } from "@idk/shared/acts/format";
import { e, page } from "./common.ts";

const STYLE = (landscape: boolean) => `<style>
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm 10mm 10mm ${landscape ? "10mm" : "20mm"}; }
body.proto { font-size: 9.5pt; }
.p-head { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 8pt; }
.p-head > div { border: 0.6pt solid #000; padding: 3pt 5pt; }
.p-c { text-align: center; }
.p-b { font-weight: bold; }
.p-title { text-align: center; font-weight: bold; font-size: 12pt; margin-top: 6pt; }
.p-sub { text-align: center; font-weight: bold; margin-bottom: 6pt; }
.p-line { display: flex; justify-content: space-between; margin: 6pt 0; }
.p-p { margin: 3pt 0; }
table.grid.p-t th, table.grid.p-t td { font-size: 8.5pt; text-align: center; }
table.grid.p-t td.l { text-align: left; }
table.grid.p-si th, table.grid.p-si td { font-size: 7.5pt; text-align: center; }
.p-tail { break-inside: avoid; }
.p-signs { margin-top: 12pt; break-inside: avoid; }
.sign-row { display: grid; grid-template-columns: 1fr 35mm 45mm; column-gap: 6pt; margin-top: 10pt; align-items: end; }
.sign-row .line { border-bottom: 0.6pt solid #000; height: 10pt; }
</style>`;

const dates = (p: ProtoData) => [formatDateShort(p.dateFrom), formatDateShort(p.dateTo)].filter(Boolean).join(" - ");
/** «Протокол проверки …» → «проверки …»; «Акт о приемке …» → «о приемке …». */
const subtitle = (name: string) => name.replace(/^(Протокол|Акт)\s+/, "");
const plainDate = (iso: string | null) => formatDateShort(iso).replace(/ г\.$/, "");

function table(p: ProtoData): string {
  const cols = PROTO_DEFS[p.kind].columns;
  const total = cols.reduce((s, c) => s + (c.width ?? 8), 4);
  const colgroup = `<col style="width:${(400 / total).toFixed(2)}%">` + cols.map((c) => `<col style="width:${(((c.width ?? 8) * 100) / total).toFixed(2)}%">`).join("");
  const head = `<tr><th>№ п/п</th>${cols.map((c) => `<th>${e(c.header)}</th>`).join("")}</tr>` +
    `<tr class="nums">${Array.from({ length: cols.length + 1 }, (_, i) => `<td>${i + 1}</td>`).join("")}</tr>`;
  const body = p.rows.map((r, i) =>
    `<tr class="r"><td>${i + 1}</td>${cols.map((c, j) => `<td${j === 0 ? ' class="l"' : ""}>${e(r[c.key] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<table class="grid p-t"><colgroup>${colgroup}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function labHtml(b: ActBundle, p: ProtoData): string {
  const def = PROTO_DEFS[p.kind];
  const org = (id: number | null | undefined) => b.organizations.find((o) => o.id === id)?.shortName ?? "";
  const section = b.sections.find((s) => s.id === b.act.sectionId);
  const lab = p.lab ?? { nameAddress: "", certificate: "", head: "", tester: "" };
  const climate = def.climate === "temp"
    ? `Температура воздуха ${e(p.temperature)} °C.`
    : `Температура воздуха ${e(p.temperature)} °C, влажность воздуха ${e(p.humidity)} %, атмосферное давление ${e(p.pressure)} мм рт. ст.`;
  const si = p.instruments.map((i) => `<tr><td>${e(i.name)}</td><td>${e(i.type)}</td><td>${e(i.range)}</td><td>${e(i.accuracy)}</td><td>${e(i.serial)}</td><td>${e(i.certificate)}</td><td>${e(plainDate(i.checkedOn))}</td><td>${e(plainDate(i.nextCheck))}</td><td>${e(i.authority)}</td></tr>`).join("");
  return `
  <div class="p-head">
    <div class="p-c"><div class="p-b">${e(lab.nameAddress)}</div><div class="cap">(наименование организации, предприятия)</div><div>${e(lab.certificate)}</div></div>
    <div>Заказчик: ${e(org(b.object.roles.developer))}. Объект: ${e(b.object.name)}. Проектная документация: ${e(section?.code ?? "")}. Дата проведения измерений: ${e(dates(p))}</div>
  </div>
  <div class="p-title">Протокол №${e(p.number)}</div>
  <div class="p-sub">${e(subtitle(p.name))}</div>
  <p class="p-p">Климатические условия при проведении измерений: ${climate}</p>
  <p class="p-p">Цель измерений (испытаний): ${e(p.purpose)}</p>
  <p class="p-p">Нормативные и технические документы, на соответствие требованиям которых проведены измерения (испытания): ${e(p.normative)}</p>
  ${p.subject ? `<p class="p-p">Предмет: ${e(p.subject)}</p>` : ""}
  <p class="p-b" style="margin:4pt 0">Результаты измерений:</p>
  ${table(p)}
  <div class="p-tail"><p class="p-p"><b>Заключение:</b> ${e(p.conclusion)}</p><p style="margin-top:6pt">Перечень используемых средств измерений.</p></div>
  <table class="grid p-si">
    <thead><tr><th rowspan="2">Наименование СИ</th><th rowspan="2">Тип применяемого СИ</th><th rowspan="2">Диапазон измерений</th><th rowspan="2">Точность измерений</th>
      <th rowspan="2">Заводской номер</th><th rowspan="2">№ свидетельства о поверке</th><th colspan="2">Дата поверки</th><th rowspan="2">Орган государственной метрологической службы, проводивший поверку</th></tr>
      <tr><th>последней</th><th>очередной</th></tr></thead>
    <tbody>${si}</tbody>
  </table>
  <div class="p-signs">
    <div class="sign-row"><div>Руководитель электролаборатории:</div><div class="line"></div><div>${e(lab.head)}</div></div>
    <div class="sign-row"><div>Испытания провел:</div><div class="line"></div><div>${e(lab.tester)}</div></div>
  </div>`;
}

function commissionHtml(b: ActBundle, p: ProtoData): string {
  const def = PROTO_DEFS[p.kind];
  const members = p.commission.map((m) => `<li>${e(m.role)}: ${e([m.position, m.org, m.name].filter(Boolean).join(" "))}</li>`).join("");
  const signs = p.commission.map((m) =>
    `<div class="sign-row"><div>${e([m.position, m.org].filter(Boolean).join(" "))}</div><div class="line"></div><div>${e(m.name)}</div></div>`).join("");
  return `
  <div class="p-title">АКТ №${e(p.number)}</div>
  <div class="p-sub">${e(subtitle(p.name))}</div>
  <div class="p-line"><span>${p.city ? `г. ${e(p.city)}` : ""}</span><span>${e(dates(p))}</span></div>
  <p class="p-p"><b>Объект:</b> ${e(b.object.name)}</p>
  ${p.subject ? `<p class="p-p"><b>Предмет:</b> ${e(p.subject)}</p>` : ""}
  <p class="p-p"><b>Комиссия в составе:</b></p>
  <ul class="p-p">${members}</ul>
  <p class="p-p">${e(def.intro ?? "")}</p>
  ${table(p)}
  <div class="p-tail">
    <p class="p-p"><b>Заключение:</b> ${e(p.conclusion)}</p>
    <p class="p-p"><b>Нормативы:</b> ${e(p.normative)}</p>
  </div>
  <div class="p-signs"><p class="p-b">Подписи членов комиссии:</p>${signs}</div>`;
}

/** Альбомный лист: протоколы лаборатории и акты с таблицей шире шести столбцов. */
export const protoLandscape = (p: ProtoData) => p.signer === "lab" || PROTO_DEFS[p.kind].columns.length > 6;

export function protoHtml(b: ActBundle): string {
  const p = b.proto;
  if (!p) throw new Error("В пакете нет данных протокола или акта");
  const body = p.signer === "lab" ? labHtml(b, p) : commissionHtml(b, p);
  return page(`${p.code} №${p.number}`, STYLE(protoLandscape(p)) + body, "proto");
}
