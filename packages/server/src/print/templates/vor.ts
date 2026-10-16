import type { VorData } from "../data.ts";
import { e, page } from "./common.ts";

export function vorHtml(d: VorData): string {
  let n = 0;
  const rows = d.rows.map((r) => {
    n++;
    return r.kind === "group"
      ? `<tr class="group"><td class="c">${n}</td><td>${e(r.title)}</td><td></td><td></td><td></td></tr>`
      : `<tr class="row"><td class="c">${n}</td><td>${e(r.name)}</td><td class="c">${e(r.unit)}</td><td class="c">${e(r.quantity)}</td><td></td></tr>`;
  }).join("");
  const sign = (label: string, who: string) =>
    `<div class="vor-sign"><div>${e(label)}: ${e(who)}</div><div class="line">&nbsp;</div></div><div class="vor-sign"><div></div><div class="cap">(подпись)</div></div>`;
  return page("Ведомость объёмов выполненных работ", `
    <p><b>Объект:</b></p>
    <p class="obj">${e(d.objectName)}</p>
    <h1>Ведомость объёмов выполненных работ</h1>
    <p class="obj">${e(d.title)}</p>
    <p>Объём работ составлен согласно комплектам исполнительной документации:</p>
    <p class="obj">№ ${e(d.sectionCode)}</p>
    <table class="grid">
      <colgroup><col style="width:5%"><col style="width:55%"><col style="width:8%"><col style="width:8%"><col style="width:24%"></colgroup>
      <thead><tr><th>№</th><th>Наименование работ</th><th>Ед. изм.</th><th>Объем</th><th>Примечания</th></tr>
      <tr class="nums"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="vor-signs">${sign("Представитель заказчика", d.customer)}${sign("Представитель монтажной организации", d.contractor)}</div>`, "vor");
}
