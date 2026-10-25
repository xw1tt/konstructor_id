# План 20: помощник — справочник и формы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** помощник дополняет справочник видов работ и документов и размечает форму заказчика (Word/Excel) метками.

**Architecture:** наборы инструментов `ToolKit` панели: `catalogKit` (`propose_catalog`, проверка `mergeCatalog`, применение
`PUT /api/catalog/user`, отмена) и `formKit` (`read_form` — разметка «По образцу» приложенного файла, `propose_form` —
выбор вариантов и новые метки; сервер: текст разметки и применение пар).

**Tech Stack:** TypeScript, node:test + tsx, React 19.

**Spec:** `docs/superpowers/specs/2026-10-25-pomoshnik-ii-design.md` §4

## Global Constraints

- Без новых зависимостей; `npm test` зелёный после каждой задачи; коммиты с трейлерами сессии; установщик 0.18 в конце.

## Review Focus

1. Справочник с занятым кодом не сохраняется; отмена возвращает прежние дополнения (риск 6). Тест — задача 1.
2. Метка с неизвестным полем или текстом, которого нет в документе, отклоняется. Тест — задача 3.

---

### Task 1: Справочник
Files: `server/src/routes/catalog.ts` (`GET /api/catalog/user`), `shared/src/ai/catalogTool.ts`, `addin/src/panel/kits.ts`;
Test `shared/test/ai.catalog.test.ts`, `addin/test/kits.panel.test.ts`.
- [x] Тесты: предложение вида работ в существующий/новый раздел и своего документа; занятый код, неизвестный документ вида
  работ — ошибка; применение — дополнения объединены; отмена — прежние; `GET /api/catalog/user`.

### Task 2: Формы — сервер
Files: `server/src/forms/markup.ts` (`markupText`, `applyPairs`), `server/src/routes/templates.ts`; Test
`server/test/ai.form.test.ts`.
- [ ] Тесты: текст разметки .docx; пары → метки (в т. ч. текст через несколько run), выбор вариантов; отсутствующий текст —
  в `missing`; сохранение формы после пар.

### Task 3: Формы — панель
Files: `addin/src/panel/kits.ts` (`formKit`), `AssistantScreen.tsx` (вложение, «Скачать для проверки», «Сохранить как форму»);
Test `addin/test/kits.panel.test.ts`.
- [ ] Тесты: без файла — ошибка; read_form → места, текст, поля; propose_form — неизвестное поле, нет текста — ошибка;
  применение → пары на сервере; сборка; снимок экрана.

### Task 4: Документация и версия 0.18
- [ ] README, инструкция («Помощник», «Нейросети», сертификат GigaChat), manifest 0.18.0.0, установщик по умолчанию 0.18.
