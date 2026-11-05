import type { RimData } from "../data.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { e, page, signBlocks } from "./common.ts";
import { htmlBlankTable, type BodyRow } from "../blankTable.ts";
import { withNo } from "@idk/shared/acts/format";

/** Строки РИМ: наименование группы документов одного материала — одна ячейка на все её строки. */
export function rimRowsOf(d: RimData): BodyRow[] {
  return d.rows.map((r, i) => {
    const size = d.rows.slice(i + 1).findIndex((x) => !x.cont);
    const rowspan = size === -1 ? d.rows.length - i : size + 1;
    return {
      group: r.group, cls: "row",
      cells: { n: i + 1, ...(r.cont ? {} : { name: { text: r.name, rowspan } }), type: r.type, number: r.number, date: r.date, sheets: r.sheets },
    };
  });
}

export function rimHtml(d: RimData, view: BlankView = blankView("rim:sbd")): string {
  return page(d.number, `
    <div class="appx-head">Приложение №2<br>Приложение к акту освидетельствования скрытых работ ${e(withNo(String(d.aosrNumber ?? "")))}</div>
    <div class="doc-head">Реестр использованных материалов<br>${e(withNo(String(d.number ?? "")))}<br>Сопроводительные документы качества (паспорта, сертификаты, заключения и т.д.)</div>
    ${htmlBlankTable(view, rimRowsOf(d), { nums: true })}
    ${signBlocks(d.signs)}`, "rim");
}
