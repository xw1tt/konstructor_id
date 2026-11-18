// 0.31: поток ответа помощника в сессии панели — текст по кускам, итог без дубля, «Остановить», обрыв.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { defaultImportant } from "@idk/shared/workbook/important";
import { BUILTIN_SBD } from "@idk/shared/forms/template";
import { StreamStopped, type ChatMessage, type ChatReply, type StreamHooks, type ToolDef } from "@idk/shared/ai/model";
import { AssistantSession, type AskContext } from "@idk/addin/panel/assistant";
import { aov1Records, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";

const wb = () => new MemoryWorkbook(aov1Records() as any);
const ctx = async (w: MemoryWorkbook): Promise<AskContext> => ({
  book: await readBook(w),
  important: defaultImportant(),
  catalog: null,
  template: BUILTIN_SBD,
  masked: false,
  prompt: { today: "18.11.2026", sheet: "База актов", table: "Акты", row: 0, act: AOV1 },
});
const reply = (content: string): ChatReply => ({ message: { role: "assistant", content, toolCalls: [] }, usage: { prompt: 1, completion: 1 }, provider: "Т" });
type Stream = (m: ChatMessage[], t: ToolDef[], h: StreamHooks, signal?: AbortSignal) => Promise<ChatReply>;

test("текст появляется по кускам в одном сообщении; по окончании — без дубля, generating сбрасывается", async () => {
  const w = wb();
  const snapshots: string[] = [];
  const chatStream: Stream = async (_m, _t, h) => {
    for (const p of ["Акт ", "в ", "порядке."]) h.onToken(p);
    return reply("Акт в порядке.");
  };
  const s = new AssistantSession({ store: w, chat: async () => assert.fail("нужен поток"), chatStream });
  await s.ask("Проверь", await ctx(w), () => snapshots.push(s.items.map((i) => `${i.kind}:${i.text}${i.live ? "…" : ""}`).join("|")));
  assert.deepEqual(snapshots.slice(1, 4), ["user:Проверь|assistant:Акт …", "user:Проверь|assistant:Акт в …", "user:Проверь|assistant:Акт в порядке.…"]);
  assert.deepEqual(
    s.items.map((i) => [i.kind, i.text, Boolean(i.live)]),
    [
      ["user", "Проверь", false],
      ["assistant", "Акт в порядке.", false],
    ],
  );
  assert.equal(s.generating, false);
});

test("«Остановить»: запрос прерывается, полученная часть остаётся в чате и в истории; следующий вопрос — как обычно", async () => {
  const w = wb();
  let seenSignal: AbortSignal | undefined;
  const chatStream: Stream = (_m, _t, h, signal) =>
    new Promise((_res, rej) => {
      seenSignal = signal;
      h.onToken("Начинаю проверку");
      signal!.addEventListener("abort", () => rej(new StreamStopped("Начинаю проверку", true, "Ответ остановлен")));
    });
  const s = new AssistantSession({ store: w, chat: async () => reply("Готово."), chatStream });
  const asked = s.ask("Проверь", await ctx(w));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(s.generating, true, "во время генерации — можно остановить");
  s.stop();
  await asked;
  assert.equal(seenSignal!.aborted, true);
  assert.equal(s.generating, false);
  assert.deepEqual(
    s.items.map((i) => [i.kind, i.text, i.cut]),
    [
      ["user", "Проверь", undefined],
      ["assistant", "Начинаю проверку", "stopped"],
    ],
  );
  assert.deepEqual(
    s.history.slice(-2).map((m) => [m.role, m.content]),
    [
      ["user", "Проверь"],
      ["assistant", "Начинаю проверку"],
    ],
  );
});

test("обрыв связи посреди ответа — часть с пометкой «ответ прерван» и пояснение, без необработанной ошибки", async () => {
  const w = wb();
  const chatStream: Stream = async (_m, _t, h) => {
    h.onToken("Часть");
    throw new StreamStopped("Часть", false, "Ответ прерван: связь с сервером оборвалась");
  };
  const s = new AssistantSession({ store: w, chat: async () => reply(""), chatStream });
  await s.ask("Вопрос", await ctx(w));
  assert.deepEqual(
    s.items.map((i) => [i.kind, i.text, i.cut]),
    [
      ["user", "Вопрос", undefined],
      ["assistant", "Часть", "interrupted"],
      ["note", "Ответ прерван: связь с сервером оборвалась", undefined],
    ],
  );
});

test("ошибка подключения (все попытки) — сообщение об ошибке, вопрос не остаётся в истории, разговор продолжается", async () => {
  const w = wb();
  let n = 0;
  const chatStream: Stream = async () => {
    if (n++ === 0) throw new Error("YandexGPT: нет связи (ECONNREFUSED) (попыток: 3)");
    return reply("Отвечаю.");
  };
  const s = new AssistantSession({ store: w, chat: async () => reply(""), chatStream });
  await s.ask("Первый", await ctx(w));
  assert.equal(s.items.at(-1)!.kind, "error");
  assert.match(s.items.at(-1)!.text, /попыток: 3/);
  assert.equal(s.history.filter((m) => m.role === "user").length, 0);
  await s.ask("Второй", await ctx(w));
  assert.equal(s.items.at(-1)!.text, "Отвечаю.");
});
