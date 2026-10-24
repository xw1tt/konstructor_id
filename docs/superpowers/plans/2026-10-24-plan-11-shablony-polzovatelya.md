# План 11: шаблоны пользователя и свои формы — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** именованные шаблоны пользователя (набор документов, встроенные или свои формы .docx/.xlsx с метками), печать своих форм в PDF (через Word/Excel или своими силами), разметка формы по заполненному образцу, документы шаблона в карточке акта, реестре и комплекте, запоминание ширины панели.

**Architecture:** словарь меток — чистая функция в `@idk/shared/forms/fields.ts` над `ActBundle` (те же строки, что встроенные формы); подстановка, разметка, zip и конвертация — на сервере (`server/src/forms/*`, `server/src/zip/*`); шаблоны — файлы в `<dataDir>/templates`; панель берёт список шаблонов с сервера, выбор хранит в книге (`idk.template` = id).

**Tech Stack:** TypeScript, node:test + tsx, node:zlib, zod, React 19, Office.js (TaskPaneApi 1.1 при наличии), PowerShell COM (Word/Excel) на Windows, playwright-core + Edge.

**Spec:** `docs/superpowers/specs/2026-10-24-shablony-polzovatelya-design.md`

## Global Constraints

- Без новых npm-зависимостей.
- Встроенный шаблон: id `"sbd"`, имя «СБД», не удаляется и не меняется.
- Код своего документа: `/^[A-Za-zА-Яа-яЁё0-9]{1,10}$/`, уникален в шаблоне, не из `АОСР РИМ ВД ВОР АВК КЖ ИП` (без учёта регистра). Номер: `<номер акта>.<код>`.
- Метки: `{Группа.Поле}`; повтор: `{#Список}` … `{/Список}` в одной строке таблицы/листа. Неизвестная метка → текст `[нет поля: X]` + предупреждение `Нет поля «X»`.
- Предупреждение без Office: «Word не найден — форма может отличаться от Word» (для .xlsx — «Excel не найден — форма может отличаться от Excel»).
- Неизвестный шаблон книги: «Шаблон «<id>» не найден на этом компьютере — печать по «СБД»».
- Таймаут конвертации Office — 60 с; задания печати своих форм хранятся в памяти 30 мин.
- Ширина панели: `localStorage["idk.panelWidth"]`, сохранение с задержкой 500 мс, `setWidth` только при `isSetSupported("TaskPaneApi","1.1")`.
- Тесты: `timeout 600 npx tsx --test "packages/*/test/**/*.test.ts"` — зелёные после каждой задачи.
- Коммиты заканчиваются `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` и `Claude-Session: https://claude.ai/code/session_01Nz1BG9XYscm62GNXkJKnVR`.

## Review Focus

1. Метка, разбитая Word на несколько `<w:r>` с разным форматированием, и две метки в одном абзаце — обе подставляются, текст вокруг сохраняется. Тест — задача 3.
2. Значение со спецсимволами XML (`&`, `<`, кавычки «ООО "СБД"») и переводами строк — документ остаётся валидным XML. Тест — задачи 3 и 4.
3. Пустой список (акт без схем) в строке-повторе — строка исчезает, таблица не ломается. Тест — задачи 3 и 4.
4. Шаблон удалён или книга открыта на другом компьютере — печать по «СБД» с предупреждением, а не ошибка. Тест — задача 5 (сервер) и задача 9 (панель, помощник).
5. Загрузка .doc/.xls/повреждённого файла как формы — понятная ошибка 422. Тест — задача 5.

---

### Task 1: Zip — запись и общий читатель

**Files:**
- Create: `packages/server/src/zip/zip.ts`
- Modify: `packages/server/src/xlsx/read.ts` (использует `openZip`), `packages/server/test/helpers/xlsx.ts` (использует `writeZip`)
- Test: `packages/server/test/zip.test.ts`

**Interfaces:**
- Produces: `class ZipError extends Error`; `openZip(buf: Uint8Array): Map<string, () => Buffer>` (вынести из `read.ts` как есть: ленивая распаковка, предел `MAX_ENTRY_BYTES`, ошибки → `ZipError`); `XlsxError` остаётся и наследует `ZipError`; `writeZip(files: [string, Buffer | string][]): Buffer` (deflate, порядок как передан, имена UTF-8).

- [ ] **Step 1:** тест: `writeZip([["a.txt","Привет"],["b/c.xml","<x/>"]])` → `openZip` читает оба; повторная запись прочитанного архива даёт тот же набор файлов; `openZip(PDF)` бросает `ZipError`.
- [ ] **Step 2:** FAIL → реализовать (перенос кода из `read.ts`, запись — по образцу `helpers/xlsx.ts`, который затем импортирует `writeZip`).
- [ ] **Step 3:** весь набор (xlsx.read, rkc.api) — PASS. Commit «План 11, задача 1: zip».

### Task 2: Словарь меток

**Files:**
- Create: `packages/shared/src/forms/fields.ts`
- Test: `packages/shared/test/forms.fields.test.ts` (книга АОВ1: `fixtures/aov1Book.ts` → `buildBundle`)

**Interfaces:**
- Consumes: `ActBundle`, `docNumber`, `formatDateShort`, `point4Lines`, `rimRows`/`avkDefaultNumber` и т.п. из `acts/*` (то, что использует `server/src/print/fromBundle.ts`).
- Produces:
  - `interface FormData { values: Record<string, string>; lists: Record<string, Record<string, string>[]> }` (ключи `values` — «Группа.Поле»; ключи `lists` — «Материалы», «Схемы», «ВОР», «Кабели», элементы — по «Материал.Поле», «Схема.Поле», «ВОР.Поле», «Кабель.Поле»);
  - `formData(b: ActBundle, doc?: { code: string }): FormData` (`Акт.Номер документа` = `<номер>.<код>` при `doc`);
  - `FIELD_TREE: { group: string; fields: string[]; list?: string }[]` — для экрана «Поля для шаблона» (порядок групп как в спецификации §3);
  - `ROLE_GROUPS: Record<RoleCode, string>` = `{ developer_control: "Технадзор", builder: "Строительство", builder_control: "Стройконтроль", designer: "Проектировщик", performer: "Выполнивший", other: "Иные" }`.

- [ ] **Step 1: Тесты** на акте АОВ1: `values["Акт.Номер АОСР"]` === номер из встроенной АОСР (`docNumber(n,"aosr")`, «№»-форма как в форме); `values["Акт.Дата"]` === «28.07.2026 г.»; `values["Технадзор.Подпись"]` === «Ведущий инженер по автоматике и слаботочным системам Валерьянов А.А.»; `lists["Материалы"].length` === числу материалов акта, `lists["Материалы"][0]["Материал.Наименование"]` — первый материал; `lists["Схемы"][0]["Схема.Номер"]` — «К32.В.СТ.АОВ1.01.00.1»; каждое поле `FIELD_TREE` есть в `values` или в элементах своего списка (для полей роли без представителя — `""`); `formData(b,{code:"АГИ"}).values["Акт.Номер документа"]` === `${n}.АГИ`.
- [ ] **Step 2:** FAIL → реализовать.
- [ ] **Step 3:** PASS. Commit «План 11, задача 2: словарь меток».

### Task 3: Подстановка в .docx

**Files:**
- Create: `packages/server/src/forms/docx.ts`
- Create: `packages/server/test/helpers/docx.ts` (`makeDocx(bodyXml: string, parts?: Record<string,string>): Buffer` — минимальный .docx)
- Test: `packages/server/test/forms.docx.test.ts`

**Interfaces:**
- Consumes: `openZip`, `writeZip`, `FormData`.
- Produces: `fillDocx(buf: Uint8Array, data: FormData): { buf: Buffer; warnings: string[] }`; `docxText(buf: Uint8Array): string` (текст абзацев через `\n` — для тестов и разметки); `class FormError extends Error` (не .docx → «Это не файл Word (.docx)»).

- [ ] **Step 1: Тесты:**
  - `<w:p><w:r><w:t>Акт № {Акт.Номер} от {Акт.Дата}</w:t></w:r></w:p>` → «Акт № 1 от 05.06.2026 г.»;
  - метка разбита на 3 `<w:r>` (`{Акт.` / `Ном` / `ер}`, у второго — `<w:b/>`) → подставлено, `<w:rPr>` первого куска сохранено, текст до/после метки в соседних `<w:r>` не тронут;
  - значение `ООО "СБД" & <Ко>` → `docxText` возвращает его как есть, `document.xml` разбирается (нет голых `&`/`<`);
  - значение с `\n` → `<w:br/>` между частями;
  - строка таблицы с `{#Материалы}{Материал.Наименование}{/Материалы}` и списком из 3 → 3 строки `<w:tr>` с именами по порядку; пустой список → строки нет, остальная таблица на месте;
  - метка в `word/header1.xml` подставлена;
  - `{Нет.Поля}` → «[нет поля: Нет.Поля]», `warnings` === `["Нет поля «Нет.Поля»"]`;
  - PDF/мусор → `FormError` «Это не файл Word (.docx)».
- [ ] **Step 2:** FAIL → реализовать: для каждого `<w:p>` (в `document.xml`, `header*.xml`, `footer*.xml`) склеить тексты `<w:t>`, найти метки в склеенном тексте; для метки, начинающейся в куске i и кончающейся в куске j, — текст метки (замена) в кусок i, из кусков i+1..j удалить символы метки (пустые `<w:r>` удалить); замена XML-экранируется, `\n` → `</w:t><w:br/><w:t xml:space="preserve">`; `<w:t>` получает `xml:space="preserve"`. Повтор: `<w:tr>`, в склеенном тексте которой есть `{#Список}`, клонируется по элементам, в клоне сначала подставляются поля элемента, маркеры `{#…}`/`{/…}` удаляются.
- [ ] **Step 3:** PASS. Commit «План 11, задача 3: подстановка в Word».

### Task 4: Подстановка в .xlsx

**Files:**
- Create: `packages/server/src/forms/xlsx.ts`
- Test: `packages/server/test/forms.xlsx.test.ts` (книги — `makeXlsx` + ручной `mergeCells` в XML листа)

**Interfaces:**
- Consumes: `openZip`, `writeZip`, `readXlsx` (для проверок), `FormData`.
- Produces: `fillXlsx(buf: Uint8Array, data: FormData): { buf: Buffer; warnings: string[] }` (ошибка формата → `FormError` «Это не файл Excel (.xlsx)»).

- [ ] **Step 1: Тесты:** ячейка «Акт № {Акт.Номер}» (общая строка) → «Акт № 1»; ячейка ровно «{Материал.Кол-во}» в повторе → число; строка 5 с `{#Материалы}` и 3 элемента → строки 5–7, бывшая строка 6 («Итого») стала 8, `mergeCell ref="A6:C6"` → `A8:C8`; пустой список → строка удалена, нижние строки поднялись; спецсимволы экранированы (читается `readXlsx`); неизвестная метка → предупреждение.
- [ ] **Step 2:** FAIL → реализовать: строки → inline-строки (`t="inlineStr"`) в изменённых ячейках; сдвиг `r` строк и ячеек, `mergeCell`, `dimension`, `definedName` областей печати (`xl/workbook.xml`, `_xlnm.Print_Area`) ниже вставки; формулы ниже вставки не пересчитываются (Excel пересчитает при открытии; `fullCalcOnLoad="1"` в `calcPr`).
- [ ] **Step 3:** PASS. Commit «План 11, задача 4: подстановка в Excel».

### Task 5: Хранение шаблонов и API

**Files:**
- Create: `packages/shared/src/forms/template.ts`, `packages/server/src/forms/store.ts`, `packages/server/src/routes/templates.ts`; Modify: `packages/server/src/app.ts`
- Modify: `packages/shared/src/templates.ts` (`TemplateCode` → `string`; `loadTemplate` возвращает сохранённый id без проверки списка; `SBD_ID = "sbd"`)
- Test: `packages/shared/test/forms.template.test.ts`, `packages/server/test/templates.api.test.ts`

**Interfaces:**
- Produces (shared): zod `FormRef`, `TemplateDoc`, `UserTemplate` по спецификации §1; `BUILTIN_SBD: UserTemplate` (`docs` = aosr, rim, vd, vor, avk, kj, ip — встроенные); `validateTemplate(t): string[]` (ошибки кода: «Код «X» уже есть в шаблоне», «Код «АОСР» занят встроенным документом», «Код: 1–10 букв или цифр»).
- Produces (server): `TemplateStore` (`list()`, `get(id)`, `create(name, from?)`, `save(t)`, `remove(id)`, `addForm(id, buf, original): FormRef`, `form(id, file): Buffer`, `exportZip(id): Buffer`, `importZip(buf): UserTemplate`); маршруты из спецификации §2. Форма: тип по сигнатуре содержимого (`word/document.xml` → docx, `xl/workbook.xml` → xlsx), иначе 422 «Нужен файл Word (.docx) или Excel (.xlsx). Старые .doc/.xls сохраните в новом формате».

- [ ] **Step 1: Тесты:** `validateTemplate` — три ошибки выше; API: список начинается с «СБД»; `POST {name:"ПИК", from:"sbd"}` → копия с теми же `docs`; `PUT` переименование и свой документ `{kind:"custom",code:"АГИ",name:"Акт гидр. испытаний",form:null}`; `PUT` с кодом «АОСР» → 422 с текстом; `DELETE sbd` → 400 «Встроенный шаблон «СБД» не удаляется»; загрузка формы .docx → `FormRef` с `type:"docx"`; PDF → 422 с текстом; `export` → `import` на втором сервере даёт тот же шаблон с формами (новый id); шаблоны переживают перезапуск сервера (новый `createApp` на той же папке).
- [ ] **Step 2:** FAIL → реализовать; `normativ.test.ts` (проверка `loadTemplate` для «zzz») обновить: `loadTemplate` возвращает «zzz» (проверка наличия — в панели).
- [ ] **Step 3:** PASS. Commit «План 11, задача 5: хранение шаблонов».

### Task 6: Печать своих форм

**Files:**
- Create: `packages/server/src/forms/convert.ts`, `packages/server/src/forms/html.ts`, `packages/server/src/routes/formJobs.ts`; Modify: `app.ts`, `main.ts` (передача `officeRunner`)
- Test: `packages/server/test/forms.print.test.ts`

**Interfaces:**
- Consumes: `fillDocx`, `fillXlsx`, `formData`, `TemplateStore`, `htmlToPdf` (как у встроенных форм, `print/browser.ts`).
- Produces:
  - `type OfficeRunner = (kind: "docx" | "xlsx", src: string, out: string) => Promise<boolean>` (true — PDF сделан Office);
  - `powershellRunner(): OfficeRunner` (Windows; скрипт из `officeScript(kind, src, out)`; `execFile("powershell", ["-NoProfile","-NonInteractive","-Command", script])`, таймаут 60 000; ошибка/не Windows → `false`);
  - `officeScript(kind, src, out): string` — Word: `$w=New-Object -ComObject Word.Application;$w.Visible=$false;$w.DisplayAlerts=0;try{$d=$w.Documents.Open('<src>',$false,$true);$d.ExportAsFixedFormat('<out>',17);$d.Close(0)}finally{$w.Quit()}`; Excel: `…Excel.Application…;$b=$x.Workbooks.Open('<src>',0,$true);$b.ExportAsFixedFormat(0,'<out>');$b.Close($false)…`; пути экранируются (`'` → `''`);
  - `docxToHtml(buf): string`, `xlsxToHtml(buf): string` (§5 спецификации);
  - `renderForm(b: ActBundle, form: FormRef & { buf: Buffer }, doc: { code: string } | undefined, runner: OfficeRunner): Promise<{ pdf: Buffer; source: Buffer; warnings: string[]; via: "word" | "excel" | "html" }>`;
  - `POST /api/form-jobs` `{ bundle, template, doc }` (`doc` — `PrintKind` или код своего документа) → `201 { id, warnings, via }`; `GET /api/form-jobs/:id` (PDF, `?download=1`), `GET /api/form-jobs/:id/source` (файл; имя `<имя документа> <номер>.docx`). Нет шаблона → 404 «Шаблон «…» не найден»; у документа нет своей формы → 400 «У документа «…» нет своей формы — печать встроенной».

- [ ] **Step 1: Тесты:** `officeScript("docx", "C:\\a'b.docx", "C:\\o.pdf")` содержит `'C:\\a''b.docx'` и `ExportAsFixedFormat('C:\\o.pdf',17)`; `renderForm` с runner, возвращающим `false`, → `via:"html"`, PDF содержит подставленный номер акта (`pdfPages`), `warnings` содержит «Word не найден — форма может отличаться от Word»; runner, создающий файл `out` (пишет готовый PDF из `makePdf`), → `via:"word"`, без этого предупреждения; API: шаблон с формой АОСР (.docx из `makeDocx`) → 201, PDF и `source` (.docx с номером) отдаются; `docxToHtml` таблицы с `gridSpan=2` → `colspan="2"`.
- [ ] **Step 2:** FAIL → реализовать. `createApp` получает `officeRunner?: OfficeRunner` (по умолчанию `powershellRunner()`; в тестах — подмена).
- [ ] **Step 3:** PASS. Commit «План 11, задача 6: печать своих форм».

### Task 7: Разметка по образцу

**Files:**
- Create: `packages/server/src/forms/markup.ts`; Modify: `routes/templates.ts`
- Test: `packages/server/test/forms.markup.test.ts`

**Interfaces:**
- Consumes: `formData`, `openZip`/`writeZip`, приёмы абзацев из `docx.ts` (общая функция склейки — вынести в `docx.ts` как `mapParagraphs(xml, fn)`).
- Produces: `interface MarkupPlace { id: number; text: string; context: string; options: string[]; chosen: string }`; `markupForm(buf, type, data: FormData): { buf: Buffer; found: number; ambiguous: MarkupPlace[] }`; `applyChoices(buf, type, choices: Record<number, string>): Buffer`. Маршрут `POST /api/templates/:id/markup` — тело JSON `{ bundle, file: base64, name }` (лимит 20 МБ) → `{ token, found, ambiguous }` (размеченный файл держится в памяти 30 мин); `POST /api/templates/:id/markup/:token` `{ choices, doc }` → сохраняет форму в шаблон, возвращает `FormRef`; `GET …/markup/:token` — скачать размеченный файл.
- Приоритет неоднозначных: порядок `values` в `formData` (Номер > Дата > Окончание > Начало …); значения короче 3 символов и пустые не ищутся; ищется от длинных значений к коротким, уже размеченные места не трогаются.

- [ ] **Step 1: Тесты:** .docx, собранный в тесте из значений акта АОВ1 («Акт № <номер АОСР>», «Объект: <объект>», подпись технадзора, строка таблицы с первым материалом и его кол-вом, «Начало работ 05.06.2026 г. Окончание 05.06.2026 г.» при одинаковых датах) → в результате `{Акт.Номер АОСР}`, `{Объект.Наименование}`, `{Технадзор.Подпись}`, строка таблицы стала `{#Материалы}…{/Материалы}` с `{Материал.Наименование}`; одинаковые даты → `ambiguous` с вариантами `["Акт.Дата","Акт.Окончание","Акт.Начало"]` (в порядке приоритета); `applyChoices` подставляет выбранную метку; `fillDocx` размеченного файла на том же акте даёт исходный текст (`docxText` совпадает, с точностью до выбора неоднозначных).
- [ ] **Step 2:** FAIL → реализовать (для .xlsx — по ячейкам, повтор — строка листа с первым материалом).
- [ ] **Step 3:** PASS. Commit «План 11, задача 7: разметка по образцу».

### Task 8: Свои документы в реестре и комплекте

**Files:**
- Modify: `packages/shared/src/workbook/schema.ts` (`REGISTRY_KINDS` + `"Свой документ"`; `SCHEMA_VERSION` → 7), `packages/shared/src/kit/registry.ts`, `packages/shared/src/kit/request.ts`, `packages/server/src/kit/assemble.ts`
- Test: `packages/shared/test/kit.custom.test.ts`, дополнить `packages/server/test/kit.assemble.test.ts`

**Interfaces:**
- Consumes: `UserTemplate`, `renderForm`.
- Produces: `registryRows(book, kit, template?: UserTemplate)` — для каждого акта после встроенных документов — строки своих документов шаблона (`Вид` «Свой документ», `Номер документа` `<номер>.<код>`, `Наименование` — имя документа, дата — дата акта); встроенные документы, которых нет в шаблоне, не добавляются (для «СБД» — как сейчас); `KitRow.doc` += `form?: { template: string; doc: string }`; `buildKitRequest(..., template: string)`; `assembleKit` печатает строки с `doc.form` через `renderForm` (шаблон из `TemplateStore`, runner из опций).

- [ ] **Step 1: Тесты:** шаблон без ВОР и со своим «АГИ» → в реестре АОВ1 нет строки ВОР, есть «Свой документ» «№ <номер>.АГИ» «Акт гидр. испытаний» с датой акта; для «СБД» реестр не изменился (существующие тесты `kit.registry` зелёные); сборка комплекта с формой «АГИ» (`makeDocx` с `{Акт.Номер документа}`, runner `false`) → в PDF комплекта есть страница с «<номер>.АГИ», номер листа совпадает с «л.» реестра.
- [ ] **Step 2:** FAIL → реализовать; обновить ожидания версии схемы в тестах (`isOutdated("6") === true`, `"7" === false`).
- [ ] **Step 3:** PASS. Commit «План 11, задача 8: свои документы в реестре и комплекте».

### Task 9: Панель

**Files:**
- Create: `packages/addin/src/panel/TemplateEditor.tsx`, `packages/addin/src/panel/FieldsScreen.tsx`, `packages/addin/src/panel/templatesApi.ts`, `packages/addin/src/panel/panelWidth.ts`
- Modify: `TopBar.tsx` (меню «Шаблоны ▾» из сервера: шаблоны, «Редактор шаблонов», «Поля для шаблона»), `screens.ts`, `Panel.tsx` (контекст шаблона = `UserTemplate`), `templateContext.ts`, `extras/ActExtras.tsx` (кнопки по документам шаблона; своя форма → `/api/form-jobs`, кнопка «.docx»/«.xlsx»), `panel/print.ts`, `panel/kit.ts`, `main.tsx` (ширина панели)
- Test: `packages/addin/test/templates.panel.test.ts`

**Interfaces:**
- Produces: `templateButtons(t: UserTemplate): { key: string; label: string; doc: PrintKind | null; code: string | null; form: boolean }[]` (порядок шаблона; подписи встроенных — как сейчас); `resolveTemplate(list: UserTemplate[], id: string): { template: UserTemplate; warning: string | null }` (неизвестный id → «СБД» + текст из Global Constraints); `panelWidth.ts`: `restoreWidth(office: any, storage: Storage | null): void`, `trackWidth(win: Window, storage: Storage | null): () => void` (дебаунс 500 мс; ширина < 200 не сохраняется).

- [ ] **Step 1: Тесты:** `templateButtons(BUILTIN_SBD)` — подписи «АОСР», «РИМ», «ВД», «ВОР», «АВК», «КЖ», «Протокол» по порядку; шаблон со своим «АГИ» с формой → кнопка `{label:"Акт гидр. испытаний", code:"АГИ", form:true}`; `resolveTemplate([sbd], "t-x")` → «СБД» и предупреждение; `restoreWidth` с поддержкой и сохранённым 420 вызывает `setWidth(420)`, без поддержки — не вызывает, с бросающим `storage` — не падает; `trackWidth` сохраняет последнее значение после 500 мс (фейковые таймеры `mock.timers`).
- [ ] **Step 2:** FAIL → реализовать; редактор: список шаблонов, «Новый / Копия / Переименовать / Удалить / Выгрузить / Загрузить», документы с галочками и ↑↓, «Добавить свой документ» (имя, код, проверка `validateTemplate`), для документа — «Форма: встроенная | своя (файл)», «Загрузить форму», «Создать по образцу» (выбор акта из книги → `markup` → список неоднозначных с выбором → «Сохранить»), «Скачать форму». Экран «Поля для шаблона»: `FIELD_TREE` + значения `formData(bundle выбранного акта)` + «Копировать метку» (`navigator.clipboard`, при отказе — выделенный текст).
- [ ] **Step 3:** весь набор PASS; сборка панели без ошибок; снимок экрана редактора (renderToStaticMarkup + Chromium, как в плане 10) просмотрен. Commit «План 11, задача 9: панель шаблонов».

### Task 10: Документация и выпуск

- [ ] **Step 1:** README: раздел «Свои шаблоны и формы» (метки, повтор, по образцу, Word/без Word, выгрузка), чек-лист п.25 (живой Word: печать своей АОСР, разбитая метка, комплект со своим документом, ширина панели после перезапуска), версия 0.12. Инструкция пользователя (файл и документ Claude Docs `edff28c9-…`): раздел «Свои шаблоны» перед «Настройки и шаблоны».
- [ ] **Step 2:** весь набор PASS; установщик `0.12` собран.
- [ ] **Step 3:** Commit «План 11: документация, версия 0.12»; push `plan-11-templates`. Слияние — после подтверждения пользователя.
