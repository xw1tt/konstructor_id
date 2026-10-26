// План 26: ссылка «Скачать Excel/Word» в окне предпросмотра по адресу документа.
import { test } from "node:test";
import assert from "node:assert/strict";
import { editableLink } from "../src/preview.ts";

test("предпросмотр: Excel документа печати, своя форма (Excel или Word), архив комплекта", () => {
  assert.deepEqual(editableLink("/api/print-jobs/abc/aosr", null, "АОВ1.АОСР.pdf"), { href: "/api/print-jobs/abc/aosr?format=xlsx", label: "Скачать Excel", file: "АОВ1.АОСР.xlsx" });
  assert.deepEqual(editableLink("/api/form-jobs/f1", "xlsx", "АОСР 1.pdf"), { href: "/api/form-jobs/f1/source", label: "Скачать Excel", file: "АОСР 1.xlsx" });
  assert.deepEqual(editableLink("/api/form-jobs/f1", "docx", "АОСР 1.pdf"), { href: "/api/form-jobs/f1/source", label: "Скачать Word", file: "АОСР 1.docx" });
  assert.deepEqual(editableLink("/api/kit-jobs/k1", null, "Реестр №1.pdf"), { href: "/api/kit-jobs/k1/xlsx", label: "Скачать Excel (архив)", file: "Реестр №1 (Excel).zip" });
  assert.equal(editableLink("/api/print-jobs/abc/vd", null)!.file, "");
  assert.equal(editableLink("/api/ojr-jobs/o1", null), null);
});
