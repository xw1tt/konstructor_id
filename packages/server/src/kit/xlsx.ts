// План 28: Excel-файлы документов комплекта одним архивом — по файлу на документ в порядке реестра (сканы не входят).
import type { KitRequest, KitRow } from "@idk/shared/kit/request";
import { writeZip } from "../zip/zip.ts";
import { renderBundleXlsx } from "../routes/print.ts";
import { fillForm } from "../forms/convert.ts";
import { findDoc, docCode } from "../routes/formJobs.ts";
import { docLabel } from "@idk/shared/forms/template";
import type { KitDeps } from "./assemble.ts";

const bundleOf = (q: KitRequest, row: KitRow) => (row.doc?.proto
  ? q.protos.find((p) => p.proto?.number === row.doc!.proto)
  : q.acts.find((a) => a.act.baseNumber === row.doc!.act));
const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "_");

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
      const f = row.doc!.form;
      if (f) {
        if (!deps.templates) throw new Error("свои формы недоступны");
        const t = deps.templates.get(f.template);
        const d = findDoc(t.docs, f.doc);
        if (!d?.form) throw new Error(`у документа «${f.doc}» нет своей формы в шаблоне «${t.name}»`);
        const code = docCode(d);
        const filled = fillForm(b, { ...d.form, buf: deps.templates.form(t.id, d.form.file) }, { ...(code ? { code } : {}), set: t.print.formSet });
        files.push([`${n} ${safe(`${docLabel(d)} ${b.act.baseNumber}`)}.${d.form.type}`, filled.buf]);
        return;
      }
      const { xlsx, name } = renderBundleXlsx(b, row.doc!.kind!, q.options);
      files.push([`${n} ${safe(name)}`, xlsx]);
    } catch (e) {
      errors.push(`Строка ${row.row ?? i + 1}: ${(e as Error).message}`);
    }
  });
  if (errors.length) files.push(["Ошибки.txt", errors.join("\r\n")]);
  return { zip: writeZip(files), files: files.map(([name]) => name) };
}

export const kitZipName = (pdfName: string) => pdfName.replace(/\.pdf$/i, "") + " (Excel).zip";
