// План 13: описания протоколов испытаний и актов приёмки — единственный источник для таблиц книги, проверки, печати,
// реестра и образцов .docx (спецификация «Протоколы испытаний и акты приёмки», §4–6).
import { PROTO_KINDS, type ProtoKind } from "../acts/schemas.ts";
import type { RoleCode } from "../roles.ts";
import type { TableName } from "../workbook/schema.ts";

export { PROTO_KINDS, type ProtoKind };

/** Правила вычисления результата строки (result.ts). */
export type RuleName = "pav" | "puzo" | "pfn" | "pms" | "pzu" | "pzov" | "ptsks";

/** Столбец печати: ключ столбца таблицы строк или вычисляемый (computed: true — значение из result.ts computed). */
export interface ProtoColumn { key: string; header: string; width?: number; computed?: boolean }

export interface ProtoDef {
  kind: ProtoKind;
  /** Код справочника документов. */
  code: string;
  /** Полное наименование (как в справочнике). */
  name: string;
  scope: "act" | "kit";
  /** Подписи: электролаборатория или комиссия из представителей этих ролей. */
  signer: "lab" | RoleCode[];
  /** Таблица строк документа. */
  table: TableName;
  /** Столбцы таблицы печати по порядку; столбец result — результат строки (внесённый или вычисленный). */
  columns: ProtoColumn[];
  rule?: RuleName;
  /** Нормативы по умолчанию (источник справочника). */
  source: string;
  /** Заключение по умолчанию; {нормативы} заменяется нормативами документа. */
  conclusion: string;
  /** Акт комиссии: текст после состава комиссии. */
  intro?: string;
  /** Лаборатория: климатические условия — полные или только температура. */
  climate?: "full" | "temp";
}

const LAB_CONCLUSION = "Результаты измерений соответствуют требованиям {нормативы}.";
const RESULT: ProtoColumn = { key: "result", header: "Результат", width: 12 };
const COMMISSION_FULL: RoleCode[] = ["developer_control", "builder", "performer", "designer"];
const COMMISSION: RoleCode[] = ["developer_control", "builder", "performer"];
const ITEMS: ProtoColumn[] = [
  { key: "name", header: "Наименование оборудования, системы", width: 40 },
  { key: "type", header: "Тип, марка", width: 22 },
  { key: "unit", header: "Ед. изм.", width: 8 },
  { key: "qty", header: "Кол-во", width: 8 },
  { key: "note", header: "Примечание", width: 18 },
];

const defs: Omit<ProtoDef, "kind">[] = [
  {
    code: "ПКЛ", name: "Протокол испытания силовой кабельной линии", scope: "act", signer: "lab", table: "ИспытанияКЛ",
    source: "ПУЭ, п. 1.8.40", conclusion: LAB_CONCLUSION,
    columns: [
      { key: "line", header: "Линия", width: 16 }, { key: "mark", header: "Марка кабеля", width: 18 },
      { key: "length", header: "Длина, м" }, { key: "riBefore", header: "R изоляции до испытания, МОм" },
      { key: "voltage", header: "Испытательное напряжение, кВ" }, { key: "duration", header: "Время, мин" },
      { key: "leakage", header: "Ток утечки, мА" }, { key: "riAfter", header: "R изоляции после испытания, МОм" }, RESULT,
    ],
  },
  {
    code: "ПАВ", name: "Протокол проверки действия автоматических выключателей", scope: "kit", signer: "lab", table: "ЗамерыАвтоматов",
    rule: "pav", source: "ПУЭ, п. 1.8.37 (3)", conclusion: LAB_CONCLUSION,
    columns: [
      { key: "board", header: "Щит", width: 12 }, { key: "line", header: "Обозначение по проекту", width: 14 },
      { key: "type", header: "Тип аппарата", width: 16 }, { key: "rated", header: "Iн, А" },
      { key: "testCurrent", header: "Ток проверки, А" }, { key: "tripNorm", header: "Время срабатывания по ТУ, с" },
      { key: "tripFact", header: "Время срабатывания факт., с" }, RESULT,
    ],
  },
  {
    code: "ПУЗО", name: "Протокол проверки устройств защитного отключения", scope: "kit", signer: "lab", table: "ЗамерыУЗО",
    rule: "puzo", source: "ПУЭ, п. 1.8.37 (5)", conclusion: LAB_CONCLUSION,
    columns: [
      { key: "board", header: "Щит", width: 12 }, { key: "line", header: "Обозначение по проекту", width: 14 },
      { key: "type", header: "Тип УЗО (АВДТ)", width: 16 }, { key: "rated", header: "Iн, А" },
      { key: "diffRated", header: "IΔн, мА" }, { key: "diffFact", header: "Ток срабатывания факт., мА" },
      { key: "timeFact", header: "Время отключения факт., мс" }, { key: "timeNorm", header: "Время отключения норм., мс" }, RESULT,
    ],
  },
  {
    code: "ПФН", name: "Протокол проверки цепи «фаза — нуль» в электроустановках до 1 кВ с системой TN", scope: "kit", signer: "lab",
    table: "ЗамерыФазаНуль", rule: "pfn", source: "ПУЭ, п. 1.8.39 (4)", conclusion: LAB_CONCLUSION,
    columns: [
      { key: "board", header: "Щит", width: 12 }, { key: "line", header: "Обозначение по проекту", width: 14 },
      { key: "device", header: "Аппарат защиты", width: 16 }, { key: "rated", header: "Iн, А" },
      { key: "curve", header: "Характеристика" }, { key: "zloop", header: "Zп, Ом" },
      { key: "ikz", header: "Iкз, А", computed: true }, { key: "itrip", header: "Ток срабатывания, А", computed: true }, RESULT,
    ],
  },
  {
    code: "ПМС", name: "Протокол проверки цепи между заземлителями и заземляемыми элементами", scope: "kit", signer: "lab",
    table: "ЗамерыМеталлосвязи", rule: "pms", source: "ПУЭ, п. 1.8.39 (2)", conclusion: LAB_CONCLUSION,
    columns: [
      { key: "element", header: "Проверяемый элемент", width: 30 }, { key: "place", header: "Место / к чему присоединён", width: 26 },
      { key: "resistance", header: "Сопротивление, Ом" }, { key: "allowed", header: "Допустимое, Ом" }, RESULT,
    ],
  },
  {
    code: "ПЗУ", name: "Протокол измерения сопротивления заземляющего устройства", scope: "kit", signer: "lab", table: "ЗамерыЗаземления",
    rule: "pzu", source: "ПУЭ, п. 1.8.39 (5); СП 76.13330.2016, п. 7.23", conclusion: LAB_CONCLUSION,
    columns: [
      { key: "device", header: "Заземляющее устройство", width: 26 }, { key: "place", header: "Место измерения", width: 22 },
      { key: "measured", header: "Сопротивление измеренное, Ом" }, { key: "season", header: "Сезонный коэффициент" },
      { key: "reduced", header: "Сопротивление с учётом коэффициента, Ом", computed: true }, { key: "allowed", header: "Допустимое, Ом" }, RESULT,
    ],
  },
  {
    code: "ПОКБ", name: "Протокол осмотра кабелей на барабанах", scope: "act", signer: ["builder_control", "performer"], table: "ОсмотрБарабанов",
    source: "СП 76.13330.2016, п. 5.5",
    conclusion: "Кабели на барабанах осмотрены; результаты осмотра — в таблице. Кабели, признанные годными, допускаются к прокладке.",
    intro: "произвела наружный осмотр кабелей на барабанах перед прокладкой и установила:",
    columns: [
      { key: "drum", header: "№ барабана", width: 10 }, { key: "mark", header: "Марка кабеля", width: 20 },
      { key: "length", header: "Длина, м" }, { key: "maker", header: "Завод-изготовитель", width: 14 },
      { key: "made", header: "Дата изготовления" }, { key: "drumState", header: "Состояние барабана" },
      { key: "cableState", header: "Наружный осмотр кабеля" }, { key: "ends", header: "Концы кабеля" },
      { key: "result", header: "Заключение по барабану", width: 14 },
    ],
  },
  {
    code: "ППКБ", name: "Протокол прогрева кабелей на барабанах (при прокладке при низких температурах)", scope: "act",
    signer: ["builder_control", "performer"], table: "ПрогревБарабанов", source: "СП 77.13330.2016, прил. А.17",
    conclusion: "Прогрев кабелей перед прокладкой выполнен в соответствии с требованиями {нормативы}.",
    intro: "составила настоящий протокол о прогреве кабелей на барабанах перед прокладкой при низкой температуре:",
    columns: [
      { key: "drum", header: "№ барабана", width: 10 }, { key: "mark", header: "Марка кабеля", width: 18 },
      { key: "length", header: "Длина, м" }, { key: "airTemp", header: "Температура воздуха, °C" },
      { key: "method", header: "Способ прогрева", width: 14 }, { key: "start", header: "Начало прогрева" },
      { key: "end", header: "Окончание прогрева" }, { key: "cableTemp", header: "Температура кабеля после прогрева, °C" },
      { key: "layEnd", header: "Прокладка окончена" }, { key: "note", header: "Примечание" },
    ],
  },
  {
    code: "АТП", name: "Акт испытания трубных проводок на прочность и плотность", scope: "act", signer: COMMISSION, table: "ТрубныеПроводки",
    source: "СП 77.13330.2016, прил. А.7",
    conclusion: "Трубные проводки испытания на прочность и плотность выдержали и признаются годными к эксплуатации.",
    intro: "произвела испытание трубных проводок на прочность и плотность и установила:",
    columns: [
      { key: "line", header: "Обозначение проводки", width: 14 }, { key: "medium", header: "Среда" },
      { key: "material", header: "Материал, диаметр", width: 14 }, { key: "workP", header: "Рабочее давление, МПа" },
      { key: "testP", header: "Давление на прочность, МПа" }, { key: "holdStr", header: "Выдержка на прочность, мин" },
      { key: "densP", header: "Давление на плотность, МПа" }, { key: "holdDens", header: "Выдержка на плотность, мин" },
      { key: "drop", header: "Падение давления, %" }, RESULT,
    ],
  },
  {
    code: "АИИ", name: "Акт о приемке электрооборудования после индивидуального испытания", scope: "kit", signer: COMMISSION_FULL,
    table: "ПереченьОборудования", source: "СП 76.13330.2016, п. 4.6", columns: ITEMS,
    conclusion: "Электрооборудование, указанное в акте, прошло индивидуальные испытания и считается принятым для комплексного опробования.",
    intro: "произвела приемку электрооборудования после индивидуального испытания и установила, что смонтировано и испытано:",
  },
  {
    code: "АТГ", name: "Акт технической готовности электрооборудования для комплексного опробования", scope: "kit", signer: COMMISSION_FULL,
    table: "ПереченьОборудования", source: "СП 76.13330.2016, п. 7.23", columns: ITEMS,
    conclusion: "Электрооборудование, указанное в акте, технически готово к комплексному опробованию.",
    intro: "произвела проверку технической готовности электрооборудования для комплексного опробования:",
  },
  {
    code: "АПНР", name: "Акт сдачи-приемки пусконаладочных работ", scope: "kit", signer: COMMISSION, table: "ПереченьОборудования",
    source: "СП 76.13330.2016, п. 7.27, прил. Б", columns: ITEMS,
    conclusion: "Пусконаладочные работы выполнены в полном объеме в соответствии с требованиями {нормативы}; оборудование принимается.",
    intro: "произвела приемку пусконаладочных работ по оборудованию:",
  },
  {
    code: "АОМА", name: "Акт окончания работ по монтажу систем автоматизации", scope: "kit", signer: COMMISSION, table: "ПереченьОборудования",
    source: "СП 77.13330.2016, прил. А.5", columns: ITEMS,
    conclusion: "Работы по монтажу систем автоматизации выполнены в соответствии с рабочей документацией и требованиями {нормативы}; системы готовы к индивидуальным испытаниям.",
    intro: "произвела освидетельствование выполненных работ по монтажу систем автоматизации:",
  },
  {
    code: "АРПС", name: "Акт проверки работоспособности системы пожарной сигнализации", scope: "kit", signer: COMMISSION_FULL,
    table: "ПереченьОборудования", source: "344/пр, п. 10", columns: ITEMS,
    conclusion: "Система пожарной сигнализации работоспособна и соответствует рабочей документации.",
    intro: "произвела проверку работоспособности системы пожарной сигнализации:",
  },
  {
    code: "ПЗОВ", name: "Протокол входного контроля измерения затухания оптических волокон", scope: "act", signer: "lab", table: "ЗамерыВолокон",
    rule: "pzov", source: "СП 77.13330.2016, прил. А.4", conclusion: LAB_CONCLUSION, climate: "temp",
    columns: [
      { key: "cable", header: "Кабель / № барабана", width: 16 }, { key: "mark", header: "Марка кабеля", width: 18 },
      { key: "length", header: "Строительная длина, м" }, { key: "fiber", header: "№ волокна" },
      { key: "wave", header: "Длина волны, нм" }, { key: "att", header: "Затухание, дБ/км" },
      { key: "norm", header: "Норма, дБ/км", computed: true }, RESULT,
    ],
  },
  {
    code: "ПТСКС", name: "Протокол тестирования структурированной кабельной системы", scope: "act", signer: "lab", table: "ЗамерыСКС",
    rule: "ptsks", source: "344/пр, п. 11", conclusion: LAB_CONCLUSION, climate: "temp",
    columns: [
      { key: "link", header: "Линия (порт)", width: 12 }, { key: "panel", header: "Шкаф, панель, порт", width: 16 },
      { key: "outlet", header: "Розетка", width: 12 }, { key: "cat", header: "Категория" }, { key: "length", header: "Длина, м" },
      { key: "wiremap", header: "Схема разводки" }, { key: "next", header: "Запас NEXT, дБ" }, { key: "il", header: "Запас затухания, дБ" },
      { key: "rl", header: "Запас возвратных потерь, дБ" }, RESULT,
    ],
  },
];

export const PROTO_DEFS = Object.fromEntries(PROTO_KINDS.map((kind, i) => [kind, { kind, ...defs[i] }])) as Record<ProtoKind, ProtoDef>;

export const isProtoKind = (k: string | null | undefined): k is ProtoKind => !!k && (PROTO_KINDS as readonly string[]).includes(k);

/** Описание по коду справочника (без учёта регистра). */
export const protoByCode = (code: string): ProtoDef | undefined =>
  Object.values(PROTO_DEFS).find((d) => d.code.toUpperCase() === code.trim().toUpperCase());

/** Таблицы строк документов (без повторов) — для схемы книги и проверок. */
export const PROTO_ROW_TABLES = [...new Set(Object.values(PROTO_DEFS).map((d) => d.table))];
