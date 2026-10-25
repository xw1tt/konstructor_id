# План 17: только нужные листы и мастер первого акта — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в книге видны только листы, нужные документам шаблона; в пустой книге мастер за 5 шагов доводит до печати АОСР.

**Architecture:** чистые функции в shared — `workbook/sheets.ts` (`neededTables`, `sheetPlan`) и `wizard.ts` (данные мастера →
строки книги, проверка шагов); порт Excel — видимость листов; панель — переключатель в «Функционале листа» и экран мастера.

**Tech Stack:** TypeScript, node:test + tsx, React 19, Office.js.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-0-design.md` §4

## Global Constraints

- Без новых зависимостей; `SCHEMA_VERSION = 10`. Настройка книги `idk.neededSheets`, по умолчанию выключена.
- Тесты `npm test` (с `IDK_BROWSER`) зелёные после каждой задачи; коммиты с трейлерами сессии.

## Review Focus

1. Лист с данными и «Реквизиты» не скрываются никогда; при выключенной настройке скрытых листов нет (риск 6). Тест — задача 1.
2. Книга после мастера печатает АОСР без ошибок `buildBundle` (риск 7). Тест — задача 2.
3. Мастер в книге, где часть организаций/материалов уже есть, не дублирует их. Тест — задача 2.

---

### Task 1: Нужные листы
Files: `shared/src/workbook/sheets.ts`; `addin/src/book/excelPort.ts` (`setSheetsVisible`); `addin/src/panel/SheetTools.tsx`
(переключатель), `addin/src/panel/Panel.tsx` (пересчёт при выборе шаблона); Test `shared/test/sheets.test.ts`.
- [x] Тесты: нужные таблицы «СБД», «ТИ», шаблона без КЖ и протоколов; скрываются «Барабаны и трубы», «Замеры …» без
  протоколов в шаблоне; лист с данными не скрывается; «Реквизиты» — никогда; выключено — всё видно.

### Task 2: Мастер — данные и запись (shared)
Files: `shared/src/wizard.ts`; Test `shared/test/wizard.test.ts`.
- [x] Тесты: проверка шагов (обязательные поля, даты, количество); записи книги из данных мастера; книга после записи →
  `buildBundle` без ошибок и АОСР печатается (данные документа); уже имеющиеся организации/материалы/шифр не дублируются.

### Task 3: Мастер — экран
Files: `addin/src/panel/WizardScreen.tsx`, `Panel.tsx` (кнопка в пустой книге и в «Базе актов»), `screens.ts` (ScreenId),
`styles.css`; Test `addin/test/wizard.panel.test.ts` (запись через TableStore).
- [ ] Тесты: «Создать акт» пишет строки в книгу на модели; сборка панели; снимок экрана мастера проверен глазами.

### Task 4: Документация и версия 0.17
- [ ] README, инструкция, `manifest.xml` 0.17.0.0, установщик по умолчанию 0.17, отметки плана.
