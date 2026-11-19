// 0.37: «Печать выбранных» в окне программы — документ нескольких актов одним PDF.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { startTestServer } from "./helpers/server.ts";
import { aov1Bundle } from "./helpers/aov1.ts";
import { closeBrowser } from "@idk/server/print/browser";

after(() => closeBrowser());

test("АОСР двух актов — один PDF со страницами обоих", async () => {
  const s = await startTestServer();
  const a = await aov1Bundle();
  const b = { ...a, act: { ...a.act, baseNumber: a.act.baseNumber + "-2" } };
  const one = await s.raw("POST", "/api/print/aosr", { headers: { "content-type": "application/json" }, body: JSON.stringify(a) });
  const single = (await PDFDocument.load(Buffer.from(await one.arrayBuffer()))).getPageCount();
  const r = await s.req("POST", "/api/print-batch", { kind: "aosr", bundles: [a, b] });
  assert.equal(r.status, 201);
  const res = await s.raw("GET", `/api/print-batch/${r.json.id}`);
  assert.equal(res.status, 200);
  assert.match(decodeURIComponent(res.headers.get("content-disposition") ?? ""), /АОСР — актов 2\.pdf/);
  const pdf = await PDFDocument.load(Buffer.from(await res.arrayBuffer()));
  assert.equal(pdf.getPageCount(), single * 2);
  assert.equal((await s.req("GET", "/api/print-batch/нет")).status, 404);
  assert.equal((await s.req("POST", "/api/print-batch", { kind: "aosr", bundles: [] })).status, 400);
});
