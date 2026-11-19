// 0.34: роли помощника — задания «Проверка как технадзор» и «Черновики актов из РД».
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASSISTANT_ROLES, RD_LIMIT } from "@idk/shared/ai/roles";

const role = (id: string) => ASSISTANT_ROLES.find((r) => r.id === id)!;

test("технадзор: акт под курсором или все акты; задание с пунктами проверки и правилом предложений", () => {
  const one = role("tehnadzor").build({ act: "АОВ1-1", acts: ["АОВ1-1", "АОВ1-2"] });
  assert.equal(one.display, "Проверка как технадзор: акт АОВ1-1");
  assert.match(one.text, /технадзор/);
  assert.match(one.text, /check_act/);
  assert.match(one.text, /п\.3 — у каждого материала есть документ качества/);
  assert.match(one.text, /Проверь акт АОВ1-1\.$/);
  const all = role("tehnadzor").build({ act: null, acts: Array.from({ length: 20 }, (_, i) => `А-${i + 1}`) });
  assert.equal(all.display, "Проверка как технадзор: все акты (20)");
  assert.match(all.text, /первые 15 из 20: А-1, .*А-15\)\.$/);
});

test("черновики из РД: текст РД в задании, длинный — обрезается с пометкой", () => {
  const r = role("rd-drafts");
  assert.ok(r.needsRd);
  const short = r.build({ act: null, acts: [], rd: { name: "ЭМ.pdf", text: "Спецификация: кабель ВВГнг 3х2,5 — 120 м", pages: 3 } });
  assert.equal(short.display, "Черновики актов из РД: ЭМ.pdf");
  assert.match(short.text, /Текст РД «ЭМ\.pdf» \(страниц: 3\):\n<<<\nСпецификация: кабель ВВГнг 3х2,5 — 120 м\n>>>$/);
  assert.match(short.text, /propose_add_rows/);
  const long = r.build({ act: null, acts: [], rd: { name: "big.docx", text: "х".repeat(RD_LIMIT + 500) } });
  assert.match(long.text, new RegExp(`первые ${RD_LIMIT} знаков`));
  assert.ok(!long.text.includes("х".repeat(RD_LIMIT + 1)));
});
