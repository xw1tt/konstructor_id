// Печать своей формы: подстановка меток → PDF через установленный Word/Excel (PowerShell + COM, без окна),
// а без Office — своими силами (HTML → Edge) с предупреждением.
import type { FormSet } from "@idk/shared/templates";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActBundle } from "@idk/shared/workbook/bundle";
import type { FormRef } from "@idk/shared/forms/template";
import { htmlToPdf } from "../print/browser.ts";
import { formData } from "./fields.ts";
import { fillDocx } from "./docx.ts";
import { fillXlsx } from "./xlsx.ts";
import { docxToHtml, xlsxToHtml } from "./html.ts";

export { docxToHtml, xlsxToHtml };

/** Перевод заполненной формы в PDF средствами Office; false — Office нет или он не справился. */
export type OfficeRunner = (kind: "docx" | "xlsx", src: string, out: string) => Promise<boolean>;

export const OFFICE_TIMEOUT_MS = 60_000;
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Скрипт PowerShell: перевод в PDF в отдельном задании с ограничением 55 с. Если Word/Excel завис (окно восстановления,
 * запрос), задание останавливается и закрываются только процессы Office, запущенные после начала скрипта, —
 * документы, которые пользователь открыл раньше, не трогаются.
 */
export function officeScript(kind: "docx" | "xlsx", src: string, out: string): string {
  const proc = kind === "docx" ? "WINWORD" : "EXCEL";
  return `$t0=Get-Date;$j=Start-Job -ScriptBlock {${exportScript(kind, src, out)}};` +
    `if(Wait-Job $j -Timeout 55){Receive-Job $j -ErrorAction Stop}else{Stop-Job $j;` +
    `Get-Process ${proc} -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt $t0 } | Stop-Process -Force;exit 1}`;
}

function exportScript(kind: "docx" | "xlsx", src: string, out: string): string {
  return kind === "docx"
    ? `$w=New-Object -ComObject Word.Application;$w.Visible=$false;$w.DisplayAlerts=0;try{$d=$w.Documents.Open(${ps(src)},$false,$true);$d.ExportAsFixedFormat(${ps(out)},17);$d.Close(0)}finally{$w.Quit()}`
    : `$x=New-Object -ComObject Excel.Application;$x.Visible=$false;$x.DisplayAlerts=$false;try{$b=$x.Workbooks.Open(${ps(src)},0,$true);$b.ExportAsFixedFormat(0,${ps(out)});$b.Close($false)}finally{$x.Quit()}`;
}

export function powershellRunner(): OfficeRunner {
  return (kind, src, out) => new Promise((resolve) => {
    if (process.platform !== "win32") { resolve(false); return; }
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", officeScript(kind, src, out)],
      { timeout: OFFICE_TIMEOUT_MS, windowsHide: true }, (err) => resolve(!err && existsSync(out)));
  });
}

/** Удаление временной папки без ошибки: файл может быть ещё открыт зависшим Office — PDF уже готов. */
export function removeQuietly(dir: string) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch { /* останется во временной папке Windows */ }
}

export interface RenderedForm { pdf: Buffer; source: Buffer; warnings: string[]; via: "word" | "excel" | "html" }

export async function renderForm(b: ActBundle, form: FormRef & { buf: Buffer }, doc: { code?: string; set?: FormSet } | undefined, runner: OfficeRunner): Promise<RenderedForm> {
  const data = formData(b, doc);
  const filled = form.type === "docx" ? fillDocx(form.buf, data) : fillXlsx(form.buf, data);
  const warnings = [...filled.warnings];
  const dir = mkdtempSync(join(tmpdir(), "idk-form-"));
  try {
    const src = join(dir, `form.${form.type}`), out = join(dir, "form.pdf");
    writeFileSync(src, filled.buf);
    if (await runner(form.type, src, out).catch(() => false) && existsSync(out)) {
      return { pdf: readFileSync(out), source: filled.buf, warnings, via: form.type === "docx" ? "word" : "excel" };
    }
    warnings.push(form.type === "docx" ? "Word не найден — форма может отличаться от Word" : "Excel не найден — форма может отличаться от Excel");
    const html = form.type === "docx" ? docxToHtml(filled.buf) : xlsxToHtml(filled.buf);
    return { pdf: await htmlToPdf(html), source: filled.buf, warnings, via: "html" };
  } finally {
    removeQuietly(dir);
  }
}
