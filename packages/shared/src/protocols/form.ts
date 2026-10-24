// План 13: метки своих форм протоколов и актов — значения из ActBundle.proto (спецификация §7). Те же имена — в образце .docx.
import { formatDateShort } from "../acts/format.ts";
import { PROTO_DEFS } from "./defs.ts";
import type { ProtoData } from "./types.ts";

/** Поля группы «Документ», «Лаборатория» и списков «Строки» (поля — заголовки столбцов), «Комиссия», «Приборы». */
export const PROTO_DOC_FIELDS = ["Код", "Наименование", "Номер", "Дата", "Окончание", "Период", "Предмет", "Температура", "Влажность",
  "Давление", "Цель", "Нормативы", "Заключение", "Город"] as const;
export const PROTO_LAB_FIELDS = ["Наименование", "Свидетельство", "Руководитель", "Испытатель"] as const;
export const PROTO_MEMBER_FIELDS = ["Роль", "Должность", "Организация", "ФИО"] as const;
export const PROTO_INSTRUMENT_FIELDS = ["Наименование", "Тип", "Диапазон", "Точность", "Заводской №", "Свидетельство", "Поверка",
  "Очередная поверка", "Орган поверки"] as const;

const period = (p: ProtoData) => [formatDateShort(p.dateFrom), formatDateShort(p.dateTo)].filter(Boolean).join(" - ");

export function protoFormData(p: ProtoData): { values: Record<string, string>; lists: Record<string, Record<string, string>[]> } {
  const cols = PROTO_DEFS[p.kind].columns;
  const lab = p.lab ?? { nameAddress: "", certificate: "", head: "", tester: "" };
  const doc: Record<(typeof PROTO_DOC_FIELDS)[number], string> = {
    "Код": p.code, "Наименование": p.name, "Номер": p.number, "Дата": formatDateShort(p.dateFrom), "Окончание": formatDateShort(p.dateTo),
    "Период": period(p), "Предмет": p.subject, "Температура": p.temperature, "Влажность": p.humidity, "Давление": p.pressure,
    "Цель": p.purpose, "Нормативы": p.normative, "Заключение": p.conclusion, "Город": p.city,
  };
  const labV: Record<(typeof PROTO_LAB_FIELDS)[number], string> = {
    "Наименование": lab.nameAddress, "Свидетельство": lab.certificate, "Руководитель": lab.head, "Испытатель": lab.tester,
  };
  return {
    values: {
      ...Object.fromEntries(Object.entries(doc).map(([k, v]) => [`Документ.${k}`, v])),
      ...Object.fromEntries(Object.entries(labV).map(([k, v]) => [`Лаборатория.${k}`, v])),
    },
    lists: {
      "Строки": p.rows.map((r, i) => ({ "Строка.№": String(i + 1), ...Object.fromEntries(cols.map((c) => [`Строка.${c.header}`, r[c.key] ?? ""])) })),
      "Комиссия": p.commission.map((m) => ({ "Член.Роль": m.role, "Член.Должность": m.position, "Член.Организация": m.org, "Член.ФИО": m.name })),
      "Приборы": p.instruments.map((i) => ({
        "Прибор.Наименование": i.name, "Прибор.Тип": i.type, "Прибор.Диапазон": i.range, "Прибор.Точность": i.accuracy,
        "Прибор.Заводской №": i.serial, "Прибор.Свидетельство": i.certificate, "Прибор.Поверка": formatDateShort(i.checkedOn),
        "Прибор.Очередная поверка": formatDateShort(i.nextCheck), "Прибор.Орган поверки": i.authority,
      })),
    },
  };
}

/** Метки протокола для пакета без протокола: все поля пустые, списки пустые (дерево меток всегда полное). */
export function emptyProtoFormData(): { values: Record<string, string>; lists: Record<string, Record<string, string>[]> } {
  return {
    values: {
      ...Object.fromEntries(PROTO_DOC_FIELDS.map((k) => [`Документ.${k}`, ""])),
      ...Object.fromEntries(PROTO_LAB_FIELDS.map((k) => [`Лаборатория.${k}`, ""])),
    },
    lists: { "Строки": [], "Комиссия": [], "Приборы": [] },
  };
}
