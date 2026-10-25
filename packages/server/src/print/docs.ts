// План 15: печать документов акта по описаниям ACT_DOC_DEFS — форма по набору и шаблону, HTML и имя файла.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { FormSet, PrintOptions } from "@idk/shared/templates";
import { ACT_DOC_DEFS, type ActDocKind } from "@idk/shared/docs/defs";
import { docNumberFor, formOf } from "@idk/shared/acts/format";
import { tiJournal } from "@idk/shared/acts/cableDocs";
import { HttpError } from "../http/router.ts";
import { buildDocDataFromBundle, buildAvkData } from "./fromBundle.ts";
import { renderHtml, renderCableHtml } from "./templates/index.ts";
import { avkHtml } from "./templates/avk.ts";
import { tiVdHtml, tiRmHtml, tiRpHtml, tiKjHtml } from "./templates/ti.ts";
import { tiDocData, tiHeader } from "./tiData.ts";
import { cableDocData } from "./cableData.ts";

type Render = (b: ActBundle, o: Partial<PrintOptions>, set: FormSet) => string;

const cables = (b: ActBundle) => {
  if (!b.cables) throw new HttpError(400, "В пакете нет данных кабельного журнала");
  return b.cables;
};

/** Встроенные формы документов по наборам (ключи — наборы из ACT_DOC_DEFS[kind].forms). */
export const ACT_DOC_RENDER: Record<ActDocKind, Partial<Record<FormSet, Render>>> = {
  aosr: { sbd: (b, o) => renderHtml("aosr", buildDocDataFromBundle(b, "aosr", o)) },
  rim: { sbd: (b, o) => renderHtml("rim", buildDocDataFromBundle(b, "rim", o)), ti: (b) => tiRmHtml(tiDocData(b)) },
  vd: { sbd: (b, o) => renderHtml("vd", buildDocDataFromBundle(b, "vd", o)), ti: (b) => tiVdHtml(tiDocData(b)) },
  vor: { sbd: (b, o) => renderHtml("vor", buildDocDataFromBundle(b, "vor", o)) },
  avk: { sbd: (b) => avkHtml(buildAvkData(b)) },
  kj: {
    sbd: (b, _o, set) => renderCableHtml("kj", cableDocData(b, "kj", set)),
    ti: (b, o, set) => tiKjHtml({
      header: tiHeader(b, cables(b).doc?.journalDate ?? b.act.date), number: docNumberFor(b.act.baseNumber, "kj", set),
      journal: tiJournal(cables(b).rows, o.kjReserve ?? 2),
    }),
  },
  ip: { sbd: (b, _o, set) => renderCableHtml("ip", cableDocData(b, "ip", set)) },
  rp: { ti: (b) => tiRpHtml(tiDocData(b)) },
};

/** Форма документа: выбранная в шаблоне (ВД, РИМ, КЖ) или набора; нет такой встроенной — первая из описания. */
export function actDocFormFor(kind: ActDocKind, options: Partial<PrintOptions>): FormSet {
  const def = ACT_DOC_DEFS[kind];
  const f = def.formDoc ? formOf(options, def.formDoc) : options.formSet ?? "sbd";
  return def.forms.includes(f) ? f : def.forms[0];
}

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
