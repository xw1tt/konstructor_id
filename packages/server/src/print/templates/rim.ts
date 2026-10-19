import type { RimData } from "../data.ts";
import { e, page, signBlocks } from "./common.ts";

export function rimHtml(d: RimData): string {
  // Документы одного материала — в своём tbody (не разрывается между страницами); наименование — в первой строке.
  const row = (r: RimData["rows"][number], i: number) => {
    const open = d.rows[i + 1]?.cont ? " open" : "";
    const name = r.cont ? `<td class="nm cont${open}"></td>` : `<td class="nm${open}">${e(r.name)}</td>`;
    return `<tr class="row"><td class="c">${i + 1}</td>${name}<td class="c">${e(r.type)}</td><td class="c">${e(r.number)}</td><td class="c">${e(r.date)}</td><td class="c">${e(r.sheets)}</td></tr>`;
  };
  const groups: string[] = [];
  d.rows.forEach((r, i) => {
    if (!r.cont) groups.push("");
    groups[groups.length - 1] += row(r, i);
  });
  const rows = groups.map((g) => `<tbody class="grp">${g}</tbody>`).join("");
  return page(d.number, `
    <div class="appx-head">Приложение №2<br>Приложение к акту освидетельствования скрытых работ №${e(d.aosrNumber)}</div>
    <div class="doc-head">Реестр использованных материалов<br>№${e(d.number)}<br>Сопроводительные документы качества (паспорта, сертификаты, заключения и т.д.)</div>
    <table class="grid">
      <colgroup><col style="width:5%"><col style="width:32%"><col style="width:22%"><col style="width:19%"><col style="width:14%"><col style="width:8%"></colgroup>
      <thead><tr><th>№ п/п</th><th>Наименование материалов</th><th>Тип документа</th><th>Номер документа</th><th>Дата документа</th><th>Кол-во листов</th></tr>
      <tr class="nums"><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr></thead>
      ${rows}
    </table>
    ${signBlocks(d.signs)}`, "rim");
}
