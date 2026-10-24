// Метки своих форм: дерево полей для экрана «Поля для шаблона». Значения строит сервер (forms/fields.ts)
// теми же функциями, что встроенные формы.
import type { RoleCode } from "../roles.ts";

export const ROLE_GROUPS: Record<RoleCode, string> = {
  developer_control: "Технадзор", builder: "Строительство", builder_control: "Стройконтроль",
  designer: "Проектировщик", performer: "Выполнивший", other: "Иные",
};

const ROLE_FIELDS = ["ФИО", "Должность", "Организация", "Приказ", "НРС", "Подпись", "Строка АОСР"];

export interface FieldGroup { group: string; fields: string[]; list?: string }

/** Группы и поля меток; у списков — `list` (имя повтора `{#…}`), поля элемента — `Группа.Поле`. */
export const FIELD_TREE: FieldGroup[] = [
  { group: "Объект", fields: ["Наименование", "Адрес", "Город", "Договор", "Дата договора", "Застройщик", "Строительство", "Проектировщик", "Шифр РД", "Раздел"] },
  { group: "Акт", fields: ["Номер", "Номер документа", "Номер АОСР", "Номер РИМ", "Номер ВД", "Дата", "Дата прописью", "Работы", "Начало", "Окончание",
    "Начало прописью", "Окончание прописью", "Нормативы", "Разрешается", "Доп. сведения", "Экз.", "Приложения", "Листы", "Ревизия",
    "Выполнивший работы", "П.2", "П.3", "П.4"] },
  ...(Object.values(ROLE_GROUPS).map((g) => ({ group: g, fields: ROLE_FIELDS }))),
  { group: "АВК", fields: ["Номер", "Дата"] },
  { group: "Материал", list: "Материалы", fields: ["№", "Наименование", "Марка", "Артикул", "Завод", "Ед.", "Кол-во", "Документы"] },
  { group: "Схема", list: "Схемы", fields: ["№", "Номер", "Наименование", "Дата", "Вид"] },
  { group: "ВОР", list: "ВОР", fields: ["№", "Участок", "Материал", "Ед.", "Объём"] },
];

export interface FormData { values: Record<string, string>; lists: Record<string, Record<string, string>[]> }

export const label = (group: string, field: string) => `{${group}.${field}}`;
