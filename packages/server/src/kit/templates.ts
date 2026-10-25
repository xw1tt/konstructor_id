// Реестр передачи ИД, титульный лист и наклейки на корешок — как стр. 1–4 образца «Монтаж кабеля».
import { e, page } from "../print/templates/common.ts";

export interface RegistryLine {
  n: number; number: string; name: string; date: string; sheets: number; copies: number; code: string; pages: string;
}
export interface RegistryData {
  title: string; objectLine: string;
  parties: { label: string; value: string }[];
  rows: RegistryLine[];
}
export interface CoverData {
  logos: string[]; objectName: string; developer: string; builder: string; contract: string;
  code: string; sectionLine: string; works: string; volume: string; part: string; city: string; year: string;
}
export interface SpineData {
  logos: string[]; objectName: string; building: string; builder: string; registry: string; sectionName: string;
  code: string; contract: string; volume: string; parts: string[]; year: string;
}

const REGISTRY_STYLE = `<style>
@page { size: A4 landscape; margin: 8mm 8mm 12mm 12mm; }
body.reg { font-size: 8pt; }
.reg-title { text-align: center; font-weight: bold; font-size: 10pt; }
.reg-object { text-align: center; font-weight: bold; font-size: 9pt; margin: 0 25mm 6pt; }
.reg-parties { display: grid; grid-template-columns: 52mm 1fr; border-top: 0.6pt solid #000; margin-bottom: 4pt; }
.reg-parties > div { border-bottom: 0.6pt solid #000; padding: 1pt 2pt; }
table.grid.reg-t th { font-weight: normal; font-size: 7.5pt; }
table.grid.reg-t td { font-size: 7.5pt; }
table.grid.reg-t td.l { text-align: left; }
.reg-sign { display: grid; grid-template-columns: 18mm 1fr 40mm 10mm 40mm; align-items: end; margin-top: 10pt; break-inside: avoid; }
.reg-sign .line { border-bottom: 0.6pt solid #000; height: 10pt; }
.reg-sign .cap { grid-column: 3; }
.reg-sign .cap2 { grid-column: 5; font-size: 5pt; text-align: center; }
</style>`;

export function registryHtml(d: RegistryData): string {
  const head = ["№ п/п", "Номер документа",
    "Тип документа (акт, лабораторное заключение, исполнительная схема, сертификат) с указанием наименования работ, осей, отметок и т.д.",
    "Дата составления документа или период", "Количество листов (включая приложения), шт.", "Количество экземпляров, шт.",
    "Шифр чертежа с указанием листов", "Примечание (страницы)"];
  const rows = d.rows.map((r) =>
    `<tr class="row"><td class="c">${r.n}</td><td class="c">${e(r.number)}</td><td class="l">${e(r.name)}</td><td class="c">${e(r.date)}</td>` +
    `<td class="c">${r.sheets}</td><td class="c">${r.copies}</td><td class="c">${e(r.code)}</td><td class="c">${e(r.pages)}</td></tr>`).join("");
  const sign = (label: string) =>
    `<div class="reg-sign"><div>${label}</div><div></div><div class="line"></div><div></div><div class="line"></div>` +
    `<div class="cap">(подпись)</div><div class="cap2">(дата)</div></div>`;
  return page(d.title, `${REGISTRY_STYLE}
    <div class="reg-title">${e(d.title)}</div>
    <div class="reg-object">Объект: ${e(d.objectLine)}</div>
    <div class="reg-parties">${d.parties.map((p) => `<div>${e(p.label)}</div><div>${e(p.value)}</div>`).join("")}</div>
    <table class="grid reg-t">
      <colgroup><col style="width:4%"><col style="width:15%"><col style="width:37%"><col style="width:10%"><col style="width:8%"><col style="width:7%"><col style="width:12%"><col style="width:7%"></colgroup>
      <thead><tr>${head.map((h) => `<th>${e(h)}</th>`).join("")}</tr>
      <tr class="nums">${head.map((_, i) => `<td>${i + 1}</td>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${sign("Сдал:")}${sign("Принял:")}`, "reg");
}

// План 14: реестр ИД в вёрстке набора «ТИ» (образец «Реестр №4/…Р»).
export interface TiRegistryData {
  customer: string; contractor: string; object: string; code: string; sectionName: string; number: string; rows: RegistryLine[];
}

const TI_REG_STYLE = `<style>
@page { size: A4 portrait; margin: 10mm 10mm 10mm 15mm; }
body.tireg { font-size: 9pt; }
.tr-head { display: grid; grid-template-columns: 1fr 1fr; column-gap: 10mm; margin-bottom: 8pt; }
.tr-val { border-bottom: 0.6pt solid #000; text-align: center; min-height: 11pt; }
.tr-cap { font-size: 6pt; text-align: center; margin-bottom: 4pt; }
.tr-head > div:nth-child(n+3) { margin-top: 10pt; }
.tr-title { text-align: center; font-weight: bold; font-size: 11pt; margin-top: 8pt; }
table.grid.tr-t th, table.grid.tr-t td { font-size: 8.5pt; }
table.grid.tr-t td.l { text-align: left; }
.tr-sign { display: grid; grid-template-columns: 18mm 70mm 8mm 35mm 8mm 30mm; align-items: end; margin-top: 12pt; break-inside: avoid; }
.tr-sign .line { border-bottom: 0.6pt solid #000; height: 11pt; }
.tr-sign .cap { font-size: 6pt; text-align: center; }
</style>`;

export function tiRegistryHtml(d: TiRegistryData): string {
  const title = `Реестр №${d.number}/${d.code}.Р`;
  const rows = d.rows.map((r) =>
    `<tr class="row"><td class="c">${r.n}</td><td class="l">${e(r.name)}</td><td class="c">${e(r.number)}</td><td class="c">${e(r.date)}</td>` +
    `<td class="c">${r.sheets}</td><td class="c">${e(r.pages.replace(/^л\.\s*/, ""))}</td></tr>`).join("");
  const sign = (label: string) => `<div class="tr-sign"><div>${label}</div><div class="line"></div><div></div><div class="line"></div><div></div><div class="line"></div>
    <div></div><div class="cap">(Ф.И.О.)</div><div></div><div class="cap">(подпись)</div><div></div><div class="cap">(дата)</div></div>`;
  return page(title, `${TI_REG_STYLE}
    <div class="tr-head">
      <div><div>Заказчик: ${e(d.customer)}</div><div style="margin-top:6pt">Подрядчик: ${e(d.contractor)}</div></div>
      <div><div class="tr-val">${e(d.object)}</div><div class="tr-cap">(объект)</div></div>
      <div><div class="tr-val">${e(d.code)}</div><div class="tr-cap">(шифр проекта)</div></div>
      <div><div class="tr-val">${e(d.sectionName)}</div><div class="tr-cap">(участок)</div></div>
    </div>
    <div class="tr-title">${e(title)}</div>
    <div class="tr-title" style="margin-top:0;font-weight:normal">Исполнительной документации</div>
    <table class="grid tr-t" style="margin-top:6pt">
      <colgroup><col style="width:6%"><col style="width:40%"><col style="width:20%"><col style="width:12%"><col style="width:9%"><col style="width:13%"></colgroup>
      <thead><tr><th>№п/п</th><th>Наименование документа</th><th>№ документа</th><th>Дата документа</th><th>Кол-во листов</th><th>Страницы по списку</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${sign("Сдал:")}${sign("Принял:")}`, "tireg");
}

const FRAME = "#2f5597";
const logos = (list: string[], cls: string) =>
  list.length ? `<div class="${cls}">${list.map((src) => `<img src="${e(src)}" alt="">`).join("")}</div>` : "";

const COVER_STYLE = `<style>
@page { size: A4 portrait; margin: 8mm; }
body.cover { font-size: 12pt; }
.cv { border: 5pt solid ${FRAME}; height: 279mm; padding: 12mm 14mm; display: flex; flex-direction: column; }
.cv-logos { display: flex; justify-content: space-between; align-items: center; gap: 10mm; height: 32mm; margin-bottom: 8mm; }
.cv-logos img { height: 30mm; width: auto; max-width: 80mm; object-fit: contain; }
.cv-obj { font-weight: bold; font-size: 10.5pt; }
.cv-obj b { font-size: 12pt; }
.cv-party { font-weight: bold; font-size: 16pt; margin-top: 8pt; }
.cv-contract { font-weight: bold; font-size: 10.5pt; margin-top: 8pt; }
.cv-mid { text-align: center; margin-top: 18mm; }
.cv-big { font-weight: bold; font-size: 17pt; margin-bottom: 6pt; }
.cv-sec { font-size: 12pt; margin-bottom: 4pt; }
.cv-vol { text-align: center; font-weight: bold; font-style: italic; font-size: 17pt; margin-top: 18mm; line-height: 1.6; }
.cv-foot { text-align: center; margin-top: auto; line-height: 1.8; }
</style>`;

export function coverHtml(d: CoverData): string {
  return page("Титульный лист", `${COVER_STYLE}<div class="cv">
    ${logos(d.logos, "cv-logos")}
    <div class="cv-obj"><b>Объект:</b> ${e(d.objectName)}</div>
    ${d.developer ? `<div class="cv-party">Заказчик: ${e(d.developer)}</div>` : ""}
    ${d.builder ? `<div class="cv-party">Подрядчик: ${e(d.builder)}</div>` : ""}
    ${d.contract ? `<div class="cv-contract">Договор строительного подряда № ${e(d.contract)}</div>` : ""}
    <div class="cv-mid">
      <div class="cv-big">Исполнительная документация</div>
      <div class="cv-big">Шифр РД:</div>
      <div class="cv-big">${e(d.code)}</div>
      ${d.sectionLine ? `<div class="cv-sec">${e(d.sectionLine)}</div>` : ""}
      ${d.works ? `<div class="cv-sec">${e(d.works)}</div>` : ""}
    </div>
    <div class="cv-vol">${d.volume ? `<div>Том № ${e(d.volume)}</div>` : ""}${d.part ? `<div>Часть №${e(d.part)}</div>` : ""}</div>
    <div class="cv-foot">${d.city ? `<div>г. ${e(d.city)}</div>` : ""}<div>${e(d.year)}</div></div>
  </div>`, "cover");
}

const SPINE_STYLE = `<style>
@page { size: A4 portrait; margin: 8mm; }
body.spine { font-size: 8pt; }
.sp-page { display: flex; gap: 6mm; align-items: flex-start; break-after: page; }
.sp-page:last-child { break-after: auto; }
.sp { width: 56mm; height: 205mm; border: 2pt solid ${FRAME}; display: flex; flex-direction: column; text-align: center; }
.sp > div { padding: 2mm; }
.sp > div + div { border-top: 0.8pt solid #000; }
.sp-logos { display: flex; justify-content: center; align-items: center; gap: 3mm; height: 10mm; margin-bottom: 2mm; }
.sp-logos img { height: 9mm; width: auto; max-width: 24mm; object-fit: contain; }
.sp-obj { font-weight: bold; font-size: 7pt; }
.sp-bld { font-weight: bold; font-style: italic; margin-top: 3mm; }
.sp-id { font-weight: bold; font-style: italic; font-size: 12pt; }
.sp-it { font-style: italic; }
.sp-code { font-weight: bold; font-size: 9pt; }
.sp-vol { margin-top: auto; font-weight: bold; font-size: 11pt; }
.sp-year { font-size: 10pt; margin-top: 3mm; }
</style>`;

export function spineHtml(d: SpineData): string {
  const strip = (part: string) => `<div class="sp">
    <div>${logos(d.logos, "sp-logos")}<div class="sp-obj">${e(d.objectName)}</div>${d.building ? `<div class="sp-bld">${e(d.building)}</div>` : ""}</div>
    <div><div class="sp-id">Исполнительная документация</div>${d.builder ? `<div class="sp-it">${e(d.builder)}</div>` : ""}
      <div class="sp-it">${e(d.registry)}${d.sectionName ? ` «${e(d.sectionName)}»` : ""}</div></div>
    <div class="sp-code">«${e(d.code)}»</div>
    ${d.contract ? `<div class="sp-it">Договор строительного подряда № ${e(d.contract)}</div>` : ""}
    <div class="sp-vol">${d.volume ? `Том № ${e(d.volume)}<br>` : ""}Часть № ${e(part)}<div class="sp-year">${e(d.year)} год</div></div>
  </div>`;
  const pages: string[] = [];
  for (let i = 0; i < d.parts.length; i += 3) pages.push(`<div class="sp-page">${d.parts.slice(i, i + 3).map(strip).join("")}</div>`);
  return page("Корешки", `${SPINE_STYLE}${pages.join("")}`, "spine");
}
