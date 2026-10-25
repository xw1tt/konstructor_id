# План 18: подключения нейросетей — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** локальный сервер хранит подключения YandexGPT, GigaChat, локальной и OpenAI-совместимой модели и передаёт им
запросы чата с инструментами в едином формате; расход пишется в журнал.

**Architecture:** нейтральный формат сообщений и инструментов в shared (`ai/model.ts`); на сервере — хранилище настроек
(`ai/store.ts`), HTTP с доп. сертификатом (`ai/http.ts`), адаптеры OpenAI-совместимый и GigaChat (`ai/providers.ts`),
маршруты `/api/ai/*`.

**Tech Stack:** TypeScript, node:test + tsx, zod, node:https.

**Spec:** `docs/superpowers/specs/2026-10-25-pomoshnik-ii-design.md` §2

## Global Constraints

- Без новых зависимостей. Ключи не покидают `ai.json` (ответы API — без ключей).
- Тесты — на подставном HTTP-сервере в процессе теста; `npm test` зелёный после каждой задачи; коммиты с трейлерами сессии.

## Review Focus

1. Формат OpenAI (tool_calls строкой) и GigaChat (function_call объектом) → один нейтральный ответ. Тест — задача 2.
2. Токен GigaChat кешируется, при 401 обновляется один раз. Тест — задача 2.
3. Ключ не возвращается и не стирается сохранением без ключа. Тест — задача 1.

---

### Task 1: Модель и хранилище подключений
Files: `shared/src/ai/model.ts`, `server/src/ai/store.ts`; Test `server/test/ai.store.test.ts`.
- [x] Тесты: значения по умолчанию по видам; проверка обязательных полей (openai — адрес и модель; yandex — каталог;
  gigachat/yandex/openai — ключ); публичный вид без ключа; сохранение без ключа сохраняет прежний; активное подключение;
  удаление активного сбрасывает выбор; журнал расхода и итоги месяца.

### Task 2: HTTP и адаптеры
Files: `server/src/ai/http.ts`, `server/src/ai/providers.ts`; Test `server/test/ai.providers.test.ts`.
- [ ] Тесты (подставной сервер): OpenAI-совместимый — запрос (tools, заголовки yandex), ответ текстом и вызовами
  инструментов, история с результатами инструментов; GigaChat — токен (Basic, RqUID, scope), кеш, 401 → новый токен,
  functions/function_call, результат `role: function`; ошибка провайдера → понятный текст; таймаут.

### Task 3: Маршруты
Files: `server/src/routes/ai.ts`, `server/src/app.ts`; Test `server/test/ai.routes.test.ts`.
- [ ] Тесты: CRUD подключений без ключей в ответах; активное; «Проверить»; `/api/ai/chat` через активное, без активного —
  400 «Не выбрана нейросеть»; расход в журнале и `/api/ai/usage`.
