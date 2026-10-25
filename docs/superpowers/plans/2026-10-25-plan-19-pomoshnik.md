# План 19: помощник — инструменты, правки, чат — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Помощник» в панели — чат с нейросетью, которая читает книгу инструментами и предлагает правки; пользователь
применяет их и может отменить. «Настройки» → «Нейросети».

**Architecture:** shared `ai/changes.ts` (проверка, описание, применение и отмена правок), `ai/tools.ts` (инструменты и
исполнение на `Book`), `ai/mask.ts`, `ai/agent.ts` (ход разговора), `ai/prompt.ts`; панель — `aiApi.ts`,
`AssistantScreen.tsx`, `AiSettings.tsx`.

**Tech Stack:** TypeScript, node:test + tsx, React 19.

**Spec:** `docs/superpowers/specs/2026-10-25-pomoshnik-ii-design.md` §3

## Global Constraints

- Без новых зависимостей. Правки — только через `TableStore` после подтверждения. Строки для модели — с 1.
- `npm test` зелёный после каждой задачи; коммиты с трейлерами сессии.

## Review Focus

1. Неверное предложение не попадает в карточку, модель получает ошибку (риск 3). Тест — задача 1.
2. Применение + отмена = исходная книга (риск 4). Тест — задача 1.
3. ФИО не уходят в запрос при маске и возвращаются в правках (риск 5). Тест — задача 1.

---

### Task 1: Инструменты, правки, маска, ход разговора (shared)
Files: `shared/src/ai/{changes,tools,mask,agent,prompt}.ts`; Test `shared/test/ai.tools.test.ts`.
- [x] Тесты: list_tables/read_rows (номера с 1, даты, отбор), check_act, get_catalog, get_template; предложения — ошибки
  столбца, даты, списка, формулы, строки; описание «было → стало»; применение и отмена; маска; ход разговора и предел шагов.

### Task 2: Панель — чат и настройки
Files: `addin/src/panel/aiApi.ts`, `addin/src/panel/assistant.ts` (сессия: история, предложения, применение, отмена),
`AssistantScreen.tsx`, `AiSettings.tsx`, `SettingsScreen.tsx`, `styles.css`; Test `addin/test/assistant.panel.test.ts`.
- [x] Тесты (модель книги, подменённый api): ход с предложением → карточка; применить отмеченные; отменить; история знает о
  применении; нет подключения — понятная ошибка; сборка панели; снимок экрана.

### Task 3: Документация
- [ ] README, инструкция (раздел «Помощник», «Нейросети»), отметки плана.
