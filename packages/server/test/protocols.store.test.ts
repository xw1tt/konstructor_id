// План 13, задача 4: шаблон плана 12 на диске читается переведённым на встроенную печать протоколов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TemplateStore } from "@idk/server/forms/store";
import { tmpDir } from "./helpers/tmp.ts";

test("get и list: свой «ПАВ»-скан плана 12 → встроенный pav", () => {
  const dir = tmpDir();
  const id = "t-00000000-0000-0000-0000-000000000001";
  mkdirSync(join(dir, "templates", id), { recursive: true });
  writeFileSync(join(dir, "templates", id, "template.json"), JSON.stringify({
    id, name: "Старый", docs: [{ kind: "custom", code: "ПАВ", name: "Протокол", form: null, catalog: "ПАВ", scope: "kit", scan: true }],
  }));
  const store = new TemplateStore(dir);
  assert.deepEqual(store.get(id).docs, [{ kind: "builtin", doc: "pav", form: null, catalog: "ПАВ" }]);
  assert.deepEqual(store.list().find((t) => t.id === id)!.docs, [{ kind: "builtin", doc: "pav", form: null, catalog: "ПАВ" }]);
});
