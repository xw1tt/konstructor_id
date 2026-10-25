# План 14: наборы форм и набор «ТИ» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** встроенные варианты форм документов с выбором в шаблоне; набор «ТИ» по образцам пользователя (ВД, РМ, РП, КЖ, реестр, нумерация).

**Architecture:** выбор форм и нумерации — в `PrintOptions` шаблона (уходит с заданием печати); `docNumberFor` — единая
нумерация; формы «ТИ» — отдельные HTML-шаблоны сервера, выбор по `formOf(options, doc)`; встроенный шаблон «ТИ».

**Tech Stack:** TypeScript, node:test + tsx, zod, React 19, Chromium, pdf-lib.

**Spec:** `docs/superpowers/specs/2026-10-25-nabory-form-design.md`

## Global Constraints

- Без новых зависимостей. `SCHEMA_VERSION = 10`. Формы «СБД» и их тесты не меняются.
- Тексты форм «ТИ» — буква в букву как в спецификации §3.
- Тесты: `timeout 600 npx tsx --test "packages/*/test/**/*.test.ts"` (с `IDK_BROWSER`) зелёные после каждой задачи; коммиты с
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Lefhaf4Eg7PBRqce76dG6t`.

## Review Focus

1. КЖ «ТИ»: у кабеля заполнены не все способы прокладки (только труба) — факт = сумма заполненных, не «-». Тест — задача 4.
2. Шаблон плана 11–13 без новых полей `print` — печать «СБД» как раньше. Тест — задача 1.
3. Набор «ТИ» без строки «ДокументыКабелей» шифра/№ протокола — КЖ и протокол печатаются. Тест — задача 4.
4. Документ качества без даты в РМ/РП «ТИ» — «б/д», строка не пропадает. Тест — задача 3.
5. Изменение формы у встроенного шаблона не меняет сам встроенный шаблон. Тест — задача 6.

---

### Task 1: Опции, нумерация, шаблон «ТИ»
Files: `shared/src/templates.ts` (PrintOptions), `shared/src/acts/format.ts` (`docNumberFor`, `FormSet`, `formOf`),
`shared/src/acts/schemas.ts` (`rp` в PRINT_KINDS), `shared/src/forms/template.ts` (`BUILTIN_TI`, подпись РП),
`server/src/forms/store.ts` (список и get «ти»); Test `shared/test/formsets.test.ts`.
- [x] Тесты: таблица §2.1 для обоих наборов; `PrintOptions.parse({})` = sbd, forms {}, kjReserve 2; шаблон без новых полей
  парсится (RF 2); `formOf`; `BUILTIN_TI` документы и print; store.list: СБД, ТИ, свои; get("ti").

### Task 2: Нумерация в реестре, АОСР, метках; книга v10; РП в реестре
Files: `shared/src/workbook/schema.ts`, `help.ts`, `kit/registry.ts`, `acts/rows.ts` (p3), `server/src/print/fromBundle.ts`,
`server/src/forms/fields.ts`, `shared/src/forms/fields.ts`; Test `shared/test/formsets.registry.test.ts`.
- [x] Тесты: v10, столбцы КЖ в конце, «РП» в видах реестра после «РИМ»; реестр по «ТИ»: наименования и номера §3; строка РП
  после РИМ; «СБД» без изменений; p3 «ТИ» с `.РМ`/`.ВД`; метки «Акт.День/Месяц/Год», «Объект.Подрядчик», «Акт.Номер РП».

### Task 3: Формы ВД, РМ, РП «ТИ»
Files: Create `server/src/print/templates/ti.ts`; Modify `print/data.ts`, `fromBundle.ts`, `routes/print.ts`; Test `server/test/formsets.print.test.ts`.
- [x] Тесты HTML: ВД — шапка, номер, графы, марка/артикул, подписи; РМ — группы, нумерация материалов, «б/д» (RF 4); РП —
  строки и листы; выбор формы по options; PDF каждой.

### Task 4: КЖ «ТИ»
Files: `shared/src/workbook/cableTypes.ts`, `cables.ts` (новые поля, необязательные шифр/№ в «ТИ»), `acts/cableDocs.ts`
(`tiJournal`), `server/src/print/templates/ti.ts`, `cableData.ts`; Test `shared/test/formsets.kj.test.ts`, дополнить print-тест.
- [x] Тесты: факт = сумма / длина / частично (RF 1); итоги, «в т.ч.» по маркам, запас N% вверх; без шифра журнала в «ТИ»
  (RF 3); PDF на 120 кабелей — шапка таблицы на страницах.

### Task 5: Реестр ИД «ТИ» в комплекте
Files: `server/src/kit/templates.ts` (`tiRegistryHtml`), `kit/assemble.ts`; Test `server/test/formsets.kit.test.ts`.
- [x] Тесты: комплект «ТИ» — заголовок «Реестр №1/<шифр>.Р», «Страницы по списку» без «л.», документы РП/РМ/ВД в PDF.

### Task 6: Редактор шаблонов и панель
Files: `addin/src/panel/TemplateEditor.tsx`, `print.ts` (опции в кабельный пакет), `templatesApi.ts`; Test `addin/test/formsets.panel.test.ts`.
- [x] Тесты: `withForm(t, doc, set)` и `withSet` — новые print; у встроенного — копия, исходный не меняется (RF 5); сборка панели.

### Task 7: Документация, выпуск 0.15
- [x] README, инструкция, версия 0.15; весь набор; слияние; установщик.
