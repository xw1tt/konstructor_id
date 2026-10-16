import { test } from "node:test";
import assert from "node:assert/strict";
import { missingNotice } from "@idk/addin/panel/missingNotice";

test("книга 0.3: нет только нового листа — предложение добавить, а не «не найдена»", () => {
  assert.deepEqual(missingNotice(["Нормативы"]), { text: "В этой версии появился лист «Нормативы».", button: "Добавить лист" });
});
test("удалённая таблица — прежнее сообщение", () => {
  assert.deepEqual(missingNotice(["ВОР", "Нормативы"]), { text: "Таблица не найдена: ВОР, Нормативы.", button: "Восстановить разметку" });
});
