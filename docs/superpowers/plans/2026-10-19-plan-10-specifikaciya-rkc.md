# План 10: спецификация проекта из РКЦ и учёт закрытых объёмов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** таблица «Спецификация» в книге (из РКЦ или вручную), привязка материалов по №п/п, «Закрыто/Остаток» формулами, лист «Закрытие по актам», подбор №п/п и предупреждения в панели.

**Architecture:** вся логика — чистые функции в `@idk/shared/spec/*` над `Book` и матрицами значений; сервер только читает .xlsx (свой мини-читатель zip+XML на `node:zlib`) и отдаёт матрицу листа; панель вызывает shared-функции и пишет в книгу через `TableStore`. Отчётный лист пишется новым методом `TableStore.writeReport`.

**Tech Stack:** TypeScript, node:test + tsx, zod, React 19, Office.js ExcelApi 1.9, node:zlib.

**Spec:** `docs/superpowers/specs/2026-10-19-specifikaciya-rkc-design.md`

## Global Constraints

- Без новых npm-зависимостей (реестр недоступен при сборке).
- Формулы Excel — без XLOOKUP/LET/FILTER (Excel 2019).
- `SCHEMA_VERSION = 6`; обновление разметки не меняет данные.
- Заголовки столбцов — буква в букву как в спецификации: «№ п/п», «Раздел», «Наименование», «Ед. изм.», «Кол-во по проекту», «Закрыто», «Остаток», «Источник», «Примечание»; в «Материалах» — «№ п/п РКЦ»; в «Материалах в актах» — «№ п/п РКЦ», «Учёт».
- Источник: значения «РКЦ» / «вручную», по умолчанию «вручную». Пометка пропавших: «нет в РКЦ».
- Номера без №п/п: «б/н-1», «б/н-2»…; повтор номера: «<номер>-2».
- Подбор: в список ≥ 50 %, галочка по умолчанию ≥ 70 %.
- Цены и суммы не читаются и не хранятся. Реальный РКЦ пользователя в репозиторий не кладётся.
- Тесты: `timeout 600 npx tsx --test "packages/*/test/**/*.test.ts"` — все зелёные после каждой задачи.
- Коммиты заканчиваются строками `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.

## Review Focus

1. №п/п, который Excel хранит числом (ячейка `2` или `1.1`), и тот же номер, набранный в «Материалах» текстом «2», — должны совпасть (сравнение по `cellText`, столбцы с форматом «@»). Тест — в задаче 1 (формат) и задаче 6 (`specClosed` с числом в одной таблице и текстом в другой).
2. Количество в РКЦ строкой «187,5» или с пробелами «1 310» — читается числом. Тест — задача 3.
3. Материал привязан к позиции, которая исчезла из нового РКЦ, — позиция остаётся с пометкой, закрытое по-прежнему считается. Тест — задача 4.
4. Файл не .xlsx (переименованный .xls, PDF) или .xlsx без шапки РКЦ — понятная ошибка, а не 500. Тест — задачи 2 и 3.
5. Пустая спецификация в старой книге — никаких предупреждений о непривязанных материалах и пустой отчёт без падения. Тест — задача 6.

---

### Task 1: Схема книги v6

**Files:**
- Modify: `packages/shared/src/workbook/schema.ts` (TableName, SheetName, TABLES, SHEETS, SCHEMA_VERSION)
- Modify: `packages/shared/src/workbook/help.ts` (подсказки и примеры новых столбцов)
- Modify: `packages/addin/src/panel/sections.ts` (раздел «Спецификация»)
- Modify: `packages/addin/src/book/defaults.ts` (Источник «вручную» в новой строке)
- Test: `packages/shared/test/spec.schema.test.ts`, дополнить `packages/addin/test/panel.sections.test.ts`

**Interfaces:**
- Produces: `TableName` += `"Спецификация"`; `SheetName` += `"Спецификация"`; `SPEC_SOURCES = ["РКЦ", "вручную"] as const`; `SPEC_MISSING = "нет в РКЦ"`; ключи столбцов `Спецификация`: `number, section, name, unit, quantity, closed, rest, source, note`; `Материалы.rkc` (ref → «Спецификация»); `МатериалыАктов.rkc`, `МатериалыАктов.counted` (formula, service); `SectionId` += `"spec"`.

- [ ] **Step 1: Тест `spec.schema.test.ts`**
  - «Спецификация»: заголовки в порядке из Global Constraints; `number` — `isKey`, тип `text`; `closed.formula === "=SUMIFS(МатериалыАктов[Учёт],МатериалыАктов[№ п/п РКЦ],[@[№ п/п]])"`; `rest.formula === "=[@[Кол-во по проекту]]-[@Закрыто]"`; `source.values` = `["РКЦ","вручную"]`, `default` «вручную».
  - `column("Материалы","rkc")`: header «№ п/п РКЦ», `ref` «Спецификация», не important.
  - `column("МатериалыАктов","rkc").formula === '=IFERROR(INDEX(Материалы[№ п/п РКЦ],MATCH([@Материал],Материалы[Наименование],0)),"")'`; `column("МатериалыАктов","counted").formula === '=IF([@[Кол-во]]="",[@[Сумма ВОР]],[@[Кол-во]])'`; оба — последние столбцы таблицы.
  - `SCHEMA_VERSION === 6`; лист «Спецификация» есть в `SHEETS`.
  - Ни одна формула схемы не содержит `XLOOKUP`, `LET(`, `FILTER(`.
  - Обновление разметки: `missingColumns` (из `packages/addin/src/book/layout.ts`) для «Материалы» с заголовками v5 возвращает `["№ п/п РКЦ"]`, для «МатериалыАктов» — `["№ п/п РКЦ", "Учёт"]`.
- [ ] **Step 2:** `npx tsx --test packages/shared/test/spec.schema.test.ts` — FAIL.
- [ ] **Step 3:** Добавить таблицу/лист/столбцы; столбцы `Спецификация.number` и `Материалы.rkc` — текстовый формат ячеек «@» (проверить, что `formatColumn` в `excelPort.ts` ставит `numberFormat "@"` для этих столбцов; если для `text`/`ref` не ставит — добавить флаг `ColumnDef.textFormat?: boolean` и учесть его в `formatColumn`). Условное форматирование «Остаток < 0» — красная заливка: правило в `paint` для `Спецификация.rest` (цвет `COLORS.duplicate`). Раздел панели: `{ id: "spec", label: "Спецификация", sheets: ["Спецификация"] }` перед «Материалы». Подсказки в `help.ts` для всех новых столбцов (≤ 255 символов).
- [ ] **Step 4:** тесты из шага 1 и весь набор — PASS (в т.ч. `workbook.schema`, `workbook.migrate`, `layout`, `panel.sections`; обновить в них ожидаемые списки таблиц/листов).
- [ ] **Step 5:** Commit «План 10, задача 1: схема v6 — спецификация, № п/п РКЦ».

### Task 2: Чтение .xlsx на сервере и маршрут `/api/rkc/:fileId`

**Files:**
- Create: `packages/server/src/xlsx/read.ts`
- Create: `packages/server/src/routes/rkc.ts`; Modify: `packages/server/src/app.ts` (регистрация)
- Test: `packages/server/test/xlsx.read.test.ts`, `packages/server/test/rkc.api.test.ts`, helper `packages/server/test/helpers/xlsx.ts`

**Interfaces:**
- Consumes: `getFile(db, id)` из `files/store.ts`; `parseRkc` из задачи 3 (маршрут — после задачи 3, см. шаг 6).
- Produces: `readXlsx(buf: Uint8Array): XlsxBook`, `interface XlsxBook { sheets: string[]; grid(sheet: string): CellValue[][] }` (строки и столбцы с 0, пустые ячейки — `null`, числа — `number`, строки — `string`, булевы — `boolean`); `class XlsxError extends Error`. Тестовый helper `makeXlsx(sheets: Record<string, CellValue[][]>, opts?: { shared?: boolean }): Uint8Array` — собирает zip (метод 8, `deflateRawSync`) с `[Content_Types].xml`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml`, `xl/worksheets/sheetN.xml`.
- HTTP: `GET /api/rkc/:fileId` → `200 { sheets: string[] }`; `GET /api/rkc/:fileId?sheet=<имя>` → `200 { sheet, items: RkcItem[], warnings: string[] }`; не-xlsx → `422 { error: "Это не файл Excel (.xlsx). Сохраните РКЦ в Excel как «Книга Excel (*.xlsx)»" }`; нет листа → `404 { error: "Лист «X» не найден" }`; нет файла → 404.

- [ ] **Step 1: Тест `xlsx.read.test.ts`**: книга из `makeXlsx({ "д.с.1 ": [["№П/П","Наименование"],[1.1,"Кабель"]], "ИД": [[null,"x",3]] })` → `sheets` `["д.с.1 ","ИД"]` (порядок и пробелы как в книге); `grid("д.с.1 ")[1]` = `[1.1,"Кабель"]`; общие строки и inline-строки (`t="inlineStr"`) читаются одинаково; пропуск столбцов по адресу `r="C1"` даёт `null` в A,B; `readXlsx(new TextEncoder().encode("%PDF-1.4"))` бросает `XlsxError`.
- [ ] **Step 2:** запуск — FAIL.
- [ ] **Step 3:** Реализовать `readXlsx`: поиск End of Central Directory (сигнатура `0x06054b50` с конца), записи центрального каталога (`0x02014b50`) → локальные заголовки → `inflateRawSync` (метод 8) или как есть (метод 0). XML разбирать регулярными выражениями: `<sheet name="…" r:id="…"/>`, rels `Id → Target`, `<si>` (склеивать все `<t>` внутри, раскодировать `&amp;&lt;&gt;&quot;&apos;&#NN;`), `<c r="…" t="…"><v>…</v>|<is><t>…</t></is></c>`. Адрес столбца из букв `r`. Формулы не вычисляются — берётся `<v>`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit «План 10, задача 2: чтение .xlsx без зависимостей».
- [ ] **Step 6 (после задачи 3): Тест `rkc.api.test.ts`** — загрузить через `POST /api/files` книгу `makeXlsx` с выборкой РКЦ из задачи 3; `GET /api/rkc/:id` → листы; `?sheet=д.с.1 ` (с пробелом, `encodeURIComponent`) → `items.length` и первая позиция как в задаче 3; PDF → 422 с текстом из Interfaces; `?sheet=Нет` → 404. Реализовать `routes/rkc.ts`, зарегистрировать в `app.ts`. PASS. Commit «План 10, задача 2б: /api/rkc».

### Task 3: Разбор листа РКЦ

**Files:**
- Create: `packages/shared/src/spec/rkc.ts`
- Create: `packages/shared/test/fixtures/rkcSample.ts` (обезличенная матрица ~20 строк в форме РКЦ)
- Test: `packages/shared/test/spec.rkc.test.ts`

**Interfaces:**
- Produces: `interface RkcItem { number: string; section: string; name: string; unit: string; quantity: number }`; `parseRkc(grid: CellValue[][]): { items: RkcItem[]; warnings: string[] }`; `class RkcError extends Error` (нет шапки); `rkcSample: CellValue[][]`.

- [ ] **Step 1: Фикстура `rkcSample`** — строки: 4 пустые; шапка `["№П/П","НАИМЕНОВАНИЕ ОБЪЕКТОВ/ВИДОВ РАБОТ","ЕД. ИЗМ.","КОЛ-ВО","ЦЕНА РАБОТ, РУБ БЕЗ НДС",…]`; подзаголовки `[null,null,null,null,"ЗА ЕДИНИЦУ","ВСЕГО","Остаток"]`, `[null,null,null,null,"НЕИЗМЕНЯЕМАЯ ЧАСТЬ"]`; нумерация `[1,2,3,4,7,8]`; разделы `[null,"АВТОМАТИЗАЦИЯ…",null,null,null,100]`, `[1,"СУДИО …",null,null,null,90]`, `["1.1.","ОСНОВНОЕ ОБОРУДОВАНИЕ",…]`; позиции `["1.1.1.1","Термостат защиты от замораживания","шт.",20,5102,102040]`, `["1.1.1.10","Погружная гильза G1/2","шт.",4,800,3200]`, `[null,"Датчик температуры воздуха в помещении","шт.",7]`, `["1.1.6.2.1","Кабель … ППГнг(А)-НF 3x1.5","м",1310,247.5,324225]`, `["1.2.3.2.7.2","Дорнит","м2","187,5"]`, `["1.2.4.4.1","Труба жесткая гладкая ∅ 20 мм","м","5 256"]`, `["1.1.2.30","Корпус под кнопочный пост","шт.",null]`, `["3.1.","Корректировка РД","комл",1]`, повтор номера `["1.1.1.1","Термостат (повтор)","шт.",1]`; итоги `[null,"Всего без НДС",…]`, `[null,"НДС 22 %"]`, `[null,"Зачет аванса",0.19]`, `[null,"Гарантийное удержание 10 %"]`, `[null,"к оплате"]`, `[null,"---"]`.
- [ ] **Step 2: Тесты** `spec.rkc.test.ts`:
  - позиции по порядку, номера: `"1.1.1.1","1.1.1.10","б/н-1","1.1.6.2.1","1.2.3.2.7.2","1.2.4.4.1","1.1.2.30","3.1.","1.1.1.1-2"`;
  - `section` позиции «Термостат…» = «ОСНОВНОЕ ОБОРУДОВАНИЕ»; у «Корректировка РД» — раздел из последней строки-раздела перед ней;
  - количества: `187.5`, `5256`, `0` для пустого;
  - `unit` обрезан («шт.»);
  - предупреждения ровно: «Позиция без №п/п: Датчик температуры воздуха в помещении — присвоен б/н-1», «Нет количества: 1.1.2.30 Корпус под кнопочный пост — принято 0», «Повтор №п/п 1.1.1.1: Термостат (повтор) — присвоен 1.1.1.1-2»;
  - итоговые строки и нумерация столбцов в позиции не попали;
  - номер-число `1.1` в ячейке даёт `"1.1"`, `2` даёт `"2"`;
  - `parseRkc([["a","b"]])` бросает `RkcError` с текстом «Не найдена шапка РКЦ: нужны столбцы «№ п/п», «Наименование», «Ед. изм.», «Кол-во»».
- [ ] **Step 3:** FAIL → реализовать `parseRkc` по правилам спецификации §2 (поиск шапки — нормализация: верхний регистр, без пробелов и точек; признаки: начинается с «№П/П», «НАИМЕНОВАНИЕ», «ЕД»+«ИЗМ», «КОЛ-ВО»). Числа из строк: убрать пробелы (в т.ч. неразрывные), «,»→«.».
- [ ] **Step 4:** PASS. Commit «План 10, задача 3: разбор РКЦ».

### Task 4: Слияние со спецификацией книги

**Files:**
- Create: `packages/shared/src/spec/merge.ts`
- Test: `packages/shared/test/spec.merge.test.ts`

**Interfaces:**
- Consumes: `RkcItem` (задача 3), `Book`, `TableStore`.
- Produces: `interface SpecDiff { added: RkcItem[]; changed: { number: string; fields: string[] }[]; missing: string[]; same: number }`; `mergeSpec(book: Book, items: RkcItem[]): { rows: Record<string, CellValue>[]; diff: SpecDiff }` (готовые записи всей таблицы по заголовкам, без формульных столбцов); `applySpec(store: TableStore, book: Book, items: RkcItem[]): Promise<SpecDiff>` (перезаписывает таблицу «Спецификация» этими строками, как `fillOjr`).

- [ ] **Step 1: Тесты:**
  - пустая книга + 3 позиции → `added.length === 3`, у всех «Источник» «РКЦ»;
  - книга с «1.1» (РКЦ, кол-во 10) и ручной «доп-1» после неё, новый РКЦ: «1.1» кол-во 12, «1.3» новая → строки по порядку `1.1, доп-1, 1.3`; `changed` = `[{number:"1.1",fields:["Кол-во по проекту"]}]`; «доп-1» не изменилась;
  - позиция «1.2» (РКЦ) отсутствует в новом РКЦ → осталась, «Примечание» = «нет в РКЦ»; повторное слияние не дублирует пометку; если «1.2» вернулась — пометка снята, прочий текст примечания сохранён;
  - «б/н-1» с наименованием «Датчик X» в книге и «б/н-1» с наименованием «Датчик Y» + «б/н-2» «Датчик X» в РКЦ → «Датчик X» остаётся одной строкой (сопоставление по наименованию), номер обновляется на «б/н-2»;
  - `Материалы` с «№ п/п РКЦ» = «1.2» после слияния не меняются (`applySpec` пишет только «Спецификация»);
  - `same` считает позиции без изменений.
- [ ] **Step 2:** FAIL → реализовать. Порядок: позиции РКЦ по порядку РКЦ; каждая ручная строка вставляется сразу после строки, за которой стояла в книге (если та осталась), иначе в конец; пропавшие РКЦ-строки — на своих местах относительно предыдущей.
- [ ] **Step 3:** PASS. Commit «План 10, задача 4: слияние спецификации».

### Task 5: Подбор №п/п по наименованию

**Files:**
- Create: `packages/shared/src/spec/match.ts`
- Test: `packages/shared/test/spec.match.test.ts`

**Interfaces:**
- Produces: `normalizeName(s: string): string`; `interface SpecMatch { materialRow: number; material: string; number: string; name: string; score: number /* 0..100 */; checked: boolean }`; `matchSpec(book: Book): SpecMatch[]` (только материалы с пустым «№ п/п РКЦ»; лучшее совпадение ≥ 50; `checked = score >= 70`; сортировка по убыванию `score`); `applyMatches(store: TableStore, matches: SpecMatch[]): Promise<number>` (пишет номер в «Материалы», возвращает число записанных).

- [ ] **Step 1: Тесты:**
  - `normalizeName("ППГнг(А)-НF 3х1,5")` === `normalizeName("ппгнг(a)-hf 3x1.5")` (кириллические А/Н и «х» → латиница, «,»→«.»);
  - материал «Кабель силовой ППГнг(А)-HF 3х1,5» марка «ППГнг(А)-HF 3х1,5» находит «1.1.6.13» «Кабель силовой, не распространяющий горение, безгалогеный, -50...+50 С ППГнг(А)-НF 3x1.5», а не «… 3x2.5» (токены с цифрами весят вдвое), `checked === true`;
  - «Термостат накладной» → «Термостат защиты от замораживания накладной, 5...65С», `score` между 50 и 100;
  - материал без общих слов со спецификацией не попадает в результат;
  - материал с уже заполненным «№ п/п РКЦ» не попадает;
  - пустая спецификация → `[]`;
  - `applyMatches` пишет только `checked`-строки.
- [ ] **Step 2:** FAIL → реализовать (оценка по спецификации §3: доля совпавших токенов материала (наименование + марка, без повторов) в токенах позиции; вес токена с цифрой — 2; округление до целого).
- [ ] **Step 3:** PASS. Commit «План 10, задача 5: подбор № п/п».

### Task 6: Закрыто по актам, отчётный лист, предупреждения

**Files:**
- Create: `packages/shared/src/spec/closed.ts`
- Modify: `packages/shared/src/workbook/store.ts` (метод `writeReport`), `packages/shared/src/workbook/memory.ts`, `packages/addin/src/book/excelPort.ts`
- Test: `packages/shared/test/spec.closed.test.ts`

**Interfaces:**
- Consumes: `Book`; правило «Кол-во или ВОР» как в `acts/rows.ts` (кол-во строки «Материалы в актах», иначе сумма «ВОР» этого материала в этом акте).
- Produces:
  - `interface SpecPosition { number: string; section: string; name: string; unit: string; quantity: number; closed: number; rest: number; byAct: { act: string; date: string | null; qty: number }[]; materials: string[] }`;
  - `specClosed(book: Book): SpecPosition[]` (порядок — как в таблице; сравнение номеров по `cellText` с обрезкой);
  - `positionOfMaterial(book: Book, material: string): SpecPosition | null`;
  - `unboundMaterials(book: Book, act: string): string[]` (материалы акта без «№ п/п РКЦ» или с номером, которого нет в спецификации; `[]` при пустой спецификации);
  - `interface Report { sheet: string; rows: CellValue[][]; bold: number[]; negative: [number, number][]; widths: number[] }`;
  - `closedReport(book: Book): Report` (лист `"Закрытие по актам"`);
  - `TableStore.writeReport(report: Report): Promise<void>`; `MemoryWorkbook.report(sheet: string): Report | null` для тестов.

- [ ] **Step 1: Тесты** на фикстуре: акты «А1» (дата 01.10.2026) и «А2»; спецификация «1.1» (100 м, раздел «Кабели»), «1.2» (5 шт., раздел «Кабели»), «2» (10 шт., раздел «Лотки»); материалы «Кабель» → «1.1», «Хомут» → «1.2», «Лоток» → `2` (в «Материалах» число, в спецификации текст «2»), «Муфта» без номера.
  - «Кабель» в А1 кол-во 30, в А2 кол-во пусто и ВОР 15+5 → `closed` 50, `rest` 50, `byAct` `[{act:"А1",qty:30},{act:"А2",qty:20}]`;
  - «Лоток» с номером-числом `2` закрывается в позицию «2» (Review Focus 1);
  - перерасход: «1.2» закрыто 7 → `rest` −2;
  - `unboundMaterials(book,"А1")` = `["Муфта"]`; при пустой спецификации — `[]`;
  - `closedReport`: шапка `["№ п/п","Наименование","Ед. изм.","По проекту","Закрыто","Остаток","Акт №А1 от 01.10.2026","Акт №А2 от …"]`; перед позициями раздела — строка-заголовок раздела (её индекс в `bold`, как и шапка); ячейки без закрытия — `null`; `negative` содержит ячейку «Остаток» позиции «1.2»; пустая спецификация → только шапка без падения (Review Focus 5);
  - `MemoryWorkbook.writeReport` сохраняет отчёт, повторный вызов заменяет.
- [ ] **Step 2:** FAIL → реализовать shared-функции и `MemoryWorkbook.writeReport/report`.
- [ ] **Step 3:** `ExcelPort.writeReport`: лист получить или добавить (`worksheets.getItemOrNullObject` → `add`), `getUsedRangeOrNullObject().clear()`, записать `rows` одним `range.values`, жирный шрифт строк `bold`, красная заливка ячеек `negative`, ширины столбцов `widths` (символы → `columnWidth = w * 7`), закрепить первую строку (`freezePanes.freezeRows(1)`), рамки тонкие на всём диапазоне. Ручной проверки в Excel нет — проверяется у пользователя.
- [ ] **Step 4:** PASS. Commit «План 10, задача 6: закрытие по актам».

### Task 7: Панель

**Files:**
- Create: `packages/addin/src/panel/extras/SpecExtras.tsx`, `packages/addin/src/panel/spec.ts` (не-React помощники для тестов)
- Modify: `packages/addin/src/panel/card/RowCard.tsx` (подключение), `packages/addin/src/panel/extras/MaterialExtras.tsx` (кнопка подбора), `packages/addin/src/panel/extras/ActExtras.tsx` (предупреждение), `packages/addin/src/styles.css`
- Test: `packages/addin/test/spec.panel.test.ts`

**Interfaces:**
- Consumes: `apiUpload`/`call` из `api.ts` (загрузка файла как у «Скан»), `GET /api/rkc/:id`, `mergeSpec`, `applySpec`, `matchSpec`, `applyMatches`, `specClosed`, `positionOfMaterial`, `unboundMaterials`, `closedReport`, `port.writeReport`.
- Produces: `diffText(d: SpecDiff): string` и `positionLines(p: SpecPosition): string[]` в `panel/spec.ts`.

- [ ] **Step 1: Тест `spec.panel.test.ts`:**
  - `diffText({added:[3 шт.],changed:[1],missing:["1.2"],same:10})` === «Новых позиций: 3. Изменено: 1. Нет в РКЦ: 1 (1.2). Без изменений: 10.»;
  - `positionLines(p)` для позиции из задачи 6 === `["По проекту: 100 м", "Закрыто: 50 м", "Остаток: 50 м", "Акт №А1 — 30", "Акт №А2 — 20", "Материалы: Кабель"]`; при отрицательном остатке строка «Остаток: −2 шт. — закрыто больше, чем по проекту».
- [ ] **Step 2:** FAIL → реализовать `panel/spec.ts`.
- [ ] **Step 3:** `SpecExtras` (на листе «Спецификация», ниже карточки строки):
  - «Загрузить из РКЦ»: `<input type="file" accept=".xlsx">` → загрузка → `GET /api/rkc/:id` → выпадающий список листов (по умолчанию первый) → «Разобрать» → `mergeSpec` → предпросмотр `diffText` + предупреждения разбора (`IssueList`-стиль, текстом) → «Применить» (`applySpec`, затем `state.refresh()`). Ошибки сервера — текстом (`useGuard`).
  - «Обновить лист «Закрытие по актам»» → `port.writeReport(closedReport(book))`, сообщение «Готово: позиций N, актов M».
  - Карточка выбранной позиции: `positionLines(specClosed(book).find(...))`.
- [ ] **Step 4:** `MaterialExtras`: кнопка «Подобрать № п/п» (видна, если спецификация не пуста) → список `matchSpec` с галочками («материал → № · наименование · NN %»), «Применить отмеченные» → `applyMatches` → `state.refresh()`; пустой результат — «Подходящих позиций не найдено — заполните № п/п вручную».
  - На карточке строки «Материалы в актах» (через `RowCard`, таблица `МатериалыАктов`): `positionLines(positionOfMaterial(book, material))`, если позиция есть.
  - `ActExtras`: если `unboundMaterials(book, act)` не пуст — строка-предупреждение «Не привязаны к спецификации: …» (жёлтая, печать не блокирует).
- [ ] **Step 5:** весь набор — PASS; сборка панели `node packages/addin/build.mjs` без ошибок. Commit «План 10, задача 7: панель спецификации».

### Task 8: Документация и выпуск

**Files:**
- Modify: `README.md` (раздел «Спецификация и закрытие по актам», чек-лист, версия 0.11), `docs/Инструкция пользователя.md` (новый раздел «Спецификация проекта (РКЦ)» перед «Общий журнал работ»)
- Модуль: документ Claude Docs `edff28c9-656b-448d-8aef-ca73e3e6b662` — тот же раздел.

- [ ] **Step 1:** Написать раздел: загрузка РКЦ (лист, предпросмотр, повторная загрузка и «нет в РКЦ»), доп. позиции вручную, «№ п/п РКЦ» в «Материалах», «Подобрать № п/п», что считается закрытым (кол-во или ВОР), лист «Закрытие по актам», предупреждения, .xls → сохранить как .xlsx.
- [ ] **Step 2:** весь набор тестов — PASS; `node scripts/build-installer.mjs /mnt/user-data/uploads/nodejs/node.exe 0.11` — установщик собран.
- [ ] **Step 3:** Commit «План 10: документация, версия 0.11»; push ветки `plan-10-spec`. Слияние в main — только после подтверждения пользователя.
