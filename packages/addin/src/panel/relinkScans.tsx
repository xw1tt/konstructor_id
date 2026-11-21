// 0.46.9: «Привязать сканы» — книга перенесена на другой компьютер. Ссылки «Скан» в книге — номера файлов в хранилище
// программы того компьютера; здесь у тех же номеров другие файлы или нет никаких. Для каждой ссылки сервер находит файл
// здесь (по отпечатку, по номеру с проверкой имени, по имени в «Папке сканов» с подпапками), найденный в папке кладёт
// в хранилище, и ссылка в книге переписывается на файл этого компьютера (с отпечатком — дальше переносится сама).
import { TABLES, type TableName } from "@idk/shared/workbook/schema";
import type { Book } from "@idk/shared/workbook/records";
import { cellText } from "@idk/shared/workbook/values";
import { scanLink } from "@idk/shared/library/model";
import type { BookPort } from "../book/bookPort.ts";
import { apiSend } from "../api.ts";
import { useState } from "react";
import type { BookState } from "./useBook.ts";

export interface RelinkResult {
  checked: number;
  relinked: number;
  missing: { table: TableName; row: number; header: string; name: string; message: string }[];
}

type Answer = { ok: true; id: number; sha256: string; name: string } | { ok: false; message: string };

const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

export async function relinkScans(port: BookPort, book: Book, origin: string, folder?: string): Promise<RelinkResult> {
  const cells: { table: TableName; row: number; header: string; name: string; link: string | null }[] = [];
  for (const [table, def] of Object.entries(TABLES) as [TableName, (typeof TABLES)[TableName]][]) {
    const files = def.columns.filter((c) => c.type === "file");
    if (!files.length) continue;
    for (const r of book.tables[table] ?? []) {
      for (const col of files) {
        const name = cellText(r.v[col.key] ?? null);
        const link = r.link[col.key] ?? null;
        if (name || link) cells.push({ table, row: r.row, header: col.header, name, link });
      }
    }
  }
  const res: RelinkResult = { checked: cells.length, relinked: 0, missing: [] };
  if (!cells.length) return res;
  const { items } = await apiSend<{ items: Answer[] }>("POST", "/api/files/relink", {
    scanFolder: folder ?? cellText(book.object.scanFolder ?? null),
    items: cells.map((c) => ({ link: c.link, name: c.name })),
  });
  for (const [i, a] of items.entries()) {
    const c = cells[i];
    if (!a.ok) {
      // Имя файла без ссылки, которого нет, — не привязка, а пропущенный скан: о нём скажет проверка комплекта.
      if (c.link) res.missing.push({ table: c.table, row: c.row, header: c.header, name: c.name || c.link, message: a.message });
      continue;
    }
    const link = scanLink(origin, a);
    if (link === c.link) continue;
    await port.write(c.table, c.row, { [c.header]: c.name && !isUrl(c.name) ? c.name : a.name }, { [c.header]: link });
    res.relinked++;
  }
  return res;
}

/** 0.46.9: «Привязать сканы» — ссылки «Скан» книги на файлы этого компьютера (книга перенесена с другого). */
export function useRelink(port: BookPort, state: BookState, afterFill: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState<RelinkResult["missing"]>([]);
  const run = async (folder?: string) => {
    if (!state.book) return;
    setBusy(true);
    setNote("");
    setMissing([]);
    try {
      const r = await relinkScans(port, state.book, location.origin, folder);
      state.refresh();
      if (r.relinked) await afterFill().catch(() => undefined);
      setMissing(r.missing);
      setNote(
        !r.checked
          ? "В книге нет сканов."
          : `Проверено сканов: ${r.checked}; привязано к файлам этого компьютера: ${r.relinked}.` +
              (r.missing.length
                ? ` Не найдено: ${r.missing.length} — положите эти файлы в «Папку сканов» (лист «Объект»; можно несколько через «;», подпапки просматриваются) и нажмите ещё раз.`
                : " Все сканы на месте."),
      );
    } catch (e) {
      setNote(`Не удалось привязать сканы: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, missing, run };
}

/** Итог «Привязать сканы»: сколько привязано и какие не найдены — со ссылкой на ячейку. */
export function RelinkNote({ port, relink }: { port: BookPort; relink: ReturnType<typeof useRelink> }) {
  if (!relink.note) return null;
  return (
    <div className={relink.missing.length ? "warn dl2-pad" : "notice dl2-pad"} role="status">
      <p>{relink.note}</p>
      {relink.missing.length > 0 && (
        <ul className="dl2-missing">
          {relink.missing.slice(0, 30).map((m, i) => (
            <li key={i}>
              <button className="btn btn-link" onClick={() => void port.selectCell(m.table, m.row, m.header).catch(() => undefined)}>
                {m.table}, строка {m.row + 1}
              </button>{" "}
              «{m.name}»: {m.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
