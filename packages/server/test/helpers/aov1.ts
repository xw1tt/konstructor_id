// Пакет акта АОВ1 из книги-образца (план 15: вместо базы версии 0.2).
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { buildBundle, type ActBundle } from "@idk/shared/workbook/bundle";
import { aov1Records, AOV1 } from "../../../shared/test/fixtures/aov1Book.ts";

export async function aov1Bundle(patch: (r: any) => void = () => {}): Promise<ActBundle> {
  const r: any = aov1Records();
  patch(r);
  const res = buildBundle(await readBook(new MemoryWorkbook(r)), AOV1, defaultImportant());
  assert.deepEqual(res.issues, []);
  return res.bundle!;
}
