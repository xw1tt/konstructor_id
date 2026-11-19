// 0.34: загрузка своей формы в один шаг — вид документа по тексту, акт образца по числу совпавших значений.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBook } from "@idk/shared/workbook/records";
import { buildBundle } from "@idk/shared/workbook/bundle";
import { defaultImportant } from "@idk/shared/workbook/important";
import { formData } from "@idk/server/forms/fields";
import { docxText } from "@idk/server/forms/docx";
import { guessDoc, codeFromName, findTitle } from "@idk/shared/forms/recognize";
import { aov1Book, AOV1 } from "../../shared/test/fixtures/aov1Book.ts";
import { startTestServer } from "./helpers/server.ts";
import { makeDocx, p, r, tr } from "./helpers/docx.ts";

test("вид документа по заголовку: встроенные, протоколы по названию, свой — с кодом", () => {
  assert.equal(guessDoc("ООО СБД\nАКТ\nосвидетельствования скрытых работ\n№ 1 от 01.02.2026").kind, "aosr");
  assert.equal(guessDoc("Приложение №1\nВедомость смонтированного оборудования, технических средств и материалов").kind, "vd");
  assert.equal(guessDoc("ВЕДОМОСТЬ ОБЪЕМОВ РАБОТ\nк акту").kind, "vor");
  assert.equal(guessDoc("Реестр применённых материалов\nк акту").kind, "rim");
  assert.equal(guessDoc("A1: КАБЕЛЬНЫЙ ЖУРНАЛ\nA2: Объект").kind, "kj");
  assert.equal(guessDoc("Акт входного контроля\nматериалов").kind, "avk");
  assert.equal(guessDoc("Протокол измерения сопротивления изоляции проводов и кабелей").kind, "ip");
  const g = guessDoc("Протокол проверки устройств защитного отключения № 5");
  assert.ok(g.kind, "протокол из справочника");
  assert.ok(g.code.length > 0, "код протокола из справочника");
  const own = guessDoc("Генподрядчик\nАКТ ГИДРАВЛИЧЕСКИХ ИСПЫТАНИЙ ТРУБОПРОВОДОВ\n№ 12");
  assert.equal(own.kind, null);
  assert.equal(own.name, "Акт гидравлических испытаний трубопроводов");
  assert.equal(own.code, "АГИТ");
  assert.equal(codeFromName("Акт о приёмке систем и оборудования"), "АПСО");
  assert.equal(findTitle("шапка\n\nАКТ\nосвидетельствования скрытых работ\n№1"), "АКТ освидетельствования скрытых работ");
});

test("распознавание формы: вид, акт с наибольшим числом совпадений, вопросы; сохранение формы", async () => {
  const book = await readBook(aov1Book());
  const b = buildBundle(book, AOV1, defaultImportant()).bundle!;
  // Второй «акт» — тот же пакет с другими номером и датами: совпадений меньше.
  const other = structuredClone(b);
  other.act.baseNumber = "Другой-1";
  other.act.date = "2020-01-01";
  const v = formData(b).values;
  const buf = makeDocx(
    [
      p(r("АКТ")),
      p(r("освидетельствования скрытых работ")),
      p(r(`№ ${v["Акт.Номер АОСР"]} от ${v["Акт.Дата"]}`)),
      p(r(`Объект: ${v["Объект.Наименование"]}`)),
      `<w:tbl>${tr("№", "Наименование")}${tr("1", formData(b).lists["Материалы"][0]["Материал.Наименование"])}</w:tbl>`,
    ].join(""),
  );
  const s = await startTestServer();
  const t = (await s.req("POST", "/api/templates", { name: "Заказчик" })).json;
  const file = buf.toString("base64");
  const d = await s.req("POST", `/api/templates/${t.id}/recognize/detect`, { file });
  assert.equal(d.status, 200, JSON.stringify(d.json));
  assert.equal(d.json.kind, "aosr");
  assert.equal(d.json.type, "docx");
  const res = await s.req("POST", `/api/templates/${t.id}/recognize`, {
    file,
    name: "акт заказчика.docx",
    bundles: [
      { act: "Другой-1", bundle: other },
      { act: AOV1, bundle: b },
    ],
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.equal(res.json.act, AOV1);
  assert.ok(res.json.found > res.json.byAct[0].found, JSON.stringify(res.json.byAct));
  const saved = await s.req("POST", `/api/templates/${t.id}/markup/${res.json.token}`, { choices: {} });
  assert.equal(saved.status, 201);
  const raw = await s.raw("GET", `/api/templates/${t.id}/forms/${encodeURIComponent(saved.json.file)}`);
  const text = docxText(Buffer.from(await raw.arrayBuffer()));
  assert.match(text, /\{Акт\.Номер АОСР\}/);
  assert.match(text, /\{#Материалы\}/);
  assert.equal((await s.req("POST", `/api/templates/${t.id}/recognize/detect`, { file: Buffer.from("не файл").toString("base64") })).status, 422);
});
