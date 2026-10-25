# План 22: облачный сервер — база, учётные записи, вход, приглашения, роли, аудит — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** пакет `packages/cloud`: PostgreSQL (pg в облаке, PGlite в тестах), миграции, компании и пользователи, вход по
почте и паролю, приглашения, роли, журнал действий.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-1-oblako-design.md` §2–4

## Global Constraints
- Новые зависимости только в `packages/cloud`: `pg`, `@electric-sql/pglite` (тесты), `@types/pg`.
- Деньги — в копейках (`BIGINT`); id — UUID из приложения; время — `timestamptz`.
- Тесты `npm test` зелёные после каждой задачи; коммиты с трейлерами сессии.

### Task 1: База и миграции
Files: `cloud/src/db.ts`, `cloud/migrations/001_init.sql`; Test `cloud/test/db.test.ts`.
- [x] Тесты: миграции применяются один раз; транзакция откатывается при ошибке; оба адаптера дают `query → rows`.

### Task 2: Учётные записи, вход, приглашения, аудит
Files: `cloud/src/auth.ts`, `cloud/src/app.ts`, `cloud/src/routes/auth.ts`, `cloud/src/cli.ts`; Test `cloud/test/auth.test.ts`.
- [ ] Тесты: пароль — только хеш; вход/выход; неверный пароль, 5 ошибок — пауза; заблокированный не входит; токен в базе —
  хеш; `/api/me`; приглашение — принять, просроченное/использованное — нет; CORS только для разрешённых адресов; команда
  создания владельца; действия — в журнале.
