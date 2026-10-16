# План 2. АОСР и печать документов (АОСР, РИМ, ВД, ВОР) — план реализации

> **Для исполнителей-агентов:** ОБЯЗАТЕЛЬНЫЙ НАВЫК: superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans. Шаги отмечаются чекбоксами (`- [ ]`).

**Цель:**
- база актов АОСР с карточкой акта на вкладке «АОСР»: пункты 1–7, материалы с количеством,
  документы п.4 со сканами, ВОР;
- печать в PDF четырёх документов СБД: АОСР, РИМ, ВД, ВОР;
- предпросмотр PDF в большом окне.

**Архитектура:**
- Правила заполнения — чистые функции в `shared/src/acts/`, которые тестируются без сервера.
- Сервер собирает из базы «данные документа» (`buildAosr`, `buildRim`, …), шаблоны превращают
  их в HTML, а playwright-core печатает HTML в PDF через Edge или Chromium.
- Панель получает PDF по адресу `/api/acts/:id/pdf/:doc`.

**Стек:** как в плане 1, плюс playwright-core 1.56.0 (печать) и pdfjs-dist 6.2.108
(только тесты: извлечение текста из PDF).

**Спецификация:** `docs/superpowers/specs/2026-10-15-konstruktor-id-design.md`
и дополнение `docs/superpowers/specs/2026-10-16-formy-sbd-addendum.md` (приоритет у дополнения).
План реализует шаги 4–5 раздела 12 спецификации, раздел 7.3 (предпросмотр) и вкладку «АОСР».

## Глобальные ограничения

- Новые зависимости только эти: `playwright-core@1.56.0` (server) и `pdfjs-dist@6.2.108`
  (server, devDependency).
- Формы и правила строк — строго по дополнению, разделы 1–6.
- Все даты в документах:
  - с месяцем прописью — `28 июля 2026 г.`;
  - числом — `ДД.ММ.ГГГГ г.`
- Числа печатаются с десятичной запятой, без лишних нулей: `1618,9`, `430`.
- Порог для п.3 и п.4 — `MATERIALS_INLINE_LIMIT = 5`.
- Документы печати (`DocKind`): `aosr`, `rim`, `vd`, `vor`.
- Печать: A4 книжная, шрифт `"Times New Roman", "Liberation Serif", serif`.
- Браузер для печати выбирается так:
  1. `IDK_BROWSER` (путь к исполняемому файлу);
  2. на Windows — канал `msedge`;
  3. иначе встроенный Chromium Playwright.

## На что обратить внимание при проверке

1. **Длинные тексты.** Наименование объекта и п.6 на 4–5 строк, 98 строк ВОР, 24 строки РИМ:
   таблицы переносятся на следующие страницы, шапка таблицы повторяется, строка не режется
   посередине. Тест в задаче 5: `pdf: РИМ на 30 строк — 2 страницы, шапка повторяется`.
2. **Документ качества сразу на два материала акта** печатается в РИМ один раз.
   Тест в задаче 2: `rimRows: письмо №2448 на две муфты — одна строка`.
3. **В роли нет действующего представителя на дату акта.** Блок роли печатается с пустой
   строкой для подписи, а не пропадает. Тест в задаче 2:
   `signers: роль без действующего — пустая подпись`.
4. **Браузер для печати не найден.** Например, Edge удалён. Ответ 503 с текстом
   «Не найден браузер для печати: установите Microsoft Edge или укажите IDK_BROWSER».
   Сервер при этом не падает. Тест в задаче 5: `pdf: нет браузера → 503`.
5. **Удаление материала, который используется в акте.** Ответ 409 «Материал используется
   в актах: …», данные акта не теряются. Тест в задаче 3: `materials: удаление используемого → 409`.

---

## Файловая структура

```
packages/shared/src/
  acts/schemas.ts          Act, ActMaterial, ActDocument, VorLine (+ *Input)
  acts/format.ts           formatDateLong, formatDateShort, formatNumber, docNumber
  acts/repLine.ts          repLine — строка представителя для АОСР
  acts/rows.ts             rimRows, vdRows, vorRows, point3Lines, point4Lines, signers
packages/shared/test/acts.*.test.ts
packages/server/src/
  migrations/002_acts.sql
  repo/acts.ts             акты и вложенные строки
  routes/acts.ts
  print/data.ts            buildAosr/buildRim/buildVd/buildVor: база → данные документа
  print/templates/*.ts     aosr.ts rim.ts vd.ts vor.ts common.ts (HTML)
  print/print.css
  print/browser.ts         запуск браузера, htmlToPdf
packages/server/test/acts.api.test.ts, print.*.test.ts
packages/server/test/fixtures/sbd-aov1.ts   контрольный пример (данные комплекта АОВ1.01.00.1)
packages/addin/src/tabs/ActsTab.tsx, tabs/acts/*.tsx, preview.html, preview.ts
scripts/seed-sbd.ts        загрузка контрольного примера в базу (для ручной проверки)
```

---

### Task 1 (Задача 1): Миграция и схемы актов

**Файлы:**
- Создать: `packages/server/src/migrations/002_acts.sql`, `packages/shared/src/acts/schemas.ts`
- Изменить: `packages/shared/src/schemas.ts`
  (`QualityDoc.registryName: string`, `Representative.actText: string`)
- Тест: `packages/shared/test/acts.schemas.test.ts`, `packages/server/test/db.test.ts` (добавить)

**Интерфейсы:**
- Создаёт:
  - `ActInput`:
    - номер и дата: `baseNumber`, `date`, `sectionId: number | null`;
    - пункты акта: `works`, `sheets`, `revision`, `dateStart`, `dateEnd`, `normative`,
      `nextWorks`, `extraInfo` (по умолчанию «нет»), `copies` (по умолчанию 4),
      `attachments` (по умолчанию «Согласно п.3, п.4.»);
    - `performerOrgId: number | null`;
    - для ВОР: `vorTitle`, `vorCustomerRepId: number | null`, `vorContractorRepId: number | null`.
  - `Act = ActInput & { id }`.
  - `ActMaterialInput { materialId, position: string ("б/н"), quantity: number | null, sortOrder }`;
    `quantity = null` — взять сумму ВОР.
  - `ActDocumentInput { kind: "scheme" | "other", number, name, date, fileId: number | null, sortOrder }`.
  - `VorLineInput { group: string, materialId, quantity: number, sortOrder }`.
- Таблицы:
  - `acts`;
  - `act_materials` (`act_id` CASCADE, `material_id` RESTRICT);
  - `act_documents` (`file_id` SET NULL);
  - `vor_lines` (`act_id` CASCADE, `material_id` RESTRICT);
  - колонки `quality_docs.registry_name`, `representatives.act_text` (`TEXT NOT NULL DEFAULT ''`).

- [ ] **Шаг 1.** Тесты:
  - `ActInput: значения по умолчанию` — `{ baseNumber: "К32.В.СТ.АОВ1.01.00.1", date: "2026-07-28" }` → `extraInfo === "нет"`, `copies === 4`, `attachments === "Согласно п.3, п.4."`;
  - `ActInput: без baseNumber → ошибка «Укажите номер акта»`;
  - `db: миграция 002 применяется к базе плана 1` — база после 001 с записями открывается, `schema_migrations` содержит 2 записи, старые организации на месте.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать миграцию и схемы. Поля `registryName` и `actText` добавить в формы
  панели («Наименование для реестра» в документе качества, «Текст для акта (если нужно иначе)»
  в представителе).
- [ ] **Шаг 4.** `npm test` → PASS.
- [ ] **Шаг 5.** Коммит `feat: схема актов АОСР`.

### Task 2 (Задача 2): Правила заполнения документов

**Файлы:**
- Создать: `packages/shared/src/acts/format.ts`, `acts/repLine.ts`, `acts/rows.ts`
- Тест: `packages/shared/test/acts.rules.test.ts`

**Интерфейсы:**
- `formatDateLong("2026-07-28") === "28 июля 2026 г."`, `formatDateShort("2025-05-09") === "09.05.2025 г."`, `formatNumber(1618.9) === "1618,9"`, `formatNumber(430) === "430"`.
- `docNumber(base, "aosr"|"rim"|"vd")` → `"К32.В.СТ.АОВ1.01.00.1.АОСР"` и т. д.
- `repLine(rep: Representative, org: Organization): string` — по таблице из дополнения, раздел 2;
  `actText` имеет приоритет.
- `signers(reps, roles: RoleCode[], date): { role, label, names: string[] }[]` — для роли без
  действующих представителей `names = [""]`.
- `point3Lines(materials, docsByMaterial, base): string[]`.
- `point4Lines(docs: ActDocument[]): string[]`.
- `rimRows(actMaterials, materials, docsByMaterial): RimRow[]`, где
  `RimRow { name, type, number, date, sheets }`.
- `vdRows(actMaterials, materials, vorLines): VdRow[]`, где
  `VdRow { position, name, article, manufacturer, unit, quantity }`.
- `vorRows(vorLines, materials): ({ kind: "group", title } | { kind: "line", name, unit, quantity })[]`.

- [ ] **Шаг 1.** Тесты (значения — из комплекта АОВ1.01.00.1):
  - `repLine: стройконтроль заказчика` →
    `Ведущий инженер по автоматике и слаботочным системам ООО "СБД" Валерьянов А.А., идентификационный номер специалиста №С-77-221429, приказ № П-1-ОД-267 от 18.06.2025 г.`
  - `repLine: лицо, выполнившее работы, с реквизитами` →
    `Начальник отдела ККС Королев Д.М., приказ № П-265 от 13.03.2026 г., ООО "Велесстрой" ОГРН 1087746466950, ИНН 7709787790, 125047, г. Москва, ул.2-ая Тверская-Ямская, д. 10`
  - `repLine: actText перекрывает автоматический текст`.
  - `point3Lines: больше 5 материалов — ссылка на РИМ и ВД` → одна строка
    `Согласно реестру использованных материалов №К32.В.СТ.АОВ1.01.00.1.РИМ ведомости смонтированного оборудования, технических средств и материалов №К32.В.СТ.АОВ1.01.00.1.ВД`.
  - `point3Lines: 2 материала — по строке с документами` →
    `Труба ПВХ жёсткая гладкая, d20 мм — Паспорт качества №63920 от 19.05.2025 г.; Сертификат соответствия №ЕАЭС RU C-RU.ПБ68.В.00389/21 от 07.07.2021 г.`
  - `point4Lines: схема` → `Исполнительная схема №К32.В.СТ.АОВ1.01.00.1. Монтаж кабельных линий на этаже П5 в осях 27-13/У-К`.
  - `rimRows: письмо №2448 на две муфты — одна строка` — наименование =
    `Муфта труба-труба с ограничителем IP40, d20 мм, Муфта труба-коробка, IP67, М20х1,5, д.20мм`.
  - `rimRows: порядок — паспорт раньше сертификата; дата со сроком` — сертификат
    → `date === "от 11.06.2021 г. до 10.06.2026 г."`.
  - `rimRows: registryName перекрывает имена материалов`.
  - `vdRows: количество — сумма ВОР, если quantity = null` — тестовые объёмы по этажам
    430; 436,6; 483,3; 269 → `1618,9`.
  - `vdRows: артикул пуст — берётся марка`.
  - `vorRows: группы и строки` — наименование
    `Труба ПВХ жёсткая гладкая, d20 мм, лёгкая, 3 м, серая (63920, DKC)`.
  - `signers: роль без действующего — пустая подпись`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать. Порядок типов в РИМ: `passport, certificate, declaration,
  info_letter, refusal_letter, other`. Месяцы — родительный падеж
  (`января … декабря`).
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(shared): правила заполнения АОСР, РИМ, ВД, ВОР`.

### Task 3 (Задача 3): API актов

**Файлы:**
- Создать: `packages/server/src/repo/acts.ts`, `routes/acts.ts`
- Изменить: `app.ts`, `routes/materials.ts` (409 при удалении используемого материала)
- Тест: `packages/server/test/acts.api.test.ts`

**Интерфейсы:**
- Маршруты:
  - `GET/POST /api/acts`, `GET/PUT/DELETE /api/acts/:id`;
  - `PUT /api/acts/:id/materials` (тело `ActMaterialInput[]`, полная замена в транзакции);
  - `PUT /api/acts/:id/documents` (`ActDocumentInput[]`);
  - `PUT /api/acts/:id/vor` (`VorLineInput[]`);
  - `GET /api/acts/:id/full` → `{ act, materials, documents, vor }`.
- Новый акт: `sectionId` и `performerOrgId` по умолчанию берутся из первого раздела
  и роли объекта `performer`.

- [ ] **Шаг 1.** Тесты:
  - `acts: создать и прочитать с умолчаниями`;
  - `acts: замена материалов — порядок сохраняется`;
  - `acts: ВОР — строки с группами`;
  - `acts: удаление акта удаляет его строки, но не материалы`;
  - `materials: удаление используемого → 409` (в тексте — номер акта);
  - `acts: несуществующий материал в строках → 400`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(server): API актов АОСР`.

### Task 4 (Задача 4): Данные и HTML-шаблоны документов

**Файлы:**
- Создать: `packages/server/src/print/data.ts`, `print/templates/common.ts`, `aosr.ts`, `rim.ts`,
  `vd.ts`, `vor.ts`, `print/print.css`, `packages/server/test/fixtures/sbd-aov1.ts`
- Тест: `packages/server/test/print.html.test.ts`

**Интерфейсы:**
- `buildDocData(db, actId, kind: DocKind)` → данные документа (все строки уже отформатированы
  правилами задачи 2).
- `renderHtml(kind, data): string` — полный HTML-документ со встроенным CSS.
- Все значения экранируются (`&`, `<`, `>`, `"`).
- `seedSbdAov1(db): { actId }` — данные комплекта АОВ1.01.00.1:
  - организации и представители со страниц 8–9;
  - 20 материалов ВД, документы РИМ, 6 схем, строки ВОР этажей П5–П2.

  Количества и номера документов берутся точно из образца.

- [ ] **Шаг 1.** Тесты на HTML контрольного примера (по тексту без тегов):
  - `aosr: шапка с полными реквизитами застройщика` (содержит `ОГРН 1197746498916`);
  - `aosr: номер и дата` (`№К32.В.СТ.АОВ1.01.00.1.АОСР`, `28 июля 2026 г.`);
  - `aosr: два представителя в роли performer` (Королев и Востров, по порядку);
  - `aosr: п.3 — ссылка на РИМ и ВД`;
  - `aosr: п.4 — 6 схем`;
  - `rim: 24 строки, первая — паспорт №3/405`;
  - `vd: 20 строк, кабель 1618,9 м.`;
  - `vor: 98 пронумерованных строк, 4 группы`;
  - `html: экранирование` (наименование `<test & "x">` не ломает разметку).
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать. Вёрстка — по страницам 5–12 образца:
  - таблицы с `thead` повторяются на каждой странице;
  - `tr { break-inside: avoid }`;
  - подчёркнутые поля с мелкой подписью-пояснением под линией.
- [ ] **Шаг 4.** Запуск → PASS.
- [ ] **Шаг 5.** Коммит `feat(server): данные и шаблоны АОСР, РИМ, ВД, ВОР`.

### Task 5 (Задача 5): Печать в PDF

**Файлы:**
- Создать: `packages/server/src/print/browser.ts`
- Изменить: `routes/acts.ts`
- Тест: `packages/server/test/print.pdf.test.ts`

**Интерфейсы:**
- `htmlToPdf(html: string): Promise<Buffer>`:
  - один экземпляр браузера на процесс, запускается лениво;
  - закрывается при остановке сервера (`installShutdown`).
- `GET /api/acts/:id/pdf/:doc` → `application/pdf`, `Content-Disposition: inline; filename*=…`
  с именем `<номер>.pdf`.
- Колонтитул «Страница N из M» — через `footerTemplate`, только для ВОР.
- Нет браузера → `HttpError(503, "Не найден браузер для печати: установите Microsoft Edge или укажите IDK_BROWSER")`.

- [ ] **Шаг 1.** Тесты (текст PDF — через pdfjs-dist):
  - `pdf: АОСР контрольного примера — 2 страницы, текст содержит номер и «Востров В.П.»`;
  - `pdf: РИМ на 30 строк — 2 страницы, шапка повторяется` (на 2-й странице есть «Номер документа»);
  - `pdf: ВОР — «Страница 1 из 3»`;
  - `pdf: нет браузера → 503` (`IDK_BROWSER=/nonexistent`).
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** Запуск → PASS. Дополнительно: отрендерить 4 PDF контрольного примера в PNG и
  положить рядом с соответствующими страницами образца в `docs/screens/plan2-compare-*.png`.
  Расхождения в составе строк исправить; расхождения в переносах строк записать в отчёт.
- [ ] **Шаг 5.** Коммит `feat(server): печать документов в PDF`.

### Task 6 (Задача 6): Вкладка «АОСР» — список и карточка акта

**Файлы:**
- Создать: `packages/addin/src/tabs/ActsTab.tsx`, `tabs/acts/ActCard.tsx`, `tabs/acts/actDefaults.ts`
- Изменить: `main.tsx`
- Тест: `packages/addin/test/actDefaults.test.ts`

**Интерфейсы:**
- `nextBaseNumber(prev: string): string` — увеличивает последнее числовое звено:
  `К32.В.СТ.АОВ1.01.00.1` → `К32.В.СТ.АОВ1.01.00.2`; без числа в конце — добавляет `.1`.
- Список актов: номер, дата, кнопка «Новый акт». Номер нового акта предлагается
  `nextBaseNumber(последний)`.
- Карточка разбита на сворачиваемые блоки:
  - «Номер и даты»;
  - «П.1–2 Работы и проект»;
  - «П.6–7»;
  - «Подписи ВОР»;
  - «Прочее».

  Блоки «Материалы», «Документы п.4» и «ВОР» добавляет задача 7.

- [ ] **Шаг 1.** Тесты `nextBaseNumber`: увеличение `…00.9 → …00.10`; строка без числа;
  пустая строка → `"1"`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** PASS. Проверка Playwright при ширине 350 px:
  - создать акт, заполнить п.1–7, перезагрузить страницу — значения на месте;
  - нет горизонтальной прокрутки, нет ошибок страницы;
  - скриншот.
- [ ] **Шаг 5.** Коммит `feat(addin): вкладка «АОСР», карточка акта`.

### Task 7 (Задача 7): Материалы, документы п.4 и ВОР в карточке акта

**Файлы:**
- Создать: `tabs/acts/ActMaterials.tsx`, `tabs/acts/ActDocuments.tsx`, `tabs/acts/VorEditor.tsx`,
  `tabs/acts/vorMath.ts`
- Тест: `packages/addin/test/vorMath.test.ts`

**Интерфейсы:**
- **Материалы акта:**
  - поиск по общей таблице, «Добавить»;
  - у строки — «№ поз по УСР», количество (пусто = «по ВОР: N»), кнопки ↑↓;
  - предупреждение «нет документов качества», если у материала их нет.
- **Документы п.4:**
  - тип (схема / прочее), номер, наименование, дата, загрузка PDF;
  - при добавлении схемы номер предлагается `<база>.<n>`.
- **ВОР:**
  - группы (этажи) с названием, в группе строки «материал акта — объём»;
  - кнопка «Скопировать группу» создаёт новую группу с теми же материалами и пустыми объёмами.
- `vorTotals(lines): Map<materialId, number>` — суммы с округлением до 3 знаков (без ошибок
  плавающей точки: 430 + 436,6 + 483,3 + 269 = 1618,9).
- `cloneGroup(lines, group, newName): VorLineInput[]`.

- [ ] **Шаг 1.** Тесты `vorTotals` (пример выше, точное равенство 1618.9) и `cloneGroup`.
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** PASS. Проверка Playwright (350 px) на базе, засеянной `scripts/seed-sbd.ts`:
  - открыть акт, изменить объём в ВОР — в строке материала подсказка «по ВОР» изменилась;
  - скриншот.
- [ ] **Шаг 5.** Коммит `feat(addin): материалы, документы и ВОР акта`.

### Task 8 (Задача 8): Печать и предпросмотр из панели

**Файлы:**
- Создать: `packages/addin/src/preview.html`, `src/preview.ts`, `tabs/acts/PrintButtons.tsx`
- Изменить: `build.mjs` (второй вход `preview`)
- Тест: `packages/addin/test/previewUrl.test.ts`

**Интерфейсы:**
- `previewUrl(actId, doc)` → `/addin/preview.html?src=%2Fapi%2Facts%2F<id>%2Fpdf%2F<doc>`.
- `preview.html` показывает PDF во весь экран (`<iframe>`) с кнопкой «Скачать».
- **Кнопки в карточке акта:** «АОСР», «РИМ», «ВД», «ВОР».
  - В Excel они открывают окно `Office.context.ui.displayDialogAsync(url, { height: 90, width: 70 })`.
  - В браузере — `window.open`.
- Ошибка печати (503 и др.) показывается текстом сервера под кнопками.

- [ ] **Шаг 1.** Тест `previewUrl` (кодирование).
- [ ] **Шаг 2.** Запуск → FAIL.
- [ ] **Шаг 3.** Реализовать.
- [ ] **Шаг 4.** PASS. Проверка Playwright:
  - нажать «АОСР» — открылась вкладка предпросмотра, PDF загрузился (`content-type` application/pdf);
  - скриншот.
- [ ] **Шаг 5.** Коммит `feat(addin): печать и предпросмотр документов`.

### Task 9 (Задача 9): Контрольный пример, сверка, README

**Файлы:**
- Создать: `scripts/seed-sbd.ts`, `docs/plan2-sverka.md`
- Изменить: `README.md` (печать через Edge, команда загрузки контрольного примера)

**Интерфейсы:**
- `npm run seed:sbd` — загружает контрольный пример в пустую базу (в непустую отказывается
  с сообщением).
- `docs/plan2-sverka.md` — таблица по документам: что совпало с образцом, что отличается
  и почему.

- [ ] **Шаг 1.** На чистой копии: `npm test` (все PASS), `npm run build`, `npm start`,
  `npm run seed:sbd`, загрузка 4 PDF через `curl` → `200`, `application/pdf`.
- [ ] **Шаг 2.** Заполнить `docs/plan2-sverka.md` по сравнительным скриншотам задачи 5.
- [ ] **Шаг 3.** Коммит `docs: сверка с образцом СБД, печать в README`.
