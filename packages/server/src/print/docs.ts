// План 15: печать документов акта по описаниям ACT_DOC_DEFS — форма по набору и шаблону, HTML и имя файла.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { FormSet, PrintOptions } from "@idk/shared/templates";
import { ACT_DOC_DEFS, type ActDocKind } from "@idk/shared/docs/defs";
import { docNumberFor, formOf } from "@idk/shared/acts/format";
import { tiJournal } from "@idk/shared/acts/cableDocs";
import { HttpError } from "../http/router.ts";
import { buildDocDataFromBundle, buildAvkData } from "./fromBundle.ts";
import { renderHtml, renderCableHtml } from "./templates/index.ts";
import { actDocFormFor, blankView } from "@idk/shared/blanks";
import { rimHtml } from "./templates/rim.ts";
import { vdHtml } from "./templates/vd.ts";
import { vorHtml } from "./templates/vor.ts";
import { ipHtml } from "./templates/ip.ts";
import { avkHtml } from "./templates/avk.ts";
import { tiVdHtml, tiRmHtml, tiRpHtml, tiKjHtml } from "./templates/ti.ts";
import { tiDocData, tiHeader } from "./tiData.ts";
import { cableDocData } from "./cableData.ts";

type Render = (b: ActBundle, o: Partial<PrintOptions>, set: FormSet) => string;

/** Вид бланка по настройкам шаблона (скрытые графы и блоки, свои заголовки). */
export const view = (key: string, o: Partial<PrintOptions>) => blankView(key, o.blanks?.[key]);

const cables = (b: ActBundle) => {
  if (!b.cables) throw new HttpError(400, "В пакете нет данных кабельного журнала");
  return b.cables;
};

/** Встроенные формы документов по наборам (ключи — наборы из ACT_DOC_DEFS[kind].forms). */
export const ACT_DOC_RENDER: Record<ActDocKind, Partial<Record<FormSet, Render>>> = {
  aosr: { sbd: (b, o) => renderHtml("aosr", buildDocDataFromBundle(b, "aosr", o)) },
  rim: { sbd: (b, o) => rimHtml(buildDocDataFromBundle(b, "rim", o), view("rim:sbd", o)), ti: (b, o) => tiRmHtml(tiDocData(b), view("rim:ti", o)) },
  vd: { sbd: (b, o) => vdHtml(buildDocDataFromBundle(b, "vd", o), view("vd:sbd", o)), ti: (b, o) => tiVdHtml(tiDocData(b), view("vd:ti", o)) },
  vor: { sbd: (b, o) => vorHtml(buildDocDataFromBundle(b, "vor", o), view("vor:sbd", o)) },
  avk: { sbd: (b, o) => avkHtml(buildAvkData(b), view("avk:sbd", o)) },
  kj: {
    sbd: (b, _o, set) => renderCableHtml("kj", cableDocData(b, "kj", set)),
    ti: (b, o, set) => tiKjHtml({
      header: tiHeader(b, cables(b).doc?.journalDate ?? b.act.date), number: docNumberFor(b.act.baseNumber, "kj", set),
      journal: tiJournal(cables(b).rows, o.kjReserve ?? 2, o.kjDecimals ?? null),
    }, view("kj:ti", o)),
  },
  ip: { sbd: (b, o, set) => ipHtml(cableDocData(b, "ip", set), view("ip:sbd", o)) },
  rp: { ti: (b, o) => tiRpHtml(tiDocData(b), view("rp:ti", o)) },
};

/** Форма документа: выбранная в шаблоне (ВД, РИМ, КЖ) или набора; нет такой встроенной — первая из описания. */
export { actDocFormFor };

/** Имя PDF (как до плана 15): ВОР — «<акт>.ВОР», АВК — «АВК <номер>», КЖ «СБД» — шифр журнала или «<акт>.КЖ». */
export function actDocFileName(b: ActBundle, kind: ActDocKind, set: FormSet, form: FormSet): string {
  const base = b.act.baseNumber;
  if (kind === "avk") return `АВК ${buildAvkData(b).number}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
  if (kind === "vor") return `${base}.ВОР.pdf`;
  if (kind === "kj" && set === "sbd" && form === "sbd") return `${b.cables?.doc?.journalCode || `${base}.КЖ`}.pdf`;
  return `${docNumberFor(base, kind, set)}.pdf`;
}

export function renderActDoc(b: ActBundle, kind: ActDocKind, options: Partial<PrintOptions> = {}): { html: string; name: string; pageNumbers: boolean } {
  const set = options.formSet ?? "sbd";
  const form = actDocFormFor(kind, options);
  return { html: ACT_DOC_RENDER[kind][form]!(b, options, set), name: actDocFileName(b, kind, set, form), pageNumbers: kind === "vor" };
}
