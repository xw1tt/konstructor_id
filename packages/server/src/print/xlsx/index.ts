// План 26: документы акта в Excel — та же форма (по набору и шаблону) и те же данные, что у PDF.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { FormSet, PrintOptions } from "@idk/shared/templates";
import type { ActDocKind } from "@idk/shared/docs/defs";
import { HttpError } from "../../http/router.ts";
import { writeBook } from "../../xlsx/book.ts";
import type { Sheet } from "../../xlsx/book.ts";
import { actDocFileName, actDocFormFor, view } from "../docs.ts";
import { buildDocDataFromBundle } from "../fromBundle.ts";
import { aosrSheet } from "./aosr.ts";
import { rimSheet, vdSheet, vorSheet, avkSheet, ipSheet, kjSheet } from "./sbd.ts";
import { buildAvkData } from "../fromBundle.ts";
import { cableDocData } from "../cableData.ts";
import { tiVdSheet, tiRmSheet, tiRpSheet, tiKjSheet } from "./ti.ts";
import { tiDocData, tiHeader } from "../tiData.ts";
import { docNumberFor } from "@idk/shared/acts/format";
import { tiJournal } from "@idk/shared/acts/cableDocs";

const cables = (b: ActBundle) => {
  if (!b.cables) throw new HttpError(400, "В пакете нет данных кабельного журнала");
  return b.cables;
};

type RenderXlsx = (b: ActBundle, o: Partial<PrintOptions>, set: FormSet) => Sheet;

/** Excel-формы документов по наборам (те же ключи, что у ACT_DOC_RENDER). */
export const ACT_DOC_XLSX: Record<ActDocKind, Partial<Record<FormSet, RenderXlsx>>> = {
  aosr: { sbd: (b, o) => aosrSheet(buildDocDataFromBundle(b, "aosr", o)).sheet },
  rim: { sbd: (b, o) => rimSheet(buildDocDataFromBundle(b, "rim", o), view("rim:sbd", o)).sheet, ti: (b, o) => tiRmSheet(tiDocData(b), view("rim:ti", o)).sheet },
  vd: { sbd: (b, o) => vdSheet(buildDocDataFromBundle(b, "vd", o), view("vd:sbd", o)).sheet, ti: (b, o) => tiVdSheet(tiDocData(b), view("vd:ti", o)).sheet },
  vor: { sbd: (b, o) => vorSheet(buildDocDataFromBundle(b, "vor", o), view("vor:sbd", o)).sheet },
  avk: { sbd: (b, o) => avkSheet(buildAvkData(b), view("avk:sbd", o)).sheet },
  kj: {
    sbd: (b, _o, set) => kjSheet(cableDocData(b, "kj", set)),
    ti: (b, o, set) => tiKjSheet({
      header: tiHeader(b, cables(b).doc?.journalDate ?? b.act.date), number: docNumberFor(b.act.baseNumber, "kj", set),
      journal: tiJournal(cables(b).rows, o.kjReserve ?? 2),
    }, view("kj:ti", o)).sheet,
  },
  ip: { sbd: (b, o, set) => ipSheet(cableDocData(b, "ip", set), view("ip:sbd", o)).sheet },
  rp: { ti: (b, o) => tiRpSheet(tiDocData(b), view("rp:ti", o)).sheet },
};

export const xlsxName = (pdfName: string) => pdfName.replace(/\.pdf$/i, "") + ".xlsx";

export function renderActXlsx(b: ActBundle, kind: ActDocKind, options: Partial<PrintOptions> = {}): { xlsx: Buffer; name: string } {
  const set = options.formSet ?? "sbd";
  const form = actDocFormFor(kind, options);
  const render = ACT_DOC_XLSX[kind][form];
  if (!render) throw new HttpError(400, "Для этого документа Excel не формируется");
  return { xlsx: writeBook([render(b, options, set)]), name: xlsxName(actDocFileName(b, kind, set, form)) };
}
