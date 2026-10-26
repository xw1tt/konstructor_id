// План 28: «ТИ» и протоколы в Excel; у каждой встроенной формы PDF есть Excel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACT_DOC_XLSX, renderActXlsx } from "@idk/server/print/xlsx/index";
import { ACT_DOC_RENDER } from "@idk/server/print/docs";
import { renderBundleXlsx } from "@idk/server/routes/print";
import { tiDocData } from "@idk/server/print/tiData";
import { gridSpans } from "@idk/server/xlsx/layout";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { buildCableBundle } from "@idk/shared/workbook/cables";
import { buildProtoBundle } from "@idk/shared/protocols/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { PrintOptions } from "@idk/shared/templates";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { protoRecords } from "../../shared/test/fixtures/protoBook.ts";
import { readXlsx } from "./helpers/xlsxRead.ts";

const TI = PrintOptions.parse({ formSet: "ti" });
const book = async () => readBook(new MemoryWorkbook(aov1Records() as any));
const bundle = async () => buildBundle(await book(), AOV1, defaultImportant()).bundle!;
const flat = (s: string) => s.replace(/\s+/g, " ");
const has = (text: string, v: string | number) => assert.ok(flat(text).includes(flat(String(v))), String(v));

test("у каждой встроенной формы PDF есть форма Excel", () => {
  for (const [kind, forms] of Object.entries(ACT_DOC_RENDER))
    for (const f of Object.keys(forms)) assert.ok((ACT_DOC_XLSX as any)[kind][f], `${kind}/${f}`);
});

test("доли → столбцы сетки: сумма равна сетке, каждой графе не меньше одного", () => {
  assert.deepEqual(gridSpans([6, 42, 20, 8, 8, 16], 36), [2, 15, 7, 3, 3, 6]);
  const s = gridSpans([1, 1, 98], 10);
  assert.equal(s.reduce((a, b) => a + b, 0), 10);
  assert.ok(s.every((x) => x >= 1));
});

test("ВД «ТИ»: шапка (подрядчик, заказчик, дата), строки, подписи пяти ролей", async () => {
  const b = await bundle();
  const d = tiDocData(b);
  const { xlsx, name } = renderActXlsx(b, "vd", TI);
  assert.equal(name, `${d.vdNumber}.xlsx`);
  const s = readXlsx(xlsx).sheets[0];
  for (const v of [d.header.contractor, d.header.customer, "(подрядная организация)", "(заказчик)", `ВЕДОМОСТЬ № ${d.vdNumber}`]) has(s.text, v);
  for (const r of d.vd) has(s.text, r.name);
  assert.equal((s.text.match(/\(фамилия, инициалы, подпись\)/g) ?? []).length, d.signs.reduce((n, x) => n + x.names.length, 0));
});

test("РМ «ТИ»: документы (серые) перед материалом, материал — один раз", async () => {
  const b = await bundle();
  const d = tiDocData(b);
  const x = readXlsx(renderActXlsx(b, "rim", TI).xlsx);
  const s = x.sheets[0];
  for (const g of d.rm) {
    const iDoc = s.rows.findIndex((r) => r.includes(g.docs[0].type) && r.includes(g.docs[0].number));
    const iMat = s.rows.findIndex((r, k) => k > iDoc && r.startsWith(`${g.items[0].n}. `));
    assert.ok(iDoc >= 0 && iMat > iDoc, `${g.docs[0].number} → ${g.items[0].name}`);
  }
  assert.match(x.styles, /FFD9D9D9/);
});

test("РП «ТИ» и кабельный журнал «ТИ»: строки, итоги, «Сдал/Принял»", async () => {
  const b = await bundle();
  const d = tiDocData(b);
  const rp = readXlsx(renderActXlsx(b, "rp", TI).xlsx).sheets[0];
  for (const r of d.rp) has(rp.text, r.number);
  const cb = buildCableBundle(await book(), AOV1, defaultImportant(), "kj", { set: "ti" }).bundle!;
  const kj = readXlsx(renderActXlsx(cb, "kj", TI).xlsx).sheets[0];
  for (const t of ["Кабельный журнал №", "Итого всего", "с учетом кф запаса", "Сдал:", "Принял:", "Подпись", "Дата"]) has(kj.text, t);
  assert.match(kj.xml, /orientation="landscape"/);
});

test("протоколы и акты комиссии: заголовок, таблица по описанию, подписи; имя — как у PDF", async () => {
  const pb = await readBook(new MemoryWorkbook(protoRecords() as any));
  const lab = buildProtoBundle(pb, "ПАВ-1", defaultImportant()).bundle!;
  const l = renderBundleXlsx(lab, lab.proto!.kind);
  assert.equal(l.name, `${lab.proto!.code} №ПАВ-1.xlsx`);
  const ls = readXlsx(l.xlsx).sheets[0];
  has(ls.text, "Протокол №ПАВ-1");
  for (const r of lab.proto!.rows) for (const v of Object.values(r)) if (v) has(ls.text, v);
  for (const i of lab.proto!.instruments) has(ls.text, i.serial);
  has(ls.text, "Руководитель электролаборатории:");
  const com = buildProtoBundle(pb, "АИИ-1", defaultImportant()).bundle!;
  const cs = readXlsx(renderBundleXlsx(com, com.proto!.kind).xlsx).sheets[0];
  has(cs.text, "АКТ №АИИ-1");
  has(cs.text, "Подписи членов комиссии:");
  for (const m of com.proto!.commission) has(cs.text, m.name);
});

test("ни в одном документе объединения не пересекаются (иначе Excel сообщает об ошибке в файле)", async () => {
  const b = await bundle();
  const cells = (ref: string) => {
    const [a, z = a] = ref.split(":");
    const p = (x: string) => { const m = /^([A-Z]+)(\d+)$/.exec(x)!; return [[...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0), Number(m[2])]; };
    const [c1, r1] = p(a), [c2, r2] = p(z);
    const out: string[] = [];
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(`${r}:${c}`);
    return out;
  };
  const files: [string, Buffer][] = [];
  for (const set of ["sbd", "ti"] as const) {
    const o = PrintOptions.parse({ formSet: set });
    for (const kind of Object.keys(ACT_DOC_XLSX)) {
      const bb = kind === "kj" || kind === "ip" ? buildCableBundle(await book(), AOV1, defaultImportant(), kind, { set }).bundle! : b;
      try { files.push([`${set}/${kind}`, renderActXlsx(bb, kind as any, o).xlsx]); } catch { /* формы нет в наборе */ }
    }
  }
  const pb = await readBook(new MemoryWorkbook(protoRecords() as any));
  for (const n of ["ПАВ-1", "ПКЛ-1", "АИИ-1"]) {
    const pbb = buildProtoBundle(pb, n, defaultImportant()).bundle!;
    files.push([n, renderBundleXlsx(pbb, pbb.proto!.kind).xlsx]);
  }
  assert.ok(files.length >= 13);
  for (const [name, buf] of files) {
    const seen = new Set<string>();
    for (const m of readXlsx(buf).sheets[0].merges) for (const c of cells(m)) {
      assert.ok(!seen.has(c), `${name}: ${m}`);
      seen.add(c);
    }
  }
});
