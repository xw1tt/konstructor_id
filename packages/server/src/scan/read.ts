// Текст скана документа качества: текстовый слой PDF (pdf.js) или распознавание средствами Windows (Windows.Media.Ocr,
// страницы PDF рисует Windows.Data.Pdf) — без сторонних программ. Вне Windows сканы-картинки не распознаются.
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hasText } from "@idk/shared/scan/docText";
import { HttpError } from "../http/router.ts";
import { removeQuietly } from "../forms/convert.ts";

export interface ScanText { text: string; pages: number; method: "pdf-text" | "ocr"; warnings: string[] }
/** Распознавание файла (путь) — текст; ошибка — понятным сообщением. */
export type OcrRunner = (path: string, kind: "pdf" | "image", maxPages: number) => Promise<{ text: string; lang: string }>;

export const OCR_PAGES = 4;
export const OCR_TIMEOUT_MS = 120_000;

/**
 * pdf.js в Node ждёт DOMMatrix и Path2D (из пакета @napi-rs/canvas, которого в установщике нет): без них сборка падает
 * при загрузке. Тексту они не нужны — ставятся простые замены 2D-матрицы и пустого контура, если своих нет.
 */
function polyfillCanvasGlobals() {
  const g = globalThis as any;
  if (!g.DOMMatrix) {
    g.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
      get is2D() { return true; }
      get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
      multiplySelf(m: any) {
        const { a, b, c, d, e, f } = this;
        this.a = a * m.a + c * m.b; this.b = b * m.a + d * m.b;
        this.c = a * m.c + c * m.d; this.d = b * m.c + d * m.d;
        this.e = a * m.e + c * m.f + e; this.f = b * m.e + d * m.f + f;
        return this;
      }
      preMultiplySelf(m: any) { const t = new g.DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]).multiplySelf(this); Object.assign(this, { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f }); return this; }
      multiply(m: any) { return new g.DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(m); }
      translate(x = 0, y = 0) { return this.multiply({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }); }
      translateSelf(x = 0, y = 0) { return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }); }
      scale(x = 1, y = x) { return this.multiply({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); }
      scaleSelf(x = 1, y = x) { return this.multiplySelf({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); }
      invertSelf() {
        const { a, b, c, d, e, f } = this; const det = a * d - b * c;
        if (!det) { Object.assign(this, { a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN }); return this; }
        Object.assign(this, { a: d / det, b: -b / det, c: -c / det, d: a / det, e: (c * f - d * e) / det, f: (b * e - a * f) / det });
        return this;
      }
      inverse() { return new g.DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).invertSelf(); }
      transformPoint(p: { x?: number; y?: number } = {}) { const x = p.x ?? 0, y = p.y ?? 0; return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 }; }
    };
  }
  if (!g.Path2D) g.Path2D = class Path2D { addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} rect() {} };
  if (!g.ImageData) g.ImageData = class ImageData { constructor(public data: unknown, public width: number, public height: number) {} };
}

/** Текстовый слой PDF (первые страницы) и число страниц. */
export async function pdfText(buf: Buffer, maxPages = 6): Promise<{ text: string; pages: number }> {
  polyfillCanvasGlobals();
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let cMapUrl: string | undefined;
  try { cMapUrl = join(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")), "cmaps") + "/"; } catch { /* без cmaps */ }
  const task = getDocument({ data: new Uint8Array(buf), useSystemFonts: true, cMapUrl, cMapPacked: true, isEvalSupported: false });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    // Строки — по смене вертикали: так «Срок действия … по …» остаётся рядом с датами.
    let line = "", y: number | null = null;
    const lines: string[] = [];
    for (const it of c.items as any[]) {
      const yy = Math.round(it.transform?.[5] ?? 0);
      if (y !== null && Math.abs(yy - y) > 3) { lines.push(line); line = ""; }
      line += (line && !line.endsWith(" ") ? " " : "") + String(it.str ?? "");
      y = yy;
    }
    lines.push(line);
    out.push(lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: out.join("\n\n"), pages };
}

export async function readScan(buf: Buffer, mime: string, ocr: OcrRunner): Promise<ScanText> {
  const warnings: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "idk-scan-"));
  try {
    if (mime === "application/pdf") {
      let pages = 1, text = "";
      try { ({ text, pages } = await pdfText(buf)); } catch (e) {
        const m = (e as Error)?.message ?? "";
        // Сбой самой программы чтения PDF — не «повреждённый файл»: попробовать распознать страницы как картинки.
        if (/password|encrypt/i.test(m)) throw new HttpError(400, "PDF защищён паролем — снимите защиту и загрузите снова");
        if (/Invalid PDF|InvalidPDF|bad XRef|corrupt/i.test(m)) throw new HttpError(400, "Не удалось прочитать PDF: файл повреждён");
        warnings.push(`Текстовый слой PDF не прочитан (${m.slice(0, 120)}) — страницы распознаются как изображения`);
      }
      if (hasText(text)) return { text, pages, method: "pdf-text", warnings };
      const path = join(dir, "scan.pdf");
      writeFileSync(path, buf);
      const r = await ocr(path, "pdf", OCR_PAGES);
      if (pages > OCR_PAGES) warnings.push(`Распознаны первые ${OCR_PAGES} страницы из ${pages}`);
      if (r.lang && !r.lang.toLowerCase().startsWith("ru")) warnings.push(russianHint);
      return { text: r.text, pages, method: "ocr", warnings };
    }
    const path = join(dir, mime === "image/png" ? "scan.png" : "scan.jpg");
    writeFileSync(path, buf);
    const r = await ocr(path, "image", 1);
    if (r.lang && !r.lang.toLowerCase().startsWith("ru")) warnings.push(russianHint);
    return { text: r.text, pages: 1, method: "ocr", warnings };
  } finally {
    removeQuietly(dir);
  }
}

const russianHint = "Распознавание русского текста в Windows не установлено — текст мог распознаться с ошибками. " +
  "Добавьте его: Параметры → Время и язык → Язык → Русский → Параметры → «Оптическое распознавание символов»";

/** Скрипт PowerShell 5.1: WinRT OCR; страницы PDF — через Windows.Data.Pdf. Результат — UTF-8 в файл out. */
export const OCR_SCRIPT = String.raw`param([string]$Path,[string]$Kind,[int]$Max,[string]$Out)
$ErrorActionPreference='Stop'
$NL=[string][char]10
trap { [IO.File]::WriteAllText($Out+'.err',($_.Exception.Message+' @ '+$_.InvocationInfo.PositionMessage),(New-Object Text.UTF8Encoding $false)); exit 2 }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$ext=[System.WindowsRuntimeSystemExtensions].GetMethods()
$asOp=($ext|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -match '^IAsyncOperation.1$'})[0]
$asAct=($ext|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'})[0]
function Await($op,[Type]$t){$k=$asOp.MakeGenericMethod($t).Invoke($null,@($op));$k.Wait(-1)|Out-Null;$k.Result}
function AwaitAct($op){$asAct.Invoke($null,@($op)).Wait(-1)|Out-Null}
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]|Out-Null
[Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime]|Out-Null
[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]|Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]|Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]|Out-Null
[Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]|Out-Null
[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]|Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]|Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics,ContentType=WindowsRuntime]|Out-Null
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]|Out-Null
[Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime]|Out-Null
$ru=New-Object Windows.Globalization.Language 'ru'
if([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($ru)){$eng=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($ru)}else{$eng=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
if($eng -eq $null){[Console]::Error.WriteLine('NO_OCR');exit 3}
function ReadStream($s){
  $s.Seek(0)
  $d=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $b=Await ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $r=Await ($eng.RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
  ($r.Lines|%{$_.Text}) -join $NL
}
$f=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$parts=@()
if($Kind -eq 'pdf'){
  $doc=Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($f)) ([Windows.Data.Pdf.PdfDocument])
  $n=[Math]::Min([int]$doc.PageCount,$Max)
  for($i=0;$i -lt $n;$i++){
    $p=$doc.GetPage([uint32]$i)
    $s=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
    $o=New-Object Windows.Data.Pdf.PdfPageRenderOptions
    $o.DestinationWidth=[uint32]2200
    AwaitAct ($p.RenderToStreamAsync($s,$o))
    $parts+=ReadStream $s
  }
}else{
  $s=Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $parts+=ReadStream $s
}
$txt=($parts -join ($NL+$NL))
[IO.File]::WriteAllText($Out,$eng.RecognizerLanguage.LanguageTag+$NL+$txt,(New-Object Text.UTF8Encoding $false))
`;

export function windowsOcr(): OcrRunner {
  return (path, kind, maxPages) => new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new HttpError(501, "Распознавание сканов-картинок работает в Windows (встроенное распознавание текста). PDF с текстовым слоем читается везде"));
      return;
    }
    const dir = dirname(path);
    const script = join(dir, "ocr.ps1"), out = join(dir, "ocr.txt");
    writeFileSync(script, "﻿" + OCR_SCRIPT);
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Path", path, "-Kind", kind, "-Max", String(maxPages), "-Out", out],
      { timeout: OCR_TIMEOUT_MS, windowsHide: true }, (err, _stdout, stderr) => {
        if (!err && existsSync(out)) {
          const raw = readFileSync(out, "utf8");
          const nl = raw.indexOf("\n");
          resolve({ lang: raw.slice(0, nl), text: raw.slice(nl + 1) });
          return;
        }
        const errFile = out + ".err";
        const msg = (existsSync(errFile) ? readFileSync(errFile, "utf8") : String(stderr || err?.message || "")).trim();
        if (/NO_OCR/.test(msg)) reject(new HttpError(500, "В Windows нет ни одного языка распознавания текста. " + russianHint));
        else if (err && (err as any).killed) reject(new HttpError(504, "Распознавание заняло больше 2 минут — попробуйте файл с меньшим числом страниц"));
        else reject(new HttpError(500, `Не удалось распознать скан средствами Windows: ${msg.replace(/\s+/g, " ").slice(0, 400) || "неизвестная ошибка"}`));
      });
  });
}
