// План 28: протоколы лаборатории и акты комиссии в Excel — по описанию документа (PROTO_DEFS), как PDF.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import { PROTO_DEFS } from "@idk/shared/protocols/defs";
import type { ProtoData } from "@idk/shared/protocols/types";
import { formatDateShort } from "@idk/shared/acts/format";
import { HttpError } from "../../http/router.ts";
import { writeBook, type CellStyle } from "../../xlsx/book.ts";
import { Layout } from "../../xlsx/layout.ts";
import { blankView, type BlankView } from "@idk/shared/blanks";
import { xlsxBlankTable } from "../blankTable.ts";
import { protoRowsOf } from "../templates/proto.ts";
import { protoLandscape } from "../templates/proto.ts";
import { ipHead, instruments } from "./sbd.ts";
import { withNo } from "@idk/shared/acts/format";

const S = 9.5;
const C: CellStyle = { h: "center" };
const dates = (p: ProtoData) => [formatDateShort(p.dateFrom), formatDateShort(p.dateTo)].filter(Boolean).join(" - ");
const subtitle = (name: string) => name.replace(/^(Протокол|Акт)\s+/, "");
const plainDate = (iso: string | null) => formatDateShort(iso).replace(/ г\.$/, "");

/** Таблица результатов по описанию и настройке бланка. */
const resultTable = (L: Layout, p: ProtoData, view: BlankView) => xlsxBlankTable(L, view, protoRowsOf(p), { nums: true, size: 8.5 });

/** Строка подписи: должность (надпись), линия 35 мм, ФИО 45 мм — у правого края. */
function signRow(L: Layout, label: string, name: string) {
  const col = L.sheet.colsMm[0];
  const line = Math.round(35 / col), who = Math.round(45 / col);
  L.gap(8);
  L.line([
    { c1: 1, c2: L.cols - line - who - 1, text: label },
    { c1: L.cols - line - who, c2: L.cols - who - 1, text: "", under: true },
    { c1: L.cols - who + 1, c2: L.cols, text: name, style: { h: "left" } },
  ], S);
}

export function protoSheet(b: ActBundle, view?: BlankView): Layout {
  const p = b.proto;
  if (!p) throw new HttpError(400, "В пакете нет данных протокола или акта");
  const landscape = protoLandscape(p);
  const width = landscape ? 277 : 180;
  const n = landscape ? 55 : 36;
  const L = new Layout(`${p.code} ${withNo(String(p.number ?? ""))}`, Array(n).fill(width / n), { landscape, margins: landscape ? [10, 10, 10, 10] : [10, 10, 10, 20] });
  const def = PROTO_DEFS[p.kind];
  view ??= blankView(p.kind);
  const sub = () => L.para(subtitle(p.name), { b: true, h: "center", size: S });
  if (p.signer === "lab") {
    const lab = p.lab ?? { nameAddress: "", certificate: "", head: "", tester: "" };
    const org = (id: number | null | undefined) => b.organizations.find((o) => o.id === id)?.shortName ?? "";
    const section = b.sections.find((s) => s.id === b.act.sectionId);
    ipHead(L, lab.nameAddress, lab.certificate,
      `Заказчик: ${org(b.object.roles.developer)}. Объект: ${b.object.name}. Проектная документация: ${section?.code ?? ""}. Дата проведения измерений: ${dates(p)}`);
    L.para(`Протокол ${withNo(String(p.number ?? ""))}`, { b: true, h: "center", size: 12 });
    sub();
    L.gap(4);
    const climate = def.climate === "temp"
      ? `Температура воздуха ${p.temperature} °C.`
      : `Температура воздуха ${p.temperature} °C, влажность воздуха ${p.humidity} %, атмосферное давление ${p.pressure} мм рт. ст.`;
    L.para(`Климатические условия при проведении измерений: ${climate}`, { size: S });
    L.para(`Цель измерений (испытаний): ${p.purpose}`, { size: S });
    L.para(`Нормативные и технические документы, на соответствие требованиям которых проведены измерения (испытания): ${p.normative}`, { size: S });
    if (p.subject) L.para(`Предмет: ${p.subject}`, { size: S });
    L.gap(3);
    L.para("Результаты измерений:", { b: true, size: S });
    resultTable(L, p, view);
    L.para(`Заключение: ${p.conclusion}`, { size: S });
    L.gap(4);
    if (view.shown("instruments")) {
      L.para("Перечень используемых средств измерений.", { size: S });
      instruments(L, p.instruments.map((i) => ({ ...i, checkedOn: plainDate(i.checkedOn), nextCheck: plainDate(i.nextCheck) })));
    }
    L.gap(6);
    signRow(L, "Руководитель электролаборатории:", lab.head);
    signRow(L, "Испытания провел:", lab.tester);
    return L;
  }
  L.para(`АКТ ${withNo(String(p.number ?? ""))}`, { b: true, h: "center", size: 12 });
  sub();
  L.gap(4);
  const half = Math.floor(L.cols / 2);
  L.line([{ c1: 1, c2: half, text: p.city ? `г. ${p.city}` : "" }, { c1: half + 1, c2: L.cols, text: dates(p), style: { h: "right" } }], S);
  L.gap(4);
  L.para(`Объект: ${b.object.name}`, { size: S });
  if (p.subject) L.para(`Предмет: ${p.subject}`, { size: S });
  L.para("Комиссия в составе:", { b: true, size: S });
  for (const m of p.commission) L.para(`•  ${m.role}: ${[m.position, m.org, m.name].filter(Boolean).join(" ")}`, { size: S }, 2);
  if (def.intro) L.para(def.intro, { size: S });
  L.gap(3);
  resultTable(L, p, view);
  L.para(`Заключение: ${p.conclusion}`, { size: S });
  L.para(`Нормативы: ${p.normative}`, { size: S });
  L.gap(8);
  L.para("Подписи членов комиссии:", { b: true, size: S });
  for (const m of p.commission) signRow(L, [m.position, m.org].filter(Boolean).join(" "), m.name);
  return L;
}

export function protoXlsx(b: ActBundle, view?: BlankView): { xlsx: Buffer; name: string } {
  const L = protoSheet(b, view);
  return { xlsx: writeBook([L.sheet]), name: `${b.proto!.code} ${withNo(String(b.proto!.number ?? ""))}.xlsx`.replace(/[\\/:*?"<>|]/g, "_") };
}
