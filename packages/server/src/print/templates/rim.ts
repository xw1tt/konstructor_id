import type { RimData } from "../data.ts";
import { e, page, signBlocks } from "./common.ts";

export function rimHtml(d: RimData): string {
  const rows = d.rows.map((r, i) =>
    `<tr class="row"><td class="c">${i + 1}</td><td>${e(r.name)}</td><td class="c">${e(r.type)}</td><td class="c">${e(r.number)}</td><td class="c">${e(r.date)}</td><td class="c">${e(r.sheets)}</td></tr>`).join("");
  return page(d.number, `
    <div class="appx-head">Приложение №2<br>Приложение к акту освидетельствования скрытых работ №${e(d.aosrNumber)}</div>
    <div class="doc-head">Реестр использованных материалов<br>№${e(d.number)}<br>Сопроводительные документы качества (паспорта, сертификаты, заключения и т.д.)</div>
    <table class="grid">
      <colgroup><col style="width:5%"><col style="width:32%"><col style="width:22%"><col style="width:19%"><col style="width:14%"><col style="width:8%"></colgroup>
      <thead><tr><th>№ п/п</th><th>Наименование материалов</th><th>Тип документа</th><th>Номер документа</th><th>Дата документа</th><th>Кол-во листов</th></tr>
      <tr class="nums"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${signBlocks(d.signs)}`, "rim");
}
