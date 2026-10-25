# План 25: облако в панели; развёртывание; выпуск 0.20 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** панель входит в облако и показывает статус компании; при ограничении доступа печать, комплект, ОЖР, свои
формы и помощник недоступны; сервер разворачивается одной командой на ВМ Ubuntu (Docker Compose, PostgreSQL, HTTPS),
без своего домена — адрес `<IP>.sslip.io`.

**Spec:** `docs/superpowers/specs/2026-10-25-etap-1-oblako-design.md` §2, §5

### Task 1: Облако в панели
Files: `addin/src/panel/cloud.ts`, `access.ts`, `CloudUi.tsx`, `Panel.tsx`, `SettingsScreen.tsx`, `api.ts`, `kit.ts`, `styles.css`;
Test `addin/test/cloud.panel.test.ts`.
- [x] Тесты: без адреса — как раньше; вход; режимы по ответу облака; 401 — вход заново; нет связи — сутки по последнему
  статусу, потом ограничение; ограничение работы по путям; снимок экрана.

### Task 2: Развёртывание
Files: `deploy/{Dockerfile,docker-compose.yml,Caddyfile,install.sh,backup.sh}`, `scripts/build-cloud-bundle.mjs`; Test
`cloud/test/deploy.test.ts` (файлы согласованы: переменные, порты, команда владельца).
- [ ] Тесты; архив развёртывания собирается.

### Task 3: Документация, версия 0.20
- [ ] «Развёртывание облака.md» (Yandex Cloud пошагово), README, инструкция, manifest 0.20.0.0, установщик 0.20.
