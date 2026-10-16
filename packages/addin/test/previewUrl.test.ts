import { test } from "node:test";
import assert from "node:assert/strict";
import { previewUrl, pdfUrl } from "@idk/addin/tabs/acts/printUrls";

test("previewUrl: кодирует адрес PDF", () => {
  assert.equal(pdfUrl(12, "rim"), "/api/acts/12/pdf/rim");
  assert.equal(previewUrl(12, "aosr"), "/addin/preview.html?src=%2Fapi%2Facts%2F12%2Fpdf%2Faosr");
});

test("previewUrl: абсолютный адрес для окна Office", () => {
  assert.equal(previewUrl(3, "vd", "https://localhost:3443"), "https://localhost:3443/addin/preview.html?src=%2Fapi%2Facts%2F3%2Fpdf%2Fvd");
});
