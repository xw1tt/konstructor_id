// Сборка комплекта в один PDF: титул → корешки → реестр → документы по порядку реестра (план 7, §4).
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { KitRequest, KitRow, FileRef } from "@idk/shared/kit/request";
import { orgFullForm } from "@idk/shared/rules";
import type { Organization } from "@idk/shared/schemas";
import { isTemplateCode, DEFAULT_TEMPLATE } from "@idk/shared/templates";
import { renderBundlePdf } from "../routes/print.ts";
import { htmlToPdf } from "../print/browser.ts";
import { resolveScan, loadScan, type ScanContext } from "./files.ts";
import { registryHtml, coverHtml, spineHtml, type RegistryLine } from "./templates.ts";
import type { Db } from "../db.ts";

export interface KitIssue { row: number | null; column: string; message: string }
export type KitResult = { ok: true; pdf: Buffer; name: string; pages: number } | { ok: false; issues: KitIssue[] };

/** «л. 4» или «л. 5-6». */
export const pageRange = (start: number, count: number) => (count <= 1 ? `л. ${start}` : `л. ${start}-${start + count - 1}`);

export function kitFileName(k: KitRequest["kit"]): string {
  return `Реестр №${k.number}${k.volume ? ` Том ${k.volume}` : ""}${k.part ? ` Часть ${k.part}` : ""}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
}

export function registryTitle(q: KitRequest): string {
  const k = q.kit;
  return `РЕЕСТР ПЕРЕДАЧИ ИСПОЛНИТЕЛЬНОЙ ДОКУМЕНТАЦИИ №${k.number}.${k.code}` +
    (k.volume ? ` Том №${k.volume}` : "") + (k.part ? `${k.volume ? "," : ""} Часть №${k.part}` : "");
}

const full = (o: Organization | null) => (o ? orgFullForm(o) : "");

async function dataUri(ref: FileRef, ctx: ScanContext): Promise<string | { message: string }> {
  const r = resolveScan(ref, ctx);
  if (!r.ok) return { message: r.message };
  if (r.mime === "application/pdf") return { message: `Логотип — только PNG или JPG: ${ref.name}` };
  return `data:${r.mime};base64,${(await readFile(r.path)).toString("base64")}`;
}

export async function assembleKit(q: KitRequest, deps: { db: Db; dataDir: string }): Promise<KitResult> {
  const ctx: ScanContext = { ...deps, scanFolder: q.scanFolder };
  const issues: KitIssue[] = [];
  const template = isTemplateCode(q.template) ? q.template : DEFAULT_TEMPLATE;

  // 1. Файлы и логотипы — все ошибки сразу, до печати.
  const resolved = new Map<KitRow, ReturnType<typeof resolveScan>>();
  for (const row of q.rows) {
    if (row.doc) {
      if (!q.acts.some((a) => a.act.baseNumber === row.doc!.act)) issues.push({ row: row.row, column: "Акт", message: `Нет данных акта «${row.doc.act}»` });
      continue;
    }
    const r = resolveScan(row.file ?? { name: "", link: null }, ctx);
    resolved.set(row, r);
    if (!r.ok) issues.push({ row: row.row, column: "Скан", message: r.message });
  }
  const logos: string[] = [];
  for (const ref of [q.logos.contractor, q.logos.developer]) {
    if (!ref || (!q.kit.cover && !q.kit.spine)) continue;
    const uri = await dataUri(ref, ctx);
    if (typeof uri === "string") logos.push(uri);
    else issues.push({ row: null, column: "Логотип", message: uri.message });
  }
  if (issues.length) return { ok: false, issues };

  // 2. Документы по порядку реестра; нумерация листов — с первого документа после реестра.
  const docs: PDFDocument[] = [];
  const lines: RegistryLine[] = [];
  let next = 1;
  for (const [i, row] of q.rows.entries()) {
    let doc: PDFDocument;
    try {
      if (row.doc) {
        const b = q.acts.find((a) => a.act.baseNumber === row.doc!.act)!;
        doc = await PDFDocument.load((await renderBundlePdf(b, row.doc.kind, template, q.options)).pdf);
      } else {
        doc = await loadScan(resolved.get(row) as { path: string; mime: "application/pdf" });
      }
    } catch (e) {
      // браузер не найден — общая ошибка, а не строка реестра
      if ((e as { status?: number }).status === 503) throw e;
      issues.push({ row: row.row, column: row.doc ? "Вид" : "Скан", message: (e as Error).message });
      continue;
    }
    const count = doc.getPageCount();
    docs.push(doc);
    lines.push({
      n: i + 1, number: row.number, name: row.name, date: row.date, sheets: row.sheets ?? count, copies: row.copies,
      code: row.code, pages: pageRange(next, count),
    });
    next += count;
  }
  if (issues.length) return { ok: false, issues };

  // 3. Реестр, титул, корешки.
  const k = q.kit;
  const objectLine = k.building ? `${k.building} в составе объекта ${q.object.name}` : q.object.name;
  const parties = [
    { label: "Заказчик:", value: full(q.developer) },
    { label: "Разработчик рабочей документации:", value: full(q.designer) },
    { label: "Подрядчик:", value: full(q.contractor) },
    ...(q.object.contractNumber ? [{ label: "Основание для выполнения работ:", value: `Договор подряда №${q.object.contractNumber}` }] : []),
  ].filter((p) => p.value);
  const front: Buffer[] = [];
  if (k.cover) {
    front.push(await htmlToPdf(coverHtml({
      logos, objectName: q.object.name, developer: q.developer?.shortName ?? "", builder: q.contractor?.shortName ?? "",
      contract: q.object.contractNumber, code: k.code,
      sectionLine: [k.sectionName && `«${k.sectionName}»`, k.building].filter(Boolean).join(" "),
      works: k.works, volume: k.volume, part: k.part, city: k.city, year: k.year,
    })));
  }
  if (k.spine) {
    front.push(await htmlToPdf(spineHtml({
      logos, objectName: q.object.name, building: k.building, builder: q.contractor?.shortName ?? "",
      registry: `№${k.number}.${k.code}`, sectionName: k.sectionName, code: k.code, contract: q.object.contractNumber,
      volume: k.volume, parts: Array.from({ length: k.parts }, (_, i) => String(i + 1)), year: k.year,
    })));
  }
  front.push(await htmlToPdf(registryHtml({ title: registryTitle(q), objectLine, parties, rows: lines }), { pageNumbers: true }));

  // 4. Склейка.
  const out = await PDFDocument.create();
  out.setTitle(registryTitle(q));
  for (const src of [...(await Promise.all(front.map((b) => PDFDocument.load(b)))), ...docs]) {
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  const pdf = Buffer.from(await out.save());
  return { ok: true, pdf, name: kitFileName(k), pages: out.getPageCount() };
}
