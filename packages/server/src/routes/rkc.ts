// Загрузка расчёта коммерческой стоимости (РКЦ): файл .xlsx держится в памяти (не сохраняется на диск — в нём цены),
// панель выбирает лист и получает разобранные позиции спецификации.
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { parseRkc, RkcError } from "@idk/shared/spec/rkc";
import { Router, Reply, HttpError } from "../http/router.ts";
import { readXlsx, XlsxError, type XlsxBook } from "../xlsx/read.ts";

export const RKC_LIMIT = 50 * 1024 * 1024;
export const RKC_TTL_MS = 30 * 60_000;
const MAX_BOOKS = 3;
const NOT_XLSX = "Это не файл Excel (.xlsx). Сохраните РКЦ в Excel как «Книга Excel (*.xlsx)»";

async function readRaw(req: IncomingMessage, limit: number): Promise<Buffer> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `Файл больше ${Math.round(limit / 1048576)} МБ`);
    parts.push(chunk as Buffer);
  }
  return Buffer.concat(parts);
}

export function rkcRoutes(r: Router, now: () => number = Date.now) {
  const books = new Map<string, { book: XlsxBook; at: number }>();
  r.post("/api/rkc", async (c) => {
    const buf = await readRaw(c.req, RKC_LIMIT);
    let book: XlsxBook;
    try {
      book = readXlsx(buf);
    } catch (e) {
      if (e instanceof XlsxError || e instanceof RangeError) return new Reply(422, { error: NOT_XLSX });
      throw e;
    }
    const id = randomUUID();
    books.set(id, { book, at: now() });
    while (books.size > MAX_BOOKS) books.delete(books.keys().next().value!);
    return new Reply(201, { id, sheets: book.sheets });
  });
  r.get("/api/rkc/:id", (c) => {
    const b = books.get(c.params.id);
    if (!b || now() - b.at > RKC_TTL_MS) {
      books.delete(c.params.id);
      throw new HttpError(404, "Файл РКЦ не найден или устарел — выберите его заново");
    }
    const sheet = c.query.get("sheet") ?? b.book.sheets[0];
    if (!b.book.sheets.includes(sheet)) throw new HttpError(404, `Лист «${sheet}» не найден`);
    try {
      return new Reply(200, { sheet, ...parseRkc(b.book.grid(sheet)) });
    } catch (e) {
      if (e instanceof RkcError) throw new HttpError(422, e.message);
      throw e;
    }
  });
}
