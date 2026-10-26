// План 26: документы акта в Excel — та же форма (по набору и шаблону) и те же данные, что у PDF.
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { FormSet, PrintOptions } from "@idk/shared/templates";
import type { ActDocKind } from "@idk/shared/docs/defs";
import { HttpError } from "../../http/router.ts";
import { writeBook } from "../../xlsx/book.ts";
import type { Layout } from "../../xlsx/layout.ts";
import { actDocFileName, actDocFormFor } from "../docs.ts";
import { buildDocDataFromBundle } from "../fromBundle.ts";
import { aosrSheet } from "./aosr.ts";

type RenderXlsx = (b: ActBundle, o: Partial<PrintOptions>, set: FormSet) => Layout;

/** Excel-формы документов по наборам (те же ключи, что у ACT_DOC_RENDER). */
export const ACT_DOC_XLSX: Partial<Record<ActDocKind, Partial<Record<FormSet, RenderXlsx>>>> = {
  aosr: { sbd: (b, o) => aosrSheet(buildDocDataFromBundle(b, "aosr", o)) },
};

export const xlsxName = (pdfName: string) => pdfName.replace(/\.pdf$/i, "") + ".xlsx";

export function renderActXlsx(b: ActBundle, kind: ActDocKind, options: Partial<PrintOptions> = {}): { xlsx: Buffer; name: string } {
  const set = options.formSet ?? "sbd";
  const form = actDocFormFor(kind, options);
  const render = ACT_DOC_XLSX[kind]?.[form];
  if (!render) throw new HttpError(400, "Для этого документа Excel не формируется");
  return { xlsx: writeBook([render(b, options, set).sheet]), name: xlsxName(actDocFileName(b, kind, set, form)) };
}
