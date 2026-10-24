# План 13: протоколы испытаний и акты приёмки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** конструктор печатает 16 документов справочника (протоколы лаборатории, кабели/трубы, акты приёмки, слаботочка)
по данным книги и выгружает их образцы .docx с метками.

**Architecture:** описание документа `ProtoDef` + общий движок: таблицы книги v9 → `buildProtoBundle` (пакет акта с полем
`proto`) → HTML «протокол лаборатории» / «акт комиссии» → PDF; тот же пакет — для своих форм, реестра, комплекта и полноты.

**Tech Stack:** TypeScript, node:test + tsx, zod, React 19, Office.js, Chromium (печать), pdf-lib.

**Spec:** `docs/superpowers/specs/2026-10-25-protokoly-i-akty-design.md`

## Global Constraints

- Без новых npm-зависимостей.
- `SCHEMA_VERSION = 9`; новые листы «Протоколы и акты», «Замеры электрики», «Барабаны и трубы», «Замеры СКС и ВОЛС»
  добавляются в конец `SHEETS`; имена таблиц и заголовки столбцов — буква в букву как в спецификации §5.
- Виды печати: pkl, pav, puzo, pfn, pms, pzu, pokb, ppkb, atp, aii, atg, apnr, aoma, arps, pzov, ptsks; подписи — коды.
- Новый вид строки реестра — «Акт/протокол» (в конце `REGISTRY_KINDS` перед «Прочее»).
- Тексты: «Есть строки «не соответствует» — впишите заключение»; «Представители: нет членов комиссии для <код>»;
  «нет данных: <документ>»; результат — «соответствует» / «не соответствует»; файл — «<код> №<номер>.pdf».
- Каждый новый столбец — подсказка ≤ 255 и пример (тест `workbook.examples`).
- Тесты: `timeout 600 npx tsx --test "packages/*/test/**/*.test.ts"` (с `IDK_BROWSER` для PDF) зелёные после каждой задачи.
  Коммиты — с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и
  `Claude-Session: https://claude.ai/code/session_01Lefhaf4Eg7PBRqce76dG6t`.

## Review Focus

1. Равенство на границе (время = норме, R = допустимому, затухание = норме) — «соответствует». Тест — задача 1.
2. Документ «на комплект», шапка которого указывает акт комплекта, а не комплект, — находится и печатается. Тест — задача 3.
3. Шаблон плана 12 со своим документом «ПАВ» (скан, на комплект) и своей загруженной формой «ПОКБ» — после
   `upgradeTemplate` встроенные, форма ПОКБ сохранена. Тест — задача 4.
4. Длинная таблица замеров (200 строк) — шапка таблицы на каждой странице PDF, подписи не отрываются. Тест — задача 6.
5. Книга v8 без новых таблиц — печать документа даёт понятную ошибку, а не падение. Тест — задача 3.

---

### Task 1: Описания документов и правила результата (этапы 1–4)

**Files:** Create `packages/shared/src/protocols/defs.ts`, `packages/shared/src/protocols/result.ts`; Modify
`packages/shared/src/acts/schemas.ts` (`PROTO_KINDS`, `PRINT_KINDS`), `packages/shared/src/forms/template.ts`
(`BUILTIN_DOC_LABELS`, `RESERVED`); Test `packages/shared/test/protocols.defs.test.ts`.

**Interfaces — Produces:** `PROTO_KINDS` (16 строк §3.1), `type ProtoKind`; `ProtoDef { kind, code, name, scope: "act"|"kit",
signer: "lab" | ProtoRole[], table: TableName, columns: { key, header, width? }[], rule?: RuleName, source, conclusion,
intro? }`; `PROTO_DEFS: Record<ProtoKind, ProtoDef>`; `protoByCode(code): ProtoDef | undefined`; `isProtoKind(k)`;
`resultOf(def, row: Record<string, CellValue>): "соответствует" | "не соответствует" | null` и `computed(def, row)` —
вычисленные столбцы (ПФН Iкз и Iсраб, ПЗУ приведённое R, ПЗОВ норма).

- [ ] Тесты: 16 видов, коды совпадают с кодами справочника; ПАВ «0,01–0,1» и факт 0,1 → соответствует, 0,11 → не; ПУЗО
  IΔн 30, факт 15 и 30 → соответствует, 14 → не, время 301 при норме 300 → не; ПФН Zп 0,46, C16 → Iкз 500, Iсраб 160 →
  соответствует; ПМС 0,05/0,05 → соответствует; ПЗУ 3 × 1,2 = 3,6 ≤ 4 → соответствует; ПЗОВ 1310 без нормы → норма 0,36;
  ПТСКС FAIL → не соответствует; пустые входы → null.
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 1: описания документов и правила результата».

### Task 2: Книга v9

**Files:** Modify `packages/shared/src/workbook/schema.ts` (таблицы и листы §5, `REGISTRY_KINDS`, v9), `help.ts`;
Test `packages/shared/test/protocols.schema.test.ts`, существующие `workbook.examples`, `layout`.

**Interfaces — Produces:** `TableName` += «Протоколы», «ПереченьОборудования», «ИспытанияКЛ», «ЗамерыАвтоматов», «ЗамерыУЗО»,
«ЗамерыФазаНуль», «ЗамерыМеталлосвязи», «ЗамерыЗаземления», «ОсмотрБарабанов», «ПрогревБарабанов», «ТрубныеПроводки»,
«ЗамерыВолокон», «ЗамерыСКС»; enum «Документ» = коды `PROTO_DEFS`.

- [ ] Тесты: v9; новые листы в конце `SHEETS`; у каждой таблицы строк первый столбец `doc` ref «Протоколы»; каждый столбец
  печати из `PROTO_DEFS[k].columns` есть в таблице `def.table`; подсказки и примеры есть.
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 2: книга v9».

### Task 3: Пакет документа

**Files:** Create `packages/shared/src/protocols/bundle.ts`, `packages/shared/src/protocols/find.ts`; Modify
`packages/shared/src/workbook/bundle.ts` (`proto: ProtoData.optional()`); Test `packages/shared/test/protocols.bundle.test.ts`
(фикстура — `aov1Book` + строки новых таблиц).

**Interfaces — Produces:** `ProtoData` (zod: kind, code, number, dateFrom, dateTo, subject, temperature, humidity, pressure,
purpose, normative, conclusion, rows: Record<string,string>[] (печатные значения + result), lab, instruments, commission:
{ role, position, org, name }[], items (перечень)); `findHeader(book, code, where: { act?: string; kit?: string }): BookRow |
undefined`; `buildProtoBundle(book, number, important): { bundle: ActBundle | null; issues: Issue[] }`.

- [ ] Тесты: ПАВ шапка с комплектом → пакет первого акта комплекта; шапка с актом комплекта → находится (Review Focus 2);
  строка без результата и без нормы → «Не заполнено» в «Результат»; «не соответствует» без заключения — текст ошибки;
  АИИ без строк перечня → перечень из «Материалов в актах» актов комплекта, одинаковые суммируются; АИИ без
  представителей ролей → «Представители: нет членов комиссии для АИИ»; нет таблицы «Протоколы» в книге → ошибка «В книге
  нет таблицы «Протоколы» — «Обновить разметку»» (Review Focus 5); ПОКБ «на акт» без акта → ошибка «Акт».
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 3: пакет документа».

### Task 4: Справочник, шаблоны, полнота

**Files:** Modify `packages/shared/src/catalog/builtin.ts` (16 → builtin), `catalog/need.ts` (`docScope` по `PROTO_DEFS`,
статус `noData`), `forms/template.ts` (`upgradeTemplate`), `packages/server/src/forms/store.ts` (upgrade при чтении);
`docs/catalog/справочник-v1.md` (пересборка); Test `packages/shared/test/protocols.catalog.test.ts`.

**Interfaces — Produces:** `upgradeTemplate(t: UserTemplate): UserTemplate`; `Status` += `"noData"`.

- [ ] Тесты: `checkCatalog` = []; «Из справочника» «ЭМ.ОСВ» → встроенные ПАВ/ПУЗО/ПФН; Review Focus 3; полнота акта ПКЛ без
  шапки → noData, с шапкой → print; `kitShortage` считает noData «на комплект» один раз.
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 4: справочник, шаблоны, полнота».

### Task 5: Реестр и комплект

**Files:** Modify `packages/shared/src/kit/registry.ts`, `kit/request.ts` (`KitRow.doc.proto?: string`, `KitRequest.protos`),
`packages/server/src/kit/assemble.ts`; Test `packages/shared/test/protocols.kit.test.ts`, `packages/server/test/protocols.kit.test.ts`.

**Interfaces — Consumes:** `findHeader`, `buildProtoBundle`. **Produces:** реестр — строка «Акт/протокол» «№<номер>».

- [ ] Тесты: комплект из двух актов с ПКЛ (на акт) и ПАВ (на комплект) → две ПКЛ, одна ПАВ в конце блока; задание
  комплекта: строка «Акт/протокол» → `protos` с пакетом; неизвестный номер → ошибка строки реестра; сборка PDF — листы
  ПАВ с «л.» реестра.
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 5: реестр и комплект».

### Task 6: Печать

**Files:** Create `packages/server/src/print/templates/proto.ts`; Modify `routes/print.ts` (вид из `PROTO_KINDS`),
`print/print.css` при необходимости; Test `packages/server/test/protocols.print.test.ts`.

- [ ] Тесты (HTML): ПАВ — «Протокол №…», шапка лаборатории, строки, «соответствует», приборы, подписи; АИИ — «АКТ №…»,
  «Комиссия в составе», перечень, подписи членов. PDF: ПАВ на 200 строк — шапка таблицы на каждой странице (Review Focus 4);
  ПОКБ, АИИ, ПТСКС — по одному PDF (номер в тексте); имя файла «ПАВ №1.pdf».
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 6: печать».

### Task 7: Свои формы и образец .docx

**Files:** Create `packages/server/src/forms/protoDocx.ts`; Modify `packages/server/src/forms/fields.ts` (значения
`bundle.proto`), `packages/shared/src/forms/fields.ts` (группы меток), маршрут образца (`routes/templates.ts`);
Test `packages/server/test/protocols.docx.test.ts`.

**Interfaces — Produces:** `protoSampleDocx(kind: ProtoKind): Buffer`; `GET /api/forms/sample/:kind`.

- [ ] Тесты: образец ПАВ — корректный XML, метки `{Документ.Номер}`, `{#Строки}…{/Строки}`; `fillDocx(образец, formData(пакет))`
  — номер, все строки, комиссия/приборы; неизвестный вид → 404.
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 7: образцы .docx».

### Task 8: Панель

**Files:** Modify `packages/addin/src/panel/print.ts` (`printProto`), `extras/ActExtras.tsx` (кнопки «на акт»),
`extras/KitExtras.tsx` (кнопки «на комплект»), `catalogApi.ts` (`statusText` noData), `extras/Completeness.tsx`,
`TemplateEditor.tsx` (ссылка «Образец .docx»), `templatesApi.ts` (`templateButtons` по области); Test
`packages/addin/test/protocols.panel.test.ts`.

- [ ] Тесты: `templateButtons(t, "act")` без ПАВ, `(t, "kit")` с ПАВ; `statusText("noData", "ПКЛ")` = «нет данных: ПКЛ»;
  `printProto` без шапки → ошибка «Протоколы», с шапкой → задание печати (мок api). Сборка панели без ошибок.
- [ ] FAIL → реализовать → PASS. Commit «План 13, задача 8: панель».

### Task 9: Документация и выпуск 0.14

- [ ] README («Протоколы испытаний и акты приёмки», чек-лист п.27, версия 0.14), инструкция пользователя, справочник.
- [ ] Весь набор PASS; ревью ветки; слияние в main; установщик 0.14. Commit «План 13: документация, версия 0.14».
