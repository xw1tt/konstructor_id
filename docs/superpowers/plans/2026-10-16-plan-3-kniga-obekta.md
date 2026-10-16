# План 3. Книга объекта — реализация

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Данные объекта живут в листах книги Excel; панель — разделы, «Функционал листа», «Функционал таблицы» и карточка строки с двусторонней синхронизацией; печать идёт из книги.

**Architecture:** Описание листов (`schema.ts`) — единственный источник. Вся логика (чтение строк, операции со строками, ссылки и переименование, проверка, сборка пакета акта, перенос из базы) — в `@idk/shared/workbook/*` поверх интерфейса `TableStore`; в тестах — `MemoryWorkbook`, в Excel — `ExcelPort` на Office.js. Сервер печатает PDF из присланного пакета акта (`ActBundle`) теми же шаблонами.

**Tech Stack:** TypeScript, Node 22 (node:test, node:sqlite), zod, React 19 + esbuild, Office.js (ExcelApi 1.9), playwright-core.

**Spec:** `docs/superpowers/specs/2026-10-16-kniga-obekta-design.md` (+ прототип `docs/prototype/kniga-obekta.xlsx`, генератор листов — §3 спецификации). Формы печати — `2026-10-16-formy-sbd-addendum.md`, не меняются.

## Global Constraints

- Node ≥ 22.13; **новых npm-зависимостей не добавлять** (в песочнице нет сети; доступно только то, что уже в `node_modules`).
- Excel: требование `ExcelApi 1.9`; на старших API не опираться.
- Заголовки столбцов, имена таблиц и листов — **буква в букву** как в спецификации §3.
- Интерфейс — по-русски; даты в интерфейсе `ДД.ММ.ГГГГ`, числа — с десятичной запятой.
- Тесты: `npm test` (tsx --test `packages/*/test/**/*.test.ts`); типы: `npx tsc -p packages/<pkg>`; сборка: `npm run build`.
- Каждый коммит заканчивается строками:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и
  `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.
- TDD: сначала падающий тест, затем код.

## Review Focus

1. **Пустые строки в середине таблицы** (пользователь добавил 10 строк, заполнил 3) — не считаются данными, не дают ошибок проверки, не попадают в печать. Тест — задача 2.
2. **Дата или число, введённые текстом** («28.07.2026», «1618,9», «1 618,9») — распознаются; мусор («завтра») — ошибка «Дата в формате ДД.ММ.ГГГГ» / «Нужно число», а не падение. Тест — задачи 1 и 5.
3. **Ключ с пробелами по краям или с «;»** — «Кабель X␠» совпадает с «Кабель X»; наименование материала с «;» даёт ошибку «Наименование не должно содержать «;»» (иначе ломается список материалов в документе). Тест — задачи 4 и 5.
4. **Переименование в уже существующее значение** — отказ «Такое значение уже есть», ссылки не трогаются. Тест — задача 4.
5. **Повтор номера акта / акт без материалов** — повтор: ошибка «Значение повторяется»; без материалов — печать идёт (п.3 пустой), без ошибок. Тест — задача 5.

---

## Файлы

```
packages/shared/src/workbook/
  values.ts       CellValue, даты Excel, разбор дат/чисел, списки через «; »
  schema.ts       листы, таблицы, столбцы, роли/типы в книге, SCHEMA_VERSION
  store.ts        интерфейсы TableStore, RowsTarget; tableRows()
  memory.ts       MemoryWorkbook implements TableStore
  records.ts      readBook(): Book
  important.ts    ImportantMap, defaultImportant, load/save в настройках
  rowOps.ts       addRows, duplicateRow, moveRow, deleteRows
  refs.ts         findReferences, renameKey
  bundle.ts       ActBundle (zod), Issue, buildBundle()
  migrate.ts      ExportData (zod), exportToBook(), writeBook()
packages/server/src/print/fromBundle.ts   buildDocDataFromBundle()
packages/server/src/print/fromDb.ts       bundleFromDb()  (бывший buildDocData)
packages/server/src/routes/print.ts       POST /api/print/:doc, /api/print-jobs
packages/server/src/routes/export.ts      GET /api/export
packages/addin/src/book/layout.ts         формулы проверок/условного форматирования (чистые)
packages/addin/src/book/excelPort.ts      ExcelPort на Office.js
packages/addin/src/book/defaults.ts       значения новой строки
packages/addin/src/panel/…                панель (задачи 9–11)
```

---

### Task 1: Значения ячеек и описание книги

**Files:**
- Create: `packages/shared/src/workbook/values.ts`, `packages/shared/src/workbook/schema.ts`
- Test: `packages/shared/test/workbook.schema.test.ts`

**Interfaces:**
- Produces (`values.ts`):
  - `type CellValue = string | number | boolean | null`
  - `excelSerialToIso(n: number): string`, `isoToExcelSerial(iso: string): number` (эпоха 1899-12-30)
  - `type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }`
  - `parseDateCell(v: CellValue): Parsed<string | null>` — серийное число, «ДД.ММ.ГГГГ», «ДД.ММ.ГГГГ г.», «ГГГГ-ММ-ДД»; пусто → `null`; иначе `message: "Дата в формате ДД.ММ.ГГГГ"`
  - `parseNumberCell(v: CellValue): Parsed<number | null>` — число; строка с запятой/точкой и пробелами-разделителями; иначе `"Нужно число"`
  - `cellText(v: CellValue): string` — строка с обрезанными краями (`null` → `""`, число → `String`)
  - `splitRefs(v: CellValue): string[]` (по «;», края обрезаны, пустые выброшены), `joinRefs(list: string[]): string` (через «; »)
- Produces (`schema.ts`):
  - `type ColType = "text" | "longtext" | "date" | "number" | "int" | "enum" | "ref" | "refs" | "file" | "formula"`
  - `type TableName = "Объект" | "Организации" | "Шифры" | "Представители" | "Материалы" | "ДокументыКачества" | "Акты" | "Схемы" | "МатериалыАктов" | "ВОР" | "КабельныйЖурнал"`
  - `type SheetName = "Реквизиты" | "Представители" | "Материалы" | "Документы качества" | "База актов" | "Исполнительные схемы" | "Материалы в актах" | "ВОР" | "Кабельный журнал"`
  - `interface ColumnDef { key: string; header: string; type: ColType; values?: readonly string[]; ref?: TableName; isKey?: boolean; important?: boolean; service?: boolean; default?: string | number; formula?: string; width?: number }`
  - `interface TableDef { name: TableName; sheet: SheetName; columns: ColumnDef[] }`
  - `TABLES: Record<TableName, TableDef>`, `SHEETS: readonly { name: SheetName; tables: TableName[] }[]` (порядок листов как в прототипе)
  - `OBJECT_FIELDS: readonly { key: "name" | "address" | "city" | "contractNumber" | "contractDate" | "developer" | "builder" | "designer" | "performer"; label: string; type: "text" | "date" | "ref" }[]` — подписи «Поле» из спецификации §3.1; таблица `Объект` = столбцы `Поле`, `Значение`
  - `ROLE_BOOK_LABELS: Record<RoleCode, string>` (спецификация §3.2), `roleFromBook(label: string): RoleCode | null`
  - `docTypeFromBook(label: string): QualityDocType | null` (подписи = `QUALITY_DOC_LABELS`)
  - `keyColumn(t: TableName): ColumnDef | undefined`, `column(t: TableName, key: string): ColumnDef`
  - `SCHEMA_VERSION = 1`

Ключи столбцов (`key`) — имена полей домена: `shortName, fullName, ogrn, inn, address, phone, sroName, sroOgrn, sroInn` (Организации); `code, name, designer` (Шифры); `role, position, fullName, org, authorityDoc, nrsNumber, nrsDate, validFrom, validTo, sortOrder, actText` (Представители); `name, mark, article, manufacturer, unit` (Материалы); `materials, type, number, issueDate, validUntil, sheets, registryName, file` (ДокументыКачества); `baseNumber, date, section, works, sheets, revision, dateStart, dateEnd, normative, nextWorks, extraInfo, copies, attachments, performerOrg, vorTitle, vorCustomer, vorContractor` (Акты); `act, kind, number, name, date, file` (Схемы); `act, material, position, quantity, vorSum` (МатериалыАктов, `vorSum` — `formula: "=SUMIFS(ВОР[Объём],ВОР[Акт],[@Акт],ВОР[Материал],[@Материал])"`, `service`); `act, group, material, quantity` (ВОР); `act, group, designation, from, to, direction, cableMark, cableLength, pipeMark, pipeLength, note` (КабельныйЖурнал). Важные/служебные/ключевые — как в прототипе (красный/серый заголовок, жёлтая подсветка повторов). Умолчания: `Акты.extraInfo="нет"`, `copies=4`, `attachments="Согласно п.3, п.4."`, `МатериалыАктов.position="б/н"`, `Схемы.kind="Схема"`.

- [ ] **Step 1: Write the failing test** `workbook.schema.test.ts`:

```ts
test("заголовки таблиц — как в спецификации", () => {
  assert.deepEqual(TABLES["Материалы"].columns.map((c) => c.header), ["Наименование", "Марка", "Артикул", "Завод-изготовитель", "Ед. изм."]);
  assert.deepEqual(TABLES["ДокументыКачества"].columns.map((c) => c.header),
    ["Материалы", "Тип", "Номер", "Дата", "Действует до", "Листов", "Наименование для реестра", "Скан"]);
  assert.deepEqual(TABLES["МатериалыАктов"].columns.map((c) => c.header), ["Акт", "Материал", "№ поз. по УСР", "Кол-во", "Сумма ВОР"]);
  assert.equal(TABLES["Акты"].columns.length, 17);
  assert.equal(TABLES["КабельныйЖурнал"].columns.length, 11);
});
test("листы и таблицы", () => {
  assert.deepEqual(SHEETS.map((s) => s.name), ["Реквизиты", "Представители", "Материалы", "Документы качества", "База актов",
    "Исполнительные схемы", "Материалы в актах", "ВОР", "Кабельный журнал"]);
  assert.deepEqual(SHEETS[0].tables, ["Объект", "Организации", "Шифры"]);
});
test("ключи и ссылки", () => {
  assert.equal(keyColumn("Материалы")?.header, "Наименование");
  assert.equal(keyColumn("Акты")?.header, "Номер акта");
  assert.equal(column("ВОР", "material").ref, "Материалы");
  assert.equal(column("ДокументыКачества", "materials").type, "refs");
  assert.equal(keyColumn("Объект"), undefined);
});
test("роли и типы документов", () => {
  assert.equal(roleFromBook("Технадзор застройщика"), "developer_control");
  assert.equal(roleFromBook(" Выполнивший работы "), "performer");
  assert.equal(roleFromBook("Прораб"), null);
  assert.equal(docTypeFromBook("Паспорт качества"), "passport");
});
test("даты и числа", () => {
  assert.equal(excelSerialToIso(46231), "2026-07-28");
  assert.equal(isoToExcelSerial("2026-06-05"), 46178);
  assert.deepEqual(parseDateCell("28.07.2026"), { ok: true, value: "2026-07-28" });
  assert.deepEqual(parseDateCell("09.05.2025 г."), { ok: true, value: "2025-05-09" });
  assert.deepEqual(parseDateCell(""), { ok: true, value: null });
  assert.deepEqual(parseDateCell("завтра"), { ok: false, message: "Дата в формате ДД.ММ.ГГГГ" });
  assert.deepEqual(parseNumberCell("1 618,9"), { ok: true, value: 1618.9 });
  assert.deepEqual(parseNumberCell(436), { ok: true, value: 436 });
  assert.deepEqual(parseNumberCell("много"), { ok: false, message: "Нужно число" });
  assert.deepEqual(splitRefs(" А ; Б;; "), ["А", "Б"]);
  assert.equal(joinRefs(["А", "Б"]), "А; Б");
});
```

- [ ] **Step 2:** `npm test` → FAIL (модули не найдены).
- [ ] **Step 3:** Реализовать `values.ts` и `schema.ts` по Interfaces.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc -p packages/shared` без ошибок.
- [ ] **Step 5:** Commit `feat(shared): описание книги объекта и разбор значений ячеек`.

---

### Task 2: Хранилище таблиц, модель в памяти, чтение книги, важные столбцы

**Files:**
- Create: `packages/shared/src/workbook/store.ts`, `memory.ts`, `records.ts`, `important.ts`
- Test: `packages/shared/test/workbook.records.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces (`store.ts`):
  - `interface TableData { name: TableName; headers: string[]; rows: CellValue[][]; links: (string | null)[][] }` — `links` — адреса гиперссылок (не-null только в столбцах `file`)
  - `interface TableStore {`
    `read(name: TableName): Promise<TableData | null>;`
    `write(name: TableName, row: number, values: Record<string, CellValue>, links?: Record<string, string | null>): Promise<void>;` — ключи — **заголовки**; формульные столбцы игнорируются
    `insert(name: TableName, at: number, rows: Record<string, CellValue>[]): Promise<void>;`
    `remove(name: TableName, rows: number[]): Promise<void>;`
    `setting(key: string): Promise<string | null>; setSetting(key: string, value: string): Promise<void>; }`
  - `interface RowsTarget { count(): Promise<number>; read(row: number): Promise<CellValue[]>; write(row: number, values: CellValue[]): Promise<void>; insertBlank(at: number, n: number): Promise<void>; remove(rows: number[]): Promise<void> }` — `write` не трогает формульные позиции
  - `tableRows(store: TableStore, name: TableName): RowsTarget`
- Produces (`memory.ts`): `class MemoryWorkbook implements TableStore` — `constructor(init?: Partial<Record<TableName, Record<string, CellValue>[]>>)` (ключи записей — заголовки; создаёт все таблицы из `TABLES`, пустые — с нулём строк); `drop(name)` (для теста «таблица не найдена»); формульные ячейки хранит как `null`.
- Produces (`records.ts`):
  - `interface BookRow { row: number; v: Record<string, CellValue>; link: Record<string, string | null> }` — `row` — индекс строки данных в таблице; `v` по **ключам столбцов**
  - `interface Book { tables: Partial<Record<TableName, BookRow[]>>; object: Record<string, CellValue>; missing: TableName[] }`
  - `readBook(store: TableStore): Promise<Book>` — строки, где все не-формульные ячейки пусты, пропускаются; `object` — по `OBJECT_FIELDS.key` из таблицы `Объект`; отсутствующие таблицы → `missing`
- Produces (`important.ts`): `type ImportantMap = Partial<Record<TableName, string[]>>` (заголовки); `defaultImportant(): ImportantMap`; `loadImportant(store): Promise<ImportantMap>` (настройка `idk.important`, JSON; нет — по умолчанию); `saveImportant(store, map): Promise<void>`

- [ ] **Step 1: Write the failing test**:

```ts
test("readBook пропускает пустые строки и раскладывает по ключам", async () => {
  const wb = new MemoryWorkbook({ "Материалы": [
    { "Наименование": "Кабель", "Ед. изм.": "м." }, {}, { "Наименование": "Труба" }] });
  const b = await readBook(wb);
  assert.deepEqual(b.tables["Материалы"]!.map((r) => [r.row, r.v.name]), [[0, "Кабель"], [2, "Труба"]]);
});
test("Объект читается как поля", async () => {
  const wb = new MemoryWorkbook({ "Объект": [{ "Поле": "Наименование объекта", "Значение": "Корпус В" }, { "Поле": "Город", "Значение": "Москва" }] });
  const b = await readBook(wb);
  assert.equal(b.object.name, "Корпус В"); assert.equal(b.object.city, "Москва");
});
test("нет таблицы — в missing", async () => {
  const wb = new MemoryWorkbook(); wb.drop("ВОР");
  assert.deepEqual((await readBook(wb)).missing, ["ВОР"]);
});
test("важные столбцы: по умолчанию и сохранённые", async () => {
  const wb = new MemoryWorkbook();
  assert.ok((await loadImportant(wb))["Акты"]!.includes("Номер акта"));
  await saveImportant(wb, { "Акты": ["Дата акта"] });
  assert.deepEqual((await loadImportant(wb))["Акты"], ["Дата акта"]);
});
test("write не трогает формульный столбец", async () => {
  const wb = new MemoryWorkbook({ "МатериалыАктов": [{ "Акт": "1", "Материал": "Кабель" }] });
  await wb.write("МатериалыАктов", 0, { "Сумма ВОР": 5, "Кол-во": 3 });
  const t = await wb.read("МатериалыАктов");
  assert.deepEqual(t!.rows[0], ["1", "Кабель", null, 3, null]);
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать `store.ts`, `memory.ts`, `records.ts`, `important.ts`.
- [ ] **Step 4:** `npm test` → PASS; tsc чисто.
- [ ] **Step 5:** Commit `feat(shared): хранилище таблиц, модель книги в памяти, чтение книги`.

---

### Task 3: Операции со строками («Функционал листа»)

**Files:**
- Create: `packages/shared/src/workbook/rowOps.ts`
- Test: `packages/shared/test/workbook.rowOps.test.ts`

**Interfaces:**
- Consumes: `RowsTarget`, `tableRows` (Task 2).
- Produces:
  - `addRows(t: RowsTarget, current: number | null, n: number): Promise<number>` — вставка под `current`; `null` → в конец; возвращает индекс первой новой строки
  - `duplicateRow(t: RowsTarget, row: number): Promise<number>` — копия под строкой; возвращает индекс копии
  - `moveRow(t: RowsTarget, row: number, dir: -1 | 1): Promise<number>` — обмен значениями с соседней; у края — без изменений; возвращает новый индекс курсора
  - `deleteRows(t: RowsTarget, rows: number[]): Promise<number>` — удаляет (уникальные, по убыванию), возвращает число удалённых

- [ ] **Step 1: Write the failing test** (на `tableRows(new MemoryWorkbook({...}), "Материалы")` с тремя строками A, B, C):

```ts
test("addRows под текущей и в конец", async () => {
  assert.equal(await addRows(t, 0, 2), 1);           // A, _, _, B, C
  assert.equal(await addRows(t, null, 1), 5);        // в конец
  assert.equal(await t.count(), 6);
});
test("duplicateRow ставит копию под строкой", async () => {
  assert.equal(await duplicateRow(t, 1), 2);
  assert.deepEqual(names(), ["A", "B", "B", "C"]);
});
test("moveRow: вверх, вниз, у края ничего", async () => {
  assert.equal(await moveRow(t, 1, -1), 0); assert.deepEqual(names(), ["B", "A", "C"]);
  assert.equal(await moveRow(t, 0, -1), 0); assert.deepEqual(names(), ["B", "A", "C"]);
  assert.equal(await moveRow(t, 2, 1), 2);
});
test("moveRow не переносит формулу Сумма ВОР", async () => { /* МатериалыАктов: после обмена Сумма ВОР у обеих строк null, Кол-во обменялись */ });
test("deleteRows удаляет выделенные, повторы игнорирует", async () => {
  assert.equal(await deleteRows(t, [2, 0, 2]), 2); assert.deepEqual(names(), ["B"]);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc.
- [ ] **Step 5:** Commit `feat(shared): операции со строками таблицы`.

---

### Task 4: Ссылки и переименование ключей

**Files:**
- Create: `packages/shared/src/workbook/refs.ts`
- Test: `packages/shared/test/workbook.refs.test.ts`

**Interfaces:**
- Consumes: `Book`, `readBook`, `TableStore`, схема (Tasks 1–2).
- Produces:
  - `interface RefHit { table: TableName; row: number; column: string /* заголовок */ }`
  - `findReferences(book: Book, table: TableName, key: string): RefHit[]` — по всем столбцам `ref`/`refs` на `table` и по полям `Объект` типа `ref` (для `Организации`; `RefHit.table = "Объект"`, `row` — индекс поля); сравнение по `cellText` (края обрезаны)
  - `type RenameResult = { ok: true; updated: number } | { ok: false; message: string }`
  - `renameKey(store: TableStore, book: Book, table: TableName, oldKey: string, newKey: string): Promise<RenameResult>` — если `newKey` уже есть в ключевом столбце → `{ ok: false, message: "Такое значение уже есть" }`, ничего не меняет; в `refs` заменяет только совпадающий элемент списка, сохраняя остальные (`joinRefs`); сам ключ не переписывает (его уже изменил пользователь или карточка)

- [ ] **Step 1: Write the failing test** (книга: материалы «Кабель», «Труба»; документ качества с `Материалы = "Кабель; Труба"`; МатериалыАктов и ВОР со ссылкой на «Кабель »(с пробелом)):

```ts
test("findReferences находит ссылки на всех листах, пробелы по краям не мешают", () => {
  assert.deepEqual(findReferences(book, "Материалы", "Кабель").map((h) => h.table).sort(), ["ВОР", "ДокументыКачества", "МатериалыАктов"]);
});
test("renameKey обновляет ссылки и элемент списка", async () => {
  const r = await renameKey(wb, book, "Материалы", "Кабель", "Кабель RS-485");
  assert.deepEqual(r, { ok: true, updated: 3 });
  const docs = await wb.read("ДокументыКачества");
  assert.equal(docs!.rows[0][0], "Кабель RS-485; Труба");
});
test("renameKey отказывает, если новое имя уже есть", async () => {
  assert.deepEqual(await renameKey(wb, book, "Материалы", "Кабель", "Труба"), { ok: false, message: "Такое значение уже есть" });
});
test("организация в таблице Объект тоже считается ссылкой", () => { /* Объект.Застройщик = ООО "СБД" → hit с table "Объект" */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc.
- [ ] **Step 5:** Commit `feat(shared): поиск ссылок и переименование ключей`.

---

### Task 5: Пакет акта и проверка перед печатью

**Files:**
- Create: `packages/shared/src/workbook/bundle.ts`
- Test: `packages/shared/test/workbook.bundle.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; типы `ObjectInfo, Organization, Section, Representative, Material, QualityDoc` (`schemas.ts`), `Act, ActMaterialInput, ActDocumentInput, VorLineInput` (`acts/schemas.ts`).
- Produces:
  - `ActBundle` (zod) = `{ object: ObjectInfo; organizations: Organization[]; sections: Section[]; representatives: Representative[]; materials: Material[]; qualityDocs: QualityDoc[]; act: Act; actMaterials: ActMaterialInput[]; documents: ActDocumentInput[]; vor: VorLineInput[] }`; `type ActBundle = z.infer<…>`
  - `interface Issue { table: TableName; row: number | null; column: string; message: string }`
  - `buildBundle(book: Book, actNumber: string, important: ImportantMap): { bundle: ActBundle | null; issues: Issue[] }` — `bundle` = `null`, если есть хоть одна ошибка

Правила сборки:
- Идентификаторы — `индекс строки в таблице + 1` (организации, шифры, представители, материалы, документы качества; акт — его строка).
- `ObjectInfo.roles` — из полей `developer/builder/designer/performer` объекта (ссылка на организацию по краткому имени).
- Представители — все строки; роль по `roleFromBook`; `sortOrder` по столбцу «Порядок» (пусто → 0).
- Документы качества — все строки; `materialIds` по `splitRefs`; тип — `docTypeFromBook`; `sheets` пусто → 0; `fileId: null`.
- `actMaterials` — строки `МатериалыАктов` этого акта в порядке листа (`sortOrder` = порядок); `quantity` пусто → `null`.
- `documents` — строки `Схемы` этого акта: `kind` «Схема» → `"scheme"`, «Прочее» → `"other"`.
- `vor` — строки `ВОР` этого акта.
- `act` — поля из строки акта; `sectionId` — шифр; `performerOrgId` — «Выполнивший работы» (пусто → роль `performer` объекта); `vorCustomerRepId/vorContractorRepId` — по ФИО.

Проверка (тексты сообщений — точно):
- нет акта: `{ table: "Акты", row: null, column: "Номер акта", message: "Акт «<n>» не найден на листе «База актов»" }`
- пустой важный столбец (по `important`) в строках, участвующих в акте: `"Не заполнено"`
- висячая ссылка: `"Нет в таблице «<имя листа целевой таблицы>»: <значение>"`
- дата/число — сообщения из `parseDateCell` / `parseNumberCell`
- роль/тип не из списка: `"Значение не из списка"`
- повтор ключа в участвующей таблице: `"Значение повторяется"`
- наименование материала с «;»: `"Наименование не должно содержать «;»"`
- материал ВОР, которого нет в «Материалах в актах» этого акта: `"Материала нет в «Материалах в актах» этого акта"`

Участвующие строки: строка акта; его строки в Схемы/МатериалыАктов/ВОР; материалы, на которые они ссылаются; документы качества этих материалов; шифр акта; организации, на которые ссылаются объект, шифр, акт, представители; все представители; поля объекта.

- [ ] **Step 1: Write the failing test** — фикстура `packages/shared/test/fixtures/aov1Book.ts`: `aov1Book(): MemoryWorkbook` с данными прототипа (организации, объект, шифр, 6 представителей, 20 материалов и документы качества из `packages/server/src/seed/sbd-aov1.data.json`, акт, 6 схем, 20 строк МатериалыАктов с пустым «Кол-во», строки ВОР). Тесты:

```ts
test("пакет контрольного акта собирается без ошибок", async () => {
  const { bundle, issues } = buildBundle(await readBook(aov1Book()), "К32.В.СТ.АОВ1.01.00.1", defaultImportant());
  assert.deepEqual(issues, []);
  assert.equal(bundle!.actMaterials.length, 20);
  assert.equal(bundle!.documents.filter((d) => d.kind === "scheme").length, 6);
  assert.equal(bundle!.act.date, "2026-07-28");
  assert.equal(bundle!.representatives.filter((r) => r.role === "performer").length, 2);
});
test("нет акта", …  message "Акт «X» не найден на листе «База актов»");
test("пустая дата документа качества — Не заполнено, с листом и строкой", …);
test("дата текстом «28.07.2026» принимается, «завтра» — ошибка", …);
test("ВОР с материалом вне акта", …);
test("повтор номера акта — Значение повторяется", …);
test("наименование с «;» — ошибка", …);
test("акт без материалов печатается: issues пуст, actMaterials пуст", …);
test("пустые строки в середине таблиц не дают ошибок", …);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc.
- [ ] **Step 5:** Commit `feat(shared): пакет акта из книги и проверка перед печатью`.

---

### Task 6: Сервер печатает из пакета

**Files:**
- Create: `packages/server/src/print/fromBundle.ts`, `packages/server/src/print/fromDb.ts`, `packages/server/src/routes/print.ts`
- Modify: `packages/server/src/print/data.ts` (оставить только типы `AosrData…DocData`; `buildDocData(db, actId, kind)` = `buildDocDataFromBundle(bundleFromDb(db, actId), kind)`), `packages/server/src/app.ts` (подключить `printRoutes`)
- Test: `packages/server/test/print.bundle.test.ts`

**Interfaces:**
- Consumes: `ActBundle`, `buildBundle`, `readBook`, `defaultImportant`, фикстура `aov1Book` (Task 5).
- Produces:
  - `buildDocDataFromBundle<K extends DocKind>(b: ActBundle, kind: K): DocData[K]` — тело нынешнего `buildDocData`, источники — поля пакета; `docsByMaterial` = для каждого материала акта документы из `b.qualityDocs` с этим `materialId`, в порядке списка
  - `bundleFromDb(db: Db, actId: number): ActBundle` (404 «Акт не найден»)
  - `POST /api/print/:doc` — тело `ActBundle` → PDF; заголовки как у старого `GET /api/acts/:id/pdf/:doc` (имя файла `<база>.АОСР.pdf` / `<база>.ВОР.pdf`); неизвестный doc → 400 «Неизвестный документ: …»
  - `POST /api/print-jobs` — тело `ActBundle` → `201 { id: string }` (случайный, `crypto.randomUUID()`); `GET /api/print-jobs/:id/:doc` → PDF; задание живёт 30 минут, хранится не больше 50 (старейшее вытесняется); нет/устарело → 404 «Задание печати не найдено или устарело». Хранилище заданий — `createPrintJobs(now = Date.now)` для теста времени.

- [ ] **Step 1: Write the failing test**:

```ts
test("пакет из книги даёт те же данные документов, что база", async () => {
  const db = openDb(join(tmpDir(), "db.sqlite")); const { actId } = seedSbdAov1(db);
  const { bundle } = buildBundle(await readBook(aov1Book()), "К32.В.СТ.АОВ1.01.00.1", defaultImportant());
  for (const k of DOC_KINDS) assert.deepEqual(buildDocDataFromBundle(bundle!, k), buildDocDataFromBundle(bundleFromDb(db, actId), k));
});
test("POST /api/print-jobs → id; GET …/:id/aosr → PDF", …);   // через print.nobrowser-подход: без браузера ждём 503, с браузером — %PDF
test("задание старше 30 минут — 404 с текстом", …);           // createPrintJobs с подменённым now
test("кривой пакет — 400", …);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать; существующие `print.html.test.ts` / `print.pdf.test.ts` должны пройти без изменений (через обёртку `buildDocData`).
- [ ] **Step 4:** `npm test` → всё PASS; tsc server.
- [ ] **Step 5:** Commit `feat(server): печать из пакета акта, задания печати`.

---

### Task 7: Выгрузка базы и перенос в книгу

**Files:**
- Create: `packages/shared/src/workbook/migrate.ts`, `packages/server/src/routes/export.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/shared/test/workbook.migrate.test.ts`, `packages/server/test/export.api.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 5, 6.
- Produces:
  - `ExportData` (zod) = `{ object: ObjectInfo; organizations: Organization[]; sections: Section[]; representatives: Representative[]; materials: Material[]; qualityDocs: QualityDoc[]; acts: ActFull[]; files: FileRow[] }`
  - `isEmptyExport(e: ExportData): boolean` — нет организаций, материалов и актов
  - `exportToBook(e: ExportData, origin: string): Partial<Record<TableName, Record<string, CellValue>[]>>` — записи по **заголовкам**; даты — серийные числа Excel; роли/типы — подписи книги; ссылки — ключами (краткое имя, наименование, ФИО, номер акта, шифр); «Скан» — имя файла; гиперссылки — отдельно: `exportLinks(e, origin): Partial<Record<TableName, Record<string, string>[]>>` (адрес `${origin}/api/files/<id>`)
  - `writeBook(store: TableStore, rows, links): Promise<void>` — дописывает в конец таблиц
  - `GET /api/export` → `ExportData`

- [ ] **Step 1: Write the failing tests**:

```ts
test("база → книга → пакет даёт те же документы, что база", async () => {   // server test
  const db = …seed; const exp = await (await app GET /api/export).json();
  const wb = new MemoryWorkbook(); await writeBook(wb, exportToBook(exp, "https://localhost:3443"), exportLinks(exp, "https://localhost:3443"));
  const { bundle, issues } = buildBundle(await readBook(wb), "К32.В.СТ.АОВ1.01.00.1", defaultImportant());
  assert.deepEqual(issues, []);
  for (const k of DOC_KINDS) assert.deepEqual(buildDocDataFromBundle(bundle!, k), buildDocDataFromBundle(bundleFromDb(db, actId), k));
});
test("пустая база — isEmptyExport", …);
test("скан документа качества — имя файла и ссылка /api/files/<id>", …);   // shared test на собранном ExportData
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc.
- [ ] **Step 5:** Commit `feat: выгрузка базы и перенос данных в книгу`.

---

### Task 8: Слой Excel (ExcelPort) и разметка книги

**Files:**
- Create: `packages/addin/src/book/layout.ts`, `packages/addin/src/book/excelPort.ts`
- Delete: `packages/addin/src/excel.ts`, `packages/addin/src/sheetMapping.ts`, `packages/addin/test/sheetMapping.test.ts` (их место занимает ExcelPort)
- Modify: `packages/addin/manifest.xml` — `<Requirements><Sets DefaultMinVersion="1.9"><Set Name="ExcelApi" MinVersion="1.9"/></Sets></Requirements>`
- Test: `packages/addin/test/layout.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces (`layout.ts`, чистые функции для разметки):
  - `listSource(col: ColumnDef): string | null` — `ref`/`refs` → `=INDIRECT("<Таблица>[<заголовок ключа>]")`; `enum` → `"<значения через запятую>"`; иначе `null`
  - `strictList(col: ColumnDef): boolean` — `false` для `refs`
  - `importantRule(firstCol: string, lastCol: string, col: string, firstRow: number): string` — формула условного форматирования «пусто в непустой строке» (как в прототипе)
  - `duplicateRule(col: string, firstRow: number, lastRow: number): string`
  - `COLORS = { header: "#1F4E78", important: "#C00000", service: "#7F7F7F", empty: "#FFC7CE", duplicate: "#FFEB9C" }`
- Produces (`excelPort.ts`): `class ExcelPort implements TableStore` + методы:
  - `isSupported(): boolean` (`Office.context.requirements.isSetSupported("ExcelApi", "1.9")`)
  - `ensureBook(): Promise<TableName[]>` — создаёт недостающие листы/таблицы со строкой заголовков, ширинами, проверками списков, условным форматированием важных и повторов, формулой «Сумма ВОР»; таблицу `Объект` заполняет подписями `OBJECT_FIELDS`; пишет `idk.version`; возвращает созданные таблицы; существующие не трогает
  - `applyImportant(map: ImportantMap): Promise<void>` — цвета заголовков и правила «пусто» по карте
  - `interface Selection { sheet: string; table: TableName | null; row: number | null; rows: number[]; column: string | null; sheetRow: number }`
  - `getSelection(): Promise<Selection>`; `selectCell(table: TableName, row: number | null, header: string): Promise<void>`; `activateSheet(name: string): Promise<void>`; `filterBy(table: TableName, header: string, value: string): Promise<void>`
  - `sheetRows(sheet: string): RowsTarget` (строки листа вне таблиц)
  - `onSelection(cb: () => void): Promise<() => void>`; `onChange(cb: (e: { table: TableName | null; row: number | null; column: string | null; before: CellValue; after: CellValue; multi: boolean }) => void): Promise<() => void>` (событие `onChanged` листов; `before/after` — из `details`, для диапазона `multi: true`)
  - `tableSheetOffset(table: TableName): Promise<number>` — номер строки листа первой строки данных (для текста «строка N» в проверке)
  - `TableStore.read` у ExcelPort читает `values`; для столбцов `file` — гиперссылки ячеек; даты возвращаются серийными числами
  - Вставка в таблицу — `table.rows.add(at, values)`; формульные столбцы не пишутся (вычисляемый столбец Excel заполняет сам)

- [ ] **Step 1: Write the failing test** `layout.test.ts`:

```ts
test("источник списка", () => {
  assert.equal(listSource(column("ВОР", "material")), '=INDIRECT("Материалы[Наименование]")');
  assert.equal(listSource(column("Схемы", "kind")), '"Схема,Прочее"');
  assert.equal(listSource(column("Материалы", "name")), null);
  assert.equal(strictList(column("ДокументыКачества", "materials")), false);
});
test("правила условного форматирования", () => {
  assert.equal(importantRule("A", "E", "C", 5), "AND(COUNTA($A5:$E5)>0,LEN(TRIM(C5))=0)");
  assert.equal(duplicateRule("A", 5, 300), 'AND(A5<>"",COUNTIF($A$5:$A$300,A5)>1)');
});
```

- [ ] **Step 2:** FAIL. **Step 3:** `layout.ts`; затем `excelPort.ts` (без автотестов — тонкий слой, проверяется вручную в задаче 11). **Step 4:** PASS; `npx tsc -p packages/addin`; `npm run build`.
- [ ] **Step 5:** Commit `feat(addin): слой Excel и разметка книги объекта`.

---

### Task 9: Панель — разделы, «Функционал листа», «Функционал таблицы», синхронизация

**Files:**
- Create: `packages/addin/src/panel/sections.ts`, `panel/useBook.ts`, `panel/Panel.tsx`, `panel/SheetTools.tsx`, `panel/TableTools.tsx`, `panel/ImportantDialog.tsx`, `panel/tableTools.ts`
- Modify: `packages/addin/src/main.tsx` (рендер `<Panel port={new ExcelPort()} />`), `packages/addin/src/styles.css`
- Delete: `packages/addin/src/App.tsx`, `tabs/` целиком и их тесты (`actDefaults` переносится в задаче 10, `previewUrl.test.ts` — переписать в задаче 10)
- Test: `packages/addin/test/panel.sections.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, 8.
- Produces:
  - `SECTIONS: readonly { id: "requisites" | "reps" | "acts" | "materials" | "schemes" | "cables"; label: string; sheets: SheetName[] }[]` — подписи «Реквизиты, Представители, Акты, Материалы, Схемы, Кабельный журнал»; листы по спецификации §4.1 (первый — открываемый по клику)
  - `sectionForSheet(sheet: string): SectionId | null`
  - `columnStatus(headers: string[], important: string[], row: CellValue[] | null): { header: string; important: boolean; empty: boolean }[]` (`tableTools.ts`)
  - `useBook(port: ExcelPort): { selection: Selection | null; table: TableData | null; book: Book | null; important: ImportantMap; refresh(): void }` — подписка на `onSelection`/`onChange`, перечитывание с задержкой 150 мс; `book` перечитывается при изменении
  - `SheetTools` — кнопки «+1», «+10», «Дублировать», «↑», «↓», «Удалить», «Важные столбцы»; в таблице — `tableRows`, вне — `port.sheetRows`; после операции курсор — на результирующую строку; «Удалить» — подтверждение «Удалить строк: N?» + при ссылках «На них ссылаются строки: K (листы: …)» (через `findReferences`); подтверждение — в панели (без `window.confirm`)
  - `TableTools` — кнопки столбцов из `columnStatus`; клик → `selectCell`; при нескольких таблицах на листе и курсоре вне таблицы — выбор таблицы
  - `ImportantDialog` — галочки по столбцам таблицы → `saveImportant` + `applyImportant`

- [ ] **Step 1: Write the failing test**:

```ts
test("раздел по листу", () => {
  assert.equal(sectionForSheet("Документы качества"), "materials");
  assert.equal(sectionForSheet("ВОР"), "acts");
  assert.equal(sectionForSheet("Лист1"), null);
});
test("статус столбцов", () => {
  assert.deepEqual(columnStatus(["А", "Б"], ["Б"], ["x", ""]),
    [{ header: "А", important: false, empty: false }, { header: "Б", important: true, empty: true }]);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc addin, `npm run build`.
- [ ] **Step 5:** Commit `feat(addin): новая панель — разделы, функционал листа и таблицы`.

---

### Task 10: Карточка строки, значения новой строки, дополнения разделов, печать

**Files:**
- Create: `packages/addin/src/panel/card/editValue.ts`, `card/RowCard.tsx`, `card/fields.tsx`, `panel/extras/MaterialExtras.tsx`, `extras/ActExtras.tsx`, `extras/CableExtras.tsx`, `panel/extras/summaries.ts`, `packages/addin/src/book/defaults.ts`, `packages/addin/src/panel/print.ts`
- Move: `packages/addin/src/tabs/acts/actDefaults.ts` → `packages/addin/src/book/numbering.ts` (тест `actDefaults.test.ts` → `numbering.test.ts`); `decimal.ts` → `panel/card/decimal.ts` (его тест — туда же)
- Test: `packages/addin/test/card.test.ts`, `packages/addin/test/summaries.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5, 8, 9; `apiUpload` (`api.ts`), `preview.html`.
- Produces:
  - `fromCell(col: ColumnDef, v: CellValue): string` — дата → «ДД.ММ.ГГГГ», число → с запятой
  - `toCell(col: ColumnDef, input: string | string[]): Parsed<CellValue>` — дата → серийное число; число/int → number; `refs` (массив) → `joinRefs`; пусто → `null`
  - `newRowDefaults(table: TableName, book: Book): Record<string, CellValue>` (по заголовкам) — `Акты`: «Номер акта» = `nextNumberFor`, «Дата акта» = сегодня (серийное), умолчания схемы, «ВОР: от заказчика» = ФИО первого «Технадзор застройщика», «ВОР: от монтажников» = ФИО последнего «Выполнивший работы» (по «Порядок»), «Выполнивший работы» = поле объекта; прочие таблицы — `default` из схемы; применяется после «+1/+10» в таблицах
  - `docsOfMaterial(book: Book, name: string): BookRow[]`; `actSummary(book: Book, act: string): { schemes: number; materials: number; vor: number }`; `cableTotal(book: Book, act: string): number`
  - `RowCard` — поля по схеме; запись при blur/выборе; ввод в фокусе не перетирается внешним изменением; изменение ключа → `findReferences` → «Обновить ссылки: N строк на K листах?» → `renameKey`; то же для изменения ключа в ячейке (`onChange` с `multi: false` в ключевом столбце); ошибки разбора — под полем
  - `printAct(book, actNumber, important, doc | "all")` (`panel/print.ts`): `buildBundle` → есть ошибки — список «<лист>, строка <N>, «<столбец>»: <сообщение>» (N = смещение + row) с переходом по клику; нет — `POST /api/print-jobs`, предпросмотр `preview.html?src=/api/print-jobs/<id>/<doc>`
  - `ActExtras`: сводка + кнопки «Схемы / Материалы / ВОР» (`activateSheet` + `filterBy(table, "Акт", n)`), кнопки АОСР, РИМ, ВД, ВОР
  - `MaterialExtras`: документы материала, «Добавить документ» (новая строка в `ДокументыКачества` с материалом, переход к ней)
  - Поле `file`: загрузка `apiUpload` → `write(..., { "Скан": name }, { "Скан": `${location.origin}/api/files/${id}` })`

- [ ] **Step 1: Write the failing tests**:

```ts
test("fromCell/toCell: дата и число", () => {
  assert.equal(fromCell(column("Акты", "date"), 46231), "28.07.2026");
  assert.deepEqual(toCell(column("Акты", "date"), "28.07.2026"), { ok: true, value: 46231 });
  assert.deepEqual(toCell(column("ВОР", "quantity"), "1618,9"), { ok: true, value: 1618.9 });
  assert.deepEqual(toCell(column("ДокументыКачества", "materials"), ["А", "Б"]), { ok: true, value: "А; Б" });
});
test("значения нового акта", async () => {
  const d = newRowDefaults("Акты", await readBook(aov1Book()));
  assert.equal(d["Номер акта"], "К32.В.СТ.АОВ1.01.00.2");
  assert.equal(d["ВОР: от заказчика"], "Валерьянов А.А.");
  assert.equal(d["ВОР: от монтажников"], "Востров В.П.");
  assert.equal(d["Экз."], 4);
});
test("сводка акта и итог кабельного журнала", async () => {
  const b = await readBook(aov1Book());
  assert.deepEqual(actSummary(b, "К32.В.СТ.АОВ1.01.00.1"), { schemes: 6, materials: 20, vor: 73 });
  assert.equal(docsOfMaterial(b, "Кабель для промышленного интерфейса RS-485, групповой прокладки, с пониженным дымо- и газовыделением").length, 2);
});
```

(Фикстура `aov1Book` импортируется из `packages/shared/test/fixtures/aov1Book.ts`.)

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc, build.
- [ ] **Step 5:** Commit `feat(addin): карточка строки, дополнения разделов, печать из книги`.

---

### Task 11: Создание книги, перенос, восстановление разметки; удаление старого; инструкция

**Files:**
- Create: `packages/addin/src/panel/CreateBook.tsx`
- Modify: `packages/addin/src/panel/Panel.tsx`, `packages/server/src/app.ts`, `README.md`
- Delete: `packages/server/src/routes/object.ts`, `routes/materials.ts`, `routes/acts.ts` и тесты `object.api.test.ts`, `materials.api.test.ts`, `acts.api.test.ts`, серверную часть `review2.test.ts`, относящуюся к удалённым маршрутам (репозитории и `seed` остаются — их использует выгрузка и тесты печати)
- Test: `packages/server/test/routes.removed.test.ts`

**Interfaces:**
- Consumes: всё выше.
- Produces:
  - Панель: `!port.isSupported()` → «Нужен Excel 2019, 2021 или Microsoft 365»; `book.missing` = все таблицы → экран «Создать книгу объекта»: `ensureBook()` → `GET /api/export` → если не пусто — «В базе есть данные (организаций N, материалов N, актов N). Перенести в книгу?» → `writeBook`; `applyImportant(loadImportant)`
  - Часть таблиц отсутствует → в разделе «Таблица не найдена» + кнопка «Восстановить разметку» (`ensureBook`)
  - Сервер не запущен → листы работают, печать и сканы показывают «Сервер не запущен…»
  - README: раздел «Книга объекта» — как создать книгу, перенос, проверка; **список ручных сценариев** (11 пунктов: создание книги и перенос; +1/+10/дублировать/↑/↓/удалить в таблице и вне; важные столбцы; переход по столбцу; правка в карточке → ячейка; правка в ячейке → карточка; переименование материала → ссылки; добавление документа к материалу; проверка с ошибкой; печать АОСР/РИМ/ВД/ВОР; восстановление разметки)

- [ ] **Step 1: Write the failing test** `routes.removed.test.ts`: `GET /api/acts`, `GET /api/materials`, `GET /api/object` → 404; `GET /api/export` → 200.
- [ ] **Step 2:** FAIL. **Step 3:** удалить маршруты и тесты, реализовать `CreateBook`, README.
- [ ] **Step 4:** `npm test` всё PASS; tsc для трёх пакетов; `npm run build`.
- [ ] **Step 5:** Ручная проверка панели в браузере вне Excel невозможна для Office.js — проверить рендер экрана «Нужен Excel…» в Chromium (playwright) скриншотом; полный сценарий — пользователь по README.
- [ ] **Step 6:** Commit `feat: создание книги объекта и перенос; старые вкладки и маршруты удалены`; собрать `konstruktor-id-v0.3.zip` (как v0.2) для передачи пользователю.
