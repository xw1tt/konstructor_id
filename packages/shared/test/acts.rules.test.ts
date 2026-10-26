import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDateLong, formatDateShort, formatNumber, docNumber } from "@idk/shared/acts/format";
import { repLine } from "@idk/shared/acts/repLine";
import { point3Lines, point4Lines, rimRows, vdRows, vorRows, vorTotals, signers } from "@idk/shared/acts/rows";
import type { Organization, Representative, Material, QualityDoc } from "@idk/shared/schemas";
import type { ActMaterialInput, ActDocumentInput, VorLineInput } from "@idk/shared/acts/schemas";

const BASE = "К32.В.СТ.АОВ1.01.00.1";
const org = (o: Partial<Organization>): Organization => ({
  id: 1, shortName: "", fullName: "", ogrn: "", inn: "", address: "", phone: "", sroName: "", sroOgrn: "", sroInn: "", ...o,
});
const rep = (o: Partial<Representative>): Representative => ({
  id: 1, role: "performer", position: "", fullName: "", orgId: 1, authorityDoc: "", nrsNumber: "", nrsDate: null,
  validFrom: null, validTo: null, sortOrder: 1, actText: "", ...o,
});
const mat = (id: number, name: string, o: Partial<Material> = {}): Material => ({
  id, name, mark: "", article: "", manufacturer: "", unit: "шт.", ...o,
});
const doc = (id: number, o: Partial<QualityDoc>): QualityDoc => ({
  id, type: "passport", number: "", issueDate: null, validUntil: null, sheets: 1, fileId: null, materialIds: [],
  registryName: "", ...o,
});
const am = (materialId: number, sortOrder: number, o: Partial<ActMaterialInput> = {}): ActMaterialInput => ({
  materialId, position: "б/н", quantity: null, sortOrder, ...o,
});

test("format: даты, числа, номера", () => {
  assert.equal(formatDateLong("2026-07-28"), "28 июля 2026 г.");
  assert.equal(formatDateLong("2026-06-05"), "5 июня 2026 г.");
  assert.equal(formatDateShort("2025-05-09"), "09.05.2025 г.");
  assert.equal(formatNumber(1618.9), "1618,9");
  assert.equal(formatNumber(430), "430");
  assert.equal(formatNumber(0.1 + 0.2), "0,3");
  assert.equal(docNumber(BASE, "aosr"), "К32.В.СТ.АОВ1.01.00.1.АОСР");
  assert.equal(docNumber(BASE, "rim"), "К32.В.СТ.АОВ1.01.00.1.РИМ");
  assert.equal(docNumber(BASE, "vd"), "К32.В.СТ.АОВ1.01.00.1.ВД");
});

const sbd = org({ id: 1, shortName: 'ООО "СБД"' });
const veles = org({ id: 2, shortName: 'ООО "Велесстрой"', ogrn: "1087746466950", inn: "7709787790", address: "125047, г. Москва, ул.2-ая Тверская-Ямская, д. 10" });

test("repLine: стройконтроль заказчика", () => {
  assert.equal(
    repLine(rep({ role: "developer_control", position: "Ведущий инженер по автоматике и слаботочным системам", fullName: "Валерьянов А.А.", nrsNumber: "С-77-221429", authorityDoc: "приказ № П-1-ОД-267 от 18.06.2025 г." }), sbd),
    'Ведущий инженер по автоматике и слаботочным системам ООО "СБД" Валерьянов А.А., идентификационный номер специалиста №С-77-221429, приказ № П-1-ОД-267 от 18.06.2025 г.',
  );
});

test("repLine: лицо, осуществляющее строительство, без НРС", () => {
  assert.equal(
    repLine(rep({ role: "builder", position: "Заместитель руководителя проекта", fullName: "Аксенов А.М.", authorityDoc: "приказ №П-КУТ00/3 от 20.04.2026 г." }), sbd),
    'Заместитель руководителя проекта ООО "СБД" Аксенов А.М., приказ №П-КУТ00/3 от 20.04.2026 г.',
  );
});

test("repLine: лицо, выполнившее работы, с реквизитами", () => {
  assert.equal(
    repLine(rep({ role: "performer", position: "Начальник отдела ККС", fullName: "Королев Д.М.", authorityDoc: "приказ № П-265 от 13.03.2026 г." }), veles),
    'Начальник отдела ККС Королев Д.М., приказ № П-265 от 13.03.2026 г., ООО "Велесстрой" ОГРН 1087746466950, ИНН 7709787790, 125047, г. Москва, ул.2-ая Тверская-Ямская, д. 10',
  );
});

test("repLine: actText перекрывает автоматический текст", () => {
  assert.equal(repLine(rep({ fullName: "X", actText: "  Особый текст  " }), veles), "Особый текст");
});

const pipe = mat(2, "Труба ПВХ жёсткая гладкая, d20 мм", { article: "63920", manufacturer: "DKC", unit: "м." });
const clip = mat(4, "Держатель-клипса для монтажного пистолета, d20 мм, серый");
const pipeDocs = [
  doc(11, { type: "certificate", number: "ЕАЭС RU C-RU.ПБ68.В.00389/21", issueDate: "2021-07-07", validUntil: "2026-07-06", sheets: 2, materialIds: [2] }),
  doc(10, { type: "passport", number: "63920", issueDate: "2025-05-19", materialIds: [2] }),
];

test("point3Lines: 2 материала — по строке с документами", () => {
  const lines = point3Lines([am(2, 1), am(4, 2)], [pipe, clip], new Map([[2, pipeDocs]]), BASE);
  assert.equal(lines[0], "Труба ПВХ жёсткая гладкая, d20 мм — Паспорт качества №63920 от 19.05.2025 г.; Сертификат соответствия №ЕАЭС RU C-RU.ПБ68.В.00389/21 от 07.07.2021 г.");
  assert.equal(lines[1], "Держатель-клипса для монтажного пистолета, d20 мм, серый");
});

test("point3Lines: больше 5 материалов — ссылка на РИМ и ВД", () => {
  const ms = [1, 2, 3, 4, 5, 6].map((i) => mat(i, `M${i}`));
  assert.deepEqual(point3Lines(ms.map((m, i) => am(m.id, i)), ms, new Map(), BASE), [
    "Согласно реестру использованных материалов №К32.В.СТ.АОВ1.01.00.1.РИМ ведомости смонтированного оборудования, технических средств и материалов №К32.В.СТ.АОВ1.01.00.1.ВД",
  ]);
});

test("point4Lines: нет документов — «Не требуется»", () => {
  assert.deepEqual(point4Lines([]), ["Не требуется"]);
});

test("point4Lines: схема и прочий документ", () => {
  const docs: ActDocumentInput[] = [
    { kind: "other", number: "1", name: "Протокол проверки сопротивления изоляции", date: "2026-06-06", fileId: null, sortOrder: 2 },
    { kind: "scheme", number: "К32.В.СТ.АОВ1.01.00.1", name: "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К", date: null, fileId: null, sortOrder: 1 },
  ];
  assert.deepEqual(point4Lines(docs), [
    "Исполнительная схема №К32.В.СТ.АОВ1.01.00.1. Монтаж кабельных линий на этаже П5 в осях 27-13/У-К;",
    "Протокол проверки сопротивления изоляции №1 от 06.06.2026 г.",
  ]);
});

test("point4Lines: подряд идущие схемы — «Исполнительная схема» один раз, через «;»", () => {
  const s = (n: number, name: string): ActDocumentInput => ({ kind: "scheme", number: `К32.В.СТ.АОВ1.01.00.${n}`, name, date: null, fileId: null, sortOrder: n });
  assert.deepEqual(point4Lines([s(1, "Монтаж на П5"), s(2, "Монтаж на П4"), s(3, "Монтаж на П3")]), [
    "Исполнительная схема №К32.В.СТ.АОВ1.01.00.1. Монтаж на П5;",
    "№К32.В.СТ.АОВ1.01.00.2. Монтаж на П4;",
    "№К32.В.СТ.АОВ1.01.00.3. Монтаж на П3",
  ]);
});

const m1 = mat(6, "Муфта труба-труба с ограничителем IP40, d20 мм");
const m2 = mat(7, "Муфта труба-коробка, IP67, М20х1,5, д.20мм");
const letter = doc(20, { type: "info_letter", number: "2448", issueDate: "2023-02-17", sheets: 2, materialIds: [6, 7] });

test("rimRows: письмо №2448 на две муфты — одна строка", () => {
  const rows = rimRows([am(6, 1), am(7, 2)], [m1, m2], new Map([[6, [letter]], [7, [letter]]]));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    name: "Муфта труба-труба с ограничителем IP40, d20 мм, Муфта труба-коробка, IP67, М20х1,5, д.20мм",
    type: "информационное письмо", number: "№2448", date: "17.02.2023 г.", sheets: 2, group: 0, cont: false,
  });
});

test("rimRows: порядок — паспорт раньше сертификата; дата со сроком", () => {
  const cert = doc(30, { type: "certificate", number: "ЕАЭС RU C-RU.АД38.В.00024/21", issueDate: "2021-06-11", validUntil: "2026-06-10", sheets: 3, materialIds: [1] });
  const pass = doc(31, { type: "passport", number: "№3/405", issueDate: "2025-05-09", materialIds: [1] });
  const rows = rimRows([am(1, 1)], [mat(1, "Кабель")], new Map([[1, [cert, pass]]]));
  assert.deepEqual(rows.map((r) => r.type), ["паспорт качества", "сертификат соответствия"]);
  assert.equal(rows[0].number, "№3/405");
  assert.equal(rows[1].date, "от 11.06.2021 г. до 10.06.2026 г.");
  // наименование материала — один раз: вторая строка его группы — продолжение
  assert.deepEqual(rows.map((r) => [r.group, r.cont]), [[0, false], [0, true]]);
});

test("point4Lines: «Исполнительная схема» перед каждой схемой — по настройке", () => {
  const s = (n: number, name: string): ActDocumentInput => ({ kind: "scheme", number: String(n), name, date: null, fileId: null, sortOrder: n });
  assert.deepEqual(point4Lines([s(1, "Монтаж трубы"), s(2, "Монтаж кабеля")], { schemeEach: true }), [
    "Исполнительная схема №1. Монтаж трубы;",
    "Исполнительная схема №2. Монтаж кабеля",
  ]);
  assert.deepEqual(point4Lines([s(1, "Монтаж трубы"), s(2, "Монтаж кабеля")]), [
    "Исполнительная схема №1. Монтаж трубы;",
    "№2. Монтаж кабеля",
  ]);
});

test("rimRows: группы материалов; общий документ — отдельная группа", () => {
  const a = doc(40, { materialIds: [1] }), b = doc(41, { type: "certificate", materialIds: [1] });
  const c = doc(42, { materialIds: [2] }), shared = doc(43, { type: "info_letter", materialIds: [1, 2] });
  const rows = rimRows([am(1, 1), am(2, 2)], [mat(1, "Кабель"), mat(2, "Труба")], new Map([[1, [a, b, shared]], [2, [c, shared]]]));
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.cont]), [
    ["Кабель", 0, false], ["Кабель", 0, true], ["Труба", 1, false], ["Кабель, Труба", 2, false],
  ]);
});

test("rimRows: registryName перекрывает имена материалов", () => {
  const d = { ...letter, registryName: "Винт М6, М8, гайка М6, М8" };
  assert.equal(rimRows([am(6, 1)], [m1], new Map([[6, [d]]]))[0].name, "Винт М6, М8, гайка М6, М8");
});

const cable = mat(1, "Кабель для промышленного интерфейса RS-485", { mark: "СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В", manufacturer: 'ООО "СегментЭНЕРГО"', unit: "м." });
const vor = (group: string, materialId: number, quantity: number, sortOrder: number): VorLineInput => ({ group, materialId, quantity, sortOrder });

test("vdRows: количество — сумма ВОР, если quantity = null", () => {
  const lines = [vor("Этаж П5", 1, 430, 1), vor("Этаж П4", 1, 436.6, 2), vor("Этаж П3", 1, 483.3, 3), vor("Этаж П2", 1, 269, 4)];
  const rows = vdRows([am(1, 1)], [cable], lines);
  assert.equal(rows[0].quantity, "1618,9");
  assert.equal(vorTotals(lines).get(1), 1618.9);
});

test("vdRows: явное количество важнее ВОР; позиция УСР", () => {
  const rows = vdRows([am(2, 1, { quantity: 1067.5, position: "5" })], [pipe], [vor("П5", 2, 1, 1)]);
  assert.deepEqual(rows[0], { position: "5", name: pipe.name, article: "63920", manufacturer: "DKC", unit: "м.", quantity: "1067,5" });
});

test("vdRows: артикул пуст — берётся марка", () => {
  assert.equal(vdRows([am(1, 1)], [cable], [])[0].article, "СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В");
  assert.equal(vdRows([am(1, 1)], [cable], [])[0].quantity, "");
});

test("vorRows: группы и строки", () => {
  const rows = vorRows([vor("Этаж П5", 2, 259.4, 1), vor("Этаж П5", 1, 430, 0), vor("Этаж П4", 2, 329.1, 2)], [pipe, cable]);
  assert.deepEqual(rows.map((r) => r.kind), ["group", "line", "line", "group", "line"]);
  assert.deepEqual(rows[2], { kind: "line", name: "Труба ПВХ жёсткая гладкая, d20 мм (63920, DKC)", unit: "м.", quantity: "259,4" });
  assert.equal((rows[1] as any).name, 'Кабель для промышленного интерфейса RS-485 (СегментКИ-485-ПсЭнг(А)-HF 1х2х0,78-300 В, ООО "СегментЭНЕРГО")');
  assert.deepEqual(rows[3], { kind: "group", title: "Этаж П4" });
});

test("signers: роль без действующего — пустая подпись", () => {
  const reps = [
    rep({ id: 1, role: "performer", fullName: "Королев Д.М.", sortOrder: 1 }),
    rep({ id: 2, role: "performer", fullName: "Востров В.П.", sortOrder: 2 }),
    rep({ id: 3, role: "designer", fullName: "Смирнов М.А.", validTo: "2026-01-01" }),
  ];
  const s = signers(reps, ["designer", "performer"], "2026-07-28");
  assert.deepEqual(s.map((x) => x.names), [[""], ["Королев Д.М.", "Востров В.П."]]);
  assert.match(s[0].label, /подготовку проектной документации/);
});

test("vorRows: итог по этажам в порядке материалов акта", () => {
  const lines = [vor("Этаж П5", 2, 259.4, 1), vor("Этаж П5", 1, 430, 0), vor("Этаж П4", 1, 436.6, 2), vor("Этаж П4", 2, 329.1, 3)];
  const rows = vorRows(lines, [pipe, cable], [am(1, 0), am(2, 1)]);
  const t = rows.findIndex((r) => r.kind === "group" && r.title.startsWith("Итого"));
  assert.deepEqual(rows[t], { kind: "group", title: "Итого по этажам П5, П4" });
  assert.deepEqual(rows.slice(t + 1).map((r: any) => r.quantity), ["866,6", "588,5"]);
});

test("vorTotalTitle: общий префикс «Этаж» и прочие группы", async () => {
  const { vorTotalTitle } = await import("@idk/shared/acts/rows");
  assert.equal(vorTotalTitle(["Этаж П5", "Этаж П4"]), "Итого по этажам П5, П4");
  assert.equal(vorTotalTitle(["Секция 1", "Кровля"]), "Итого по разделам: Секция 1, Кровля");
});

test("rimRows: общий документ — после документов последнего своего материала", () => {
  const p6 = doc(40, { type: "passport", number: "54920", issueDate: "2025-05-19", materialIds: [6] });
  const p7 = doc(41, { type: "passport", number: "50220", issueDate: "2026-05-14", materialIds: [7] });
  const rows = rimRows([am(6, 1), am(7, 2)], [m1, m2], new Map([[6, [letter, p6]], [7, [letter, p7]]]));
  assert.deepEqual(rows.map((r) => r.number), ["№54920", "№50220", "№2448"]);
});
