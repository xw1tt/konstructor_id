# План 12: справочник видов документов и контроль полноты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** справочник «раздел → вид работ → документы» (встроенный + дополнения пользователя), сборка шаблона из него, «Вид работ» и «Без документов» у акта, документы-сканы в реестре/комплекте, контроль полноты в карточке акта и перед сборкой комплекта.

**Architecture:** справочник и вся логика (слияние, документы акта, полнота) — чистые функции в `@idk/shared/catalog/*`; дополнения пользователя — `<dataDir>/catalog.json` через сервер; шаблон хранит ссылки на справочник в `TemplateDoc`; панель вызывает shared-функции.

**Tech Stack:** TypeScript, node:test + tsx, zod, React 19, Office.js 1.9.

**Spec:** `docs/superpowers/specs/2026-10-24-spravochnik-dokumentov-design.md`

## Global Constraints

- Без новых npm-зависимостей. В справочнике — только названия и обозначения/пункты нормативов, без текстов.
- Перечни сторонних сайтов не используются; источники: 344/пр, СП 76.13330, ПУЭ гл. 1.8, СП 77.13330, СП 134.13330, СП 484.1311500.
- Разделы первой версии (коды): `ЭМ` электромонтажные работы, `ЭС` сети электроснабжения, `СС` слаботочные системы и сети связи, `АВТ` автоматизация (СУДИО, АСКУЭ), `ПС` пожарная сигнализация.
- `SCHEMA_VERSION = 8`; новые столбцы «Базы актов»: «Вид работ», «Без документов» (в конце); список видов работ — лист «Списки», имя `ВидыРабот`.
- Тексты: «Код «X» занят встроенным документом»; «нет скана: <документ>»; «нет формы: <документ>»; сводка комплекта «Не хватает документов: N».
- Тесты: `timeout 600 npx tsx --test "packages/*/test/**/*.test.ts"` зелёные после каждой задачи. Коммиты — с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.

## Review Focus

1. Акт с несколькими видами работ «Прокладка КЛ; Монтаж лотков» — документы обоих без дублей. Тест — задача 4.
2. Шаблон, сохранённый до плана 12 (без полей справочника), и книга v7 — всё работает как раньше (акт без вида работ — все документы «на акт»). Тест — задачи 3 и 4.
3. Вид работ из книги, которого больше нет в справочнике (скрыт/удалён) — предупреждение, а не падение; документы без привязки. Тест — задача 4.
4. Скан «на комплект» при двух актах одного вида — одна строка реестра, а не две. Тест — задача 5.
5. Скрытый встроенный документ, уже стоящий в шаблоне, — остаётся в шаблоне (скрытие влияет только на выбор из справочника). Тест — задача 2.

---

### Task 1: Модель справочника и проверка

**Files:** Create `packages/shared/src/catalog/model.ts`, `packages/shared/src/catalog/builtin.ts` (каркас: 5 разделов, по 1 виду работ с документами конструктора — полное наполнение в задаче 6); Test `packages/shared/test/catalog.model.test.ts`.

**Interfaces — Produces:** zod `CatalogDoc`, `CatalogWork`, `CatalogSection`, `Catalog`, `UserCatalog` (`{ docs, sections, hidden: string[] }`) по спецификации §1; `BUILTIN_CATALOG: Catalog`; `checkCatalog(c: Catalog): string[]` — ошибки: «Повтор кода документа «X»», «Пункт 344/пр документа «X» — 1–13», «Вид работ «W» ссылается на неизвестный документ «X»», «Документ «X»: make=builtin без вида печати», «Повтор кода вида работ «W»».

- [x] Тест: `checkCatalog(BUILTIN_CATALOG)` = `[]`; на испорченных копиях — каждая из 5 ошибок ровно с текстом выше; встроенные документы конструктора в каталоге: коды `АОСР`, `РИМ`, `ВД`, `ВОР`, `АВК`, `КЖ`, `ПСИ` с `make:"builtin"` и `builtin` = `aosr`, `rim`, `vd`, `vor`, `avk`, `kj`, `ip`.
- [x] FAIL → реализовать → PASS. Commit «План 12, задача 1: модель справочника».

### Task 2: Дополнения пользователя и API

**Files:** Create `packages/shared/src/catalog/merge.ts`, `packages/server/src/catalog/store.ts`, `packages/server/src/routes/catalog.ts`; Modify `app.ts`, `forms/store.ts` (выгрузка/загрузка шаблона со своими документами справочника); Test `packages/shared/test/catalog.merge.test.ts`, `packages/server/test/catalog.api.test.ts`.

**Interfaces — Produces:** `mergeCatalog(builtin: Catalog, user: UserCatalog): { catalog: Catalog & { own: Set<string> }; errors: string[] }` (свои документы/виды работ/разделы добавляются; свой вид работ может быть во встроенном разделе — по коду раздела; `hidden` убирает документы и виды работ из выбора; конфликт кода — «Код «X» занят встроенным документом»); `CatalogStore` (`user()`, `save(u)`); `GET /api/catalog` → `{ catalog, own: string[], hidden: string[] }`; `PUT /api/catalog/user` (422 при ошибках). В `.idk-template` — файл `catalog.json` со своими документами/видами работ, на которые ссылается шаблон; при загрузке — добавляются отсутствующие.

- [x] Тесты: свой документ и свой вид работ во встроенном разделе «ЭМ» видны в итоге; скрытый «ВОР» не в выборе, но `docs` справочника его по коду находит (Review Focus 5); конфликт кода — ошибка; API сохраняет и отдаёт; конфликт — 422; выгрузка шаблона со своим документом справочника → загрузка на чистом сервере даёт этот документ в справочнике.
- [x] FAIL → реализовать → PASS. Commit «План 12, задача 2: дополнения справочника».

### Task 3: Шаблон из справочника

**Files:** Modify `packages/shared/src/forms/template.ts` (поля `catalog?`, `works?`, `scope?`, `scan?` у `TemplateDoc`; `validateTemplate` — скан не требует формы); Create `packages/shared/src/catalog/template.ts`; Test `packages/shared/test/catalog.template.test.ts`.

**Interfaces — Produces:** `addWork(t: UserTemplate, c: Catalog, work: string): UserTemplate` (документы вида работ: `make=builtin` → `{kind:"builtin", doc, catalog, works:[work]}`, иначе `{kind:"custom", code, name, form:null, catalog, works:[work], scope, scan: make==="scan"}`; уже есть (по `catalog` или по встроенному `doc`) — дописать `work` в `works`); `removeWork(t, work): { template: UserTemplate; removed: string[] }` (убрать `work` из `works`; документ из справочника без видов работ — удалить, имена — в `removed`); `templateWorks(t): string[]`.

- [x] Тесты: `addWork` двух видов с общим «АОСР» — один документ, `works` из двух; повторный `addWork` того же вида ничего не меняет; `removeWork` убирает только документы без оставшихся видов; ручной свой документ (без `catalog`) `removeWork` не трогает; шаблон без новых полей (JSON плана 11) парсится (Review Focus 2).
- [x] FAIL → реализовать → PASS. Commit «План 12, задача 3: шаблон из справочника».

### Task 4: Книга v8, документы акта и полнота

**Files:** Modify `packages/shared/src/workbook/schema.ts` (столбцы `works` «Вид работ» — `refs` с `listRange: "ВидыРабот"`, `skipDocs` «Без документов» — text; `ColumnDef.listRange?`; v8), `help.ts`, `packages/addin/src/book/layout.ts` (`listSource` для `listRange`), `packages/addin/src/book/excelPort.ts` (`writeWorkList(names: string[])` — диапазон на «Списках» и имя `ВидыРабот`); Create `packages/shared/src/catalog/need.ts`; Test `packages/shared/test/catalog.need.test.ts`, дополнить `layout.test.ts`.

**Interfaces — Produces:** `actWorks(book, act): string[]` (по названию или коду вида работ из справочника; неизвестные — в `unknown`); `actDocs(t: UserTemplate, c: Catalog, book: Book, act: string): { docs: TemplateDoc[]; unknown: string[] }`; `kitDocs(t, c, book, acts: string[]): TemplateDoc[]`; `type Status = "print" | "scan" | "noScan" | "noForm"`; `completeness(t, c, book, act): { doc: TemplateDoc; label: string; status: Status; number: string }[]` (номер скана «на акт» — `<номер акта>.<код>`; скан найден — строка «РеестрИД» с этим номером и непустым «Сканом»); `kitShortage(t, c, book, kit): { act: string | null; label: string; status: Status }[]`.

- [x] Тесты: акт «Прокладка кабельных линий; Монтаж кабельных лотков» — документы обоих без дублей (Review Focus 1); акт без вида работ — все «на акт»; «Без документов» = «ПИК» убирает документ; вид работ не из справочника → `unknown` и документы без привязки (Review Focus 3); `completeness`: АОСР — `print`, скан с файлом в реестре — `scan`, без — `noScan`, свой «форма» без формы — `noForm`; `kitShortage` — скан «на комплект» один раз; `listSource` для «Вид работ» = `=ВидыРабот`; схема v8 и обновление разметки v7 → v8 (новые столбцы в конце).
- [x] FAIL → реализовать → PASS. Commit «План 12, задача 4: документы акта и полнота».

> Отступления при реализации: ключ столбца «Вид работ» — `workKinds` (`works` в «Актах» уже занят «Работами (п.1)»); `actWorks(c, book, act)` принимает справочник и возвращает `{ works, unknown }`; документы без привязки к видам работ нужны любому акту; проверка книги не сверяет «Вид работ» с таблицами (его проверяет справочник).

### Task 5: Сканы в реестре и комплекте

**Files:** Modify `packages/shared/src/kit/registry.ts`, `packages/shared/src/kit/request.ts`; Test дополнить `packages/shared/test/kit.custom.test.ts`.

**Interfaces — Consumes:** `actDocs`, `kitDocs`. **Produces:** `registryRows(book, kit, template?, catalog?)` — документы шаблона по акту через `actDocs` (без каталога — как в плане 11); скан «на акт» — строка «Свой документ» `№<акт>.<код>`; скан «на комплект» — одна строка в конце блока комплекта (`<код>`, без акта); `buildKitRequest`: строка «Свой документ» со сканом — `file` обязателен («Нет скана: укажите файл в столбце «Скан»»), форма не нужна.

- [x] Тесты: шаблон с «ПИК» (скан, на акт) и «СЭЛ» (скан, на комплект) на комплекте из двух актов — две строки «ПИК», одна «СЭЛ» (Review Focus 4); задание комплекта без файла «ПИК» — ошибка «Нет скана…», с файлом — строка со `file`, без `doc`.
- [x] FAIL → реализовать → PASS. Commit «План 12, задача 5: сканы в реестре и комплекте».

> При реализации: без справочника в реестр попадают все документы шаблона (свои — с формой или «скан»), документы «на комплект» — строкой «<код>» в конце; скан в задании комплекта не проверяет акт и не печатается (`doc: null`).

### Task 6: Наполнение справочника

**Files:** Modify `packages/shared/src/catalog/builtin.ts`; Create `docs/catalog/справочник-v1.md` (таблица для просмотра: раздел, вид работ, документ, код, пункт 344/пр, источник, кто делает, на акт/комплект).

- [ ] Для разделов `ЭМ`, `ЭС`, `СС`, `АВТ`, `ПС`: виды работ и документы по источникам Global Constraints; источник — обозначение и пункт, сверенные по тексту СП/ПУЭ (WebSearch/WebFetch); документ без подтверждённого пункта — источник «344/пр, п. N» и пометка «уточнить» в таблице.
- [ ] `checkCatalog(BUILTIN_CATALOG)` = `[]`; весь набор PASS.
- [ ] Таблица опубликована пользователю на просмотр (Docs-документ). Правки пользователя вносятся до выпуска. Commit «План 12, задача 6: наполнение справочника».

### Task 7: Панель

**Files:** Create `packages/addin/src/panel/CatalogPicker.tsx`, `packages/addin/src/panel/extras/Completeness.tsx`, `packages/addin/src/panel/catalogApi.ts`; Modify `TemplateEditor.tsx` (кнопка «Из справочника», у документа — «скан/форма», «на акт/комплект», виды работ), `ActExtras.tsx` (блок «Полнота»), `KitExtras.tsx` (сводка перед сборкой), `Panel.tsx` (справочник в контексте; запись списка видов работ в книгу при загрузке справочника и «Обновить разметку»); Test `packages/addin/test/catalog.panel.test.ts`.

**Interfaces — Produces:** `statusText(s: Status, label: string): string` («печатается: …», «скан есть: …», «нет скана: …», «нет формы: …»); `skipDoc(store, book, act, code): Promise<void>` (дописывает код в «Без документов» через «; »); `shortageText(n: number)` = «Не хватает документов: N».

- [ ] Тесты: `statusText` для четырёх статусов; `skipDoc` на MemoryWorkbook дописывает без повторов; `shortageText(3)`.
- [ ] Реализовать; сборка панели; снимок редактора с открытым «Из справочника» и карточки акта с «Полнотой» просмотрен. Commit «План 12, задача 7: панель справочника».

### Task 8: Документация и выпуск

- [ ] README (раздел «Справочник документов», чек-лист п.26, версия 0.13), инструкция пользователя (файл и Docs-документ) — раздел «Справочник и полнота».
- [ ] Весь набор PASS; установщик 0.13 собран. Commit «План 12: документация, версия 0.13»; push. Слияние — после подтверждения пользователя.
