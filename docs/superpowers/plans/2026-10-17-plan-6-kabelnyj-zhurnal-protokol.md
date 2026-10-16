# План 6. Печать кабельного журнала и протокола изоляции — реализация

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Лист «Изоляция» в книге и печать на акт кабельного журнала (рамка и штамп, листы с «Лист/Листов») и протокола сопротивления изоляции (альбомный, без ограничения страниц) по образцу СБД.

**Architecture:** Новые таблицы описаны в схеме книги (с подсказками и примерами). Данные кабелей акта собираются в общий пакет печати (`ActBundle.cables`) отдельной функцией с собственной проверкой. Раскладка журнала по листам и строки протокола — чистые функции в `@idk/shared`; сервер рендерит два новых HTML-шаблона тем же движком печати.

**Tech Stack:** TypeScript, Node 22 (node:test), React 19 + esbuild, Office.js, playwright-core (печать), pdfjs-dist (тесты).

**Spec:** `docs/superpowers/specs/2026-10-17-kabelnyj-zhurnal-protokol-design.md`.

## Global Constraints

- Новых npm-зависимостей не добавлять.
- Заголовки новых таблиц и тексты сообщений — точно как в спецификации (§2, §5).
- Числа в документах — с десятичной запятой (`formatNumber`); даты — `ДД.ММ.ГГГГ`, дата журнала в штампе — `ММ.ГГ`.
- Каждый столбец новых таблиц — с `hint` (≤ 255) и примером (`HELP` в `workbook/help.ts`); тест «у каждого столбца есть подсказка и пример» должен проходить.
- Печать АОСР/РИМ/ВД/ВОР не меняется; набор `DOC_KINDS` (документы акта из базы) не расширяется — новые виды в `CABLE_DOC_KINDS`.
- Тесты `npm test`; типы `npx tsc -p packages/shared|server`; сборка `npm run build`. Коммиты — со строками `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.

## Review Focus

1. **Ровно 30 строк на листе журнала и 31-я** — 30 строк (кабели + итоги) — один лист; 31 — два листа, во втором штампе «Лист 2», в обоих «Листов 2». Тест — задача 3.
2. **Марка в журнале с двойным пробелом / пробелом на конце** — находит измерения марки, протокол печатается. Тест — задача 2.
3. **Кабель без длины или с длиной текстом «48,5»** — без длины не ломает итог (считается 0, проверка — «Не заполнено», если столбец важный), «48,5» — 48,5. Тест — задача 2.
4. **В акте нет кабелей / нет строки в «ДокументыКабелей»** — понятные сообщения проверки, печать не идёт. Тест — задача 2.
5. **Пример-строки на листе «Изоляция»** (лаборатория-пример, прибор-пример) — не попадают в протокол; при только примерах — «Заполните таблицу …». Тест — задача 2.

---

### Task 1: Лист «Изоляция» в схеме книги

**Files:**
- Modify: `packages/shared/src/workbook/schema.ts`, `packages/shared/src/workbook/help.ts`, `packages/addin/src/panel/sections.ts`
- Test: `packages/shared/test/workbook.cables.schema.test.ts`, `packages/addin/test/panel.sections.test.ts`

**Interfaces:**
- Produces: `TableName` + `"Электролаборатория" | "СредстваИзмерений" | "ИзмеренияМарок" | "ДокументыКабелей"`; `SheetName` + `"Изоляция"`; лист «Изоляция» последним в `SHEETS` с таблицами в этом порядке; столбцы (ключи → заголовки):
  - `Электролаборатория`: `nameAddress` «Организация и адрес» (ключ, важный), `certificate` «Свидетельство», `head` «Руководитель электролаборатории» (важный), `tester` «Испытания провёл» (важный)
  - `СредстваИзмерений`: `name` «Наименование СИ» (ключ, важный), `type` «Тип» (важный), `range` «Диапазон», `accuracy` «Точность», `serial` «Заводской №» (важный), `certificate` «№ свидетельства о поверке» (важный), `checkedOn` «Дата поверки» (date, важный), `nextCheck` «Дата очередной поверки» (date), `authority` «Орган поверки»
  - `ИзмеренияМарок`: `mark` «Марка» (ключ, важный), `purpose` «Назначение», `voltage` «Напряжение мегаомметра, В» (number, умолч. 500, важный), `allowed` «Допустимое сопротивление, МОм» (number, умолч. 0.5, важный), `ab` «А-В», `bc` «В-С», `ca` «С-А», `an` «A-N (PEN)», `bn` «B-N (PEN)», `cn` «C-N (PEN)», `ape` «A-PE», `bpe` «B-PE», `cpe` «C-PE», `npe` «N-PE» (текст)
  - `ДокументыКабелей`: `act` «Акт» (ref Акты, ключ, важный), `journalCode` «Шифр журнала» (важный), `journalDate` «Дата журнала» (date, важный), `protocolNumber` «№ протокола» (важный), `dateFrom` «Измерения с» (date, важный), `dateTo` «Измерения по» (date, важный), `temperature` «Температура, °C» (number, умолч. 20), `humidity` «Влажность, %» (number, умолч. 60), `purpose` «Цель испытаний» (умолч. «приемо-сдаточные»), `normative` «Нормативы» (longtext, умолч. «ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34»), `integrity` «Целостность жил» (longtext, умолч. «Проведена проверка целостности жил кабельных линий. Замечания отсутствуют.»), `conclusion` «Заключение» (longtext, умолч. «Результаты проведенных измерений соответствуют требованиям ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34»)
  - Примеры: лаборатория `Пример: ООО «Электролаб». г. Москва, ул. Измерительная, д. 1`; прибор `Пример: Измеритель параметров электроустановок`; марка `Пример: ВВГнг(А)-LS 3х2,5`; документы — акт `EX_ACT`
  - `SECTIONS`: раздел «Кабельный журнал» — листы `["Кабельный журнал", "Изоляция"]`

- [ ] **Step 1: Write the failing test**:

```ts
test("лист «Изоляция» и его таблицы", () => {
  assert.equal(SHEETS.at(-1)!.name, "Изоляция");
  assert.deepEqual(SHEETS.at(-1)!.tables, ["Электролаборатория", "СредстваИзмерений", "ИзмеренияМарок", "ДокументыКабелей"]);
  assert.deepEqual(TABLES["ИзмеренияМарок"].columns.map((c) => c.header).slice(4),
    ["А-В", "В-С", "С-А", "A-N (PEN)", "B-N (PEN)", "C-N (PEN)", "A-PE", "B-PE", "C-PE", "N-PE"]);
  assert.equal(keyColumn("ДокументыКабелей")?.header, "Акт");
  assert.equal(column("ДокументыКабелей", "normative").default, "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34");
  assert.equal(column("ИзмеренияМарок", "voltage").default, 500);
});
// panel.sections.test: sectionForSheet("Изоляция") === "cables"
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать (подсказки и примеры — в `HELP`). **Step 4:** `npm test` PASS (включая «у каждого столбца есть подсказка и пример», «книга из одних примеров — пустая»), tsc shared.
- [ ] **Step 5:** Commit `feat(shared): лист «Изоляция» — лаборатория, приборы, измерения марок, документы кабелей`.

---

### Task 2: Данные кабелей акта и проверка

**Files:**
- Create: `packages/shared/src/workbook/cables.ts`, `packages/shared/test/fixtures/aov1-cables.json`
- Modify: `packages/shared/src/workbook/bundle.ts` (поле `cables` в `ActBundle`, необязательное), `packages/shared/test/fixtures/aov1Book.ts` (кабели и лист «Изоляция»)
- Test: `packages/shared/test/workbook.cables.test.ts`

**Interfaces:**
- Consumes: Task 1; `buildBundle`, `readBook`, `Issue`.
- Produces:
  - zod/типы: `CableRow { group: string; designation: string; from: string; to: string; direction: string; cableMark: string; cableLength: number | null; pipeMark: string; pipeLength: number | null; note: string }`; `MarkMeasure { mark: string; purpose: string; voltage: number | null; allowed: number | null; values: string[] /* 10 */ }`; `CableDoc { journalCode: string; journalDate: string | null; protocolNumber: string; dateFrom: string | null; dateTo: string | null; temperature: number | null; humidity: number | null; purpose: string; normative: string; integrity: string; conclusion: string }`; `Lab { nameAddress: string; certificate: string; head: string; tester: string }`; `Instrument { name; type; range; accuracy; serial; certificate: string; checkedOn: string | null; nextCheck: string | null; authority: string }`; `CablesData { rows: CableRow[]; marks: MarkMeasure[]; doc: CableDoc | null; lab: Lab | null; instruments: Instrument[] }`
  - `ActBundle.cables?: CablesData`
  - `markKey(mark: string): string` — края обрезаны, пробельные последовательности → один пробел, верхний регистр
  - `type CableDocKind = "kj" | "ip"`
  - `buildCableBundle(book: Book, actNumber: string, important: ImportantMap, kind: CableDocKind): { bundle: ActBundle | null; issues: Issue[] }` — `buildBundle` + кабели акта; проверки спецификации §5 (тексты точно): «В кабельном журнале нет кабелей акта «<n>»», «Нет строки акта «<n>» в таблице «ДокументыКабелей»», для `ip`: «Нет в таблице «ИзмеренияМарок»: <марка>» (issue на строку кабеля, столбец «Кабель: марка, число жил, сечение»), «Заполните таблицу «Электролаборатория»», «Заполните таблицу «СредстваИзмерений»»; важные столбцы, числа и даты строк кабелей акта, строки документов акта, (для `ip`) используемых марок, лаборатории и приборов
  - `collectMarks(store: TableStore, book: Book): Promise<number>` — дописывает в `ИзмеренияМарок` марки журнала (по `markKey`), которых нет, с «Напряжение» 500 и «Допустимое» 0,5; возвращает число добавленных
- Фикстура `aov1-cables.json`: 25 кабелей АОВ1 из «Исходники АОВ1.xlsx», лист «1» (столбцы C обозначение, F откуда, I куда, L направление, O марка, U длина, V труба, Y длина трубы, Z примечание; группа — «Этаж <префикс до точки>»), лаборатория, 2 прибора и строка документов (шифр «СБД-1436-АОВ1К1», дата журнала 2026-06-30, протокол «1», измерения 2026-06-05 … 2026-06-06) — из листа «Sheet1» и стр. 19–23 образца; марка — «СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В», назначение «RS-485», 500, 0,5, «>1000» в «А-В», остальные пусто. Сгенерировать один раз скриптом из `/tmp/claude-0/-home-claude/1a0a294f-d685-5aba-881f-5ab24bfe9a10/scratchpad/tpl/Исходники АОВ1.xlsx` (в журнале у марки двойной пробел «HF  1х2х» — сохранить как в источнике).

- [ ] **Step 1: Write the failing test**:

```ts
test("кабели АОВ1 для журнала и протокола", async () => {
  const { bundle, issues } = buildCableBundle(await readBook(aov1Book()), AOV1, defaultImportant(), "ip");
  assert.deepEqual(issues, []);
  assert.equal(bundle!.cables!.rows.length, 25);
  assert.equal(bundle!.cables!.rows.reduce((a, r) => a + (r.cableLength ?? 0), 0).toFixed(1), "1618.9");
  assert.equal(bundle!.cables!.doc!.journalCode, "СБД-1436-АОВ1К1");
  assert.equal(bundle!.cables!.instruments.length, 2);
});
test("марка с двойным пробелом находит измерения", …);            // markKey("A  B ") === markKey("A B")
test("длина текстом «48,5» читается, пустая длина не ломает журнал", …);
test("нет кабелей акта / нет строки документов — сообщения", …);    // тексты спецификации
test("протокол без лаборатории и приборов (только примеры) — сообщения", …);
test("журнал не требует марок и лаборатории", …);                   // kind "kj" при пустых ИзмеренияМарок — без issues про марки
test("Собрать марки из журнала", async () => { /* пустые ИзмеренияМарок → 1 добавлена, повторно 0; Напряжение 500, Допустимое 0,5 */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS; tsc shared.
- [ ] **Step 5:** Commit `feat(shared): данные кабелей акта, проверка журнала и протокола, сбор марок`.

---

### Task 3: Раскладка журнала по листам, строки протокола, подписи штампа

**Files:**
- Create: `packages/shared/src/acts/cableDocs.ts`
- Test: `packages/shared/test/cableDocs.test.ts`

**Interfaces:**
- Consumes: Task 2; `formatNumber`, `Representative`, `Organization`.
- Produces:
  - `type JournalLine = { kind: "group"; title: string } | { kind: "cable"; row: CableRow } | { kind: "total"; label: "ИТОГО" | "Всего"; mark: string; length: string; pipe?: boolean }`
  - `journalLines(rows: CableRow[]): JournalLine[]` — группы (строка-заголовок при смене непустой «Группы»), кабели, затем `ИТОГО` по маркам кабеля в порядке первого появления (сумма длин, `formatNumber`), «Всего» — если марок больше одной; затем так же по трубам (`pipe: true`), если есть
  - `JOURNAL_LINES_PER_SHEET = 30`; `journalSheets(lines: JournalLine[]): JournalLine[][]` — по 30; пустой список — один пустой лист
  - `journalSigners(reps: Representative[], orgs: Organization[], date: string): { position: string; name: string; org: string }[]` — `performer` по `sortOrder`, затем `developer_control` (действующие на дату), не больше 5
  - `monthYear(iso: string | null): string` → «06.26»
  - `protocolRows(rows: CableRow[], marks: MarkMeasure[]): { n: number; line: string; mark: string; voltage: string; allowed: string; values: string[] }[]` — `line` = «<обозначение>; <назначение>» (без «; » при пустом назначении); числа с запятой; пустые значения → «—»

- [ ] **Step 1: Write the failing test**:

```ts
test("журнал АОВ1: 25 кабелей + ИТОГО = 26 строк, один лист", () => {
  const lines = journalLines(cables);          // из фикстуры
  assert.equal(lines.filter((l) => l.kind === "cable").length, 25);
  assert.deepEqual(lines.at(-1), { kind: "total", label: "ИТОГО", mark: "СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В", length: "1618,9" });
  assert.equal(journalSheets(lines).length, 1);
});
test("30 строк — один лист, 31 — два", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ ...cables[0], designation: `К${i}` }));
  assert.equal(journalSheets(journalLines(mk(29))).length, 1);   // 29 + ИТОГО = 30
  assert.equal(journalSheets(journalLines(mk(30))).length, 2);   // 30 + ИТОГО = 31
});
test("две марки — ИТОГО по каждой и Всего; заголовки групп", …);
test("подписи штампа АОВ1: Востров, Королев, Валерьянов; дата 06.26", …);
test("строки протокола: «П2.Щ-АК2-17; RS-485», 500, «0,5», «>1000», остальные «—»", …);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS; tsc shared.
- [ ] **Step 5:** Commit `feat(shared): раскладка кабельного журнала и строки протокола`.

---

### Task 4: Шаблоны печати и маршрут

**Files:**
- Create: `packages/server/src/print/templates/kj.ts`, `packages/server/src/print/templates/ip.ts`, `packages/server/src/print/cableData.ts`
- Modify: `packages/shared/src/acts/schemas.ts` (`CABLE_DOC_KINDS = ["kj", "ip"]`, `PRINT_KINDS = [...DOC_KINDS, ...CABLE_DOC_KINDS]`, `type PrintKind`), `packages/server/src/print/templates/index.ts`, `packages/server/src/routes/print.ts` (виды `PRINT_KINDS`; для `kj`/`ip` без `cables` в пакете — 400 «В пакете нет данных кабельного журнала»; имена файлов `<шифр журнала>.pdf` и `<база>.Протокол.pdf`), `packages/server/src/print/print.css`
- Test: `packages/server/test/print.cables.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  - `KjData { sheets: JournalLine[][]; stamp: { code: string; object: string; section: string; org: string; signers: { position: string; name: string; org: string }[]; date: string } }`; `IpData { lab: Lab; customer: string; object: string; project: string; dates: string; number: string; temperature: string; humidity: string; purpose: string; normative: string; rows: ReturnType<typeof protocolRows>; integrity: string; conclusion: string; instruments: Instrument[] }`
  - `cableDocData(b: ActBundle, kind: "kj"): KjData` / `(b, "ip"): IpData` в `cableData.ts`
  - `kjHtml(d: KjData)` — каждый лист: рамка (поля 20/5/5/5 мм), таблица журнала (шапка как в образце), пустые строки до 30, основная надпись формы 3 (графы «Изм., Кол.уч, Лист, № док., Подпись, Дата», строки подписей, шифр, объект, раздел, «Кабельный журнал», «Стадия ИД», «Лист N», «Листов M», организация), слева графы «Взам. инв. №», «Подп. и дата», «Инв. № подл.»; `page-break-after` между листами; `@page { size: A4 portrait; margin: 0 }`
  - `ipHtml(d: IpData)` — `@page { size: A4 landscape; margin: 10mm }`, шапка в две колонки, тексты спецификации §4, таблица 15 столбцов с повторяемой шапкой и строкой «1…15», затем целостность, заключение, приборы, подписи

- [ ] **Step 1: Write the failing test** (пакет из `aov1Book()` через `buildCableBundle`; PDF через `POST /api/print/:doc`, `pdfPages`):

```ts
test("КЖ АОВ1: 1 лист, шифр, ИТОГО 1618,9, подписи, Лист 1 Листов 1", async () => {
  const { pages } = await pdf("kj");
  assert.equal(pages.length, 1);
  const t = pages[0];
  for (const s of ["СБД-1436-АОВ1К1", "П2.Щ-АК2-17", "ИТОГО", "1618,9", "Востров", "Королев", "Валерьянов", "06.26", "Кабельный журнал", "ИД"]) assert.ok(t.includes(s), s);
});
test("КЖ на 70 кабелей — 3 листа, «Листов 3» на каждом, листы 1, 2, 3", …);
test("протокол АОВ1: альбомный, 25 строк, «П2.Щ-АК2-17; RS-485», «>1000», приборы, подписи; страниц 3–5", …);
test("протокол на 200 линий — все строки по порядку, «200» есть, шапка таблицы на каждой странице", …);
test("kj без cables в пакете — 400", …);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npm test` PASS; tsc server. **Сверка:** отрисовать оба документа АОВ1 в PNG (`pdftoppm -r 70`) рядом со стр. 19 и 20 образца (`docs/screens/plan6-compare-kj.png`, `…-ip.png`); различия записать в `docs/plan6-sverka.md`.
- [ ] **Step 5:** Commit `feat(server): печать кабельного журнала и протокола изоляции`.

---

### Task 5: Панель, README, сборка

**Files:**
- Modify: `packages/addin/src/panel/print.ts` (`printAct` для `kj`/`ip` вызывает `buildCableBundle`; тип `PrintKind`), `packages/addin/src/panel/extras/ActExtras.tsx` (кнопки «КЖ», «Протокол»), `packages/addin/src/panel/extras/CableExtras.tsx` («Изоляция» — переход на лист, «Собрать марки из журнала» → «Добавлено марок: N»), `packages/addin/src/book/defaults.ts` (`ДокументыКабелей`: «Акт» = `book`-последний акт без строки документов), `README.md`
- Test: `packages/addin/test/cables.panel.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `printAct(book, act, important, doc: PrintKind, template)` — тело задания как раньше
  - `newRowDefaults("ДокументыКабелей", book)` — умолчания схемы + «Акт» = номер последнего акта (по порядку листа «База актов»), у которого ещё нет строки в «ДокументыКабелей»; если все есть — пусто
  - README: раздел «Кабельный журнал и протокол изоляции» (лист «Изоляция», порядок заполнения: лаборатория → приборы → «Собрать марки» и значения → строка документов на акт → печать) и пункты ручной проверки 17–19

- [ ] **Step 1: Write the failing test**:

```ts
test("печать протокола передаёт кабели в задании", async () => { /* как screens.test: подменный fetch; body.cables.rows.length === 25 */ });
test("умолчания новой строки «ДокументыКабелей»", async () => {
  const b = await readBook(aov1BookWithoutCableDoc());
  const d = newRowDefaults("ДокументыКабелей", b);
  assert.equal(d["Акт"], AOV1); assert.equal(d["Нормативы"], "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34"); assert.equal(d["Напряжение мегаомметра, В"], undefined);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npm test` PASS; `npm run build`; стенд в Chromium: карточка акта — кнопки «КЖ»/«Протокол», раздел «Кабельный журнал» — «Собрать марки» (ошибок в консоли нет).
- [ ] **Step 5:** Commit `feat(addin): печать КЖ и протокола из карточки акта, сбор марок`; собрать `konstruktor-id-v0.6.zip`.
