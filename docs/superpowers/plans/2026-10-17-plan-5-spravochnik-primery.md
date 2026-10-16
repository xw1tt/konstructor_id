# План 5. Справочник нормативов портала; строки-примеры и подсказки — реализация

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Экран «Норматив» — справочник ≈5000 нормативов protect.gost.ru (только сведения из списков), обновляемый сервером; в новой книге — строки-примеры и подсказки к каждому столбцу.

**Architecture:** Разбор страниц списков портала — чистая функция в `@idk/shared`; сервер обходит списки с подменяемым `fetch`, хранит справочник в SQLite (раздел заменяется одной транзакцией) и отдаёт поиск. Примеры и подсказки описаны в схеме книги; признак примера — ячейка, начинающаяся с «Пример:»; `readBook` примеры пропускает, поэтому их не видит вся логика.

**Tech Stack:** TypeScript, Node 22 (node:sqlite, node:test, глобальный fetch), React 19 + esbuild, Office.js (ExcelApi 1.9).

**Spec:** `docs/superpowers/specs/2026-10-17-spravochnik-primery-design.md` (заменяет §3 `2026-10-16-normativ-shapka-design.md`).

## Global Constraints

- Новых npm-зависимостей не добавлять; разбор HTML — регулярными выражениями/строками.
- Тексты нормативов не скачиваются: сервер читает только страницы списков разделов (§2.1 спецификации), не карточки.
- Адреса — только `https://protect.gost.ru/…` (`isPortalUrl`).
- Сообщения — точно как в спецификации: «Обновление уже идёт», «Нет связи с порталом protect.gost.ru», «Не удалось разобрать список раздела «<Кнопка>» — возможно, портал изменил вёрстку», «Уже есть в ячейке», «Справочник пуст — нажмите «Обновить базу». Понадобится доступ к интернету, обновление займёт несколько минут.», текст «Условий» (§2.6), плашка «Это строка-пример: замените значения своими или удалите строку».
- `EXAMPLE_PREFIX = "Пример: "`; признак — ячейка, текст которой начинается с «Пример:».
- Тесты `npm test`; типы `npx tsc -p packages/shared|server`; сборка `npm run build`. Коммиты — со строками `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.

## Review Focus

1. **Портал ответил страницей входа/ошибки (HTML без строк) на середине раздела** — раздел в базе не меняется, сообщение о разборе; уже обновлённые разделы остаются новыми. Тест — задача 3.
2. **Пользователь поменял в строке-примере не ключ, а другую ячейку** — строка остаётся примером (ключ ещё «Пример: …»), в печать не идёт. Тест — задача 4.
3. **Поиск с «ё» и в другом регистре** («огнестойкость», «СП 2.13130») — находит «огнестойкости», «СП 2.13130.2020». Тест — задача 2.
4. **«В ячейку» в ячейку с числом или датой** — значение превращается в текст «<число>, <обозначение>», а не падает. Тест — задача 6 (чистая функция `cellAppend`).
5. **Повторный запуск «Обновить базу», пока идёт обход** — 409 «Обновление уже идёт», первый обход не прерывается. Тест — задача 3.

---

### Task 1: Разделы портала и разбор страницы списка

**Files:**
- Create: `packages/shared/src/normCatalog.ts`
- Test: `packages/shared/test/normCatalog.test.ts`

**Interfaces:**
- Produces:
  - `NORM_SECTIONS: readonly { code: "sp" | "gost" | "rst" | "classificators" | "tr" | "foundational"; label: string; url: string }[]` — порядок и подписи: СП, ГОСТ, Правила, Классиф., Техрегл., Основопол.; `url` = `https://protect.gost.ru/<code>`; `type NormSection = …["code"]`
  - `interface CatalogRow { designation: string; title: string; pages: number; status: string; url: string }`
  - `parseListPage(html: string): { rows: CatalogRow[]; totalPages: number | null }` — строки из `<tr>…</tr>`, содержащих ссылку `/(gost|sp|rst|classificators|tr)/details/<uuid>`; `url` = `https://protect.gost.ru` + путь; ячейки `<td>` без тегов, сущности декодированы (`&quot; &amp; &lt; &gt; &#NN; &nbsp; &laquo; &raquo;`), пробелы схлопнуты; страницы — ячейка из одних цифр, не равная номеру строки «№» (у «Основополагающих» первая ячейка — «№»; если в строке два числа, страницы — последнее); статус — ячейка, начинающаяся (без учёта регистра, после отбрасывания значков ✓ ↻ и т.п.) с «Действ», «Замен», «Отмен», «Не действ», «Приостан», «Утрат»; наименование — самая длинная из остальных ячеек; повторы по `url` отброшены; блоки вне `<tr>` строк не дают; `totalPages` — из «Стр. N из M» (M) или максимум `page=K` в ссылках, иначе `null`
  - `statusTone(status: string): "ok" | "replaced" | "other"` — «Действует» → ok; «Заменен»/«Заменён» → replaced

- [ ] **Step 1: Write the failing test** — фикстуры-строки в тесте:

```ts
const SP = `<html><body><p>Найдено: 758</p><table><tr><th>Обозначение</th><th>Наименование</th><th>Стр.</th><th>Статус</th></tr>
<tr><td><a href="/sp/details/582947c1-4171-4b75-b5d8-1a0bcb0f0968">СП 19.13330.2010</a></td><td>Генеральные планы сельскохозяйственных предприятий</td><td>0</td><td><i class="i"></i> Заменен</td></tr>
<tr><td><a href="/sp/details/bac9e1fe-45f1-401b-8e32-949f4ee27821">СП 20.13330.2016</a></td><td>Нагрузки и воздействия</td><td>148</td><td>✓ Действует</td></tr>
</table><a href="/sp?&search=&page=2">2</a><a href="/sp?&search=&page=38">38</a></body></html>`;
const FOUND = `<p>Стр. 1 из 2 • Всего: 34</p><table><tr><td>1</td><td><a href="/gost/details/a8608e17-1ca1-4945-98e2-7044d5bc11ac">ГОСТ 1.0-2015</a></td>
<td>Межгосударственная система стандартизации. Основные положения</td><td>13</td><td>✓ Действует</td></tr></table>
<div class="card"><a href="/gost/details/a8608e17-1ca1-4945-98e2-7044d5bc11ac">ГОСТ 1.0-2015</a> Действует 13</div>`;
test("список СП", () => {
  const p = parseListPage(SP);
  assert.equal(p.totalPages, 38);
  assert.deepEqual(p.rows[1], { designation: "СП 20.13330.2016", title: "Нагрузки и воздействия", pages: 148, status: "Действует",
    url: "https://protect.gost.ru/sp/details/bac9e1fe-45f1-401b-8e32-949f4ee27821" });
  assert.equal(p.rows[0].status, "Заменен");
});
test("основополагающие: № не страницы, блоки-повторы не дублируют", () => {
  const p = parseListPage(FOUND);
  assert.equal(p.totalPages, 2);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].pages, 13);
  assert.equal(p.rows[0].title, "Межгосударственная система стандартизации. Основные положения");
});
test("сущности и пустая страница", () => {
  assert.equal(parseListPage(`<tr><td><a href="/tr/details/11111111-1111-1111-1111-111111111111">ТР ТС 004/2011</a></td><td>О безопасности &quot;низковольтного&quot; оборудования</td><td>20</td><td>Действует</td></tr>`).rows[0].title,
    'О безопасности "низковольтного" оборудования');
  assert.deepEqual(parseListPage("<html><body>Войдите</body></html>"), { rows: [], totalPages: null });
});
test("разделы и тон статуса", () => {
  assert.deepEqual(NORM_SECTIONS.map((s) => s.label), ["СП", "ГОСТ", "Правила", "Классиф.", "Техрегл.", "Основопол."]);
  assert.equal(statusTone("Заменён"), "replaced"); assert.equal(statusTone("Действует"), "ok"); assert.equal(statusTone("Отменен"), "other");
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc shared.
- [ ] **Step 5:** Commit `feat(shared): разделы портала и разбор списка нормативов`.

---

### Task 2: Справочник в базе и поиск

**Files:**
- Create: `packages/server/src/migrations/003_norm_catalog.sql`, `packages/server/src/repo/normCatalog.ts`, `packages/server/src/routes/norms.ts`
- Modify: `packages/server/src/app.ts`
- Test: `packages/server/test/norms.api.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Таблицы: `norm_catalog(id INTEGER PRIMARY KEY, section TEXT NOT NULL, ord INTEGER NOT NULL, designation TEXT NOT NULL, title TEXT NOT NULL, pages INTEGER NOT NULL, status TEXT NOT NULL, url TEXT NOT NULL, search TEXT NOT NULL)` (индекс по `section, ord`); `norm_sections(section TEXT PRIMARY KEY, updated_at TEXT NOT NULL)`. `search` = нормализованный «обозначение + наименование» (нижний регистр, «ё»→«е»)
  - `normCatalog(db)`: `replaceSection(section: NormSection, rows: CatalogRow[], at: string): void` (одна транзакция; строки с адресом не `isPortalUrl` отбрасываются); `search(p: { section?: NormSection; q?: string; offset?: number; limit?: number }): NormSearchResult`
  - `interface NormItem extends CatalogRow { id: number; section: NormSection }`; `interface NormSearchResult { total: number; counts: Record<NormSection, number>; updated: Partial<Record<NormSection, string>>; items: NormItem[] }`
  - `GET /api/norms?section=&q=&offset=&limit=` → `NormSearchResult`; `limit` по умолчанию 100, больше 500 → 500; неизвестный `section` → 400 «Неизвестный раздел: <код>»; `q` — слова через пробел, каждое должно входить в `search`; `total` — с учётом раздела и `q`; `counts` — по всем разделам с учётом `q`

- [ ] **Step 1: Write the failing test** (заполнить через `normCatalog(db).replaceSection` в БД тестового сервера — `startTestServer` возвращает `db` или открыть ту же БД по `dataDir`):

```ts
test("поиск: регистр, «ё», несколько слов, счётчики", async () => {
  // sp: «СП 2.13130.2020» «Системы противопожарной защиты. Обеспечение огнестойкости объектов защиты» Действует 32;
  //     «СП 76.13330.2016» «Электротехнические устройства» Действует 40; gost: «ГОСТ 10434-82» «Соединения контактные электрические» Действует 12
  const r = await s.req("GET", "/api/norms?q=" + encodeURIComponent("ОГНЕСТОЙКОСТЬ сп 2.13130"));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items.map((i: any) => i.designation), ["СП 2.13130.2020"]);
  assert.deepEqual(r.json.counts, { sp: 1, gost: 0, rst: 0, classificators: 0, tr: 0, foundational: 0 });
  const all = await s.req("GET", "/api/norms?section=gost");
  assert.equal(all.json.total, 1); assert.equal(all.json.counts.sp, 2);
  assert.equal(typeof all.json.updated.sp, "string");
});
test("замена раздела целиком и отказ чужих адресов", …);   // replaceSection второй раз — старые строки раздела исчезли; url https://evil.ru — строка не сохранена
test("неизвестный раздел — 400", …);                        // ?section=xxx → 400 «Неизвестный раздел: xxx»
test("limit ограничен 500, offset работает", …);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc server.
- [ ] **Step 5:** Commit `feat(server): справочник нормативов в базе и поиск`.

---

### Task 3: Обновление справочника с портала

**Files:**
- Create: `packages/server/src/norms/refresh.ts`
- Modify: `packages/server/src/routes/norms.ts`, `packages/server/src/app.ts` (опция `fetchImpl`, `sleep` в `AppOptions` для тестов)
- Test: `packages/server/test/norms.refresh.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `interface RefreshState { running: boolean; section: NormSection | null; page: number; pages: number | null; error: string | null; finishedAt: string | null }`
  - `createRefresher(db: Db, deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => Date }): { state(): RefreshState; start(): boolean /* false — уже идёт */; done(): Promise<void> /* для тестов */ }`
  - Обход: разделы в порядке `NORM_SECTIONS`; страница N — `${url}?page=${N}`; заголовок `User-Agent: Konstruktor-ID (справочник нормативов)`; таймаут 20 с (`AbortSignal.timeout`); пауза `sleep(300)` между запросами; конец раздела — пустая страница или `N >= totalPages`; первая страница раздела без строк или ответ не `text/html` → ошибка разбора; исключение `fetch` / статус ≥ 400 → «Нет связи с порталом protect.gost.ru»; при ошибке обход останавливается, текущий раздел не записывается, `error` заполнено, `running=false`
  - `POST /api/norms/refresh` → 202 `RefreshState`; если идёт — 409 «Обновление уже идёт»; `GET /api/norms/refresh` → `RefreshState`

- [ ] **Step 1: Write the failing test** (подменный `fetchImpl` по таблице `url → html`, `sleep` мгновенный):

```ts
test("обход всех разделов и страниц", async () => {
  // sp: page=1 две строки, «Стр. 1 из 2»; page=2 одна строка; остальные разделы: page=1 одна строка, без числа страниц; page=2 пустая
  const r = createRefresher(db, { fetchImpl: fake, sleep: async () => {} });
  assert.equal(r.start(), true); await r.done();
  assert.equal(r.state().error, null);
  assert.equal(normCatalog(db).search({ section: "sp" }).total, 3);
  assert.equal(normCatalog(db).search({}).total, 8);
});
test("сбой на середине раздела — раздел не меняется, ранее обновлённые остаются", async () => {
  // первый прогон успешен; второй: sp обновляется (новые строки), gost page=2 → страница входа без строк? (не первая — конец раздела) — используем fetch, бросающий ошибку на gost page=2
  // ожидание: error «Нет связи с порталом protect.gost.ru»; sp — новые строки; gost — строки первого прогона
});
test("первая страница раздела без строк — ошибка разбора", …);   // «Не удалось разобрать список раздела «СП» — возможно, портал изменил вёрстку»
test("повторный запуск во время обхода — 409", async () => {
  // fetch, который ждёт промис; POST /api/norms/refresh → 202; второй POST → 409 «Обновление уже идёт»; затем отпустить промис
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc server.
- [ ] **Step 5:** Commit `feat(server): обновление справочника нормативов с портала`.

---

### Task 4: Примеры и подсказки в схеме книги; лист «Нормативы» убирается

**Files:**
- Modify: `packages/shared/src/workbook/schema.ts` (`hint`, `example` у `ColumnDef` и `OBJECT_FIELDS`; таблица/лист «Нормативы» удаляются), `packages/shared/src/workbook/records.ts` (`readBook` пропускает примеры), `packages/shared/src/normativ.ts` (сюда переезжает `appendToP6`, переименованный в `appendDesignation`), `packages/shared/test/normativ.test.ts`, `packages/shared/test/workbook.schema.test.ts`
- Create: `packages/shared/src/workbook/examples.ts`
- Delete: `packages/shared/src/workbook/normativActions.ts`, `packages/shared/test/normativActions.test.ts` (тесты `appendToP6` переносятся в `normativ.test.ts` под новым именем)
- Test: `packages/shared/test/workbook.examples.test.ts`

**Interfaces:**
- Consumes: план 3 (`readBook`, `buildBundle`, `MemoryWorkbook`), `extractNormativ`, `normKey`.
- Produces:
  - `ColumnDef.hint: string` (обязателен для каждого столбца, ≤ 255), `ColumnDef.example?: CellValue`; у `OBJECT_FIELDS` — `hint` и `example`
  - `EXAMPLE_PREFIX = "Пример: "`; `isExampleValue(v: CellValue): boolean` (текст после обрезки начинается с «Пример:»); `isExampleRow(values: CellValue[]): boolean`
  - `exampleRows(): Partial<Record<TableName, Record<string, CellValue>[]>>` — по одной записи на таблицу (по заголовкам; для `Объект` — по строке на поле) из `example`; формульные и служебные `file` столбцы без значения
  - `readBook`: строки-примеры не попадают в `book.tables`; поле объекта со значением «Пример: …» → `null`
  - `appendDesignation(current: string, designation: string): string | null` — прежнее поведение `appendToP6`
  - Ключевые значения примеров (остальные — правдоподобные данные в формате СБД):
    - Организации: `Пример: ООО "Строймонтаж"`; Шифры: `Пример: КУТ03-Р-ПИР-2-26-100-ЭМ1.01.00`; Представители: `Пример: Иванов И.И.` (роль «Выполнивший работы», организация — пример-организация)
    - Материалы: `Пример: Кабель силовой ВВГнг(А)-LS 3х2,5`; Документы качества: материалы — пример-материал, «Паспорт качества», № `123/45`
    - Акты: `Пример: К32.В.СТ.ЭМ1.01.00.1` (шифр — пример-шифр, п.6 «СП 76.13330.2016, ПУЭ»); Схемы/Материалы в актах/ВОР/Кабельный журнал — акт = пример-акт, материал = пример-материал
    - Объект: «Наименование объекта» = `Пример: Жилой комплекс, корпус 1`, организации — пример-организация

- [ ] **Step 1: Write the failing test**:

```ts
test("у каждого столбца и поля объекта есть подсказка ≤ 255 и пример", () => {
  for (const t of TABLE_NAMES) for (const c of TABLES[t].columns) {
    assert.ok(c.hint && c.hint.length <= 255, `${t}.${c.header}`);
    if (c.type !== "formula" && c.type !== "file" && t !== "Объект") assert.notEqual(c.example, undefined, `${t}.${c.header}`);
  }
  for (const f of OBJECT_FIELDS) assert.ok(f.hint && f.example !== undefined, f.label);
});
test("книга из одних примеров — пустая для программы", async () => {
  const b = await readBook(new MemoryWorkbook(exampleRows()));
  for (const t of TABLE_NAMES.filter((x) => x !== "Объект")) assert.deepEqual(b.tables[t], [], t);
  assert.equal(b.object.name, null);
});
test("пример-акт не печатается; без признака примеры связаны без висячих ссылок", async () => {
  const ex = exampleRows();
  const act = String(ex["Акты"]![0]["Номер акта"]);
  assert.deepEqual(buildBundle(await readBook(new MemoryWorkbook(ex)), act, defaultImportant()).issues[0].message,
    `Акт «${act}» не найден на листе «База актов»`);
  const plain = JSON.parse(JSON.stringify(ex).replaceAll("Пример: ", ""));          // те же данные без признака
  const r = buildBundle(await readBook(new MemoryWorkbook(plain)), act.replace("Пример: ", ""), defaultImportant());
  assert.deepEqual(r.issues, []);
});
test("изменение не-ключевой ячейки примера оставляет строку примером", async () => {
  const wb = new MemoryWorkbook(exampleRows());
  await wb.write("Материалы", 0, { "Завод-изготовитель": "ООО Кабельный завод" });
  assert.deepEqual((await readBook(wb)).tables["Материалы"], []);
  await wb.write("Материалы", 0, { "Наименование": "Кабель ВВГнг(А)-LS 3х1,5" });
  assert.equal((await readBook(wb)).tables["Материалы"]!.length, 1);
});
test("листа «Нормативы» в схеме нет", () => assert.equal(SHEETS.some((s) => s.name === ("Нормативы" as any)), false));
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать; удалить использования `Нормативы` в shared. **Step 4:** `npm test` для shared PASS (addin упадёт до задачи 5–6 только там, где используются удалённые модули — допустимо в пределах задачи, если задача 5 идёт следом; иначе временно поправить импорты), tsc shared.
- [ ] **Step 5:** Commit `feat(shared): строки-примеры и подсказки в описании книги; лист «Нормативы» убран`.

---

### Task 5: Excel — подсказки, оформление примеров, запись примеров, «В ячейку»

**Files:**
- Modify: `packages/addin/src/book/layout.ts`, `packages/addin/src/book/excelPort.ts`, `packages/addin/src/panel/CreateBook.tsx`, `packages/addin/src/panel/card/fields.tsx`, `packages/addin/src/panel/card/RowCard.tsx`, `packages/addin/src/styles.css`
- Delete: `packages/addin/src/panel/missingNotice.ts`, `packages/addin/test/missingNotice.test.ts`, `packages/addin/src/panel/normativState.ts` (тест в `normativ.test.ts` — убрать соответствующий случай)
- Test: `packages/addin/test/layout.test.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `promptFor(col: ColumnDef): { title: string; message: string }` — `title` = заголовок, обрезанный до 32 символов («…» на конце при обрезке), `message` = `hint`
  - `exampleRule(firstCol: string, lastCol: string, firstRow: number): string` → `=COUNTIF($A5:$K5,"Пример:*")>0` для `("A","K",5)`
  - `ExcelPort.ensureBook`: на ячейках данных каждого столбца — `dataValidation.prompt = { showPrompt: true, ...promptFor(col) }`; правило условного форматирования `exampleRule` на всю таблицу: шрифт серый `#7F7F7F`, курсив; для «Объекта» — подсказки полей по строкам
  - `ExcelPort.writeActiveCell(fn: (current: CellValue) => CellValue | null): Promise<{ written: boolean }>` — читает выделенную ячейку (одну — левую верхнюю), `null` от `fn` — не писать
  - `CreateBook`: после `ensureBook`, если перенос не выбран (пустая база, сервер недоступен или «Не переносить») — `writeBook(port, exampleRows(), {})`; кнопка «Не переносить» в предложении переноса
  - Карточка: подсказка `hint` серым под полем; для строки-примера (`isExampleRow`) — плашка «Это строка-пример: замените значения своими или удалите строку»

- [ ] **Step 1: Write the failing test**:

```ts
test("подсказка проверки данных", () => {
  const p = promptFor(column("Акты", "normative"));
  assert.equal(p.title, "Нормативы (п.6)");
  assert.equal(p.message, column("Акты", "normative").hint);
  assert.equal(promptFor({ ...column("Акты", "normative"), header: "Очень длинный заголовок столбца для проверки" }).title.length, 32);
});
test("правило оформления примеров", () => assert.equal(exampleRule("A", "K", 5), '=COUNTIF($A5:$K5,"Пример:*")>0'));
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(addin): подсказки к столбцам и строки-примеры в новой книге`.

---

### Task 6: Экран «Норматив» — справочник

**Files:**
- Modify: `packages/addin/src/panel/NormativScreen.tsx` (переписать), `packages/addin/src/panel/Panel.tsx` (экран без `restore`), `packages/addin/src/styles.css`, `README.md`
- Create: `packages/addin/src/panel/normsApi.ts`
- Test: `packages/addin/test/normativ.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `openPortal`, `apiGet`, `apiSend`, `ExcelPort.writeActiveCell`.
- Produces:
  - `normsQuery(p: { section?: NormSection | null; q: string; offset: number }): string` → `/api/norms?…` (пустые параметры не добавляются, `limit=100`)
  - `cellAppend(current: CellValue, designation: string): { value: string } | { error: "Уже есть в ячейке" }` — пусто → обозначение; число/дата → `String(current)` как текст; иначе `appendDesignation`
  - `refreshText(s: RefreshState): string` — «Обновляю: <Кнопка>, страница N из M» (без «из M», если `pages` null); ошибка — `error`; иначе «»
  - `NormativScreen({ port })` — §2.6 спецификации: поиск (задержка 250 мс), кнопки разделов со счётчиками, «N документов, обновлён ДД.ММ.ГГГГ» (самая поздняя дата разделов), список с метками `statusTone` и «N с.», выделение строки, «Читать» (`openPortal(url)`), «Карточка» (сведения в панели + «Открыть на портале»), «В ячейку» (`writeActiveCell` + `cellAppend`), «Обновить базу» (POST, опрос GET раз в 1 с до `running=false`, затем перечитать), ⚙ неактивна «Скоро», «Условия» (текст спецификации), пустая база — текст спецификации; подгрузка следующих 100 при прокрутке к концу
  - README: раздел «Норматив» переписан под справочник; ручная проверка — пункты 13–15 заменены: «Обновить базу» (ход, итоговые счётчики около СП 758 / ГОСТ 3421), «Читать»/«Карточка», «В ячейку» в п.6 акта; новый пункт про примеры и подсказки в новой книге

- [ ] **Step 1: Write the failing test**:

```ts
test("адрес запроса справочника", () => {
  assert.equal(normsQuery({ section: null, q: "", offset: 0 }), "/api/norms?offset=0&limit=100");
  assert.equal(normsQuery({ section: "sp", q: "огнест", offset: 100 }), "/api/norms?section=sp&q=" + encodeURIComponent("огнест") + "&offset=100&limit=100");
});
test("В ячейку", () => {
  assert.deepEqual(cellAppend(null, "СП 1"), { value: "СП 1" });
  assert.deepEqual(cellAppend(46231, "СП 1"), { value: "46231, СП 1" });
  assert.deepEqual(cellAppend("ПУЭ.", "СП 1"), { value: "ПУЭ, СП 1." });
  assert.deepEqual(cellAppend("СП 1, ПУЭ", "сп 1"), { error: "Уже есть в ячейке" });
});
test("ход обновления", () => {
  assert.equal(refreshText({ running: true, section: "sp", page: 12, pages: 38, error: null, finishedAt: null }), "Обновляю: СП, страница 12 из 38");
  assert.equal(refreshText({ running: true, section: "gost", page: 3, pages: null, error: null, finishedAt: null }), "Обновляю: ГОСТ, страница 3");
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npm test` PASS; tsc shared/server; `npm run build`; стенд в Chromium (подменённый ExcelPort + подменённый `fetch` к `/api/norms*` с несколькими строками): экран, фильтр, «Карточка», «В ячейку», «Обновить базу» с ходом — скриншоты, ошибок в консоли нет.
- [ ] **Step 5:** Commit `feat(addin): экран «Норматив» — справочник портала`; собрать `konstruktor-id-v0.5.zip`.
