// План 14, задача 1: встроенный шаблон «ТИ» на сервере.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TemplateStore } from "@idk/server/forms/store";
import { tmpDir } from "./helpers/tmp.ts";

test("список: СБД, ТИ, свои; «ТИ» читается и не меняется; копия «ТИ» — свой шаблон с набором ТИ", () => {
  const s = new TemplateStore(tmpDir());
  const own = s.create("Мой");
  assert.deepEqual(s.list().map((t) => t.id), ["sbd", "ti", own.id]);
  assert.equal(s.get("ti").print.formSet, "ti");
  assert.throws(() => s.save("ti", { name: "ТИ", docs: [] }), /не меняется/);
  assert.throws(() => s.remove("ti"), /не удаляется/);
  const copy = s.create("ТИ (копия)", "ti");
  assert.equal(copy.print.formSet, "ti");
  assert.deepEqual(copy.docs.map((d) => d.kind === "builtin" && d.doc), ["aosr", "rim", "rp", "vd", "kj", "ip"]);
});
