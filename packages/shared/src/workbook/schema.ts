// Описание книги объекта: листы, «умные таблицы», столбцы. Единственный источник для разметки,
// карточек, проверок и сборки пакета акта. Заголовки — буква в букву как в спецификации §3.
import { HELP, OBJECT_HELP } from "./help.ts";
import type { CellValue } from "./values.ts";
import { PROTO_KINDS, PROTO_DEFS } from "../protocols/defs.ts";
import { ROLE_CODES, QUALITY_DOC_TYPES, QUALITY_DOC_LABELS, type RoleCode, type QualityDocType } from "../roles.ts";

export const SCHEMA_VERSION = 13;

export type ColType = "text" | "longtext" | "date" | "number" | "int" | "enum" | "ref" | "refs" | "file" | "formula";

export type TableName =
  | "Объект" | "Организации" | "Шифры" | "Представители" | "Материалы" | "ДокументыКачества"
  | "Акты" | "Схемы" | "МатериалыАктов" | "ВОР" | "КабельныйЖурнал"
  | "Электролаборатория" | "СредстваИзмерений" | "ИзмеренияМарок" | "ДокументыКабелей"
  | "Комплекты" | "АктыКомплектов" | "РеестрИД" | "ОЖР3" | "ОЖР5" | "Спецификация"
  | "Протоколы" | "ПереченьОборудования" | "ИспытанияКЛ" | "ЗамерыАвтоматов" | "ЗамерыУЗО" | "ЗамерыФазаНуль"
  | "ЗамерыМеталлосвязи" | "ЗамерыЗаземления" | "ОсмотрБарабанов" | "ПрогревБарабанов" | "ТрубныеПроводки"
  | "ЗамерыВолокон" | "ЗамерыСКС";

export type SheetName =
  | "Реквизиты" | "Представители" | "Материалы" | "Документы качества" | "База актов"
  | "Исполнительные схемы" | "Материалы в актах" | "ВОР" | "Кабельный журнал" | "Изоляция" | "Комплекты" | "Реестр ИД"
  | "ОЖР Раздел 3" | "ОЖР Раздел 5" | "Спецификация"
  | "Протоколы и акты" | "Замеры электрики" | "Барабаны и трубы" | "Замеры СКС и ВОЛС";

export interface ColumnDef {
  key: string;
  header: string;
  type: ColType;
  values?: readonly string[];
  ref?: TableName;
  isKey?: boolean;
  important?: boolean;
  service?: boolean;
  default?: string | number;
  formula?: string;
  width?: number;
  /** Имя диапазона Excel со списком значений (для столбцов без таблицы-источника, например «ВидыРабот»). */
  listRange?: string;
  /** Подсказка: что вносить и в каком формате (≤ 255 символов — ограничение Excel). */
  hint: string;
  /** Значение строки-примера в новой книге. */
  example?: CellValue;
}

export interface TableDef {
  name: TableName; sheet: SheetName; columns: ColumnDef[];
  /** План 31: таблицы в Excel нет — строки выводятся из единой таблицы «Материалы» (workbook/virtual.ts). */
  virtual?: true;
  /** Повтор значения ключа допустим (один человек в нескольких ролях): нет подсветки и ошибки повтора. */
  allowDuplicates?: boolean;
}

/** Подписи ролей представителей в книге (спецификация §3.2). */
export const ROLE_BOOK_LABELS: Record<RoleCode, string> = {
  developer_control: "Технадзор застройщика",
  builder: "Лицо, осуществляющее строительство",
  builder_control: "Строительный контроль подрядчика",
  designer: "Проектировщик",
  performer: "Выполнивший работы",
  other: "Иные представители",
};

export function roleFromBook(label: string): RoleCode | null {
  const t = label.trim();
  return ROLE_CODES.find((r) => ROLE_BOOK_LABELS[r] === t) ?? null;
}

export function docTypeFromBook(label: string): QualityDocType | null {
  const t = label.trim();
  return QUALITY_DOC_TYPES.find((d) => QUALITY_DOC_LABELS[d] === t) ?? null;
}

export const SCHEME_KINDS = ["Схема", "Прочее"] as const;

/** Виды строк реестра ИД: документы, которые печатает конструктор (по акту), и сканы. */
export const REGISTRY_KINDS = ["ВОР", "АОСР", "РИМ", "РП", "ВД", "Схема", "КЖ", "Протокол", "Поверка", "Лаборатория", "АВК", "Документ качества", "Свой документ", "Акт/протокол", "Прочее"] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];
export const YES_NO = ["да", "нет"] as const;
/** Источник позиции спецификации; пометка позиции, пропавшей из нового РКЦ. */
export const SPEC_SOURCES = ["РКЦ", "вручную"] as const;
export const SPEC_MISSING = "нет в РКЦ";
/** Группы столбцов документов качества в строке материала. */
export const DOC_SLOTS = [1, 2, 3] as const;
/** Ключи столбцов документа k в «Материалах» по ключам виртуальной таблицы «ДокументыКачества». */
export const DOC_SLOT_KEYS = { type: "type", number: "number", issueDate: "date", validUntil: "valid", sheets: "sheets", registryName: "registry", file: "file" } as const;
export const slotKey = (k: number, docKey: keyof typeof DOC_SLOT_KEYS) => `d${k}${DOC_SLOT_KEYS[docKey]}`;

const OBJECT_FIELDS_RAW = [
  { key: "name", label: "Наименование объекта", type: "text" },
  { key: "address", label: "Адрес", type: "text" },
  { key: "city", label: "Город", type: "text" },
  { key: "contractNumber", label: "Договор №", type: "text" },
  { key: "contractDate", label: "Дата договора", type: "date" },
  { key: "developer", label: "Застройщик (технический заказчик)", type: "ref" },
  { key: "builder", label: "Лицо, осуществляющее строительство", type: "ref" },
  { key: "designer", label: "Лицо, осуществляющее подготовку проектной документации", type: "ref" },
  { key: "performer", label: "Лицо, выполнившее работы (по умолчанию)", type: "ref" },
  { key: "scanFolder", label: "Папка сканов", type: "text" },
  { key: "workConditions", label: "Условия производства работ", type: "text" },
] as const satisfies readonly { key: string; label: string; type: "text" | "date" | "ref" }[];
export type ObjectFieldKey = (typeof OBJECT_FIELDS_RAW)[number]["key"];

/** Поля объекта, без которых не напечатать шапку АОСР (договор и прочее — необязательны). */
export const OBJECT_REQUIRED = new Set<ObjectFieldKey>(["name", "developer", "builder"]);
export const OBJECT_REQUIRED_LABELS: string[] = OBJECT_FIELDS_RAW.filter((f) => OBJECT_REQUIRED.has(f.key)).map((f) => f.label);
export const isObjectFieldRequired = (label: string) => OBJECT_REQUIRED_LABELS.includes(label.trim());

/** Поля таблицы «Объект» с подсказками и значениями примера. */
export const OBJECT_FIELDS = OBJECT_FIELDS_RAW.map((f) => ({ ...f, hint: OBJECT_HELP[f.key][0], example: OBJECT_HELP[f.key][1] }));

/** Именованный диапазон на листе «Списки» с видами работ из справочника шаблона. */
export const WORK_LIST = "ВидыРабот";

const c = (key: string, header: string, type: ColType, extra: Partial<ColumnDef> = {}): ColumnDef =>
  ({ key, header, type, hint: "", ...extra });
const imp = { important: true };

const t = (name: TableName, sheet: SheetName, columns: ColumnDef[], extra: Partial<TableDef> = {}): TableDef =>
  ({ name, sheet, columns, ...extra });
/** Первый столбец таблиц строк протоколов и актов (план 13); новый объект на таблицу — подсказки пишутся в столбец. */
const protoRef = () => c("doc", "№ документа", "ref", { ...imp, ref: "Протоколы", width: 16 });
/** Результат строки с правилом (protocols/result.ts): пусто — вычисляется. */
const resultCol = () => c("result", "Результат", "text", { width: 16 });

export const TABLES: Record<TableName, TableDef> = {
  "Объект": t("Объект", "Реквизиты", [
    c("field", "Поле", "text", { width: 34 }),
    c("value", "Значение", "text", { ...imp, width: 70 }),
  ]),
  "Организации": t("Организации", "Реквизиты", [
    c("shortName", "Краткое наименование", "text", { ...imp, isKey: true, width: 34 }),
    c("fullName", "Полное наименование", "text", { ...imp, width: 70 }),
    c("ogrn", "ОГРН", "text", imp),
    c("inn", "ИНН", "text", imp),
    c("address", "Адрес", "text", { ...imp, width: 40 }),
    c("phone", "Телефон", "text"),
    c("sroName", "СРО: наименование", "text", { width: 40 }),
    c("sroOgrn", "СРО: ОГРН", "text"),
    c("sroInn", "СРО: ИНН", "text"),
    c("logo", "Логотип", "file", { width: 20 }),
  ]),
  "Шифры": t("Шифры", "Реквизиты", [
    c("code", "Шифр", "text", { ...imp, isKey: true, width: 34 }),
    c("name", "Наименование раздела", "longtext", { width: 70 }),
    c("designer", "Проектировщик", "ref", { ...imp, ref: "Организации", width: 30 }),
  ]),
  "Представители": t("Представители", "Представители", [
    c("role", "Роль", "enum", { ...imp, values: ROLE_CODES.map((r) => ROLE_BOOK_LABELS[r]), width: 30 }),
    c("position", "Должность", "text", { ...imp, width: 40 }),
    c("fullName", "ФИО", "text", { ...imp, isKey: true, width: 20 }),
    c("org", "Организация", "ref", { ...imp, ref: "Организации", width: 26 }),
    c("authorityDoc", "Документ о полномочиях", "text", { ...imp, width: 36 }),
    c("nrsNumber", "НРС №", "text"),
    c("nrsDate", "Дата НРС", "date"),
    c("validFrom", "Действует с", "date"),
    c("validTo", "Действует по", "date"),
    c("sortOrder", "Порядок", "int", { default: 1 }),
    c("actText", "Текст для акта", "longtext", { width: 40 }),
  ], { allowDuplicates: true }),
  // План 31: одна таблица на листе «Материалы» — материал, позиция спецификации (РКЦ) и до трёх документов качества.
  // «Спецификация» и «ДокументыКачества» ниже — виртуальные: строятся из неё (workbook/virtual.ts).
  "Материалы": t("Материалы", "Материалы", [
    c("name", "Наименование", "text", { ...imp, isKey: true, width: 60 }),
    c("mark", "Марка", "text", { width: 30 }),
    c("article", "Артикул", "text"),
    c("manufacturer", "Завод-изготовитель", "text", { ...imp, width: 24 }),
    c("unit", "Ед. изм.", "text", imp),
    c("rkc", "№ п/п РКЦ", "text", { width: 12 }),
    c("section", "Раздел", "text", { width: 24 }),
    c("quantity", "Кол-во по проекту", "number"),
    c("closed", "Закрыто", "formula", { service: true, formula: "=SUMIFS(МатериалыАктов[Учёт],МатериалыАктов[Материал],[@Наименование])" }),
    c("rest", "Остаток", "formula", { service: true, formula: '=IF([@[Кол-во по проекту]]="","",[@[Кол-во по проекту]]-[@Закрыто])' }),
    c("source", "Источник", "enum", { values: SPEC_SOURCES, width: 10 }),
    c("note", "Примечание", "text", { width: 24 }),
    ...DOC_SLOTS.flatMap((k) => [
      c(`d${k}type`, `Док.${k}: вид`, "enum", { values: QUALITY_DOC_TYPES.map((d) => QUALITY_DOC_LABELS[d]), width: 20 }),
      c(`d${k}number`, `Док.${k}: номер`, "text", { width: 22 }),
      c(`d${k}date`, `Док.${k}: дата`, "date"),
      c(`d${k}valid`, `Док.${k}: действует до`, "date"),
      c(`d${k}sheets`, `Док.${k}: листов`, "int", { width: 9 }),
      c(`d${k}registry`, `Док.${k}: наименование для реестра`, "text", { width: 26 }),
      c(`d${k}file`, `Док.${k}: скан`, "file", { service: true, width: 18 }),
    ]),
  ]),
  "ДокументыКачества": t("ДокументыКачества", "Материалы", [
    c("materials", "Материалы", "refs", { ...imp, ref: "Материалы", width: 60 }),
    c("type", "Тип", "enum", { ...imp, values: QUALITY_DOC_TYPES.map((d) => QUALITY_DOC_LABELS[d]), width: 24 }),
    c("number", "Номер", "text", { ...imp, width: 30 }),
    c("issueDate", "Дата", "date"),
    c("validUntil", "Действует до", "date"),
    c("sheets", "Листов", "int", imp),
    c("registryName", "Наименование для реестра", "text", { width: 40 }),
    c("file", "Скан", "file", { service: true }),
  ], { virtual: true }),
  "Акты": t("Акты", "База актов", [
    c("baseNumber", "Номер акта", "text", { ...imp, isKey: true, width: 24 }),
    c("date", "Дата акта", "date", imp),
    c("section", "Шифр", "ref", { ...imp, ref: "Шифры", width: 30 }),
    c("works", "Работы (п.1)", "longtext", { ...imp, width: 50 }),
    c("sheets", "Листы", "text"),
    c("revision", "Ревизия", "text"),
    c("dateStart", "Начало работ", "date", imp),
    c("dateEnd", "Окончание работ", "date", imp),
    c("normative", "Нормативы (п.6)", "longtext", { ...imp, width: 50 }),
    c("nextWorks", "Разрешается (п.7)", "longtext", { ...imp, width: 50 }),
    c("extraInfo", "Доп. сведения", "text", { default: "нет" }),
    c("copies", "Экз.", "int", { default: 4 }),
    c("attachments", "Приложения", "text", { default: "Согласно п.3, п.4." }),
    c("performerOrg", "Выполнивший работы", "ref", { ref: "Организации" }),
    c("vorTitle", "Заголовок ВОР", "longtext", { width: 40 }),
    c("vorCustomer", "ВОР: от заказчика", "ref", { ref: "Представители" }),
    c("vorContractor", "ВОР: от монтажников", "ref", { ref: "Представители" }),
    c("avkNumber", "АВК: номер", "text", { width: 18 }),
    c("avkDate", "АВК: дата", "date"),
    c("workKinds", "Вид работ", "refs", { listRange: WORK_LIST, width: 40 }),
    c("skipDocs", "Без документов", "text", { width: 24 }),
  ]),
  "Схемы": t("Схемы", "Исполнительные схемы", [
    c("act", "Акт", "ref", { ...imp, ref: "Акты", width: 24 }),
    c("kind", "Вид", "enum", { values: SCHEME_KINDS, default: "Схема" }),
    c("number", "Номер", "text", { ...imp, width: 26 }),
    c("name", "Наименование", "text", { ...imp, width: 55 }),
    c("date", "Дата", "date", imp),
    c("file", "Скан", "file", { service: true }),
  ]),
  "МатериалыАктов": t("МатериалыАктов", "Материалы в актах", [
    c("act", "Акт", "ref", { ...imp, ref: "Акты", width: 24 }),
    c("material", "Материал", "ref", { ...imp, ref: "Материалы", width: 60 }),
    c("position", "№ поз. по УСР", "text", { default: "б/н" }),
    c("quantity", "Кол-во", "number"),
    c("vorSum", "Сумма ВОР", "formula", {
      service: true, formula: "=SUMIFS(ВОР[Объём],ВОР[Акт],[@Акт],ВОР[Материал],[@Материал])",
    }),
    c("rkc", "№ п/п РКЦ", "formula", {
      service: true, formula: '=IFERROR(INDEX(Материалы[№ п/п РКЦ],MATCH([@Материал],Материалы[Наименование],0))&"","")',
    }),
    c("counted", "Учёт", "formula", { service: true, formula: '=IF([@[Кол-во]]="",[@[Сумма ВОР]],[@[Кол-во]])' }),
  ]),
  "Спецификация": t("Спецификация", "Материалы", [
    c("number", "№ п/п", "text", { ...imp, isKey: true, width: 14 }),
    c("section", "Раздел", "text", { width: 30 }),
    c("name", "Наименование", "longtext", { ...imp, width: 60 }),
    c("unit", "Ед. изм.", "text"),
    c("quantity", "Кол-во по проекту", "number", imp),
    c("closed", "Закрыто", "formula", { service: true, formula: '=SUMPRODUCT(--(МатериалыАктов[№ п/п РКЦ]&""=[@[№ п/п]]&""),МатериалыАктов[Учёт])' }),
    c("rest", "Остаток", "formula", { service: true, formula: "=[@[Кол-во по проекту]]-[@Закрыто]" }),
    c("source", "Источник", "enum", { values: SPEC_SOURCES, default: "вручную" }),
    c("note", "Примечание", "text", { width: 30 }),
  ], { virtual: true }),
  "ВОР": t("ВОР", "ВОР", [
    c("act", "Акт", "ref", { ...imp, ref: "Акты", width: 24 }),
    c("group", "Этаж / участок", "text", { ...imp, width: 16 }),
    c("material", "Материал", "ref", { ...imp, ref: "Материалы", width: 60 }),
    c("quantity", "Объём", "number", imp),
  ]),
  "КабельныйЖурнал": t("КабельныйЖурнал", "Кабельный журнал", [
    c("act", "Акт", "ref", { ...imp, service: true, ref: "Акты", width: 24 }),
    c("group", "Группа", "text", { service: true }),
    c("designation", "Обозначение кабеля, жгута, трубы", "text", { ...imp, isKey: true, width: 22 }),
    c("from", "Откуда", "text", imp),
    c("to", "Куда", "text", imp),
    c("direction", "Направление по планам расположения", "text", { width: 22 }),
    c("cableMark", "Кабель: марка, число жил, сечение", "text", { ...imp, width: 40 }),
    c("cableLength", "Кабель: длина, м", "number", imp),
    c("pipeMark", "Труба: марка, диаметр", "text"),
    c("pipeLength", "Труба: длина, м", "number"),
    c("note", "Примечание", "text"),
    // План 14: кабельный журнал набора «ТИ» — длина по проекту и по способам прокладки (факт = их сумма).
    c("projectLength", "Длина по проекту, м", "number"),
    c("tray", "Лоток, м", "number"),
    c("smoothPipe", "Труба гладкая, м", "number"),
    c("corrugatedPipe", "Труба гофрированная, м", "number"),
  ]),
  "Электролаборатория": t("Электролаборатория", "Изоляция", [
    c("nameAddress", "Организация и адрес", "longtext", { ...imp, isKey: true, width: 50 }),
    c("certificate", "Свидетельство", "longtext", { width: 60 }),
    c("head", "Руководитель электролаборатории", "text", { ...imp, width: 24 }),
    c("tester", "Испытания провёл", "text", { ...imp, width: 24 }),
    c("file", "Скан", "file", { width: 20 }),
  ]),
  "СредстваИзмерений": t("СредстваИзмерений", "Изоляция", [
    c("name", "Наименование СИ", "text", { ...imp, isKey: true, width: 34 }),
    c("type", "Тип", "text", { ...imp, width: 18 }),
    c("range", "Диапазон", "text", { width: 20 }),
    c("accuracy", "Точность", "text", { width: 16 }),
    c("serial", "Заводской №", "text", imp),
    c("certificate", "№ свидетельства о поверке", "text", { ...imp, width: 26 }),
    c("checkedOn", "Дата поверки", "date", imp),
    c("nextCheck", "Дата очередной поверки", "date"),
    c("authority", "Орган поверки", "text", { width: 40 }),
    c("file", "Скан", "file", { width: 20 }),
  ]),
  "ИзмеренияМарок": t("ИзмеренияМарок", "Изоляция", [
    c("mark", "Марка", "text", { ...imp, isKey: true, width: 40 }),
    // «нет» — марка не измеряется (кабельные сборки): её линии не попадают в протокол изоляции.
    c("inProtocol", "В протокол", "enum", { values: YES_NO, default: "да", width: 11 }),
    c("purpose", "Назначение", "text", { width: 14 }),
    c("voltage", "Напряжение мегаомметра, В", "number", { ...imp, default: 500 }),
    c("allowed", "Допустимое сопротивление, МОм", "number", { ...imp, default: 0.5 }),
    ...([["ab", "А-В"], ["bc", "В-С"], ["ca", "С-А"], ["an", "A-N (PEN)"], ["bn", "B-N (PEN)"], ["cn", "C-N (PEN)"],
      ["ape", "A-PE"], ["bpe", "B-PE"], ["cpe", "C-PE"], ["npe", "N-PE"]] as const).map(([k, h]) => c(k, h, "text", { width: 9 })),
  ]),
  "ДокументыКабелей": t("ДокументыКабелей", "Изоляция", [
    c("act", "Акт", "ref", { ...imp, isKey: true, ref: "Акты", width: 24 }),
    c("journalCode", "Шифр журнала", "text", { ...imp, width: 22 }),
    c("journalDate", "Дата журнала", "date", imp),
    c("protocolNumber", "№ протокола", "text", imp),
    c("dateFrom", "Измерения с", "date", imp),
    c("dateTo", "Измерения по", "date", imp),
    c("temperature", "Температура, °C", "number", { default: 20 }),
    c("humidity", "Влажность, %", "number", { default: 60 }),
    c("purpose", "Цель испытаний", "text", { default: "приемо-сдаточные", width: 18 }),
    c("normative", "Нормативы", "longtext", { default: "ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34", width: 34 }),
    c("integrity", "Целостность жил", "longtext", { default: "Проведена проверка целостности жил кабельных линий. Замечания отсутствуют.", width: 40 }),
    c("conclusion", "Заключение", "longtext", { default: "Результаты проведенных измерений соответствуют требованиям ПУЭ 7 изд. 1.8.37 п.1, таблица 1.8.34", width: 40 }),
  ]),
  "Комплекты": t("Комплекты", "Комплекты", [
    c("number", "№ реестра", "text", { ...imp, isKey: true, width: 12 }),
    c("section", "Шифр", "ref", { ref: "Шифры", width: 30 }),
    c("volume", "Том", "text", { ...imp, width: 8 }),
    c("part", "Часть", "text", { width: 8 }),
    c("building", "Корпус", "text", { width: 14 }),
    c("works", "Перечень работ", "longtext", { width: 50 }),
    c("city", "Город", "text", { width: 14 }),
    c("year", "Год", "text", { width: 8 }),
    c("cover", "Титул", "enum", { values: YES_NO, default: "да", width: 8 }),
    c("spine", "Корешки", "enum", { values: YES_NO, default: "да", width: 9 }),
    c("parts", "Частей в томе", "int", { default: 1, width: 9 }),
  ]),
  "АктыКомплектов": t("АктыКомплектов", "Комплекты", [
    c("kit", "Комплект", "ref", { ...imp, ref: "Комплекты", width: 12 }),
    c("act", "Акт", "ref", { ...imp, ref: "Акты", width: 30 }),
  ]),
  "РеестрИД": t("РеестрИД", "Реестр ИД", [
    c("kit", "Комплект", "ref", { ...imp, ref: "Комплекты", width: 10 }),
    c("kind", "Вид", "enum", { ...imp, values: REGISTRY_KINDS, width: 16 }),
    c("act", "Акт", "ref", { ref: "Акты", width: 26 }),
    c("number", "Номер документа", "text", { width: 26 }),
    c("name", "Наименование", "longtext", { ...imp, width: 60 }),
    c("date", "Дата / период", "text", { width: 22 }),
    c("copies", "Экз.", "int", { default: 1, width: 6 }),
    c("code", "Шифр чертежа", "text", { width: 26 }),
    c("file", "Скан", "file", { width: 22 }),
    c("sheets", "Листов", "int", { width: 8 }),
  ]),
  // Общий журнал работ (приказ Минстроя № 1026/пр): раздел 3 — строка на дату, раздел 5 — исполнительная документация.
  "ОЖР3": t("ОЖР3", "ОЖР Раздел 3", [
    c("date", "Дата", "date", { ...imp, width: 12 }),
    c("conditions", "Условия производства работ", "longtext", { width: 26 }),
    c("works", "Наименование выполненных работ", "longtext", { ...imp, width: 70 }),
    c("signer", "Представитель", "longtext", { width: 30 }),
    c("acts", "Акты", "refs", { service: true, ref: "Акты", width: 26 }),
  ]),
  "ОЖР5": t("ОЖР5", "ОЖР Раздел 5", [
    c("name", "Наименование исполнительной документации", "longtext", { ...imp, width: 70 }),
    c("signed", "Дата подписания и подписавшие", "longtext", { ...imp, width: 50 }),
    c("act", "Акт", "ref", { service: true, ref: "Акты", width: 26 }),
  ]),
  // План 13: протоколы испытаний и акты приёмки — шапка документа и строки по видам документов.
  "Протоколы": t("Протоколы", "Протоколы и акты", [
    c("doc", "Документ", "enum", { ...imp, values: PROTO_KINDS.map((k) => PROTO_DEFS[k].code), width: 10 }),
    c("number", "№ документа", "text", { ...imp, isKey: true, width: 16 }),
    c("act", "Акт", "ref", { ref: "Акты", width: 24 }),
    c("kit", "Комплект", "ref", { ref: "Комплекты", width: 10 }),
    c("dateFrom", "Дата / начало", "date", imp),
    c("dateTo", "Окончание", "date"),
    c("subject", "Предмет (что проверено)", "longtext", { width: 40 }),
    c("temperature", "Температура, °C", "number", { default: 20 }),
    c("humidity", "Влажность, %", "number", { default: 60 }),
    c("pressure", "Давление, мм рт. ст.", "number", { default: 750 }),
    c("purpose", "Цель", "text", { default: "приемо-сдаточные", width: 18 }),
    c("normative", "Нормативы", "longtext", { width: 34 }),
    c("conclusion", "Заключение", "longtext", { width: 40 }),
  ]),
  "ПереченьОборудования": t("ПереченьОборудования", "Протоколы и акты", [
    protoRef(), c("name", "Наименование оборудования, системы", "text", { ...imp, width: 50 }), c("type", "Тип, марка", "text", { width: 24 }),
    c("unit", "Ед. изм.", "text"), c("qty", "Кол-во", "number"), c("note", "Примечание (результат)", "text", { width: 30 }),
  ]),
  "ИспытанияКЛ": t("ИспытанияКЛ", "Замеры электрики", [
    protoRef(), c("line", "Линия", "text", { ...imp, width: 20 }), c("mark", "Марка кабеля", "text", { width: 26 }), c("length", "Длина, м", "number"),
    c("riBefore", "R изоляции до, МОм", "text"), c("voltage", "Испытательное напряжение, кВ", "number", imp),
    c("duration", "Время, мин", "number", { default: 10 }), c("leakage", "Ток утечки, мА", "text"), c("riAfter", "R изоляции после, МОм", "text"),
    c("result", "Результат", "text", { ...imp, width: 16 }),
  ]),
  "ЗамерыАвтоматов": t("ЗамерыАвтоматов", "Замеры электрики", [
    protoRef(), c("board", "Щит", "text", { ...imp, width: 14 }), c("line", "Обозначение по проекту", "text", { ...imp, width: 16 }),
    c("type", "Тип аппарата", "text", { ...imp, width: 20 }), c("rated", "Iн, А", "number", imp), c("testCurrent", "Ток проверки, А", "number"),
    c("tripNorm", "Время срабатывания по ТУ, с", "text"), c("tripFact", "Время срабатывания факт., с", "number", imp), resultCol(),
  ]),
  "ЗамерыУЗО": t("ЗамерыУЗО", "Замеры электрики", [
    protoRef(), c("board", "Щит", "text", { ...imp, width: 14 }), c("line", "Обозначение по проекту", "text", { ...imp, width: 16 }),
    c("type", "Тип УЗО (АВДТ)", "text", { ...imp, width: 20 }), c("rated", "Iн, А", "number"), c("diffRated", "IΔн, мА", "number", imp),
    c("diffFact", "Ток срабатывания факт., мА", "number", imp), c("timeFact", "Время отключения факт., мс", "number"),
    c("timeNorm", "Время отключения норм., мс", "number", { default: 300 }), resultCol(),
  ]),
  "ЗамерыФазаНуль": t("ЗамерыФазаНуль", "Замеры электрики", [
    protoRef(), c("board", "Щит", "text", { ...imp, width: 14 }), c("line", "Обозначение по проекту", "text", { ...imp, width: 16 }),
    c("device", "Аппарат защиты", "text", { ...imp, width: 20 }), c("rated", "Iн, А", "number", imp),
    c("curve", "Характеристика", "enum", { values: ["B", "C", "D", "—"] }), c("zloop", "Zп, Ом", "number", imp),
    c("ikz", "Iкз, А", "number"), c("itrip", "Ток срабатывания, А", "number"), resultCol(),
  ]),
  "ЗамерыМеталлосвязи": t("ЗамерыМеталлосвязи", "Замеры электрики", [
    protoRef(), c("element", "Проверяемый элемент", "text", { ...imp, width: 34 }), c("place", "Место / к чему присоединён", "text", { width: 30 }),
    c("resistance", "Сопротивление, Ом", "number", imp), c("allowed", "Допустимое, Ом", "number", { default: 0.05 }), resultCol(),
  ]),
  "ЗамерыЗаземления": t("ЗамерыЗаземления", "Замеры электрики", [
    protoRef(), c("device", "Заземляющее устройство", "text", { ...imp, width: 30 }), c("place", "Место измерения", "text", { width: 24 }),
    c("measured", "Сопротивление измеренное, Ом", "number", imp), c("season", "Сезонный коэффициент", "number", { default: 1 }),
    c("allowed", "Допустимое, Ом", "number", { default: 4 }), resultCol(),
  ]),
  "ОсмотрБарабанов": t("ОсмотрБарабанов", "Барабаны и трубы", [
    protoRef(), c("drum", "№ барабана", "text", { ...imp, width: 12 }), c("mark", "Марка кабеля", "text", { ...imp, width: 26 }),
    c("length", "Длина, м", "number"), c("maker", "Завод-изготовитель", "text", { width: 20 }), c("made", "Дата изготовления", "text"),
    c("drumState", "Состояние барабана", "text", { default: "без повреждений", width: 18 }),
    c("cableState", "Наружный осмотр кабеля", "text", { default: "повреждений нет", width: 18 }),
    c("ends", "Концы кабеля", "text", { default: "загерметизированы", width: 18 }),
    c("result", "Заключение по барабану", "text", { ...imp, width: 18 }),
  ]),
  "ПрогревБарабанов": t("ПрогревБарабанов", "Барабаны и трубы", [
    protoRef(), c("drum", "№ барабана", "text", { ...imp, width: 12 }), c("mark", "Марка кабеля", "text", { ...imp, width: 26 }),
    c("length", "Длина, м", "number"), c("airTemp", "Температура воздуха, °C", "number", imp),
    c("method", "Способ прогрева", "text", { default: "в обогреваемом помещении", width: 22 }),
    c("start", "Начало прогрева", "text", { ...imp, width: 16 }), c("end", "Окончание прогрева", "text", { ...imp, width: 16 }),
    c("cableTemp", "Температура кабеля после прогрева, °C", "number", imp), c("layEnd", "Прокладка окончена", "text", { width: 16 }),
    c("note", "Примечание", "text", { width: 20 }),
  ]),
  "ТрубныеПроводки": t("ТрубныеПроводки", "Барабаны и трубы", [
    protoRef(), c("line", "Обозначение проводки", "text", { ...imp, width: 16 }), c("medium", "Среда", "text"),
    c("material", "Материал, диаметр", "text", { width: 18 }), c("workP", "Рабочее давление, МПа", "number"),
    c("testP", "Давление на прочность, МПа", "number", imp), c("holdStr", "Выдержка на прочность, мин", "number", { default: 5 }),
    c("densP", "Давление на плотность, МПа", "number"), c("holdDens", "Выдержка на плотность, мин", "number"),
    c("drop", "Падение давления, %", "number"), c("result", "Результат", "text", { ...imp, width: 16 }),
  ]),
  "ЗамерыВолокон": t("ЗамерыВолокон", "Замеры СКС и ВОЛС", [
    protoRef(), c("cable", "Кабель / № барабана", "text", { ...imp, width: 18 }), c("mark", "Марка кабеля", "text", { width: 24 }),
    c("length", "Строительная длина, м", "number"), c("fiber", "№ волокна", "text", imp),
    c("wave", "Длина волны, нм", "number", { default: 1550 }), c("att", "Затухание, дБ/км", "number", imp), c("norm", "Норма, дБ/км", "number"), resultCol(),
  ]),
  "ЗамерыСКС": t("ЗамерыСКС", "Замеры СКС и ВОЛС", [
    protoRef(), c("link", "Линия (порт)", "text", { ...imp, width: 14 }), c("panel", "Шкаф, панель, порт", "text", { width: 18 }),
    c("outlet", "Розетка", "text", { width: 14 }), c("cat", "Категория", "text", { default: "5e" }), c("length", "Длина, м", "number", imp),
    c("wiremap", "Схема разводки", "text", imp), c("next", "Запас NEXT, дБ", "number"), c("il", "Запас затухания, дБ", "number"),
    c("rl", "Запас возвратных потерь, дБ", "number"), resultCol(),
  ]),
};

/** Лист книги: таблицы; side — таблицы рядом (слева направо), а не одна под другой; panelOnly — лист ведётся из панели
 *  (карточка акта) и при «Только нужных листах» скрыт. */
export interface SheetDef { name: SheetName; tables: TableName[]; side?: true; panelOnly?: true }
export const SHEETS: readonly SheetDef[] = [
  { name: "Реквизиты", tables: ["Объект", "Организации", "Шифры"] },
  { name: "Представители", tables: ["Представители"] },
  // План 31: материалы, позиции спецификации и документы качества — одна таблица.
  { name: "Материалы", tables: ["Материалы"] },
  { name: "База актов", tables: ["Акты"] },
  { name: "Исполнительные схемы", tables: ["Схемы"] },
  // Материалы акта выбираются в карточке акта в панели; лист — служебный.
  { name: "Материалы в актах", tables: ["МатериалыАктов"], panelOnly: true },
  { name: "ВОР", tables: ["ВОР"] },
  { name: "Кабельный журнал", tables: ["КабельныйЖурнал"] },
  { name: "Изоляция", tables: ["Электролаборатория", "СредстваИзмерений", "ИзмеренияМарок", "ДокументыКабелей"] },
  { name: "Комплекты", tables: ["Комплекты", "АктыКомплектов"] },
  { name: "Реестр ИД", tables: ["РеестрИД"] },
  { name: "ОЖР Раздел 3", tables: ["ОЖР3"] },
  { name: "ОЖР Раздел 5", tables: ["ОЖР5"] },
  { name: "Протоколы и акты", tables: ["Протоколы", "ПереченьОборудования"] },
  { name: "Замеры электрики", tables: ["ИспытанияКЛ", "ЗамерыАвтоматов", "ЗамерыУЗО", "ЗамерыФазаНуль", "ЗамерыМеталлосвязи", "ЗамерыЗаземления"] },
  { name: "Барабаны и трубы", tables: ["ОсмотрБарабанов", "ПрогревБарабанов", "ТрубныеПроводки"] },
  { name: "Замеры СКС и ВОЛС", tables: ["ЗамерыВолокон", "ЗамерыСКС"] },
];

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

// Подсказки и примеры — в help.ts, чтобы описание столбцов оставалось читаемым.
for (const name of TABLE_NAMES) {
  for (const col of TABLES[name].columns) {
    const h = HELP[name]?.[col.key];
    if (h) { col.hint = h[0]; col.example = h[1]; }
  }
}

export const keyColumn = (t: TableName): ColumnDef | undefined => TABLES[t].columns.find((c) => c.isKey);

export function column(t: TableName, key: string): ColumnDef {
  const col = TABLES[t].columns.find((c) => c.key === key);
  if (!col) throw new Error(`Нет столбца ${key} в таблице ${t}`);
  return col;
}

export const columnByHeader = (t: TableName, header: string): ColumnDef | undefined =>
  TABLES[t].columns.find((c) => c.header === header);

/** Лист таблицы по SHEETS. */
export const sheetOfTable = (t: TableName): SheetDef => SHEETS.find((s) => s.tables.includes(t))!;
