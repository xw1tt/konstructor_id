# План 16: библиотека компании — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** организации, представители, материалы и документы качества со сканами вводятся один раз на компанию и
берутся в книгу объекта кнопкой; библиотека может лежать в сетевой папке.

**Architecture:** модель записей и правила «книга ↔ библиотека» — в shared (`library/model.ts`, чистые функции); хранилище —
папка с файлом на запись (`server/src/library/store.ts`) и маршруты `/api/library/*`; панель — раздел «Библиотека», «В
библиотеку» в «Функционале таблицы», папка в «Настройках».

**Tech Stack:** TypeScript, node:test + tsx, zod, React 19, Office.js.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-0-design.md` §3

## Global Constraints

- Без новых зависимостей. `SCHEMA_VERSION = 10` (книга не меняется).
- Запись файла — во временный и `rename`; запись — отдельный файл `<вид>/<id>.json`.
- Тесты `npm test` (с `IDK_BROWSER`) зелёные после каждой задачи; коммиты с трейлерами сессии.

## Review Focus

1. Повторное «Добавить в книгу» и «В библиотеку» не дублируют (риск 5). Тесты — задачи 1, 2.
2. Два сервера на одной папке — одна запись на ключ (риск 4). Тест — задача 2.
3. Папка недоступна — понятная ошибка, остальное работает. Тест — задача 2.

---

### Task 1: Модель библиотеки (shared)
Files: `shared/src/library/model.ts`; Test `shared/test/library.model.test.ts`.
- [x] Тесты: ключи четырёх видов (ИНН/краткое, ФИО+организация, наименование+марка, вид+номер; без учёта регистра и
  пробелов по краям); значения из строки книги без служебных/объектных столбцов; план добавления: материал тянет свои
  документы, представитель — организацию; уже есть в книге — пропуск; записи → строки по заголовкам и ссылки сканов.

### Task 2: Хранилище и маршруты (server)
Files: `server/src/library/store.ts`, `server/src/routes/library.ts`, `server/src/app.ts`; Test `server/test/library.test.ts`.
- [x] Тесты: настройки (по умолчанию `<dataDir>/library`, смена папки, недоступная папка → 400 с путём); добавление и
  обновление по ключу (`created` true/false); два хранилища на одной папке — одна запись; поиск `q`; удаление; скан из
  локального файла копируется в библиотеку и импортируется обратно (новый fileId, то же содержимое).

### Task 3: Панель
Files: `addin/src/panel/libraryApi.ts`, `addin/src/panel/library.ts` (добавление в книгу/в библиотеку через TableStore и
api), `addin/src/panel/LibraryScreen.tsx`, `TopBar.tsx`, `screens.ts`, `Panel.tsx`, `TableTools.tsx`, `SettingsScreen.tsx`,
`styles.css`; Test `addin/test/library.panel.test.ts`.
- [x] Тесты (на модели книги и подменённом api): «Добавить в книгу» — строки и ссылки сканов, итог «добавлено/уже были»;
  повтор — без дублей; «В библиотеку» строк таблицы — fileId из ссылки скана, итог «добавлено/обновлено»; сборка панели.

### Task 4: Документация
- [ ] README (раздел «Библиотека компании», пункт проверки), инструкция, отметки плана.
