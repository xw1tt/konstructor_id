// План 16: библиотека компании — настройки папки, записи, сканы.
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { LIB_KINDS, type LibKind } from "@idk/shared/library/model";
import type { Db } from "../db.ts";
import { Router, Reply, HttpError, notFound } from "../http/router.ts";
import { getFile, saveFile } from "../files/store.ts";
import type { LibraryStore } from "../library/store.ts";

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const kindOf = (k: string): LibKind => {
  if (!(LIB_KINDS as readonly string[]).includes(k)) throw new HttpError(404, "Нет такого раздела библиотеки: " + k);
  return k as LibKind;
};

export function libraryRoutes(r: Router, lib: LibraryStore, db: Db, dataDir: string, uploadLimit: number) {
  r.get("/api/library/settings", () => lib.settings());
  r.put("/api/library/settings", async (c) => lib.setDir((await c.body(z.object({ dir: z.string().nullable() }))).dir));
  r.post("/api/library/files/:sha/import", async (c) => {
    const q = await c.body(z.object({ name: z.string().default("скан.pdf"), mime: z.string().default("application/pdf") }));
    const path = lib.scanPath(c.params.sha);
    if (!existsSync(path)) throw new HttpError(404, "Скан не найден в папке библиотеки");
    const f = await saveFile(db, dataDir, createReadStream(path), { name: q.name, mime: q.mime }, uploadLimit);
    return { fileId: f.id, name: f.name };
  });
  r.get("/api/library/:kind", (c) => lib.list(kindOf(c.params.kind), c.query.get("q") ?? ""));
  r.post("/api/library/:kind", async (c) => {
    const kind = kindOf(c.params.kind);
    const q = await c.body(z.object({ values: z.record(Cell), fileId: z.number().int().positive().nullable().default(null) }));
    let scan = null;
    if (kind === "doc" && q.fileId) {
      const f = getFile(db, q.fileId);
      if (!f) throw notFound("Скан");
      const src = join(dataDir, "files", f.path);
      if (!existsSync(src)) throw new HttpError(404, "Файл скана отсутствует на диске");
      scan = lib.putScan(src, { sha256: f.sha256, name: f.name, mime: f.mime });
    }
    const { record, created } = lib.upsert(kind, q.values, scan);
    return new Reply(created ? 201 : 200, { id: record.id, created });
  });
  r.delete("/api/library/:kind/:rid", (c) => {
    if (!lib.remove(kindOf(c.params.kind), c.params.rid)) throw notFound();
  });
}
