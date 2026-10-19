// Описание книги объекта: листы, «умные таблицы», столбцы. Единственный источник для разметки,
// карточек, проверок и сборки пакета акта. Заголовки — буква в букву как в спецификации §3.
import { HELP, OBJECT_HELP } from "./help.ts";
import type { CellValue } from "./values.ts";
import { ROLE_CODES, QUALITY_DOC_TYPES, QUALITY_DOC_LABELS, type RoleCode, type QualityDocType } from "../roles.ts";

export const SCHEMA_VERSION = 1;

export type ColType = "text" | "longtext" | "date" | "number" | "int" | "enum" | "ref" | "refs" | "file" | "formula";

export type TableName =
  | "Объект" | "Организации" | "Шифры" | "Представители" | "Материалы" | "ДокументыКачества"
  | "Акты" | "Схемы" | "МатериалыАктов" | "ВОР" | "КабельныйЖурнал"
  | "Электролаборатория" | "СредстваИзмерений" | "ИзмеренияМарок" | "ДокументыКабелей";

export type SheetName =
  | "Реквизиты" | "Представители" | "Материалы" | "Документы качества" | "База актов"
  | "Исполнительные схемы" | "Материалы в актах" | "ВОР" | "Кабельный журнал" | "Изоляция";

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
  /** Подсказка: что вносить и в каком формате (≤ 255 символов — ограничение Excel). */
  hint: string;
  /** Значение строки-примера в новой книге. */
  example?: CellValue;
}

export interface TableDef {
  name: TableName; sheet: SheetName; columns: ColumnDef[];
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
] as const satisfies readonly { key: string; label: string; type: "text" | "date" | "ref" }[];
export type ObjectFieldKey = (typeof OBJECT_FIELDS_RAW)[number]["key"];

/** Поля объекта, без которых не напечатать шапку АОСР (договор и прочее — необязательны). */
export const OBJECT_REQUIRED = new Set<ObjectFieldKey>(["name", "developer", "builder"]);
export const OBJECT_REQUIRED_LABELS: string[] = OBJECT_FIELDS_RAW.filter((f) => OBJECT_REQUIRED.has(f.key)).map((f) => f.label);
export const isObjectFieldRequired = (label: string) => OBJECT_REQUIRED_LABELS.includes(label.trim());

/** Поля таблицы «Объект» с подсказками и значениями примера. */
export const OBJECT_FIELDS = OBJECT_FIELDS_RAW.map((f) => ({ ...f, hint: OBJECT_HELP[f.key][0], example: OBJECT_HELP[f.key][1] }));

const c = (key: string, header: string, type: ColType, extra: Partial<ColumnDef> = {}): ColumnDef =>
  ({ key, header, type, hint: "", ...extra });
const imp = { important: true };

const t = (name: TableName, sheet: SheetName, columns: ColumnDef[], extra: Partial<TableDef> = {}): TableDef =>
  ({ name, sheet, columns, ...extra });

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
  "Материалы": t("Материалы", "Материалы", [
    c("name", "Наименование", "text", { ...imp, isKey: true, width: 60 }),
    c("mark", "Марка", "text", { width: 30 }),
    c("article", "Артикул", "text"),
    c("manufacturer", "Завод-изготовитель", "text", { ...imp, width: 24 }),
    c("unit", "Ед. изм.", "text", imp),
  ]),
  "ДокументыКачества": t("ДокументыКачества", "Документы качества", [
    c("materials", "Материалы", "refs", { ...imp, ref: "Материалы", width: 60 }),
    c("type", "Тип", "enum", { ...imp, values: QUALITY_DOC_TYPES.map((d) => QUALITY_DOC_LABELS[d]), width: 24 }),
    c("number", "Номер", "text", { ...imp, width: 30 }),
    c("issueDate", "Дата", "date", imp),
    c("validUntil", "Действует до", "date"),
    c("sheets", "Листов", "int", imp),
    c("registryName", "Наименование для реестра", "text", { width: 40 }),
    c("file", "Скан", "file", { service: true }),
  ]),
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
  ]),
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
  ]),
  "Электролаборатория": t("Электролаборатория", "Изоляция", [
    c("nameAddress", "Организация и адрес", "longtext", { ...imp, isKey: true, width: 50 }),
    c("certificate", "Свидетельство", "longtext", { width: 60 }),
    c("head", "Руководитель электролаборатории", "text", { ...imp, width: 24 }),
    c("tester", "Испытания провёл", "text", { ...imp, width: 24 }),
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
  ]),
  "ИзмеренияМарок": t("ИзмеренияМарок", "Изоляция", [
    c("mark", "Марка", "text", { ...imp, isKey: true, width: 40 }),
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
};

export const SHEETS: readonly { name: SheetName; tables: TableName[] }[] = [
  { name: "Реквизиты", tables: ["Объект", "Организации", "Шифры"] },
  { name: "Представители", tables: ["Представители"] },
  { name: "Материалы", tables: ["Материалы"] },
  { name: "Документы качества", tables: ["ДокументыКачества"] },
  { name: "База актов", tables: ["Акты"] },
  { name: "Исполнительные схемы", tables: ["Схемы"] },
  { name: "Материалы в актах", tables: ["МатериалыАктов"] },
  { name: "ВОР", tables: ["ВОР"] },
  { name: "Кабельный журнал", tables: ["КабельныйЖурнал"] },
  { name: "Изоляция", tables: ["Электролаборатория", "СредстваИзмерений", "ИзмеренияМарок", "ДокументыКабелей"] },
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
