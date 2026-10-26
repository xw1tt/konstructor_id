// Помощник меняет бланки шаблона: get_blanks → propose_blank (+ настройки печати) → одно предложение → применить → отменить.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_TI, UserTemplate } from "@idk/shared/forms/template";
import type { ChatReply } from "@idk/shared/ai/model";
import { AssistantSession, type AskContext } from "@idk/addin/panel/assistant";
import { templateKit, type TemplateApi } from "@idk/addin/panel/kits";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const reply = (content: string, calls: { name: string; arguments: Record<string, unknown> }[] = []): ChatReply =>
  ({ message: { role: "assistant", content, toolCalls: calls.map((c, i) => ({ id: `c${i}`, ...c })) }, usage: { prompt: 1, completion: 1 }, provider: "Тест" });

function fakeApi(list: UserTemplate[]) {
  const log: string[] = [];
  let chosen = list[0].id;
  const api: TemplateApi = {
    list: async () => structuredClone(list),
    save: async (t) => { const i = list.findIndex((x) => x.id === t.id); list[i] = structuredClone(t); log.push(`save ${t.id}`); return t; },
    create: async (name, from) => { const src = list.find((x) => x.id === from)!; const t = { ...structuredClone(src), id: `t-${list.length + 1}`, name }; list.push(t); log.push(`create ${t.id}`); return t; },
    remove: async (id) => { list.splice(list.findIndex((x) => x.id === id), 1); log.push(`remove ${id}`); },
    choose: async (id) => { chosen = id; log.push(`choose ${id}`); },
  };
  return { api, log, chosen: () => chosen };
}

const ask = async (template: UserTemplate, api: TemplateApi, queue: ChatReply[]) => {
  const wb = new MemoryWorkbook(aov1Records() as any);
  let changed = 0;
  const s = new AssistantSession({ store: wb, chat: async () => queue.shift()!, kits: [templateKit(api, () => changed++)] });
  const ctx: AskContext = { book: await readBook(wb), important: defaultImportant(), catalog: null, template, masked: false,
    prompt: { today: "26.10.2026", sheet: "База актов", table: "Акты", row: 0, act: AOV1 } };
  await s.ask("Для шаблона «Камчатка» убери из КЖ строку запаса и способы прокладки", ctx);
  return { s, changed: () => changed };
};

test("«Камчатка»: КЖ без способов прокладки и запаса — одно предложение; применить — шаблон сохранён, отменить — прежний", async () => {
  const kam = UserTemplate.parse({ id: "t-1", name: "Камчатка", docs: BUILTIN_TI.docs, print: { formSet: "ti" } });
  const { api, log } = fakeApi([kam]);
  const { s, changed } = await ask(kam, api, [
    reply("", [{ name: "get_blanks", arguments: { doc: "КЖ" } }]),
    reply("", [{ name: "propose_blank", arguments: { doc: "КЖ", hide: ["Лоток, м", "Труба гладкая, м", "Труба гофрированная, м"] } },
      { name: "propose_blank", arguments: { doc: "Кабельный журнал", hide: ["строка с коэффициентом запаса 2%"] } }]),
    reply("Предлагаю изменить бланк кабельного журнала."),
  ]);
  const tool = s.history.find((m) => m.role === "tool" && String(m.content).includes("Кабельный журнал (ТИ)"));
  assert.ok(tool, "get_blanks вернул бланк КЖ «ТИ»");
  assert.equal(s.pending.length, 1, "два вызова — одно предложение");
  assert.match(s.pending[0].lines.join("\n"), /без графы «Лоток»; без графы «Труба гладкая»; без графы «Труба гофрированная»/);
  assert.match(s.pending[0].lines.join("\n"), /без «Строка «с учетом кф запаса»»/);
  await s.apply([1]);
  const saved = (await api.list())[0];
  assert.deepEqual(saved.print.blanks["kj:ti"].hide, ["tray", "smooth", "corrugated", "reserve"]);
  assert.equal(changed(), 1);
  await s.revert();
  assert.deepEqual((await api.list())[0].print.blanks, {});
  assert.deepEqual(log, ["save t-1", "save t-1"]);
});

test("встроенный шаблон «ТИ»: применение — копия с настройкой выбрана для книги; отмена — прежний шаблон, копия удалена", async () => {
  const ti = structuredClone(BUILTIN_TI);
  const { api, log, chosen } = fakeApi([ti]);
  const { s } = await ask(ti, api, [
    reply("", [{ name: "propose_blank", arguments: { doc: "КЖ", hide: ["Лоток"] } }]),
    reply("Предлагаю."),
  ]);
  assert.match(s.pending[0].lines.join("\n"), /будет создана копия «ТИ \(копия\)»/);
  await s.apply([1]);
  assert.equal(chosen(), "t-2");
  assert.deepEqual((await api.list()).find((t) => t.id === "t-2")!.print.blanks["kj:ti"].hide, ["tray"]);
  await s.revert();
  assert.equal(chosen(), "ti");
  assert.deepEqual(log, ["create t-2", "save t-2", "choose t-2", "choose ti", "remove t-2"]);
});

test("ошибка проверки возвращается модели, предложения нет", async () => {
  const kam = UserTemplate.parse({ id: "t-1", name: "Камчатка", docs: BUILTIN_TI.docs, print: { formSet: "ti" } });
  const { api } = fakeApi([kam]);
  const { s } = await ask(kam, api, [reply("", [{ name: "propose_blank", arguments: { doc: "КЖ", hide: ["Обозначение кабеля, провода"] } }]), reply("Нельзя.")]);
  assert.equal(s.pending.length, 0);
  assert.ok(s.history.some((m) => m.role === "tool" && /скрыть нельзя/.test(String(m.content))));
});
