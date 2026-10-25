# План 23: облачный сервер — тарифы, баланс, ежедневное списание, доступ; API владельца и администратора — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** баланс компании в рублях (операции в копейках), абонентская плата раз в сутки без повторов и с догоном
пропущенных дней, статус доступа; управление компаниями, тарифами и пользователями — у владельца; сотрудники и
операции — у администратора компании.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-1-oblako-design.md` §3–4

### Task 1: Баланс и списание
Files: `cloud/src/billing.ts`; Test `cloud/test/billing.test.ts`.
- [x] Тесты: баланс = сумма операций; плата за день = места × цена / дней месяца (округление до копейки); повторный запуск
  не списывает; пропущенные дни догоняются; приостановленная компания не платит; доступ active/readonly/suspended
  с кредитным лимитом.

### Task 2: API владельца и администратора
Files: `cloud/src/routes/owner.ts`, `cloud/src/routes/company.ts`, `cloud/src/extend.ts`, `cloud/src/main.ts` (таймер);
Test `cloud/test/owner.test.ts`.
- [x] Тесты: только владелец управляет компаниями, тарифами и балансом (администратор и инженер — 403); пополнение > 0,
  причина обязательна; приглашение администратором в пределах мест; чужая компания — 404; `/api/me` — баланс и доступ;
  все действия в журнале.
