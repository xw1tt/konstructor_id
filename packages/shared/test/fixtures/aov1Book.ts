// Книга объекта с данными контрольного акта К32.В.СТ.АОВ1.01.00.1 — те же данные, что seedSbdAov1 кладёт в базу.
import { readFileSync } from "node:fs";
import { MemoryWorkbook } from "@idk/shared/workbook/memory";
import { isoToExcelSerial, type CellValue } from "@idk/shared/workbook/values";
import { ROLE_BOOK_LABELS } from "@idk/shared/workbook/schema";
import { QUALITY_DOC_LABELS } from "@idk/shared/roles";

export const cablesData = JSON.parse(readFileSync(new URL("./aov1-cables.json", import.meta.url), "utf8")) as {
  cables: { designation: string; from: string; to: string; direction: string; cableMark: string; cableLength: number | null; pipeMark: string; pipeLength: number | null; note: string; group: string }[];
  lab: { nameAddress: string; certificate: string; head: string; tester: string };
  instruments: { name: string; type: string; range: string; accuracy: string; serial: string; certificate: string; checkedOn: string; nextCheck: string; authority: string }[];
  mark: { mark: string; purpose: string; voltage: number; allowed: number; values: string[] };
  doc: { journalCode: string; journalDate: string; protocolNumber: string; dateFrom: string; dateTo: string; temperature: number; humidity: number };
};
const MEASURE_HEADERS = ["А-В", "В-С", "С-А", "A-N (PEN)", "B-N (PEN)", "C-N (PEN)", "A-PE", "B-PE", "C-PE", "N-PE"];

const data = JSON.parse(readFileSync(new URL("../../../server/src/seed/sbd-aov1.data.json", import.meta.url), "utf8")) as {
  materials: { name: string; mark: string; article: string; manufacturer: string; unit: string }[];
  docs: { type: keyof typeof QUALITY_DOC_LABELS; number: string; issueDate: string; validUntil: string | null; sheets: number; materials: number[]; registryName: string }[];
  vor: { group: string; material: number; quantity: number }[];
};

export const AOV1 = "К32.В.СТ.АОВ1.01.00.1";
const d = (iso: string | null) => (iso ? isoToExcelSerial(iso) : null);
const SBD = 'ООО "СБД"', MARKS = 'ООО "МАРКС ИНЖИНИРИНГ"', VELES = 'ООО "Велесстрой"', TECH = 'ООО "ТехноИнжиниринг"';
const SECTION = "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00";
const SECTION_NAME = "Комплекс работ по монтажу системы автоматизации и диспетчеризации отопления и теплоснабжения. Подземная часть.";

const org = (shortName: string, ogrn: string, inn: string, address: string, phone = "", sroName = "", sroOgrn = "", sroInn = "") => ({
  "Краткое наименование": shortName, "Полное наименование": shortName, "ОГРН": ogrn, "ИНН": inn, "Адрес": address,
  "Телефон": phone, "СРО: наименование": sroName, "СРО: ОГРН": sroOgrn, "СРО: ИНН": sroInn,
});
const rep = (role: keyof typeof ROLE_BOOK_LABELS, position: string, fio: string, orgName: string, doc: string, nrs = "", order = 1) => ({
  "Роль": ROLE_BOOK_LABELS[role], "Должность": position, "ФИО": fio, "Организация": orgName,
  "Документ о полномочиях": doc, "НРС №": nrs, "Порядок": order,
});

export function aov1Records(): Partial<Record<string, Record<string, CellValue>[]>> {
  const names = data.materials.map((m) => m.name);
  return {
    "Объект": [
      ["Наименование объекта", '"Реконструируемый деловой комплекс в составе корп. "А", "Б", "В", "Г", "Е" с единой стилобатной (подземной) частью и устройством надземной объединительной аркады" по адресу: г. Москва, пересечение Кутузовского проспекта и улицы Кульнева (ЗАО г. Москвы). Корпус "В"'],
      ["Адрес", "г. Москва, пересечение Кутузовского проспекта и улицы Кульнева"],
      ["Город", "Москва"],
      ["Договор №", "КУТ03-Р-СМР-36-26"],
      ["Дата договора", null],
      ["Застройщик (технический заказчик)", SBD],
      ["Лицо, осуществляющее строительство", SBD],
      ["Лицо, осуществляющее подготовку проектной документации", MARKS],
      ["Лицо, выполнившее работы (по умолчанию)", VELES],
    ].map(([f, v]) => ({ "Поле": f, "Значение": v })),
    "Организации": [
      org(SBD, "1197746498916", "7736323532", "125284, г. Москва, ул. Ленинградский просп., д. 31А, стр. 1, этаж 27, пом. I, ком. 10",
        "+7 (495) 685-92-30", 'Ассоциация строителей "Саморегулируемая организация "Строительные допуски"', "1097799011045", "7714322214"),
      org(MARKS, "1117847040717", "7805543475", "125124, г. Москва, ул. 3-я Ямского Поля, д. 2, к. 12, этаж 5, помещ. I, ком. 12",
        "+7 (495) 120-12-26", 'Ассоциация проектировщиков "СтройОбъединение"', "1097800006237", "7811154692"),
      org(VELES, "1087746466950", "7709787790", "125047, г. Москва, ул.2-ая Тверская-Ямская, д. 10"),
      org(TECH, "1127746684790", "7706780490", "125047, г. Москва, ул. Щербаковская д. 3, стр. 1, офис 710."),
    ],
    "Шифры": [{ "Шифр": SECTION, "Наименование раздела": SECTION_NAME, "Проектировщик": MARKS }],
    "Представители": [
      rep("developer_control", "Ведущий инженер по автоматике и слаботочным системам", "Валерьянов А.А.", SBD, "приказ № П-1-ОД-267 от 18.06.2025 г.", "С-77-221429"),
      rep("builder", "Заместитель руководителя проекта", "Аксенов А.М.", SBD, "приказ №П-КУТ00/3 от 20.04.2026 г."),
      rep("builder_control", "Ведущий инженер строительного контроля", "Филиппов М.И.", SBD, "приказ № П-КУТ03/16 от 28.07.2026 г.", "С-77-283172"),
      rep("designer", "Главный инженер проекта отдела авторского надзора", "Смирнов М.А.", MARKS, "приказ №116 от 03.07.2026 г."),
      rep("performer", "Начальник отдела ККС", "Королев Д.М.", VELES, "приказ № П-265 от 13.03.2026 г.", "", 1),
      rep("performer", "Начальник участка", "Востров В.П.", TECH, "приказ № 004 от 20.04.2026 г.", "", 2),
    ],
    "Материалы": data.materials.map((m) => ({
      "Наименование": m.name, "Марка": m.mark, "Артикул": m.article, "Завод-изготовитель": m.manufacturer, "Ед. изм.": m.unit })),
    "ДокументыКачества": data.docs.map((q) => ({
      "Материалы": q.materials.map((i) => names[i - 1]).join("; "), "Тип": QUALITY_DOC_LABELS[q.type], "Номер": q.number,
      "Дата": d(q.issueDate), "Действует до": d(q.validUntil), "Листов": q.sheets, "Наименование для реестра": q.registryName })),
    "Акты": [{
      "Номер акта": AOV1, "Дата акта": d("2026-07-28"), "Шифр": SECTION,
      "Работы (п.1)": "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К; на этаже П4 в осях 36-22/У-К, 20-13/У-М; на этаже П3 в осях 36-21/У-К, 20-13/Т-Л; на этаже П2 в осях 31-14/У-Л.",
      "Листы": "0210-0230", "Ревизия": "рев.1", "Начало работ": d("2026-06-05"), "Окончание работ": d("2026-06-06"),
      "Нормативы (п.6)": 'Шифр рабочей документации: КУТ03-Р-ПИР-2-26-100-АОВ1.01.00 листы 0210-0230, рев.1 , СП 76.13330.2016 "Электротехнические устройства", ПУЭ "Правила устройства электроустановок" (6-е и 7-е издания), СП 77.13330.2016 "Системы автоматизации", СП 134.13330.2012 "Системы электросвязи зданий и сооружений. Основные положения проектирования".',
      "Разрешается (п.7)": "Расключение и заделка проходок кабельных линий на этаже П5 в осях 13-27/У-К; на этаже П4 в осях 22-36/У-К, 13-20/С-Л; на этаже П3 в осях 20-13/Т-Л, 36-21/У-К; на этаже П2 в осях 31-14/У-Л.",
      "Доп. сведения": "нет", "Экз.": 4, "Приложения": "Согласно п.3, п.4.", "Выполнивший работы": VELES,
      "Заголовок ВОР": SECTION_NAME, "ВОР: от заказчика": "Валерьянов А.А.", "ВОР: от монтажников": "Востров В.П.",
    }],
    "Схемы": [
      "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К", "Монтаж кабельных линий на этаже П4 в осях 36-22/У-К",
      "Монтаж кабельных линий на этаже П4 в осях 20-13/У-М", "Монтаж кабельных линий на этаже П3 в осях 36-21/У-К",
      "Монтаж кабельных линий на этаже П3 в осях 20-13/Т-Л", "Монтаж кабельных линий на этаже П2 в осях 31-14/У-Л",
    ].map((name, i) => ({ "Акт": AOV1, "Вид": "Схема", "Номер": `К32.В.СТ.АОВ1.01.00.${i + 1}`, "Наименование": name, "Дата": d("2026-06-06") })),
    "МатериалыАктов": names.map((n) => ({ "Акт": AOV1, "Материал": n, "№ поз. по УСР": "б/н", "Кол-во": null })),
    "ВОР": data.vor.map((v) => ({ "Акт": AOV1, "Этаж / участок": v.group, "Материал": names[v.material - 1], "Объём": v.quantity })),
    "КабельныйЖурнал": cablesData.cables.map((c) => ({
      "Акт": AOV1, "Группа": c.group, "Обозначение кабеля, жгута, трубы": c.designation, "Откуда": c.from, "Куда": c.to,
      "Направление по планам расположения": c.direction, "Кабель: марка, число жил, сечение": c.cableMark, "Кабель: длина, м": c.cableLength,
      "Труба: марка, диаметр": c.pipeMark, "Труба: длина, м": c.pipeLength, "Примечание": c.note,
    })),
    "Электролаборатория": [{
      "Организация и адрес": cablesData.lab.nameAddress, "Свидетельство": cablesData.lab.certificate,
      "Руководитель электролаборатории": cablesData.lab.head, "Испытания провёл": cablesData.lab.tester,
    }],
    "СредстваИзмерений": cablesData.instruments.map((i) => ({
      "Наименование СИ": i.name, "Тип": i.type, "Диапазон": i.range, "Точность": i.accuracy, "Заводской №": i.serial,
      "№ свидетельства о поверке": i.certificate, "Дата поверки": d(i.checkedOn), "Дата очередной поверки": d(i.nextCheck), "Орган поверки": i.authority,
    })),
    "ИзмеренияМарок": [{
      "Марка": cablesData.mark.mark, "Назначение": cablesData.mark.purpose, "Напряжение мегаомметра, В": cablesData.mark.voltage,
      "Допустимое сопротивление, МОм": cablesData.mark.allowed,
      ...Object.fromEntries(MEASURE_HEADERS.map((h, i) => [h, cablesData.mark.values[i]])),
    }],
    "ДокументыКабелей": [{
      "Акт": AOV1, "Шифр журнала": cablesData.doc.journalCode, "Дата журнала": d(cablesData.doc.journalDate),
      "№ протокола": cablesData.doc.protocolNumber, "Измерения с": d(cablesData.doc.dateFrom), "Измерения по": d(cablesData.doc.dateTo),
      "Температура, °C": cablesData.doc.temperature, "Влажность, %": cablesData.doc.humidity,
    }],
  };
}

export const aov1Book = () => new MemoryWorkbook(aov1Records() as any);
