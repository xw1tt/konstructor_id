# План 24: консоль владельца и администратора компании (браузер) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** страница `/console` облачного сервера: вход, приглашение (задать пароль), компании, карточка компании (баланс,
пополнение и корректировка, доступ, реквизиты и условия, сотрудники и ссылки, операции), тарифы, журнал действий;
у администратора — «Компания» (сотрудники в пределах мест, операции), смена пароля.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-1-oblako-design.md` §6

### Task 1: Консоль
Files: `cloud/console/{main.tsx,api.ts,index.html}`, `cloud/build.mjs`, `cloud/src/extend.ts` (раздача), `cloud/src/app.ts`
(запросы со своей страницы); Test `cloud/test/console.test.ts`, `cloud/test/auth.test.ts`.
- [x] Тесты: `/console/` раздаётся, `/` ведёт в консоль, выход за папку — 404; запрос со своей страницы не считается чужим;
  сквозная проверка в браузере (приглашение владельца → компании → карточка) — снимки проверены.
