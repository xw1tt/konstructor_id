// 0.35: формы старых форматов Word 97–2003 (.doc) и Excel 97–2003 (.xls) — переводятся в .docx/.xlsx тем же Office
// на компьютере (Word/Excel «Сохранить как»), без изменения вёрстки. Вне Windows — LibreOffice, если он установлен
// (для разработки и проверок).
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpError } from "../http/router.ts";
import { removeQuietly } from "./convert.ts";

export type LegacyKind = "doc" | "xls";
/** Перевод файла src старого формата в out (.docx/.xlsx); false — не получилось. */
export type LegacyConverter = (kind: LegacyKind, src: string, out: string) => Promise<boolean>;

/** Составной файл OLE (Word 97–2003, Excel 97–2003). */
export const isOle = (b: Buffer) => b.length > 8 && b.readUInt32BE(0) === 0xd0cf11e0 && b.readUInt32BE(4) === 0xa1b11ae1;

/** Вид старого файла: по расширению имени, иначе по названию потока внутри (WordDocument / Workbook). */
export function legacyKind(buf: Buffer, name = ""): LegacyKind | null {
  if (!isOle(buf)) return null;
  if (/\.doc$/i.test(name)) return "doc";
  if (/\.xls$/i.test(name)) return "xls";
  const s = buf.subarray(0, Math.min(buf.length, 1 << 20)).toString("utf16le");
  if (s.includes("WordDocument")) return "doc";
  if (s.includes("Workbook") || s.includes("Book")) return "xls";
  return null;
}

const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** PowerShell: открыть только для чтения и сохранить в OpenXML (wdFormatXMLDocument = 16, xlOpenXMLWorkbook = 51). */
export function legacyScript(kind: LegacyKind, src: string, out: string): string {
  const body =
    kind === "doc"
      ? `$w=New-Object -ComObject Word.Application;$w.Visible=$false;$w.DisplayAlerts=0;try{$d=$w.Documents.Open(${ps(src)},$false,$true);$d.SaveAs2(${ps(out)},16);$d.Close(0)}finally{$w.Quit()}`
      : `$x=New-Object -ComObject Excel.Application;$x.Visible=$false;$x.DisplayAlerts=$false;try{$b=$x.Workbooks.Open(${ps(src)},0,$true);$b.SaveAs(${ps(out)},51);$b.Close($false)}finally{$x.Quit()}`;
  const proc = kind === "doc" ? "WINWORD" : "EXCEL";
  return (
    `$t0=Get-Date;$j=Start-Job -ScriptBlock {${body}};` +
    `if(Wait-Job $j -Timeout 55){Receive-Job $j -ErrorAction Stop}else{Stop-Job $j;` +
    `Get-Process ${proc} -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt $t0 } | Stop-Process -Force;exit 1}`
  );
}

export function defaultLegacyConverter(): LegacyConverter {
  return (kind, src, out) =>
    new Promise((resolve) => {
      if (process.platform === "win32") {
        execFile(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", legacyScript(kind, src, out)],
          { timeout: 60_000, windowsHide: true },
          (err) => resolve(!err && existsSync(out)),
        );
        return;
      }
      const dir = join(out, "..");
      execFile("soffice", ["--headless", "--convert-to", kind === "doc" ? "docx" : "xlsx", "--outdir", dir, src], { timeout: 120_000 }, (err) =>
        resolve(!err && existsSync(out)),
      );
    });
}

/** Файл формы в OpenXML: .docx/.xlsx — как есть; .doc/.xls — переводится. */
export async function toOpenXml(buf: Buffer, name: string, convert: LegacyConverter): Promise<{ buf: Buffer; name: string; converted: boolean }> {
  const kind = legacyKind(buf, name);
  if (!kind) return { buf, name, converted: false };
  const dir = mkdtempSync(join(tmpdir(), "idk-legacy-"));
  try {
    const src = join(dir, `form.${kind}`);
    const out = join(dir, `form.${kind}x`);
    writeFileSync(src, buf);
    if (!(await convert(kind, src, out)))
      throw new HttpError(
        422,
        kind === "doc"
          ? "Не удалось перевести .doc в .docx — нужен установленный Word. Откройте файл в Word и сохраните как «Документ Word (.docx)»"
          : "Не удалось перевести .xls в .xlsx — нужен установленный Excel. Откройте файл в Excel и сохраните как «Книга Excel (.xlsx)»",
      );
    return { buf: readFileSync(out), name: name.replace(/\.(doc|xls)$/i, (m) => `${m}x`), converted: true };
  } finally {
    removeQuietly(dir);
  }
}
