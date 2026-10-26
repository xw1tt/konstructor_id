import type { VorData } from "../data.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { e, page } from "./common.ts";
import { htmlBlankTable, type BodyRow } from "../blankTable.ts";

export const vorRowsOf = (d: VorData): BodyRow[] => d.rows.map((r, i): BodyRow => (r.kind === "group"
  ? { cls: "group", style: { b: true }, cells: { n: i + 1, name: r.title } }
  : { cls: "row", cells: { n: i + 1, name: r.name, unit: r.unit, quantity: r.quantity, note: "" } }));

export function vorHtml(d: VorData, view: BlankView = blankView("vor:sbd")): string {
  const sign = (label: string, who: string) =>
    `<div class="vor-sign"><div>${e(label)}: ${e(who)}</div><div><div class="line">&nbsp;</div><div class="cap">(подпись)</div></div></div>`;
  return page("Ведомость объёмов выполненных работ", `
    <p><b>Объект:</b></p>
    <p class="obj">${e(d.objectName)}</p>
    <h1>Ведомость объёмов выполненных работ</h1>
    <p class="obj">${e(d.title)}</p>
    <p>Объём работ составлен согласно комплектам исполнительной документации:</p>
    <p class="obj">№ ${e(d.sectionCode)}</p>
    ${htmlBlankTable(view, vorRowsOf(d), { nums: true })}
    ${view.shown("signs") ? `<div class="vor-signs">${sign("Представитель заказчика", d.customer)}${sign("Представитель монтажной организации", d.contractor)}</div>` : ""}`, "vor");
}
