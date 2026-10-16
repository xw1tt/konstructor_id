# План 4. Верхняя строка, «Норматив», выбор шаблона — реализация

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Верхняя строка панели (⌂ / Норматив / Помощник / Шаблоны ▾ / значки), реестр нормативов на листе «Нормативы» с открытием портала protect.gost.ru в окне Office, выбор шаблона, передаваемый в печать.

**Architecture:** Чистая логика (разбор обозначений, адреса портала, шаблоны, действия с реестром) — в `@idk/shared`, тестируется на `MemoryWorkbook`. Панель получает `TopBar` и три экрана; нынешняя панель становится экраном «⌂». Окно портала — служебная страница `portal.html`, которая переходит на разрешённый адрес protect.gost.ru. Сервер принимает код шаблона в задании печати.

**Tech Stack:** TypeScript, React 19 + esbuild, Office.js (ExcelApi 1.9, Dialog API), Node 22 (node:test).

**Spec:** `docs/superpowers/specs/2026-10-16-normativ-shapka-design.md` (дополняет `2026-10-16-kniga-obekta-design.md`).

## Global Constraints

- Новых npm-зависимостей не добавлять.
- Программа не загружает, не хранит и не пересылает страницы портала; открываются только адреса, начинающиеся с `https://protect.gost.ru/`.
- Сообщения — точно: «Нет на портале», «Можно открывать только страницы protect.gost.ru», «Добавлено: N», «Уже есть в п.6», «Неизвестный шаблон: <код>», «Помощник появится в следующих версиях», подсказка значков «Скоро».
- Заголовки таблицы `Нормативы`: «Обозначение», «Наименование», «Вид», «Статус», «Ссылка на портал», «Примечание».
- Тесты `npm test`; типы `npx tsc -p packages/shared|server` (addin .tsx — без @types/react в песочнице, как раньше); сборка `npm run build`.
- Коммиты заканчиваются строками `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.

## Review Focus

1. **Книга версии 0.3 без листа «Нормативы»** — экран «Норматив» показывает «Таблица не найдена» и «Восстановить разметку», а не падает; остальные листы не трогаются. Тест — задача 4.
2. **Обозначение с другим написанием** («СП76.13330.2016», «сп 76.13330.2016 ») — считается тем же, «Собрать из актов» не дублирует. Тест — задача 3.
3. **Чужая или поддельная ссылка** (`http://protect.gost.ru/…`, `https://protect.gost.ru.evil.ru/…`, `javascript:`) — не открывается, сообщение «Можно открывать только страницы protect.gost.ru». Тест — задача 1.
4. **Пустой п.6 у акта** — «Вставить в п.6» даёт ровно обозначение, без ведущей «, ». Тест — задача 3.
5. **Задание печати без поля `template`** (старая панель) — печатается шаблоном СБД. Тест — задача 2.

---

### Task 1: Обозначения, адреса портала, шаблоны, таблица «Нормативы»

**Files:**
- Create: `packages/shared/src/normativ.ts`, `packages/shared/src/templates.ts`
- Modify: `packages/shared/src/workbook/schema.ts` (таблица `Нормативы`, лист «Нормативы» — последним в `SHEETS`)
- Test: `packages/shared/test/normativ.test.ts`

**Interfaces:**
- Produces (`normativ.ts`):
  - `type NormKind = "ГОСТ" | "ГОСТ Р" | "СП" | "ТР" | "ПУЭ" | "Прочее"`; `NORM_KINDS: readonly NormKind[]` (в этом порядке); `NORM_STATUSES = ["Действует", "Заменён", "Отменён"] as const`
  - `normKey(designation: string): string` — верхний регистр, все пробельные символы удалены, «ё»→«е»
  - `extractNormativ(text: string): { designation: string; kind: NormKind }[]` — в порядке появления, без повторов по `normKey`; распознаёт `ГОСТ Р <номер>`, `ГОСТ <номер>`, `СП <номер>`, `ТР ТС <номер>` (номер — цифры с «.», «/», «-»; завершающая точка предложения не входит), слово `ПУЭ`; обозначение нормализуется к виду «СП 76.13330.2016» (один пробел после префикса)
  - `isPortalUrl(url: string): boolean` — строго `https://protect.gost.ru/` в начале (URL разобран, `protocol === "https:"`, `hostname === "protect.gost.ru"`)
  - `type PortalTarget = { ok: true; url: string } | { ok: false; message: string }`
  - `portalTarget(row: { designation: string; kind: string; link: string }): PortalTarget` — непустая ссылка: разрешённая → она, иначе `"Можно открывать только страницы protect.gost.ru"`; пустая: ГОСТ/ГОСТ Р → `/gost`, СП → `/sp`, ТР → `/tr` с `?search=<encodeURIComponent(обозначение)>`; иначе `"Нет на портале"`
- Produces (`templates.ts`): `TEMPLATES = [{ code: "sbd", label: "СБД" }] as const`; `type TemplateCode = (typeof TEMPLATES)[number]["code"]`; `isTemplateCode(s: string): s is TemplateCode`; `loadTemplate(store: TableStore): Promise<TemplateCode>` (настройка `idk.template`; нет/неизвестно → `"sbd"`); `saveTemplate(store: TableStore, code: TemplateCode): Promise<void>`
- Produces (схема): `TableName` + `"Нормативы"`, `SheetName` + `"Нормативы"`; столбцы с ключами `designation` (ключ, важный), `title`, `kind` (enum `NORM_KINDS`, важный), `status` (enum `NORM_STATUSES`, по умолчанию «Действует»), `link`, `note`

- [ ] **Step 1: Write the failing test**:

```ts
const P6 = 'Шифр рабочей документации: КУТ03-Р-ПИР-2-26-100-АОВ1.01.00 листы 0210-0230, рев.1 , СП 76.13330.2016 "Электротехнические устройства", ПУЭ "Правила устройства электроустановок" (6-е и 7-е издания), СП 77.13330.2016 "Системы автоматизации", СП 134.13330.2012 "Системы электросвязи зданий и сооружений. Основные положения проектирования".';
test("обозначения из п.6 акта АОВ1", () => {
  assert.deepEqual(extractNormativ(P6).map((x) => x.designation), ["СП 76.13330.2016", "ПУЭ", "СП 77.13330.2016", "СП 134.13330.2012"]);
  assert.deepEqual(extractNormativ(P6).map((x) => x.kind), ["СП", "ПУЭ", "СП", "СП"]);
});
test("ГОСТ Р, ГОСТ, ТР ТС, точка в конце, повтор", () => {
  assert.deepEqual(extractNormativ("по ГОСТ Р 50571.5.52-2011, ГОСТ 10434-82. ТР ТС 004/2011 и снова гост р 50571.5.52-2011.").map((x) => [x.designation, x.kind]),
    [["ГОСТ Р 50571.5.52-2011", "ГОСТ Р"], ["ГОСТ 10434-82", "ГОСТ"], ["ТР ТС 004/2011", "ТР"]]);
});
test("normKey", () => assert.equal(normKey(" сп76.13330.2016 "), normKey("СП 76.13330.2016")));
test("адрес портала", () => {
  assert.deepEqual(portalTarget({ designation: "СП 76.13330.2016", kind: "СП", link: "" }),
    { ok: true, url: "https://protect.gost.ru/sp?search=" + encodeURIComponent("СП 76.13330.2016") });
  assert.equal((portalTarget({ designation: "ГОСТ Р 1", kind: "ГОСТ Р", link: "" }) as any).url.startsWith("https://protect.gost.ru/gost?search="), true);
  assert.deepEqual(portalTarget({ designation: "ПУЭ", kind: "ПУЭ", link: "" }), { ok: false, message: "Нет на портале" });
  const d = "https://protect.gost.ru/sp/details/9fdcb635-708c-4c67-81a7-83e6baad9ab3";
  assert.deepEqual(portalTarget({ designation: "x", kind: "СП", link: d }), { ok: true, url: d });
});
test("чужие ссылки не открываются", () => {
  for (const link of ["http://protect.gost.ru/sp", "https://protect.gost.ru.evil.ru/x", "javascript:alert(1)", "https://example.com"])
    assert.deepEqual(portalTarget({ designation: "x", kind: "СП", link }), { ok: false, message: "Можно открывать только страницы protect.gost.ru" });
});
test("шаблон: по умолчанию СБД, сохранение", async () => {
  const wb = new MemoryWorkbook();
  assert.equal(await loadTemplate(wb), "sbd");
  await wb.setSetting("idk.template", "zzz"); assert.equal(await loadTemplate(wb), "sbd");
  await saveTemplate(wb, "sbd"); assert.equal(await wb.setting("idk.template"), "sbd");
});
test("таблица Нормативы", () => {
  assert.deepEqual(TABLES["Нормативы"].columns.map((c) => c.header), ["Обозначение", "Наименование", "Вид", "Статус", "Ссылка на портал", "Примечание"]);
  assert.equal(SHEETS.at(-1)!.name, "Нормативы");
});
```

- [ ] **Step 2:** `npm test` → FAIL (модули не найдены). Обновить в `workbook.schema.test.ts` ожидаемый список листов (добавить «Нормативы» последним) — он тоже должен упасть до изменения схемы.
- [ ] **Step 3:** Реализовать по Interfaces.
- [ ] **Step 4:** `npm test` → PASS; `npx tsc -p packages/shared` чисто.
- [ ] **Step 5:** Commit `feat(shared): обозначения нормативов, адреса портала, шаблоны, таблица «Нормативы»`.

---

### Task 2: Шаблон в задании печати

**Files:**
- Modify: `packages/server/src/routes/print.ts`
- Test: `packages/server/test/print.template.test.ts`

**Interfaces:**
- Consumes: `isTemplateCode`, `TemplateCode` (Task 1), `ActBundle`.
- Produces: тело `POST /api/print/:doc` и `POST /api/print-jobs` — `PrintRequest = ActBundle.extend({ template: z.string().default("sbd") })`; код не из `TEMPLATES` → 400 `"Неизвестный шаблон: <код>"`; задание хранит пакет и шаблон. Рендер пока один (СБД), код шаблона передаётся в `sendBundlePdf(res, b, kind, template)` для будущих форм.

- [ ] **Step 1: Write the failing test** (собрать пакет из `aov1Book()` как в `print.bundle.test.ts`):

```ts
test("неизвестный шаблон — 400 с текстом", async () => {
  const r = await post("/api/print-jobs", { ...bundle, template: "abc" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "Неизвестный шаблон: abc");
});
test("без поля template — задание создаётся (СБД)", async () => {
  assert.equal((await post("/api/print-jobs", bundle)).status, 201);
});
test("template: sbd — задание создаётся", async () => {
  assert.equal((await post("/api/print-jobs", { ...bundle, template: "sbd" })).status, 201);
});
```

- [ ] **Step 2:** FAIL (первый тест: 201 вместо 400). **Step 3:** реализовать. **Step 4:** `npm test` PASS; tsc server.
- [ ] **Step 5:** Commit `feat(server): код шаблона в задании печати`.

---

### Task 3: Действия реестра — «Собрать из актов», «Вставить в п.6», поиск

**Files:**
- Create: `packages/shared/src/workbook/normativActions.ts`
- Test: `packages/shared/test/normativActions.test.ts`

**Interfaces:**
- Consumes: `extractNormativ`, `normKey` (Task 1); `Book`, `BookRow`, `readBook`, `TableStore` (план 3); фикстура `aov1Book`.
- Produces:
  - `collectFromActs(store: TableStore, book: Book): Promise<number>` — обозначения из «Нормативы (п.6)» всех актов, которых нет в `Нормативы` (по `normKey`), дописываются в конец таблицы: «Обозначение», «Вид», «Статус» = «Действует»; возвращает число добавленных
  - `type P6Result = { ok: true } | { ok: false; message: string }`
  - `appendToP6(current: string, designation: string): string | null` — `null`, если обозначение уже есть (по `normKey` среди `extractNormativ(current)`); пусто → обозначение; иначе `<текст без завершающей точки>, <обозначение>` + завершающая точка, если она была
  - `insertIntoP6(store: TableStore, book: Book, actNumber: string, designation: string): Promise<P6Result>` — нет акта → `"Акт «<n>» не найден на листе «База актов»"`; уже есть → `"Уже есть в п.6"`
  - `filterNormativ(rows: BookRow[], query: string): BookRow[]` — по вхождению в обозначение или наименование без учёта регистра; пустой запрос — все

- [ ] **Step 1: Write the failing test**:

```ts
test("Собрать из актов: 4 обозначения из АОВ1, повторно — 0", async () => {
  const wb = aov1Book();
  assert.equal(await collectFromActs(wb, await readBook(wb)), 4);
  const t = await wb.read("Нормативы");
  assert.deepEqual(t!.rows.map((r) => r[0]), ["СП 76.13330.2016", "ПУЭ", "СП 77.13330.2016", "СП 134.13330.2012"]);
  assert.equal(t!.rows[1][3], "Действует");
  assert.equal(await collectFromActs(wb, await readBook(wb)), 0);
});
test("иное написание уже существующего не дублируется", async () => {
  const wb = aov1Book(); await wb.insert("Нормативы", 0, [{ "Обозначение": "сп76.13330.2016", "Вид": "СП" }]);
  assert.equal(await collectFromActs(wb, await readBook(wb)), 3);
});
test("appendToP6", () => {
  assert.equal(appendToP6("", "СП 1.1"), "СП 1.1");
  assert.equal(appendToP6("СП 76.13330.2016.", "ГОСТ 10434-82"), "СП 76.13330.2016, ГОСТ 10434-82.");
  assert.equal(appendToP6("ПУЭ", "ГОСТ 1-1"), "ПУЭ, ГОСТ 1-1");
  assert.equal(appendToP6("по СП 76.13330.2016", "сп 76.13330.2016"), null);
});
test("insertIntoP6: уже есть, нет акта, успешно", async () => {
  const wb = aov1Book(); const b = await readBook(wb);
  assert.deepEqual(await insertIntoP6(wb, b, "К32.В.СТ.АОВ1.01.00.1", "СП 76.13330.2016"), { ok: false, message: "Уже есть в п.6" });
  assert.deepEqual(await insertIntoP6(wb, b, "нет", "СП 1"), { ok: false, message: "Акт «нет» не найден на листе «База актов»" });
  assert.deepEqual(await insertIntoP6(wb, b, "К32.В.СТ.АОВ1.01.00.1", "ГОСТ 10434-82"), { ok: true });
  assert.match(String((await readBook(wb)).tables["Акты"]![0].v.normative), /ГОСТ 10434-82\.$/);
});
test("filterNormativ", async () => { /* после collectFromActs: "77" → 1 строка, "пуэ" → 1, "" → 4 */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS, tsc shared.
- [ ] **Step 5:** Commit `feat(shared): действия реестра нормативов`.

---

### Task 4: Окно портала и экран «Норматив»

**Files:**
- Create: `packages/addin/src/portal.html`, `packages/addin/src/portal.ts`, `packages/addin/src/panel/portal.ts`, `packages/addin/src/panel/NormativScreen.tsx`, `packages/addin/src/panel/normativState.ts`
- Modify: `packages/addin/build.mjs` (вход `portal`, копирование `portal.html`), `packages/addin/manifest.xml` (`<AppDomain>https://protect.gost.ru</AppDomain>`), `packages/addin/src/panel/useBook.ts` (`lastAct: string | null` — номер акта последней выделенной строки «Базы актов»)
- Test: `packages/addin/test/normativ.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3; `ExcelPort` (`ensureBook`, `selectCell`, `activateSheet`), `BookState`.
- Produces:
  - `portalDialogUrl(origin: string, url: string): string` → `${origin}/addin/portal.html?to=${encodeURIComponent(url)}`
  - `openPortal(url: string): void` — `Office.context.ui.displayDialogAsync(portalDialogUrl(location.origin, url), { height: 90, width: 70, displayInIframe: false }, cb)`; при ошибке в `cb` или без Office — `window.open(url, "_blank", "noopener")`
  - `portal.ts` (страница окна): `to` из адреса; `isPortalUrl(to)` → `location.replace(to)`; иначе текст «Можно открывать только страницы protect.gost.ru»
  - `normativState(book: Book): "missing" | "empty" | "ok"` — нет таблицы `Нормативы` / пустая / есть строки
  - `NormativScreen({ port, state })`: `missing` → «Таблица не найдена» + «Восстановить разметку» (`port.ensureBook(state.important)` и `state.refresh()`); иначе строка поиска, список (`filterNormativ`), у строки «Открыть на портале» (`portalTarget` → `openPortal` или подсказка-сообщение у кнопки), клик по строке → `selectCell("Нормативы", row, "Обозначение")`; кнопки «Собрать из актов» (→ «Добавлено: N») и «Вставить в п.6» (активна при `state.lastAct`, подпись «Вставить в п.6 акта <номер>»)

- [ ] **Step 1: Write the failing test**:

```ts
test("адрес окна портала", () => {
  assert.equal(portalDialogUrl("https://localhost:3443", "https://protect.gost.ru/sp?search=СП 1"),
    "https://localhost:3443/addin/portal.html?to=" + encodeURIComponent("https://protect.gost.ru/sp?search=СП 1"));
});
test("состояние экрана: книга 0.3 без листа «Нормативы»", async () => {
  const wb = aov1Book(); wb.drop("Нормативы");
  assert.equal(normativState(await readBook(wb)), "missing");
  assert.equal(normativState(await readBook(aov1Book())), "empty");
});
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS; `npm run build` — в `dist` есть `portal.html` и `portal.js`.
- [ ] **Step 5:** Commit `feat(addin): экран «Норматив» и окно портала`.

---

### Task 5: Верхняя строка, «Помощник», «Шаблоны», шаблон в печати; README и сборка

**Files:**
- Create: `packages/addin/src/panel/TopBar.tsx`, `packages/addin/src/panel/AssistantScreen.tsx`, `packages/addin/src/panel/icons.tsx`, `packages/addin/src/panel/screens.ts`
- Modify: `packages/addin/src/panel/Panel.tsx` (нынешнее содержимое — экран «⌂»; над ним `TopBar`; экраны «⌂», «Норматив», «Помощник»; заголовок «Конструктор ИД» заменяется строкой), `packages/addin/src/panel/print.ts` (`printAct(..., template: TemplateCode)` кладёт `template` в тело задания), места вызова `printAct`, `packages/addin/src/styles.css`, `README.md`
- Test: `packages/addin/test/screens.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4.
- Produces:
  - `type ScreenId = "home" | "normativ" | "assistant"`; `SCREENS: readonly { id: ScreenId; label: string }[]` = `[{home,"Конструктор ИД"}, {normativ,"Норматив"}, {assistant,"Помощник"}]`
  - `ASSISTANT_ICONS: readonly { id: "search" | "history" | "chat" | "bell" | "help" | "menu"; label: string }[]` — подписи «Поиск», «История», «Сообщения», «Уведомления», «Справка», «Меню»; все `disabled`, `title` = `«<подпись> — скоро»`
  - `TopBar({ screen, onScreen, template, onTemplate })`: кнопка ⌂ (`aria-label="Конструктор ИД"`), «Норматив» (активный экран — тёмная «таблетка»), «Помощник» (градиентный текст), «Шаблоны ▾» (выпадающий список `TEMPLATES` с отметкой текущего + неактивная строка «Другие заказчики — позже»), справа `ASSISTANT_ICONS` (простые SVG в `icons.tsx`, `currentColor`)
  - Шаблон: `loadTemplate(port)` при старте, `saveTemplate` при выборе; передаётся в `printAct`
  - `AssistantScreen` — «Помощник появится в следующих версиях»
  - README: раздел «Норматив» (реестр, портал, тексты не хранятся, «Собрать из актов», «Вставить в п.6», шаблоны) и пункты ручной проверки 12–15 (верхняя строка; окно портала по ссылке и по поиску, фильтрует ли `?search=`; «Собрать из актов» на АОВ1 → 4; «Вставить в п.6»)

- [ ] **Step 1: Write the failing test**:

```ts
test("экраны и значки", () => {
  assert.deepEqual(SCREENS.map((s) => s.id), ["home", "normativ", "assistant"]);
  assert.deepEqual(ASSISTANT_ICONS.map((i) => i.label), ["Поиск", "История", "Сообщения", "Уведомления", "Справка", "Меню"]);
});
test("печать передаёт шаблон", async () => { /* подменить apiSend через globalThis.fetch: тело POST /api/print-jobs содержит template: "sbd" */ });
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать.
- [ ] **Step 4:** `npm test` PASS; tsc shared/server; `npm run build`. Стенд в Chromium (как в плане 3: подменённый ExcelPort на книге АОВ1) — скриншоты верхней строки, открытого списка «Шаблоны», экрана «Норматив» после «Собрать из актов»; ошибок в консоли нет.
- [ ] **Step 5:** Commit `feat(addin): верхняя строка, «Помощник», выбор шаблона`; собрать `konstruktor-id-v0.4.zip` (`git archive`).
