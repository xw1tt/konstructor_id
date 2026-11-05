// 0.30: подписанты, выбранные на акте, заменяют подписантов роли по датам — в пакете акта, проверке и ОЖР.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { isoToExcelSerial } from "@idk/shared/workbook/values";
import { actRepresentatives } from "@idk/shared/acts/actSigners";
import { activeRepresentatives } from "@idk/shared/rules";
import { ojrRows } from "@idk/shared/ojr";
import { checkActs } from "@idk/shared/check/predelivery";
import { aov1Records, AOV1 } from "./fixtures/aov1Book.ts";

const d = isoToExcelSerial;
const rep = (role: any, fullName: string, validFrom: string | null = null, validTo: string | null = null) => ({ role, fullName, validFrom, validTo });

test("без выбора — как было; выбранный по роли заменяет остальных и подписывает без срока", () => {
  const reps = [rep("builder", "Аксенов А.М."), rep("builder", "Петров П.П.", "2026-08-01"), rep("performer", "Королев Д.М.")];
  assert.deepEqual(actRepresentatives(reps, [], "2026-07-28"), reps);
  const r = actRepresentatives(reps, ["Петров П.П."], "2026-07-28");
  assert.deepEqual(r.map((x) => x.fullName), ["Петров П.П.", "Королев Д.М."]);
  assert.deepEqual(activeRepresentatives(r as any, "builder", "2026-07-28").map((x) => x.fullName), ["Петров П.П."]);
  // Неизвестное ФИО ничего не меняет.
  assert.deepEqual(actRepresentatives(reps, ["Нет Такого"], "2026-07-28"), reps);
});

test("одно ФИО в нескольких строках роли — одна подпись: действующая на дату, иначе самая поздняя", () => {
  const reps = [rep("builder", "Аксенов А.М.", "2026-01-01", "2026-03-31"), rep("builder", "Аксенов А.М.", "2026-04-01")];
  assert.equal(actRepresentatives(reps, ["Аксенов А.М."], "2026-02-10").length, 1);
  assert.equal(actRepresentatives(reps, ["аксенов  а.м."], "2026-02-10")[0].validTo, null);
  const late = [rep("builder", "Аксенов А.М.", "2025-01-01", "2025-03-31"), rep("builder", "Аксенов А.М.", "2025-04-01", "2025-05-01")];
  assert.equal(actRepresentatives(late, ["Аксенов А.М."], "2026-02-10").length, 1);
});

const book = (patch: (r: any) => void) => {
  const r: any = aov1Records();
  r["Представители"].push({ ...r["Представители"][2], "ФИО": "Заменов З.З.", "Действует с": d("2026-09-01") });
  patch(r);
  return readBook(new MemoryWorkbook(r));
};

test("пакет акта: замена стройконтроля на акте попадает во все документы акта", async () => {
  const b = await book((r) => { r["Акты"][0]["Подписанты"] = "Заменов З.З."; });
  const { bundle, issues } = buildBundle(b, AOV1, defaultImportant());
  assert.deepEqual(issues, []);
  const ctl = bundle!.representatives.filter((x) => x.role === "builder_control").map((x) => x.fullName);
  assert.deepEqual(ctl, ["Заменов З.З."]);
  assert.equal(bundle!.representatives.filter((x) => x.role === "performer").length, 2, "другие роли — по датам");
});

test("неизвестный подписант — ошибка печати в ячейке акта", async () => {
  const b = await book((r) => { r["Акты"][0]["Подписанты"] = "Нет Такого"; });
  const { issues } = buildBundle(b, AOV1, defaultImportant());
  assert.ok(issues.some((i) => i.table === "Акты" && i.column === "Подписанты"));
});

test("ОЖР: раздел 5 подписывают выбранные в акте", async () => {
  const { s5 } = ojrRows(await book((r) => { r["Акты"][0]["Подписанты"] = "Заменов З.З."; }));
  const all = s5.map((x) => Object.values(x).join("\n")).join("\n");
  assert.ok(all.includes("Заменов З.З."));
  assert.ok(!all.includes("Филиппов М.И."));
});

test("проверка перед сдачей: выбранный без действующих полномочий — предупреждение, роль не «пустая»", async () => {
  const b = await book((r) => { r["Акты"][0]["Подписанты"] = "Заменов З.З."; });
  const w = checkActs(b, [AOV1], "2026-10-01").map((x) => x.message);
  assert.ok(w.some((m) => m.includes("Заменов З.З.") && m.includes("не действуют")), w.join("\n"));
  const b2 = await book((r) => { r["Акты"][0]["Подписанты"] = "Кто-то"; });
  assert.ok(checkActs(b2, [AOV1], "2026-10-01").some((x) => x.message.includes("«Кто-то» нет")));
});
