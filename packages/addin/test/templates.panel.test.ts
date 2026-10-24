// План 11: панель — кнопки печати по шаблону, неизвестный шаблон, ширина панели.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_SBD, type UserTemplate } from "@idk/shared/forms/template";
import { templateButtons, resolveTemplate } from "@idk/addin/panel/templatesApi";
import { restoreWidth, trackWidth, WIDTH_KEY } from "@idk/addin/panel/panelWidth";

const form = { file: "x.docx", type: "docx" as const, original: "x.docx" };
const tpl: UserTemplate = { id: "t-1", name: "ПИК", docs: [
  { kind: "builtin", doc: "aosr", form },
  { kind: "custom", code: "АГИ", name: "Акт гидр. испытаний", form },
  { kind: "custom", code: "ЧЕР", name: "Черновик", form: null },
] };

test("кнопки печати по шаблону", () => {
  assert.deepEqual(templateButtons(BUILTIN_SBD).map((b) => b.label), ["АОСР", "РИМ", "ВД", "ВОР", "АВК", "КЖ", "Протокол"]);
  assert.deepEqual(templateButtons(tpl), [
    { key: "aosr", label: "АОСР", doc: "aosr", code: null, form: true },
    { key: "АГИ", label: "Акт гидр. испытаний", doc: null, code: "АГИ", form: true },
  ], "свой документ без формы не печатается");
});

test("неизвестный шаблон книги — «СБД» с предупреждением", () => {
  assert.deepEqual(resolveTemplate([BUILTIN_SBD, tpl], "t-1"), { template: tpl, warning: null });
  assert.deepEqual(resolveTemplate([BUILTIN_SBD], "t-x"),
    { template: BUILTIN_SBD, warning: "Шаблон «t-x» не найден на этом компьютере — печать по «СБД»" });
});

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m } as unknown as Storage & { m: Map<string, string> };
};

test("восстановление ширины панели", () => {
  const calls: number[] = [];
  const office = (supported: boolean) => ({
    context: { requirements: { isSetSupported: (n: string, v: string) => supported && n === "TaskPaneApi" && v === "1.1" } },
    extensionLifeCycle: { taskpane: { setWidth: (w: number) => calls.push(w) } },
  });
  restoreWidth(office(true), store({ [WIDTH_KEY]: "420" }));
  restoreWidth(office(false), store({ [WIDTH_KEY]: "500" }));
  restoreWidth(office(true), store());
  restoreWidth(office(true), { getItem: () => { throw new Error("SecurityError"); } } as unknown as Storage);
  assert.deepEqual(calls, [420]);
});

test("ширина сохраняется через 500 мс после изменения размера; узкая не сохраняется", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const s = store();
  const listeners: (() => void)[] = [];
  const win = { innerWidth: 300, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener() {} } as unknown as Window;
  const stop = trackWidth(win, s);
  (win as any).innerWidth = 380; listeners[0]();
  (win as any).innerWidth = 410; listeners[0]();
  mock.timers.tick(499);
  assert.equal(s.m.get(WIDTH_KEY), undefined);
  mock.timers.tick(1);
  assert.equal(s.m.get(WIDTH_KEY), "410");
  (win as any).innerWidth = 150; listeners[0]();
  mock.timers.tick(500);
  assert.equal(s.m.get(WIDTH_KEY), "410");
  stop();
  mock.timers.reset();
});
