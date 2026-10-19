// Общий журнал работ (приказ Минстроя России от 02.12.2022 № 1026/пр): разделы 3 и 5 по форме — для вкладывания в журнал.
import type { OjrRequest } from "@idk/shared/ojrPrint";
import { e, page } from "./common.ts";

const STYLE = `<style>
@page { size: A4 portrait; margin: 12mm 10mm 14mm 20mm; }
body.ojr { font-size: 9pt; }
.ojr-title { text-align: center; font-weight: bold; font-size: 10.5pt; margin: 0 6mm 6pt; }
.ojr-obj { text-align: center; font-size: 8pt; margin-bottom: 6pt; }
table.grid.ojr-t th { font-weight: normal; font-size: 7.5pt; line-height: 1.15; }
table.grid.ojr-t td { font-size: 8.5pt; vertical-align: top; padding: 2pt 3pt; white-space: pre-line; }
table.grid.ojr-t td.c { text-align: center; }
</style>`;

const H3 = [
  "N п/п", "Дата выполнения работ", "Условия производства работ",
  "Наименование работ, выполняемых в процессе строительства, реконструкции, капитального ремонта объекта капитального строительства с указанием осей, рядов, отметок, пикетов, этажей, ярусов, секций, помещений, в которых выполнялись работы, сведения о методах выполнения работ, применяемых строительных материалах, изделиях и конструкциях, проведенных испытаниях конструкций, оборудования, систем, сетей и устройств (опробование вхолостую или под нагрузкой, подача электроэнергии, давления, испытания на прочность и герметичность)",
  "Должность (при наличии), фамилия, инициалы, подпись уполномоченного представителя лица, осуществляющего строительство, реконструкцию, капитальный ремонт",
];
const H5 = [
  "N п/п",
  "Наименование исполнительной документации (с указанием наименования и реквизитов документа, вида работ, места расположения конструкций, участков сетей инженерно-технического обеспечения)",
  "Дата подписания документа, должности (при наличии), фамилии, инициалы лиц, подписавших документы",
];

const head = (h: string[]) =>
  `<thead><tr>${h.map((x) => `<th>${e(x)}</th>`).join("")}</tr><tr class="nums">${h.map((_, i) => `<td>${i + 1}</td>`).join("")}</tr></thead>`;

export function ojrHtml(q: OjrRequest): string {
  const obj = q.objectName ? `<div class="ojr-obj">${e(q.objectName)}</div>` : "";
  if (q.section === 3) {
    const rows = q.rows.map((r, i) =>
      `<tr class="row"><td class="c">${i + 1}</td><td class="c">${e(r.date)}</td><td>${e(r.conditions)}</td><td>${e(r.works)}</td><td>${e(r.signer)}</td></tr>`).join("");
    return page("ОЖР Раздел 3", `${STYLE}
      <div class="ojr-title">Раздел 3. Сведения о выполнении работ в процессе строительства, реконструкции, капитального ремонта объекта капитального строительства</div>${obj}
      <table class="grid ojr-t"><colgroup><col style="width:6%"><col style="width:11%"><col style="width:16%"><col style="width:43%"><col style="width:24%"></colgroup>
      ${head(H3)}<tbody>${rows}</tbody></table>`, "ojr");
  }
  const rows = q.rows.map((r, i) =>
    `<tr class="row"><td class="c">${i + 1}</td><td>${e(r.name)}</td><td>${e(r.signed)}</td></tr>`).join("");
  return page("ОЖР Раздел 5", `${STYLE}
    <div class="ojr-title">Раздел 5. Перечень исполнительной документации при строительстве, реконструкции, капитальном ремонте объекта капитального строительства</div>${obj}
    <table class="grid ojr-t"><colgroup><col style="width:7%"><col style="width:58%"><col style="width:35%"></colgroup>
    ${head(H5)}<tbody>${rows}</tbody></table>`, "ojr");
}
