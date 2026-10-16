import type { VdData } from "../data.ts";
import { e, page, signBlocks } from "./common.ts";

export function vdHtml(d: VdData): string {
  const rows = d.rows.map((r, i) =>
    `<tr class="row"><td class="c">${i + 1}</td><td class="c">${e(r.position)}</td><td>${e(r.name)}</td><td class="c">${e(r.article)}</td><td class="c">${e(r.manufacturer)}</td><td class="c">${e(r.unit)}</td><td class="c">${e(r.quantity)}</td></tr>`).join("");
  return page(d.number, `
    <div class="appx-head">Приложение №1<br>Приложение к акту освидетельствования скрытых работ №${e(d.aosrNumber)}</div>
    <div class="doc-head">Ведомость смонтированного оборудования, технических средств и материалов<br>№${e(d.number)}</div>
    <table class="grid">
      <colgroup><col style="width:6%"><col style="width:8%"><col style="width:41%"><col style="width:13%"><col style="width:13%"><col style="width:8%"><col style="width:11%"></colgroup>
      <thead><tr><th>№ п/п</th><th>№ поз по УСР</th><th>Наименование оборудования, комплекта</th><th>Артикул</th><th>Завод изготовитель</th><th>Ед. изм.</th><th>Кол-во</th></tr>
      <tr class="nums"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td><td>7</td></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${signBlocks(d.signs)}`, "vd");
}
