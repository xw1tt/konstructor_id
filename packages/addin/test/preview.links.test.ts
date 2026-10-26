// План 26: ссылка «Скачать Excel/Word» в окне предпросмотра по адресу документа.
import { test } from "node:test";
import assert from "node:assert/strict";
import { editableLink } from "../src/preview.ts";

test("предпросмотр: Excel документа печати, своя форма (Excel или Word), архив комплекта", () => {
  assert.deepEqual(editableLink("/api/print-jobs/abc/aosr", null), { href: "/api/print-jobs/abc/aosr?format=xlsx", label: "Скачать Excel" });
  assert.deepEqual(editableLink("/api/form-jobs/f1", "xlsx"), { href: "/api/form-jobs/f1/source", label: "Скачать Excel" });
  assert.deepEqual(editableLink("/api/form-jobs/f1", "docx"), { href: "/api/form-jobs/f1/source", label: "Скачать Word" });
  assert.deepEqual(editableLink("/api/kit-jobs/k1", null), { href: "/api/kit-jobs/k1/xlsx", label: "Скачать Excel (архив)" });
  assert.equal(editableLink("/api/ojr-jobs/o1", null), null);
});
