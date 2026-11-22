// 0.49: действия программы для помощника — предложения комплекта применяются по порядку и отменяются.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import { PrintOptions } from "@idk/shared/templates";
import { kitActs } from "@idk/shared/kit/registry";
import type { ChatReply } from "@idk/shared/ai/model";
import { AssistantSession, type AskContext } from "@idk/addin/panel/assistant";
import { actionsKit } from "@idk/addin/panel/actionsKit";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const reply = (content: string, calls: { name: string; arguments: Record<string, unknown> }[] = []): ChatReply => ({
  message: { role: "assistant", content, toolCalls: calls.map((c, i) => ({ id: `c${i}`, ...c })) },
  usage: { prompt: 1, completion: 1 },
  provider: "Тест",
});

test("помощник: создать комплект и задать состав → применить → отменить", async () => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  const port = Object.assign(wb, { isFiltered: async () => false, clearFilters: async () => undefined }) as any;
  const reports: string[] = [];
  const box: { s?: AssistantSession } = {};
  const kit = actionsKit({
    port,
    important: defaultImportant,
    code: () => "sbd" as any,
    options: () => PrintOptions.parse({}),
    template: () => BUILTIN_SBD,
    open: () => undefined,
    report: (t) => {
      reports.push(t);
      box.s?.report(t);
    },
    refresh: () => undefined,
  });
  const queue: ChatReply[] = [
    reply("", [{ name: "list_kits", arguments: {} }]),
    reply("", [
      { name: "propose_action", arguments: { action: "set_kit_acts", kit: "77", acts: [AOV1] } },
      { name: "propose_action", arguments: { action: "create_kit", number: "77", volume: "2" } },
      { name: "propose_action", arguments: { action: "set_kit_acts", kit: "77", acts: [AOV1, "нет-такого"] } },
    ]),
    reply("", [{ name: "propose_action", arguments: { action: "set_kit_acts", kit: "77", acts: [AOV1] } }]),
    reply("Предлагаю создать комплект 77 и положить в него акт."),
  ];
  const s = new AssistantSession({
    store: wb,
    chat: async () => queue.shift()!,
    kits: [kit],
    maxSteps: () => 30,
  });
  box.s = s;
  const before = await readBook(wb);
  const ctx: AskContext = {
    book: before,
    important: defaultImportant(),
    catalog: null,
    template: BUILTIN_SBD,
    masked: false,
    prompt: { today: "22.11.2026", act: AOV1 },
  };
  await s.ask("Собери комплект 77 из акта", ctx);
  assert.equal(s.pending.length, 2, "создание и верный состав");
  const tools = s.history
    .filter((m) => m.role === "tool")
    .map((m) => String(m.content))
    .join("\n");
  assert.match(tools, /Нет комплекта «77»/);
  assert.match(tools, /Нет актов: нет-такого/);
  assert.deepEqual(
    s.pending.map((p) => (p.change.kind === "action" ? p.change.action : "")),
    ["create_kit", "set_kit_acts"],
  );
  await s.apply(s.pending.map((p) => p.id));
  const after = await readBook(wb);
  assert.deepEqual(kitActs(after, "77").acts, [AOV1]);
  assert.equal(kitActs(after, "77").kitRow?.v.volume, "2");
  assert.ok(reports.some((r) => /Создан комплект 77/.test(r)));
  assert.match(String(s.history.at(-2)!.content), /Состав комплекта 77 записан/);
  await s.revert();
  const back = await readBook(wb);
  assert.deepEqual(kitActs(back, "77").acts, []);
  assert.equal(kitActs(back, "77").kitRow, undefined);
});
