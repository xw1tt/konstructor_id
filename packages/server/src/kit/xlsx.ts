// План 28: Excel-файлы документов комплекта одним архивом — по файлу на документ в порядке реестра (сканы не входят).
import type { KitRequest, KitRow } from "@idk/shared/kit/request";
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { PrintKind } from "@idk/shared/acts/schemas";
import type { PrintOptions } from "@idk/shared/templates";
import { writeZip } from "../zip/zip.ts";
import { renderBundleXlsx } from "../routes/print.ts";
import { fillForm } from "../forms/convert.ts";
import { findDoc, docCode } from "../routes/formJobs.ts";
import { docLabel, formStyleKey } from "@idk/shared/forms/template";
import { styleKeyFor } from "@idk/shared/docStyle";
import type { KitDeps } from "./assemble.ts";
import { actDocFileName } from "../print/docs.ts";
import { kamDocx } from "../forms/kamForms.ts";
import { isActDocKind } from "@idk/shared/docs/defs";
import { actDocFormFor } from "@idk/shared/blanks";

const bundleOf = (q: KitRequest, row: KitRow) =>
  row.doc?.proto ? q.protos.find((p) => p.proto?.number === row.doc!.proto) : q.acts.find((a) => a.act.baseNumber === row.doc!.act);
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");

/** 0.46.3: «Камчатка» — АОСР и реестры в Word по образцам заказчика (ВД и КЖ — в Excel, как в образцах); null — нет. */
export function kamWordFile(b: ActBundle, kind: PrintKind, options: Partial<PrintOptions> | undefined): { name: string; buf: Buffer } | null {
  if ((options?.formSet ?? "sbd") !== "kam" || !isActDocKind(kind)) return null;
  if (kind !== "aosr" && actDocFormFor(kind, options ?? {}) !== "kam") return null;
  const form = kamDocx(kind);
  if (!form) return null;
  const filled = fillForm(
    b,
    { file: "kam.docx", type: "docx", original: "", buf: form },
    { set: "kam" },
    options?.styles?.[styleKeyFor(kind, options ?? {}) ?? ""],
  );
  return { name: actDocFileName(b, kind, "kam", actDocFormFor(kind, options ?? {})).replace(/\.pdf$/i, ".docx"), buf: filled.buf };
}

/** 0.35: файл одного документа — своя форма (заполненный .docx/.xlsx) или встроенный документ в Excel. */
export function docFile(
  b: ActBundle,
  doc: { kind: PrintKind | null; form: { template: string; doc: string } | null },
  options: Partial<PrintOptions> | undefined,
  deps: Pick<KitDeps, "templates">,
): { name: string; buf: Buffer } {
  const f = doc.form;
  if (f) {
    if (!deps.templates) throw new Error("свои формы недоступны");
    const t = deps.templates.get(f.template);
    const d = findDoc(t.docs, f.doc);
    if (!d?.form) throw new Error(`у документа «${f.doc}» нет своей формы в шаблоне «${t.name}»`);
    const code = docCode(d);
    const filled = fillForm(
      b,
      { ...d.form, buf: deps.templates.form(t.id, d.form.file) },
      { ...(code ? { code } : {}), set: t.print.formSet },
      t.print.styles?.[formStyleKey(d)],
    );
    return { name: `${safe(`${docLabel(d)} ${b.act.baseNumber}`)}.${d.form.type}`, buf: filled.buf };
  }
  if (!doc.kind) throw new Error("не указан документ");
  const word = kamWordFile(b, doc.kind, options);
  if (word) return { name: safe(word.name), buf: word.buf };
  const { xlsx, name } = renderBundleXlsx(b, doc.kind, options);
  return { name: safe(name), buf: xlsx };
}

/** Архив .zip: «01 <имя>.xlsx» (своя форма Word — .docx); документы, которые не удалось собрать, — в «Ошибки.txt». */
export function kitXlsxZip(q: KitRequest, deps: Pick<KitDeps, "templates">): { zip: Buffer; files: string[] } {
  const files: [string, Buffer | string][] = [];
  const errors: string[] = [];
  const docs = q.rows.filter((r) => r.doc);
  const width = String(docs.length).length < 2 ? 2 : String(docs.length).length;
  docs.forEach((row, i) => {
    const n = String(i + 1).padStart(width, "0");
    try {
      const b = bundleOf(q, row);
      if (!b) throw new Error("нет данных документа");
      const x = docFile(b, { kind: row.doc!.kind ?? null, form: row.doc!.form ?? null }, q.options, deps);
      files.push([`${n} ${x.name}`, x.buf]);
    } catch (e) {
      errors.push(`Строка ${row.row ?? i + 1}: ${(e as Error).message}`);
    }
  });
  if (errors.length) files.push(["Ошибки.txt", errors.join("\r\n")]);
  return { zip: writeZip(files), files: files.map(([name]) => name) };
}

/** 0.35: в архиве и файлы Word своих форм — имя без «(Excel)». */
export const kitZipName = (pdfName: string) => pdfName.replace(/\.pdf$/i, "") + " (Word и Excel).zip";
