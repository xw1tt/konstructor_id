# План 1. Каркас, вкладка «Объект», материалы — план реализации

> **Для исполнителей-агентов:** ОБЯЗАТЕЛЬНЫЙ НАВЫК: superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans. Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:** работающий каркас конструктора ИД. Локальный HTTPS-сервер с базой SQLite,
панель Excel (она же открывается в обычном браузере для разработки), вкладка
«Объект» (организации, роли, разделы РД, представители) и вкладка «Материалы»
(общая таблица и документы качества со сканами).

**Архитектура:** монорепозиторий из трёх пакетов: `shared` (типы, схемы zod, чистые
правила), `server` (node:http + node:sqlite, REST JSON, хранилище файлов, TLS),
`addin` (React, собирается esbuild, раздаётся тем же сервером с того же адреса).
Панель обращается к серверу по относительным путям `/api/...`.

**Стек:** Node.js 22 (встроенные `node:sqlite`, `node:test`, `node:https`),
TypeScript 6.0.3, tsx 4.23.12, esbuild 0.28.2, React 19.2.8, zod 3.25.76,
pdf-lib 1.17.1, Office.js (CDN `https://appsforoffice.microsoft.com/lib/1/hosted/office.js`).

**Спецификация:** `docs/superpowers/specs/2026-10-15-konstruktor-id-design.md`.
Этот план реализует шаги 1–3 из раздела 12 спецификации и разделы 4, 5.1, 8
(вкладки 1–2), 10 в части каркаса. Средства измерения и электролаборатория
(тоже раздел 5.1) войдут в план по кабелям, где они используются.

**Отклонение от спецификации (технологии, не функции).** В рабочей среде нет доступа
к реестру npm, поэтому:
- Fastify заменён на `node:http` с небольшим маршрутизатором;
- Drizzle ORM и better-sqlite3 заменены на встроенный `node:sqlite` и SQL-миграции;
- Fluent UI заменён на собственные стили в духе Office.

Функционально это ничего не меняет. Встроенный `node:sqlite` к тому же избавляет
Windows от компиляции нативного модуля. Переход на PostgreSQL остаётся возможным:
доступ к базе изолирован в слое `repo/*`.

## Глобальные ограничения

- Версии зависимостей фиксируются точно, как в разделе «Стек»; новые зависимости
  не добавляются.
- Адрес сервера: `https://localhost:3443`; панель раздаётся по `/addin/`.
- Каталог данных: переменная `IDK_DATA_DIR`, по умолчанию `%LOCALAPPDATA%\KonstruktorID`
  (на Linux `~/.konstruktor-id`). Внутри: `db.sqlite`, `files/`, `backups/`, `tls/`.
- Даты хранятся строками ISO `YYYY-MM-DD`.
- Все тексты интерфейса — на русском языке.
- Роли представителей (коды → подписи):
  `developer_control` «Представитель застройщика (технического заказчика…) по вопросам строительного контроля»;
  `builder` «Представитель лица, осуществляющего строительство»;
  `builder_control` «Представитель лица, осуществляющего строительство, по вопросам строительного контроля»;
  `designer` «Представитель лица, осуществляющего подготовку проектной документации»;
  `performer` «Представитель лица, выполнившего работы, подлежащие освидетельствованию»;
  `other` «Иные представители».
- Роли организаций на объекте: `developer` (застройщик / технический заказчик),
  `builder` (лицо, осуществляющее строительство), `designer` (проектировщик),
  `performer` (лицо, выполнившее работы, по умолчанию).
- Типы документов качества: `passport` «Паспорт качества», `certificate` «Сертификат соответствия»,
  `declaration` «Декларация о соответствии», `info_letter` «Информационное письмо»,
  `refusal_letter` «Отказное письмо», `other` «Прочее».
- Тесты: `npx tsx --test "packages/*/test/**/*.test.ts"`.

## На что обратить внимание при проверке

1. **Кириллица и кавычки в названиях** («ООО «СБД»», `ООО "СБД"`, `№`, `∅`) должны
   без искажений проходить сохранение, чтение и отображение.
   Тест в задаче 4: `organizations: кириллица и кавычки сохраняются без изменений`.
2. **Большие сканы** (в образцах PDF до 107 МБ) должны загружаться без падения
   сервера и без чтения файла целиком в память дважды. Лимит загрузки — 200 МБ,
   при превышении ответ 413 с понятным текстом.
   Тест в задаче 5: `files: файл больше лимита → 413`.
3. **Граница полномочий.** Представитель с периодом по 31.07.2026 включительно
   действует 31.07 и не действует 01.08.
   Тест в задаче 2: `activeRepresentatives: последняя дата включительно`.
4. **Удаление используемой записи.** Удаление организации, у которой есть роль
   на объекте или представители, должно вернуть 409 с объяснением, а не стереть
   данные. Тест в задаче 4: `organizations: удаление используемой → 409`.
5. **Повторная загрузка того же скана** не должна плодить копии файла: файл
   определяется по SHA-256.
   Тест в задаче 5: `files: одинаковое содержимое → один файл`.

---

## Файловая структура

```
package.json                     workspaces, скрипты test/build/start
tsconfig.base.json
packages/shared/src/
  roles.ts                        коды и подписи ролей, типы документов
  schemas.ts                      zod-схемы сущностей и входных данных API
  rules.ts                        чистые функции: orgFullForm, activeRepresentatives
packages/shared/test/rules.test.ts
packages/server/src/
  config.ts                       каталог данных, порт
  db.ts                           открытие базы, миграции
  migrations/001_init.sql
  http/router.ts                  маршрутизатор, JSON, ошибки HttpError
  http/static.ts                  раздача /addin/
  repo/organizations.ts  repo/objectInfo.ts  repo/sections.ts
  repo/representatives.ts  repo/materials.ts  repo/qualityDocs.ts
  files/store.ts                  хранение файлов по SHA-256, подсчёт листов
  routes/*.ts                     маршруты по сущностям
  tls/x509.ts                     генерация CA с nameConstraints и сертификата localhost
  tls/ensureCerts.ts
  backup.ts                       ежедневная копия, хранить 30
  app.ts                          сборка приложения (без listen) — для тестов
  main.ts                         запуск HTTPS
packages/server/test/*.test.ts
packages/addin/
  manifest.xml
  src/index.html  src/main.tsx  src/api.ts  src/styles.css
  src/App.tsx                     вкладки, баннер «Сервер не запущен»
  src/tabs/ObjectTab.tsx  src/tabs/MaterialsTab.tsx  src/tabs/Placeholder.tsx
  src/excel.ts                    чтение и запись активного листа (Office.js)
  src/sheetMapping.ts             чистые функции «строки листа ↔ материалы»
  build.mjs                       сборка esbuild → packages/addin/dist
packages/addin/test/*.test.ts
scripts/install-cert.ps1          установка CA в хранилище пользователя (Windows)
README.md                         запуск на Windows
```

---

### Задача 1: Каркас монорепозитория

**Файлы:**
- Создать: `package.json`, `tsconfig.base.json`, `packages/*/package.json`,
  `packages/*/tsconfig.json`, `.gitignore`
- Тест: `packages/shared/test/smoke.test.ts`

**Интерфейсы:**
- Создаёт: команды `npm test`, `npm run build`, `npm start`; пакеты `@idk/shared`,
  `@idk/server`, `@idk/addin` (workspaces). В рабочей среде вместо `npm install`
  создаётся симлинк `node_modules → /opt/npm-tools/node_modules` плюс ссылки
  workspace-пакетов в `node_modules/@idk/*`.

- [ ] **Шаг 1.** Тест `smoke: импорт @idk/shared работает`: `import { ROLE_CODES } from "@idk/shared/roles"` → `assert.ok(Array.isArray(ROLE_CODES))`.
- [ ] **Шаг 2.** Запустить `npx tsx --test packages/shared/test/smoke.test.ts` → FAIL (модуля нет).
- [ ] **Шаг 3.** Создать файлы каркаса и `packages/shared/src/roles.ts` с константами из «Глобальных ограничений»: `ROLE_CODES`, `ROLE_LABELS`, `ORG_ROLE_CODES`, `QUALITY_DOC_TYPES` с подписями.
- [ ] **Шаг 4.** Тест → PASS; `npx tsc -p packages/shared --noEmit` без ошибок.
- [ ] **Шаг 5.** Коммит `chore: каркас монорепозитория`.

### Задача 2: Общие схемы и правила

**Файлы:**
- Создать: `packages/shared/src/schemas.ts`, `packages/shared/src/rules.ts`
- Тест: `packages/shared/test/rules.test.ts`

**Интерфейсы:**
- Создаёт (zod-схемы и выведенные типы):
  - `Organization { id, shortName, fullName, ogrn, inn, address, phone, sroName, sroOgrn, sroInn }`, все строки, кроме `id: number`; `OrganizationInput` — без `id`, обязательны `shortName` и `fullName`.
  - `ObjectInfo { name, address, contractNumber, contractDate, city, roles: Record<OrgRoleCode, number | null> }`.
  - `Section { id, code, name, designerOrgId: number | null }`.
  - `Representative { id, role: RoleCode, position, fullName, orgId, authorityDoc, nrsNumber, nrsDate, validFrom, validTo, sortOrder }`; `validFrom` и `validTo` — `string | null`.
  - `Material { id, name, mark, article, manufacturer, unit }`.
  - `QualityDoc { id, type: QualityDocType, number, issueDate, validUntil, sheets, fileId: number | null, materialIds: number[] }`.
  - `FileRow { id, sha256, name, mime, size, pages }`.
  - Для каждой сущности `XxxInput` — та же схема без `id` (`OrganizationInput`, `SectionInput`, `RepresentativeInput`, `MaterialInput`, `QualityDocInput`).
- `orgFullForm(org: Organization): string`
- `activeRepresentatives(reps: Representative[], role: RoleCode, date: string): Representative[]` — отсортированы по `sortOrder`.

- [ ] **Шаг 1.** Тесты:
  - `orgFullForm: собирает реквизиты` — для СБД из образца результат равен
    `ООО "СБД", ОГРН 1197746498916, ИНН 7736323532, 125284, г. Москва, … , тел. +7 (495) 685-92-30, является членом Ассоциация строителей "Саморегулируемая организация "Строительные допуски", ОГРН 1097799011045, ИНН 7714322214`.
    Формат: `<shortName>, ОГРН <ogrn>, ИНН <inn>, <address>, тел. <phone>, является членом <sroName>, ОГРН <sroOgrn>, ИНН <sroInn>`.
  - `orgFullForm: пустые поля пропускаются вместе с подписью` — без телефона и СРО в результате нет `тел.` и `является членом`.
  - `activeRepresentatives: последняя дата включительно` — `validTo: "2026-07-31"`: на `2026-07-31` ⇒ 1 представитель, на `2026-08-01` ⇒ 0.
  - `activeRepresentatives: null = без ограничения` и `несколько в роли — по sortOrder` (Королёв `sortOrder` 1, Востров 2 ⇒ в этом порядке).
  - `schemas: OrganizationInput без shortName отклоняется`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать схемы и функции. Даты сравниваются как строки ISO.
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(shared): схемы сущностей и правила`.

### Задача 3: База данных и миграции

**Файлы:**
- Создать: `packages/server/src/config.ts`, `packages/server/src/db.ts`, `packages/server/src/migrations/001_init.sql`
- Тест: `packages/server/test/db.test.ts`

**Интерфейсы:**
- `openDb(path: string): DatabaseSync` — включает `PRAGMA foreign_keys=ON`, `journal_mode=WAL` и применяет миграции из папки по порядку имён, ведя таблицу `schema_migrations(name)`.
- `loadConfig(env = process.env): { dataDir: string; port: number }` — значения по умолчанию из «Глобальных ограничений».
- Таблицы `001_init.sql`:
  - `organizations`;
  - `object_info` (одна строка `id=1`);
  - `object_org_roles(role PRIMARY KEY, org_id REFERENCES organizations ON DELETE RESTRICT)`;
  - `sections(designer_org_id REFERENCES organizations ON DELETE RESTRICT)`;
  - `representatives(org_id REFERENCES organizations ON DELETE RESTRICT)`;
  - `files(id, sha256 UNIQUE, name, mime, size, pages, path)`;
  - `materials`;
  - `quality_docs(file_id REFERENCES files ON DELETE SET NULL)`;
  - `material_quality_docs(material_id, doc_id, PRIMARY KEY(material_id, doc_id))` с `ON DELETE CASCADE` по обеим ссылкам.

- [ ] **Шаг 1.** Тесты:
  - `db: миграции применяются один раз` — повторный `openDb` на том же файле не падает, в `schema_migrations` одна запись;
  - `db: внешние ключи включены` — вставка представителя с несуществующей `org_id` бросает ошибку.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать. Предупреждение ExperimentalWarning от `node:sqlite` подавить: `process.removeAllListeners('warning')` с фильтром по типу ExperimentalWarning SQLite в `db.ts`.
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(server): база и миграции`.

### Задача 4: HTTP-приложение и API «Объект»

**Файлы:**
- Создать: `http/router.ts`, `app.ts`, `repo/organizations.ts`, `repo/objectInfo.ts`, `repo/sections.ts`, `repo/representatives.ts`, `routes/object.ts`
- Тест: `packages/server/test/object.api.test.ts`

**Интерфейсы:**
- `class HttpError(status: number, message: string)`; любой другой ответ сервера при ошибке —
  `{ error: string }` на русском.
- `createApp(opts: { db: DatabaseSync; dataDir: string; addinDir?: string }): (req, res) => void` — обработчик без `listen`, чтобы тесты поднимали его на HTTP со случайным портом.
- Маршруты (JSON):
  - `GET/POST /api/organizations`, `GET/PUT/DELETE /api/organizations/:id`;
  - `GET/PUT /api/object` (тело — `ObjectInfo`);
  - `GET/POST /api/sections`, `PUT/DELETE /api/sections/:id`;
  - `GET/POST /api/representatives`, `PUT/DELETE /api/representatives/:id`;
  - `GET /api/representatives/active?role=&date=`.
- Вход проверяется схемами из задачи 2; ошибка проверки → 400 с перечнем полей.
- Нарушение `RESTRICT` → 409 «Организация используется: <где>».

- [ ] **Шаг 1.** Тесты на временной базе:
  - `organizations: создать, прочитать, изменить, удалить`;
  - `organizations: кириллица и кавычки сохраняются без изменений` (`ООО «СБД»`, `ООО "МАРКС ИНЖИНИРИНГ"`, `№ 2448`);
  - `organizations: удаление используемой → 409` (организация назначена застройщиком; текст ответа содержит «застройщик»);
  - `object: роли сохраняются, одна организация в двух ролях`;
  - `representatives: active по роли и дате`;
  - `api: неверный JSON → 400`, `неизвестный путь → 404`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать. Маршрутизатор — таблица `{method, pattern, handler}`, параметры `:id` через RegExp, тело читается с лимитом 1 МБ для JSON.
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(server): API объекта, организаций, разделов, представителей`.

### Задача 5: Файлы, материалы и документы качества

**Файлы:**
- Создать: `files/store.ts`, `repo/materials.ts`, `repo/qualityDocs.ts`, `routes/materials.ts`, `routes/files.ts`
- Тест: `packages/server/test/materials.api.test.ts`, `packages/server/test/files.test.ts`

**Интерфейсы:**
- `saveFile(db, dataDir, stream: Readable, meta: { name: string; mime: string }): Promise<FileRow>` — поток пишется во временный файл с подсчётом SHA-256, затем переименовывается в `files/<sha256[0..2]>/<sha256>.<ext>`. Если такой SHA-256 уже есть, временный файл удаляется и возвращается существующая запись.
- `countPages(path, mime): Promise<number>` — PDF через pdf-lib (`PDFDocument.load(..., { ignoreEncryption: true })`), изображения (`image/jpeg`, `image/png`) — 1.
- `FileRow` — из `@idk/shared/schemas` (задача 2).
- Маршруты:
  - `POST /api/files` (тело — сырые байты, заголовки `Content-Type` и `X-File-Name` в URI-кодировке) → `FileRow`;
  - `GET /api/files/:id` — отдаёт файл;
  - `GET/POST /api/materials`, `PUT/DELETE /api/materials/:id`;
  - `GET/POST /api/quality-docs`, `PUT/DELETE /api/quality-docs/:id` (тело с `materialIds`);
  - `GET /api/materials/:id/quality-docs`.
- Лимит загрузки 200 МБ → 413 «Файл больше 200 МБ».
- Неподдерживаемый тип → 415.
- `sheets` документа по умолчанию равно `pages` файла.

- [ ] **Шаг 1.** Тесты:
  - `files: PDF из 3 страниц → pages 3` (PDF создаётся в тесте через pdf-lib);
  - `files: одинаковое содержимое → один файл`;
  - `files: файл больше лимита → 413` (лимит в тесте задаётся опцией `createApp({ uploadLimit: 1024 })`);
  - `quality-docs: один документ на два материала` — письмо № 2448 привязано к двум муфтам, `GET /api/materials/:id/quality-docs` возвращает его для обеих;
  - `materials: удаление материала не удаляет документ, только связь`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать. `createApp` получает опцию `uploadLimit` (по умолчанию `200 * 1024 * 1024`).
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(server): файлы, материалы, документы качества`.

### Задача 6: TLS-сертификаты, запуск сервера, резервные копии

**Файлы:**
- Создать: `tls/x509.ts`, `tls/ensureCerts.ts`, `backup.ts`, `http/static.ts`, `main.ts`, `scripts/install-cert.ps1`
- Тест: `packages/server/test/tls.test.ts`, `packages/server/test/backup.test.ts`

**Интерфейсы:**
- `createCa(): { certPem: string; keyPem: string }`:
  - RSA 2048, SHA-256, срок 10 лет;
  - CN «Konstruktor ID Local CA»;
  - `basicConstraints` CA:true critical;
  - `keyUsage` keyCertSign|cRLSign critical;
  - `nameConstraints` critical, permitted `DNS:localhost`, `IP:127.0.0.1/255.255.255.255`.
- `createLeaf(ca): { certPem; keyPem }` — CN localhost, SAN `DNS:localhost`, `IP:127.0.0.1`, EKU serverAuth, срок 825 дней.
- `ensureCerts(dataDir): { key: string; cert: string; caCertPath: string }` — создаёт `tls/` при первом запуске и перевыпускает leaf за 30 дней до истечения.
- DER-кодирование ASN.1 пишется вручную в `x509.ts` (минимальный кодировщик: SEQUENCE, SET, INTEGER, OID, BIT STRING, OCTET STRING, UTCTime, UTF8String, context-tagged). Подпись — `crypto.sign('sha256', tbs, key)`.
- `runDailyBackup(dataDir, now = new Date()): string | null` — если сегодня копии ещё нет, копирует `db.sqlite` через `VACUUM INTO` и папку `files/` (жёсткие ссылки, при ошибке — копирование) в `backups/YYYY-MM-DD/`, оставляет 30 последних. Возвращает путь или `null`.
- `main.ts`: `loadConfig` → `openDb` → `runDailyBackup` → `ensureCerts` → `https.createServer` на порту 3443; раздача `packages/addin/dist` по `/addin/`. Если порт занят — сообщение «Порт 3443 занят: сервер уже запущен?» и код выхода 1.
- `install-cert.ps1`: `certutil -user -addstore Root <caCertPath>`.

- [ ] **Шаг 1.** Тесты:
  - `tls: openssl принимает цепочку` — `openssl verify -CAfile ca.pem leaf.pem` → `OK`;
  - `tls: nameConstraints присутствует` — `openssl x509 -text` для CA содержит `X509v3 Name Constraints: critical`, `Permitted:` и `DNS:localhost`;
  - `tls: сертификат для другого имени не проходит` — leaf, подписанный CA для `example.com`, не проходит `openssl verify` (ошибка `permitted subtree violation`). Тесты пропускаются (`skip`), если `openssl` не найден;
  - `backup: одна копия в день, хранится 30` — 32 вызова с датами подряд → 30 папок; повторный вызов в тот же день → `null`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** Запуск → PASS. Дополнительно: `npm start` в фоне, `curl --cacert <ca.pem> https://localhost:3443/api/object` → `200`.
- [ ] **Шаг 5.** Коммит `feat(server): TLS с ограничением имён, запуск, резервные копии`.

### Задача 7: Оболочка панели, связь с сервером, манифест

**Файлы:**
- Создать: `packages/addin/manifest.xml`, `src/index.html`, `src/main.tsx`, `src/api.ts`, `src/App.tsx`, `src/tabs/Placeholder.tsx`, `src/styles.css`, `build.mjs`
- Тест: `packages/addin/test/api.test.ts`

**Интерфейсы:**
- `api.ts`:
  - `class ServerUnavailableError`;
  - `apiGet<T>(path)`, `apiSend<T>(method, path, body?)`, `apiUpload(file: Blob, name: string): Promise<FileRow>`;
  - сетевая ошибка (fetch rejected) → `ServerUnavailableError`; ответ с `{error}` → `Error(error)`.
- `App.tsx`: вкладки «Объект», «Материалы», «Входной контроль», «Кабели», «АОСР», «Комплект и печать». Вкладки 3–6 показывают «Раздел появится в следующих версиях». При `ServerUnavailableError` — баннер «Сервер не запущен» с кнопкой «Повторить».
- Панель работает и без Office: если `Office` не определён, приложение запускается сразу, функции листа скрыты.
- `manifest.xml`: тип TaskPaneApp, хост Workbook, `SourceLocation` `https://localhost:3443/addin/index.html`, кнопка на ленте «Конструктор ИД», минимальная ширина панели — по умолчанию Office.
- `build.mjs`: esbuild, entry `src/main.tsx` → `dist/main.js`, копирование `index.html` и `styles.css`.

- [ ] **Шаг 1.** Тесты (fetch подменяется):
  - `api: сетевая ошибка → ServerUnavailableError`;
  - `api: ответ 409 с error → Error с этим текстом`;
  - `api: upload передаёт X-File-Name в URI-кодировке` (имя `Паспорт №3/405.pdf`).
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** Запуск → PASS; `npm run build` без ошибок. Проверка Playwright (Chromium): открыть `https://localhost:3443/addin/index.html` с `ignoreHTTPSErrors`, увидеть 6 вкладок. Остановить сервер, нажать «Повторить» и увидеть баннер «Сервер не запущен». Скриншот приложить к отчёту.
- [ ] **Шаг 5.** Коммит `feat(addin): оболочка панели, связь с сервером, манифест`.

### Задача 8: Вкладка «Объект»

**Файлы:**
- Создать: `src/tabs/ObjectTab.tsx`, `src/tabs/object/OrganizationsSection.tsx`, `src/tabs/object/ObjectSection.tsx`, `src/tabs/object/SectionsSection.tsx`, `src/tabs/object/RepresentativesSection.tsx`, `src/tabs/object/repOrder.ts`
- Тест: `packages/addin/test/repOrder.test.ts`

**Интерфейсы:**
- Внутри вкладки сворачиваемые блоки:
  - «Организации»: список, форма с краткой и полной формой реквизитов и предпросмотром `orgFullForm`;
  - «Объект и роли»: поля объекта и четыре выпадающих списка ролей;
  - «Разделы РД»;
  - «Представители»: сгруппированы по ролям, внутри роли — список с кнопками ↑↓, форма: должность, ФИО, организация, документ о полномочиях, НРС, период действия.
- `moveRep(list: Representative[], id: number, dir: -1 | 1): { id: number; sortOrder: number }[]` — возвращает изменённые `sortOrder` для отправки на сервер.

- [ ] **Шаг 1.** Тесты `moveRep`:
  - перемещение вверх меняет местами с соседом;
  - первый элемент вверх → пустой массив;
  - `sortOrder` после операции — 1..n без пропусков.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать вкладку и `moveRep`. Ошибку 409 показать текстом сервера рядом с кнопкой «Удалить».
- [ ] **Шаг 4.** Запуск → PASS. Проверка Playwright при ширине окна 350 px: в контрольном примере ввести СБД, Велесстрой, Техноинжиниринг и МАРКС ИНЖИНИРИНГ, назначить роли (СБД — застройщик и лицо, осуществляющее строительство), добавить Королёва и Вострова в роль `performer` и поменять их местами. После перезагрузки страницы всё на месте. Нет горизонтальной прокрутки при 350 px. Скриншот приложить.
- [ ] **Шаг 5.** Коммит `feat(addin): вкладка «Объект»`.

### Задача 9: Вкладка «Материалы» и загрузка с листа Excel

**Файлы:**
- Создать: `src/tabs/MaterialsTab.tsx`, `src/tabs/materials/QualityDocForm.tsx`, `src/sheetMapping.ts`, `src/excel.ts`
- Тест: `packages/addin/test/sheetMapping.test.ts`

**Интерфейсы:**
- Вкладка:
  - таблица материалов с поиском по наименованию и марке;
  - карточка материала — поля и список его документов качества;
  - «Добавить документ»: тип, номер, дата, срок, файл (перетаскиванием или выбором), привязка к одному или нескольким материалам;
  - число листов подставляется из ответа загрузки, его можно изменить;
  - у документа без файла — метка «нет скана».
- `rowsToMaterials(rows: string[][]): { materials: MaterialInput[]; errors: string[] }`:
  - первая строка — заголовки, распознаются без учёта регистра: «Наименование», «Марка»/«Тип, марка», «Артикул», «Производитель»/«Завод-изготовитель», «Ед. изм.»/«Ед.изм.»;
  - строки без наименования пропускаются;
  - отсутствие колонки «Наименование» → ошибка «Не найдена колонка «Наименование»».
- `materialsToRows(materials: Material[]): string[][]` — с той же строкой заголовков.
- `excel.ts`: `readActiveSheetUsedRange(): Promise<string[][]>`, `writeToNewSheet(name: string, rows: string[][]): Promise<void>` (Office.js `Excel.run`). Кнопки «Загрузить с листа» и «Выгрузить на лист» видны только внутри Excel. Перед загрузкой показывается предпросмотр «будет добавлено N, пропущено M».
- Повтор (одинаковые наименование и марка) не добавляется, а попадает в «пропущено».

- [ ] **Шаг 1.** Тесты:
  - `rowsToMaterials: заголовки ВД из образца` — строки с заголовками `["№ п/п","Наименование оборудования, комплекта","Тип, марка","Ед. изм."]` и строкой `["1","Труба ПЛЛ гибкая…","81820","м."]` → наименование и марка распознаны; «Наименование» ищется по вхождению слова;
  - `rowsToMaterials: нет колонки наименования → ошибка`;
  - `materialsToRows ∘ rowsToMaterials сохраняет данные`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** Запуск → PASS. Проверка Playwright (350 px):
  - добавить материал «Труба ПВХ жёсткая гладкая, d20 мм» (63920, DKC, м);
  - загрузить PDF на 2 страницы как сертификат № ЕАЭС RU C-RU.ПБ68.В.00389/21 — листов 2;
  - добавить письмо № 2448 на две муфты — видно у обеих;
  - скриншот приложить.
- [ ] **Шаг 5.** Коммит `feat(addin): вкладка «Материалы», загрузка с листа`.

### Задача 10: Запуск на Windows и итоговая проверка

**Файлы:**
- Создать: `README.md`, `scripts/start.cmd`, `scripts/register-autostart.ps1`
- Изменить: корневой `package.json` (скрипт `start`)

**Интерфейсы:**
- `README.md` на русском, пошагово:
  1. Установить Node.js 22 LTS.
  2. `npm ci`.
  3. `npm run build`.
  4. `npm start` — первый запуск создаёт сертификаты.
  5. `scripts\install-cert.ps1`.
  6. Подключить надстройку: общая папка каталога надстроек в Excel → «Центр управления безопасностью» → «Доверенные каталоги надстроек» → путь к папке с `manifest.xml` → «Вставка → Мои надстройки → Общая папка».
- `register-autostart.ps1` — ярлык `scripts\start.cmd` в папке автозагрузки пользователя (`shell:startup`).

- [ ] **Шаг 1.** Выполнить на чистом клоне в рабочей среде: `npm test` (все PASS), `npm run build`, `npm start`, проверка `curl --cacert` → 200.
- [ ] **Шаг 2.** Проверить, что README описывает каждый шаг и не ссылается на несуществующие файлы (`ls` по всем упомянутым путям).
- [ ] **Шаг 3.** Коммит `docs: запуск на Windows`.
