import type { VdData } from "../data.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { e, page, signBlocks } from "./common.ts";
import { htmlBlankTable, type BodyRow } from "../blankTable.ts";
import { withNo } from "@idk/shared/acts/format";

export const vdRowsOf = (d: VdData): BodyRow[] => d.rows.map((r, i) => ({
  cls: "row", cells: { n: i + 1, position: r.position, name: r.name, article: r.article, manufacturer: r.manufacturer, unit: r.unit, quantity: r.quantity },
}));

export function vdHtml(d: VdData, view: BlankView = blankView("vd:sbd")): string {
  return page(d.number, `
    <div class="appx-head">Приложение №1<br>Приложение к акту освидетельствования скрытых работ ${e(withNo(String(d.aosrNumber ?? "")))}</div>
    <div class="doc-head">Ведомость смонтированного оборудования, технических средств и материалов<br>${e(withNo(String(d.number ?? "")))}</div>
    ${htmlBlankTable(view, vdRowsOf(d), { nums: true })}
    ${signBlocks(d.signs)}`, "vd");
}
