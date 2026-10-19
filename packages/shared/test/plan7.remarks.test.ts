// План 7, замечания к печати: повторы представителей, дата документа качества, группы РИМ, п.4.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { TABLES, ROLE_BOOK_LABELS } from "@idk/shared/workbook/schema";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const book = async (patch: (r: any) => void = () => {}) => {
  const r: any = aov1Records();
  patch(r);
  return readBook(new MemoryWorkbook(r));
};

test("представители: одна фамилия в двух ролях и повтор роли с фамилией — без ошибок", async () => {
  const b = await book((r) => {
    const first = r["Представители"][1]; // Аксенов — лицо, осуществляющее строительство
    r["Представители"].push({ ...first, "Роль": ROLE_BOOK_LABELS.performer });
    r["Представители"].push({ ...first });
  });
  const { bundle, issues } = buildBundle(b, AOV1, defaultImportant());
  assert.deepEqual(issues, []);
  assert.equal(bundle!.representatives.filter((x) => x.fullName === "Аксенов А.М.").length, 3);
  assert.equal(TABLES["Представители"].allowDuplicates, true);
  assert.doesNotMatch(TABLES["Представители"].columns.find((c) => c.key === "fullName")!.hint, /уникальн/);
});
