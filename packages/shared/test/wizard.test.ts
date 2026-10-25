// План 17, задача 2: мастер первого акта — проверка шагов и строки книги; книга после мастера печатает АОСР.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWizard, stepErrors, allErrors, wizardRecords } from "@idk/shared/wizard";
import { readBook } from "@idk/shared/workbook/records";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { writeBook } from "@idk/shared/workbook/write";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { exampleRows } from "@idk/shared/workbook/examples";

import { filled } from "./fixtures/wizardData.ts";

test("проверка шагов: обязательные поля, представитель без организации из участников, даты, количество", () => {
  const d = emptyWizard();
  assert.deepEqual(Object.keys(stepErrors(0, d)), ["object.name"]);
  assert.ok(stepErrors(1, d)["orgs.developer.inn"]);
  assert.equal(stepErrors(1, d)["reps"], "Добавьте хотя бы одного представителя");
  assert.equal(stepErrors(1, d)["orgs.performer.inn"], undefined, "выполнивший работы — необязателен");
  const f = filled();
  for (let i = 0; i < 5; i++) assert.deepEqual(stepErrors(i, f), {}, `шаг ${i + 1}`);
  f.reps[0].org = "ООО Чужое";
  assert.equal(stepErrors(1, f)["reps.0.org"], "Выберите организацию из участников");
  const g = filled();
  g.act.dateEnd = "2026-09-01";
  g.materials[0].quantity = "много";
  assert.equal(stepErrors(4, g)["act.dateEnd"], "Раньше начала работ");
  assert.equal(stepErrors(3, g)["materials.0.quantity"], "Число");
});

test("новая книга (строки-примеры) → мастер → АОСР собирается без ошибок", async () => {
  const wb = new MemoryWorkbook({}, { placeholder: true });
  await writeBook(wb, exampleRows(), {});
  const d = filled();
  assert.deepEqual(allErrors(d, await readBook(wb)), {});
  await writeBook(wb, wizardRecords(await readBook(wb), d));
  const book = await readBook(wb);
  const { bundle, issues } = buildBundle(book, "ЭОМ-1", defaultImportant());
  assert.deepEqual(issues, []);
  assert.equal(bundle!.object.name, "ЖК «Пример», корпус 1");
  assert.equal(bundle!.act.dateStart, "2026-10-01");
  assert.equal(bundle!.actMaterials[0].quantity, 120.5);
  assert.equal(bundle!.organizations.find((x) => x.id === bundle!.act.performerOrgId)?.shortName, "ООО Монтаж");
  assert.equal(stepErrors(4, d, book)["act.number"], "Такой акт уже есть в книге");
});

test("что уже есть в книге — не дублируется; без «Выполнившего работы» — лицо, осуществляющее строительство", async () => {
  const wb = new MemoryWorkbook({
    "Организации": [{ "Краткое наименование": "ООО Заказчик" }], "Материалы": [{ "Наименование": "кабель ввгнг(а)-ls 3х2,5" }],
    "Шифры": [{ "Шифр": "Р-01-ЭОМ" }], "Представители": [{ "ФИО": "Иванов И.И.", "Организация": "ООО Заказчик" }],
  } as any);
  const d = filled();
  d.orgs.performer = { shortName: "", fullName: "", inn: "", ogrn: "", address: "" };
  d.reps[3].org = "ООО Генподряд";
  const r = wizardRecords(await readBook(wb), d);
  assert.deepEqual(r["Организации"]!.map((x) => x["Краткое наименование"]), ["ООО Генподряд", "ООО Проект"]);
  assert.equal(r["Материалы"], undefined);
  assert.equal(r["Шифры"], undefined);
  assert.deepEqual(r["Представители"]!.map((x) => x["ФИО"]), ["Петров П.П.", "Сидоров С.С."]);
  assert.equal(r["МатериалыАктов"]![0]["Материал"], "кабель ввгнг(а)-ls 3х2,5", "ссылка — на материал книги");
  assert.equal(r["Акты"]![0]["Выполнивший работы"], "ООО Генподряд");
  assert.equal(r["Объект"]!.find((x) => x["Поле"] === "Лицо, выполнившее работы (по умолчанию)")!["Значение"], "ООО Генподряд");
});
