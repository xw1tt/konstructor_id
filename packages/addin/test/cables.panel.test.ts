import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { defaultImportant } from "@idk/shared/workbook/important";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { printAct } from "@idk/addin/panel/print";
import { newRowDefaults } from "@idk/addin/book/defaults";
import { aov1Book, aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

async function captureJob(doc: "kj" | "ip" | "aosr") {
  const g = globalThis as any;
  const saved = { fetch: g.fetch, window: g.window, location: g.location };
  let body: any = null;
  g.location = { origin: "https://localhost:3443" };
  g.window = { open: () => null };
  g.fetch = async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }), { status: 201 });
  };
  try {
    const issues = await printAct(await readBook(aov1Book()), AOV1, defaultImportant(), doc, "sbd");
    return { issues, body };
  } finally { Object.assign(g, saved); }
}

test("печать протокола и КЖ передаёт кабели в задании; АОСР — без кабелей", async () => {
  const ip = await captureJob("ip");
  assert.deepEqual(ip.issues, []);
  assert.equal(ip.body.cables.rows.length, 25);
  assert.equal(ip.body.cables.marks.length, 1);
  const kj = await captureJob("kj");
  assert.equal(kj.body.cables.doc.journalCode, "СБД-1436-АОВ1К1");
  const aosr = await captureJob("aosr");
  assert.equal(aosr.body.cables, undefined);
});

test("умолчания новой строки «ДокументыКабелей»", async () => {
  const r: any = aov1Records();
  r["ДокументыКабелей"] = [];
  const b = await readBook(new MemoryWorkbook(r));
  const d = newRowDefaults("ДокументыКабелей", b);
  assert.equal(d["Акт"], AOV1);
  assert.equal(d["Нормативы"], "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34");
  assert.equal(d["Цель испытаний"], "приемо-сдаточные");
  const full = newRowDefaults("ДокументыКабелей", await readBook(aov1Book()));
  assert.equal(full["Акт"], undefined);
});
