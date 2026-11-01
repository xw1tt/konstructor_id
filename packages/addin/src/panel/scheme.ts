// Схема трассы в панели: PDF на сервере, скан в «Исполнительные схемы» (оттуда схема попадает в комплект и реестр).
import type { RouteScheme } from "@idk/shared/scheme/route";
import { registerRecord, registerRowIndex } from "@idk/shared/scheme/fromBook";
import { column } from "@idk/shared/workbook/schema";
import { writeBook } from "@idk/shared/workbook/write";
import type { Book } from "@idk/shared/workbook/records";
import type { TableStore } from "@idk/shared/workbook/store";
import type { FileRow } from "@idk/shared/schemas";
import { ServerUnavailableError, apiUpload } from "../api.ts";

/** PDF листа схемы (сервер печатает SVG в масштабе через браузер). */
export async function schemePdf(scheme: RouteScheme, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  let res: Response;
  try {
    res = await fetchImpl("/api/scheme/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(scheme) });
  } catch {
    throw new ServerUnavailableError();
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Ошибка сервера (${res.status})`);
  }
  return res.blob();
}

/** Имя файла скана схемы: «Схема ИС-1.pdf» (символы, недопустимые в имени файла, — «_»). */
export const schemeFileName = (number: string) => `Схема ${number}.pdf`.replace(/[\\/:*?"<>|]/g, "_");

/**
 * Строка «Исполнительных схем» со сканом: есть строка с этим номером (и актом) — обновляется, нет — добавляется.
 * Возвращает индекс строки, если он известен (новая строка — null).
 */
export async function saveToRegister(store: TableStore, book: Book, number: string, file: FileRow, origin: string): Promise<{ added: boolean }> {
  const rec = registerRecord(book, number);
  if (!rec) throw new Error(`Схема «${number}» не найдена на листе «Схемы трасс»`);
  const scan = column("Схемы", "file").header;
  const name = schemeFileName(number);
  const link = `${origin}/api/files/${file.id}`;
  const at = registerRowIndex(book, number);
  if (at !== null) {
    await store.write("Схемы", at, { ...rec, [scan]: name }, { [scan]: link });
    return { added: false };
  }
  await writeBook(store, { "Схемы": [{ ...rec, [scan]: name }] }, { "Схемы": [{ [scan]: link }] });
  return { added: true };
}

/** Всё сохранение: PDF → файл сервера → строка «Исполнительных схем». */
export async function saveSchemePdf(store: TableStore, book: Book, number: string, scheme: RouteScheme, origin: string,
  deps: { pdf?: typeof schemePdf; upload?: typeof apiUpload } = {}): Promise<{ file: FileRow; added: boolean }> {
  const blob = await (deps.pdf ?? schemePdf)(scheme);
  const file = await (deps.upload ?? apiUpload)(blob, schemeFileName(number));
  const r = await saveToRegister(store, book, number, file, origin);
  return { file, added: r.added };
}
