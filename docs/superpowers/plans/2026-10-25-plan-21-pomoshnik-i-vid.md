# План 21: помощник понимает книгу; панель не прыгает; компактный вид — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** по отзыву пользователя после первой работы с помощником (25.10.2026): модель переспрашивала названия таблиц и
столбцов, не знала про ОЖР, заменяла ФИО десятью правками; панель прокручивалась при наборе; ширина не запоминалась;
при узкой панели не хватает места. Одобрено пользователем 25.10.2026 (сообщение с планом 21).

**Architecture:** схема книги и памятка предметной области — в системной подсказке; новые инструменты `search_book`,
`check_ojr`, `propose_replace` (одно предложение из многих правок — `batch`); прокрутка только окна сообщений; верхняя
строка и разделы — иконка + текст, при ширине < 400 px — только иконки; в «Настройках» — версия Excel и запоминание ширины.

**Tech Stack:** TypeScript, node:test + tsx, React 19.

## Global Constraints
- Без новых зависимостей; `npm test` зелёный после каждой задачи; коммиты с трейлерами сессии; установщик 0.19 в конце.

---

### Task 1: Помощник — схема, памятка, поиск, проверка ОЖР, замена
Files: `shared/src/ai/prompt.ts`, `shared/src/ai/tools.ts`, `shared/src/ai/agent.ts` (подписи), `addin/src/panel/assistant.ts`
(batch); Test `shared/test/ai.context.test.ts`, `addin/test/assistant.panel.test.ts`.
- [x] Тесты: схема в подсказке (листы, таблицы, столбцы, ключи); поиск «Беляц» → таблица/строка/столбец; проверка ОЖР — нет
  даты, лишняя дата, другие работы; замена — одно предложение со всеми ячейками, значение списка проверяется, применение и
  отмена всех ячеек.

### Task 2: Панель — прокрутка, компактный вид, ширина
Files: `AssistantScreen.tsx`, `TopBar.tsx`, `Panel.tsx` (разделы), `icons.tsx`, `screens.ts`, `SettingsScreen.tsx`,
`panelWidth.ts`, `styles.css`; Test `addin/test/screens.test.ts`, `addin/test/panelwidth.test.ts`.
- [ ] Тесты: состояние ширины (поддерживается/нет, версия); иконка у каждого экрана и раздела; сборка; снимки экрана
  широкой и узкой панели.

### Task 3: Документация и версия 0.19
- [ ] README, инструкция, manifest 0.19.0.0, установщик по умолчанию 0.19.
