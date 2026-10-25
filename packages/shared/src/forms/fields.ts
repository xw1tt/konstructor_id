// Метки своих форм: дерево полей для экрана «Поля для шаблона». Значения строит сервер (forms/fields.ts)
// теми же функциями, что встроенные формы.
import type { RoleCode } from "../roles.ts";
import { PROTO_DOC_FIELDS, PROTO_LAB_FIELDS, PROTO_MEMBER_FIELDS, PROTO_INSTRUMENT_FIELDS } from "../protocols/form.ts";

export const ROLE_GROUPS: Record<RoleCode, string> = {
  developer_control: "Технадзор", builder: "Строительство", builder_control: "Стройконтроль",
  designer: "Проектировщик", performer: "Выполнивший", other: "Иные",
};

const ROLE_FIELDS = ["ФИО", "Должность", "Организация", "Приказ", "НРС", "Подпись", "Строка АОСР"];

export interface FieldGroup { group: string; fields: string[]; list?: string }

/** Группы и поля меток; у списков — `list` (имя повтора `{#…}`), поля элемента — `Группа.Поле`. */
export const FIELD_TREE: FieldGroup[] = [
  { group: "Объект", fields: ["Наименование", "Адрес", "Город", "Договор", "Дата договора", "Застройщик", "Строительство", "Проектировщик", "Шифр РД", "Раздел", "Подрядчик"] },
  { group: "Акт", fields: ["Номер", "Номер документа", "Номер АОСР", "Номер РИМ", "Номер ВД", "Номер РП", "Дата", "День", "Месяц", "Год", "Дата прописью", "Работы", "Начало", "Окончание",
    "Начало прописью", "Окончание прописью", "Нормативы", "Разрешается", "Доп. сведения", "Экз.", "Приложения", "Листы", "Ревизия",
    "Выполнивший работы", "П.2", "П.3", "П.4"] },
  ...(Object.values(ROLE_GROUPS).map((g) => ({ group: g, fields: ROLE_FIELDS }))),
  { group: "АВК", fields: ["Номер", "Дата"] },
  { group: "Материал", list: "Материалы", fields: ["№", "Наименование", "Марка", "Артикул", "Завод", "Ед.", "Кол-во", "Документы"] },
  { group: "Схема", list: "Схемы", fields: ["№", "Номер", "Наименование", "Дата", "Вид"] },
  { group: "ВОР", list: "ВОР", fields: ["№", "Участок", "Материал", "Ед.", "Объём"] },
  // План 13: протоколы и акты приёмки (значения — при печати такого документа). Поля «Строки» — заголовки столбцов
  // документа (см. «Образец .docx»).
  { group: "Документ", fields: [...PROTO_DOC_FIELDS] },
  { group: "Лаборатория", fields: [...PROTO_LAB_FIELDS] },
  { group: "Строка", list: "Строки", fields: ["№"] },
  { group: "Член", list: "Комиссия", fields: [...PROTO_MEMBER_FIELDS] },
  { group: "Прибор", list: "Приборы", fields: [...PROTO_INSTRUMENT_FIELDS] },
];

export interface FormData { values: Record<string, string>; lists: Record<string, Record<string, string>[]> }

export const label = (group: string, field: string) => `{${group}.${field}}`;

/** План 20: известные метки «Группа.Поле» (поля строк протокола «Строка.<столбец>» — любые). */
export const KNOWN_FIELDS: ReadonlySet<string> = new Set(FIELD_TREE.flatMap((g) => g.fields.map((f) => `${g.group}.${f}`)));
export const isKnownField = (f: string): boolean => KNOWN_FIELDS.has(f.trim()) || /^Строка\.\S/.test(f.trim());
