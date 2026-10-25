# План 15: быстрое чтение книги, без наследия 0.2, одно описание документов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** панель читает книгу за один заход и перечитывает только изменённую таблицу; удалён код версии 0.2; документы акта
описаны в одном месте.

**Architecture:** `TableStore.readMany?` + `bookFromTables`; `useBook` держит таблицы и обновляет одну; `ACT_DOC_DEFS` в shared
и `ACT_DOC_RENDER` на сервере вместо разборов вида документа.

**Tech Stack:** TypeScript, node:test + tsx, zod, React 19, Office.js, Chromium.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-0-design.md` §2

## Global Constraints

- Без новых зависимостей. `SCHEMA_VERSION = 10`. Тексты, номера, формы и имена файлов документов не меняются.
- Тесты: `npm test` (с `IDK_BROWSER`) зелёные после каждой задачи; коммиты с
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Lefhaf4Eg7PBRqce76dG6t`.

## Review Focus

1. Частичное перечитывание = полное чтение (риск 1 спецификации). Тест — задача 1.
2. Нормативы и сканы после удаления 0.2 работают. Тест — задача 2 (существующие).
3. Имена файлов и номера всех 8 документов в обоих наборах — как до рефакторинга. Тест — задача 4.

---

### Task 1: Чтение книги одним заходом и обновление одной таблицы
Files: `shared/src/workbook/store.ts` (`readMany?`), `shared/src/workbook/records.ts` (`bookFromTables`, `readBook`),
`shared/src/workbook/memory.ts` (счётчик чтений для тестов не нужен — `readMany` в модели), `addin/src/book/excelPort.ts`
(`readMany`), `addin/src/panel/bookCache.ts` (новый: `BookCache` — таблицы, `full()`, `refreshTable(name)`),
`addin/src/panel/useBook.ts`; Test `shared/test/readmany.test.ts`, `addin/test/bookcache.test.ts`.
- [x] Тесты: `readBook` через `readMany` = через `read`; `bookFromTables` с отсутствующей таблицей → `missing`;
  `BookCache`: полное чтение одним `readMany`; изменение одной таблицы → один `read` этой таблицы, книга = полному чтению
  (в т. ч. после вставки строк и правки «Объекта»); неизвестная таблица/ошибка → полное чтение.

### Task 2: Удаление наследия 0.2
Files: удалить `server/src/routes/export.ts`, `server/src/print/fromDb.ts`, `server/src/print/data.ts` (типы данных — в
`fromBundle.ts`), `server/src/seed/`, `scripts/seed-sbd.ts`, старые `server/src/repo/*` кроме `normCatalog.ts` (+ `util.ts`,
если нужен), `shared/src/workbook/migrate.ts` → `shared/src/workbook/write.ts` (`writeBook`, `BookRecords`, `BookLinks`);
`server/src/app.ts`, `addin/src/panel/CreateBook.tsx`; тесты печати на `aov1Records`; удалить тесты переноса.
- [x] Тесты: `/api/export` → 404; печать АОСР/РИМ/ВД/ВОР из книги — проверки прежних тестов печати из базы; нормативы,
  сканы, примеры новой книги — зелёные.

### Task 3: Описания документов акта (shared)
Files: `shared/src/docs/defs.ts` (новый), `shared/src/acts/format.ts` (`docNumberFor` через defs), `shared/src/kit/registry.ts`
(наименования), `shared/src/kit/request.ts` (`PRINTED_KINDS`), `shared/src/forms/template.ts` (подписи); Test
`shared/test/docdefs.test.ts`.
- [x] Тесты: на каждый вид и набор — суффикс, наименование реестра, вид реестра, подпись — равны прежним значениям
  (таблица в тесте); `PRINTED_KINDS` и `BUILTIN_DOC_LABELS` как прежде; `tables` каждого вида — существующие таблицы.

### Task 4: Печать по описаниям (server)
Files: `server/src/print/docs.ts` (новый: `ACT_DOC_RENDER`, `actDocFileName`), `server/src/routes/print.ts`; Test
`server/test/docdefs.print.test.ts`.
- [x] Тесты: имена файлов 8 видов × 2 набора и выбор формы (`forms.vd = sbd` в «ТИ») как прежде; документ без формы набора
  «ТИ» (ВОР, АВК) печатается по «СБД»; весь набор зелёный.

### Task 5: Документация
- [ ] README (раздел «Для разработки»: описания документов; перенос 0.2 убран), инструкция (без шага переноса), отметки плана.
