// План 20: наборы инструментов помощника — справочник (задача 1), формы (задача 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import type { UserCatalog } from "@idk/shared/catalog/model";
import type { ChatReply } from "@idk/shared/ai/model";
import { AssistantSession, type AskContext } from "@idk/addin/panel/assistant";
import { catalogKit } from "@idk/addin/panel/kits";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const reply = (content: string, calls: { name: string; arguments: Record<string, unknown> }[] = []): ChatReply =>
  ({ message: { role: "assistant", content, toolCalls: calls.map((c, i) => ({ id: `c${i}`, ...c })) }, usage: { prompt: 1, completion: 1 }, provider: "Тест" });

test("справочник: предложение → применить (дополнения объединены) → отменить (прежние)", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const prev: UserCatalog = { docs: [{ code: "ДОП", name: "Прежний документ", clause344: 13, source: "", make: "scan", scope: "act" }], sections: [], hidden: [] };
  let user = structuredClone(prev);
  let changed = 0;
  const kit = catalogKit({ user: async () => structuredClone(user), save: async (u) => { user = structuredClone(u); return u; } }, () => changed++);
  const queue: ChatReply[] = [
    reply("", [{ name: "propose_catalog", arguments: { works: [{ section: BUILTIN_CATALOG.sections[0].code, code: "ДОП-1", name: "Новый вид", docs: ["ДОП"] }] } },
      { name: "propose_catalog", arguments: { docs: [{ code: "ДОП", name: "повтор", clause344: 1, make: "scan", scope: "act" }] } }]),
    reply("Предлагаю новый вид работ."),
  ];
  const s = new AssistantSession({ store: wb, chat: async () => queue.shift()!, kits: [kit] });
  const ctx: AskContext = { book: await readBook(wb), important: defaultImportant(), catalog: null, template: BUILTIN_SBD, masked: false,
    prompt: { today: "25.10.2026", sheet: "База актов", table: "Акты", row: 0, act: AOV1 } };
  await s.ask("Добавь вид работ", ctx);
  assert.equal(s.pending.length, 1, "повтор кода отклонён");
  assert.match(s.pending[0].lines[0], /ДОП-1 — Новый вид; документы: ДОП/);
  assert.match(String(s.history.find((m) => m.role === "tool" && String(m.content).includes("уже есть"))?.content), /уже есть/);
  await s.apply([1]);
  assert.deepEqual(user.docs.map((d) => d.code), ["ДОП"]);
  assert.equal(user.sections[0].works[0].code, "ДОП-1");
  assert.equal(changed, 1);
  await s.revert();
  assert.deepEqual(user, prev);
  assert.equal(changed, 2);
});

import { FormKit, type FormApi } from "@idk/addin/panel/kits";

test("формы: без файла — ошибка; read_form → места, текст, поля; propose_form — проверки; применение → пары на сервере", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const calls: string[] = [];
  const api: FormApi = {
    markup: async (id) => { calls.push(`markup ${id}`); return { token: "T1", type: "docx", found: 5, ambiguous: [{ id: 3, text: "28.07.2026", context: "Дата 28.07.2026", options: ["Акт.Дата", "Акт.Окончание"], chosen: "Акт.Дата" }] }; },
    text: async () => ({ text: "АКТ № {Акт.Номер АОСР}\nУчасток: Подземная часть\nДата {Акт.Дата#3}" }),
    fields: async () => ({ values: { "Объект.Раздел": "Подземная часть", "Акт.Номер": AOV1 }, lists: {} }),
    pairs: async (_id, token, reps) => { calls.push(`pairs ${token} ${reps.map((r) => r.field).join(",")}`); return { applied: reps.length, missing: [] }; },
  };
  let ready = 0;
  const kit = new FormKit({ api, templateId: () => "t-1", act: () => AOV1, onReady: () => ready++ });
  const queue: ChatReply[] = [
    reply("", [{ name: "read_form", arguments: {} }]),
    reply("Приложите файл."),
  ];
  const s = new AssistantSession({ store: wb, chat: async () => queue.shift()!, kits: [kit] });
  const ctx: AskContext = { book: await readBook(wb), important: defaultImportant(), catalog: null, template: BUILTIN_SBD, masked: false,
    prompt: { today: "25.10.2026", sheet: "База актов", table: "Акты", row: 0, act: AOV1 } };
  await s.ask("Сделай форму", ctx);
  assert.match(String(s.history.find((m) => m.role === "tool")?.content), /не приложил файл/);

  kit.attach({ name: "акт заказчика.docx", base64: "AAAA" });
  assert.equal(ready, 1, "вложение — тоже изменение для экрана");
  ready = 0;
  queue.push(
    reply("", [{ name: "read_form", arguments: {} }]),
    reply("", [{ name: "propose_form", arguments: { choices: { "3": "Акт.Цвет" } } }]),
    reply("", [{ name: "propose_form", arguments: { replacements: [{ text: "Нет в тексте", field: "Объект.Раздел" }] } }]),
    reply("", [{ name: "propose_form", arguments: { choices: { "3": "Акт.Окончание" }, replacements: [{ text: "Подземная часть", field: "{Объект.Раздел}" }] } }]),
    reply("Готово, проверьте."),
  );
  await s.ask("Вот файл", ctx);
  const tools = s.history.filter((m) => m.role === "tool").map((m) => String(m.content));
  assert.match(tools.at(-4)!, /"found":5/);
  assert.match(tools.at(-4)!, /listFields/);
  assert.match(tools.at(-3)!, /можно выбрать только: Акт\.Дата, Акт\.Окончание/);
  assert.match(tools.at(-2)!, /нет в документе/);
  assert.equal(s.pending.length, 1);
  assert.deepEqual(s.pending[0].lines, ["Форма «акт заказчика.docx»:", "«28.07.2026» → {Акт.Окончание}", "«Подземная часть» → {Объект.Раздел}"]);
  await s.apply([1]);
  assert.deepEqual(calls, ["markup t-1", "pairs T1 Объект.Раздел"]);
  assert.deepEqual(kit.ready, { name: "акт заказчика.docx", token: "T1", type: "docx", choices: { "3": "Акт.Окончание" }, missing: [] });
  assert.equal(ready, 1);
  await s.revert();
  assert.equal(kit.ready, null);
});
