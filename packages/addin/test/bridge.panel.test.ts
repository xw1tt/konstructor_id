// 0.36: слой книги окна (RemotePort) через исполнителя панели (bridgeLink.executor) даёт то же, что ExcelPort:
// вызовы проходят через JSON, как на самом деле (окно → сервер → панель).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeExcel } from "./helpers/fakeExcel.ts";
import { ExcelPort } from "@idk/addin/book/excelPort";
import { executor } from "@idk/addin/book/bridgeLink";
import { RemotePort, WindowEvents, type Caller } from "@idk/addin/book/remotePort";
import { BRIDGE_METHODS } from "@idk/shared/bridge";
import { defaultImportant } from "@idk/shared/workbook/important";

const json = <T>(v: T): T => (v === undefined ? (null as T) : JSON.parse(JSON.stringify(v)));

function linked() {
  const wb = installFakeExcel();
  wb.addSheet("Лист1");
  const port = new ExcelPort();
  const exec = executor(port);
  const calls: string[] = [];
  const caller: Caller = async (method, args) => {
    calls.push(method);
    return json(await exec[method](...json(args)));
  };
  const events = new WindowEvents();
  return { wb, port, remote: new RemotePort(events, caller), calls, events };
}

test("у каждого метода протокола есть исполнитель в панели", () => {
  const exec = executor(new ExcelPort());
  for (const m of BRIDGE_METHODS) assert.equal(typeof exec[m], "function", m);
});

test("окно размечает книгу, пишет и читает строки через панель", async () => {
  const { wb, remote, port } = linked();
  const created = await remote.ensureBook(defaultImportant());
  assert.ok(created.includes("Акты"));
  const at = await remote.insert("Материалы", 0, [{ Наименование: "Кабель" }, { Наименование: "Труба" }]);
  await remote.write("Материалы", at + 1, { Марка: "ПНД 32" });
  const rows = wb.rowsOf("Материалы");
  assert.deepEqual(
    rows.map((r) => r["Наименование"]),
    ["Кабель", "Труба"],
  );
  assert.equal(rows[1]["Марка"], "ПНД 32");
  // readMany возвращает Map, как ExcelPort (через JSON — парами).
  const many = await remote.readMany(["Материалы", "Акты"]);
  assert.ok(many instanceof Map);
  assert.deepEqual(many.get("Материалы"), await port.read("Материалы"));
  assert.equal(await remote.isVirtual("Спецификация"), true);
  await remote.setSetting("idk.test", "1");
  assert.equal(await remote.setting("idk.test"), "1");
});

test("активная ячейка: функция выполняется в окне, запись — отдельным вызовом", async () => {
  const calls: [string, unknown[]][] = [];
  let cell: unknown = "ГОСТ 1";
  const caller: Caller = async (m, a) => {
    calls.push([m, a]);
    if (m === "activeCell") return cell;
    if (m === "setActiveCell") {
      cell = a[0];
      return { written: true };
    }
    throw new Error(m);
  };
  const remote = new RemotePort(new WindowEvents(), caller);
  assert.deepEqual(await remote.writeActiveCell(() => null), { written: false });
  assert.deepEqual(await remote.writeActiveCell((cur) => `${cur}; СП 2`), { written: true });
  assert.equal(cell, "ГОСТ 1; СП 2");
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["activeCell", "activeCell", "setActiveCell"],
  );
});

test("события книги из потока окна доходят до подписчиков RemotePort", async () => {
  const { remote, events } = linked();
  const got: unknown[] = [];
  const off = await remote.onChange((e) => got.push(e));
  let sel = 0;
  await remote.onSelection(() => sel++);
  events.change.forEach((f) => f({ table: "Акты", row: 0, column: "Номер", before: 1, after: 2, multi: false }));
  events.selection.forEach((f) => f());
  await off();
  events.change.forEach((f) => f({ table: "Акты", row: 1, column: "Номер", before: 1, after: 2, multi: false }));
  assert.equal(got.length, 1);
  assert.equal(sel, 1);
});
