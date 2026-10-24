// План 11: zip — запись и чтение.
import { test } from "node:test";
import assert from "node:assert/strict";
import { openZip, writeZip, ZipError } from "@idk/server/zip/zip";

test("запись и чтение: имена UTF-8, порядок, повторная запись", () => {
  const z = writeZip([["a.txt", "Привет"], ["b/c.xml", Buffer.from("<x/>")]]);
  const m = openZip(z);
  assert.deepEqual([...m.keys()], ["a.txt", "b/c.xml"]);
  assert.equal(m.get("a.txt")!().toString("utf8"), "Привет");
  const again = openZip(writeZip([...m].map(([k, get]) => [k, get()])));
  assert.equal(again.get("b/c.xml")!().toString(), "<x/>");
});

test("не zip — ZipError", () => {
  assert.throws(() => openZip(new TextEncoder().encode("%PDF-1.4")), ZipError);
});
