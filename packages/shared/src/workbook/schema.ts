// Описание книги объекта: листы, «умные таблицы», столбцы. Единственный источник для разметки,
// карточек, проверок и сборки пакета акта. Заголовки — буква в букву как в спецификации §3.
import { NORM_KINDS, NORM_STATUSES } from "../normativ.ts";
import { ROLE_CODES, QUALITY_DOC_TYPES, QUALITY_DOC_LABELS, type RoleCode, type QualityDocType } from "../roles.ts";

export const SCHEMA_VERSION = 1;

export type ColType = "text" | "longtext" | "date" | "number" | "int" | "enum" | "ref" | "refs" | "file" | "formula";

export type TableName =
  | "Объект" | "Организации" | "Шифры" | "Представители" | "Материалы" | "ДокументыКачества"
  | "Акты" | "Схемы" | "МатериалыАктов" | "ВОР" | "КабельныйЖурнал" | "Нормативы";

export type SheetName =
  | "Реквизиты" | "Представители" | "Материалы" | "Документы качества" | "База актов"
  | "Исполнительные схемы" | "Материалы в актах" | "ВОР" | "Кабельный журнал" | "Нормативы";

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
}

export interface TableDef { name: TableName; sheet: SheetName; columns: ColumnDef[] }

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

export const OBJECT_FIELDS = [
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
export type ObjectFieldKey = (typeof OBJECT_FIELDS)[number]["key"];

const c = (key: string, header: string, type: ColType, extra: Partial<ColumnDef> = {}): ColumnDef =>
  ({ key, header, type, ...extra });
const imp = { important: true };

const t = (name: TableName, sheet: SheetName, columns: ColumnDef[]): TableDef => ({ name, sheet, columns });

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
  ]),
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
  "Нормативы": t("Нормативы", "Нормативы", [
    c("designation", "Обозначение", "text", { ...imp, isKey: true, width: 26 }),
    c("title", "Наименование", "text", { width: 60 }),
    c("kind", "Вид", "enum", { ...imp, values: NORM_KINDS, width: 12 }),
    c("status", "Статус", "enum", { values: NORM_STATUSES, default: "Действует", width: 14 }),
    c("link", "Ссылка на портал", "text", { width: 40 }),
    c("note", "Примечание", "text", { width: 30 }),
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
  { name: "Нормативы", tables: ["Нормативы"] },
];

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export const keyColumn = (t: TableName): ColumnDef | undefined => TABLES[t].columns.find((c) => c.isKey);

export function column(t: TableName, key: string): ColumnDef {
  const col = TABLES[t].columns.find((c) => c.key === key);
  if (!col) throw new Error(`Нет столбца ${key} в таблице ${t}`);
  return col;
}

export const columnByHeader = (t: TableName, header: string): ColumnDef | undefined =>
  TABLES[t].columns.find((c) => c.header === header);
