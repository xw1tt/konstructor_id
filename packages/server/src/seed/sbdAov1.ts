/**
 * Контрольный пример: комплект ИД «Монтаж кабеля», акт №К32.В.СТ.АОВ1.01.00.1.АОСР (ООО «СБД»).
 * Данные взяты из образца пользователя; используются в тестах печати и командой `npm run seed:sbd`.
 */
import { readFileSync } from "node:fs";
import type { Db } from "../db.ts";
import { organizations } from "../repo/organizations.ts";
import { objectInfo } from "../repo/objectInfo.ts";
import { sections } from "../repo/sections.ts";
import { representatives } from "../repo/representatives.ts";
import { materials } from "../repo/materials.ts";
import { qualityDocs } from "../repo/qualityDocs.ts";
import { acts } from "../repo/acts.ts";

interface SeedData {
  materials: { name: string; mark: string; article: string; manufacturer: string; unit: string; vdQty: number }[];
  docs: { type: any; number: string; issueDate: string; validUntil: string | null; sheets: number; materials: number[]; registryName: string }[];
  vor: { group: string; material: number; quantity: number }[];
}

const data = (): SeedData => JSON.parse(readFileSync(new URL("./sbd-aov1.data.json", import.meta.url), "utf8"));

const ORG = (o: Partial<Record<string, string>> & { shortName: string }) => ({
  fullName: o.shortName, ogrn: "", inn: "", address: "", phone: "", sroName: "", sroOgrn: "", sroInn: "", ...o,
});

export function seedSbdAov1(db: Db): { actId: number } {
  const orgs = organizations(db);
  const sbd = orgs.create(ORG({
    shortName: 'ООО "СБД"', ogrn: "1197746498916", inn: "7736323532",
    address: "125284, г. Москва, ул. Ленинградский просп., д. 31А, стр. 1, этаж 27, пом. I, ком. 10",
    phone: "+7 (495) 685-92-30",
    sroName: 'Ассоциация строителей "Саморегулируемая организация "Строительные допуски"', sroOgrn: "1097799011045", sroInn: "7714322214",
  }));
  const marks = orgs.create(ORG({
    shortName: 'ООО "МАРКС ИНЖИНИРИНГ"', ogrn: "1117847040717", inn: "7805543475",
    address: "125124, г. Москва, ул. 3-я Ямского Поля, д. 2, к. 12, этаж 5, помещ. I, ком. 12", phone: "+7 (495) 120-12-26",
    sroName: 'Ассоциация проектировщиков "СтройОбъединение"', sroOgrn: "1097800006237", sroInn: "7811154692",
  }));
  const veles = orgs.create(ORG({
    shortName: 'ООО "Велесстрой"', ogrn: "1087746466950", inn: "7709787790", address: "125047, г. Москва, ул.2-ая Тверская-Ямская, д. 10",
  }));
  const tech = orgs.create(ORG({
    shortName: 'ООО "ТехноИнжиниринг"', ogrn: "1127746684790", inn: "7706780490", address: "125047, г. Москва, ул. Щербаковская д. 3, стр. 1, офис 710.",
  }));

  objectInfo(db).save({
    name: '"Реконструируемый деловой комплекс в составе корп. "А", "Б", "В", "Г", "Е" с единой стилобатной (подземной) частью и устройством надземной объединительной аркады" по адресу: г. Москва, пересечение Кутузовского проспекта и улицы Кульнева (ЗАО г. Москвы). Корпус "В"',
    address: "г. Москва, пересечение Кутузовского проспекта и улицы Кульнева", contractNumber: "КУТ03-Р-СМР-36-26",
    contractDate: null, city: "Москва",
    roles: { developer: sbd.id, builder: sbd.id, designer: marks.id, performer: veles.id },
  });
  const section = sections(db).create({
    code: "КУТ03-Р-ПИР-2-26-100-АОВ1.01.00",
    name: "Комплекс работ по монтажу системы автоматизации и диспетчеризации отопления и теплоснабжения. Подземная часть.",
    designerOrgId: marks.id,
  });

  const R = representatives(db);
  const rep = (role: any, position: string, fullName: string, orgId: number, authorityDoc: string, nrsNumber = "", sortOrder = 1) =>
    R.create({ role, position, fullName, orgId, authorityDoc, nrsNumber, nrsDate: null, validFrom: null, validTo: null, sortOrder, actText: "" });
  const valer = rep("developer_control", "Ведущий инженер по автоматике и слаботочным системам", "Валерьянов А.А.", sbd.id, "приказ № П-1-ОД-267 от 18.06.2025 г.", "С-77-221429");
  rep("builder", "Заместитель руководителя проекта", "Аксенов А.М.", sbd.id, "приказ №П-КУТ00/3 от 20.04.2026 г.");
  rep("builder_control", "Ведущий инженер строительного контроля", "Филиппов М.И.", sbd.id, "приказ № П-КУТ03/16 от 28.07.2026 г.", "С-77-283172");
  rep("designer", "Главный инженер проекта отдела авторского надзора", "Смирнов М.А.", marks.id, "приказ №116 от 03.07.2026 г.");
  rep("performer", "Начальник отдела ККС", "Королев Д.М.", veles.id, "приказ № П-265 от 13.03.2026 г.", "", 1);
  const vostrov = rep("performer", "Начальник участка", "Востров В.П.", tech.id, "приказ № 004 от 20.04.2026 г.", "", 2);

  const d = data();
  const M = materials(db);
  const matIds = d.materials.map(({ vdQty: _q, ...m }) => M.create(m).id);
  const Q = qualityDocs(db);
  for (const doc of d.docs) {
    Q.create({ type: doc.type, number: doc.number, issueDate: doc.issueDate, validUntil: doc.validUntil, sheets: doc.sheets,
      fileId: null, materialIds: doc.materials.map((i) => matIds[i - 1]), registryName: doc.registryName });
  }

  const A = acts(db);
  const act = A.create({
    baseNumber: "К32.В.СТ.АОВ1.01.00.1", date: "2026-07-28", sectionId: section.id,
    works: "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К; на этаже П4 в осях 36-22/У-К, 20-13/У-М; на этаже П3 в осях 36-21/У-К, 20-13/Т-Л; на этаже П2 в осях 31-14/У-Л.",
    sheets: "0210-0230", revision: "рев.1", dateStart: "2026-06-05", dateEnd: "2026-06-06",
    normative: 'Шифр рабочей документации: КУТ03-Р-ПИР-2-26-100-АОВ1.01.00 листы 0210-0230, рев.1 , СП 76.13330.2016 "Электротехнические устройства", ПУЭ "Правила устройства электроустановок" (6-е и 7-е издания), СП 77.13330.2016 "Системы автоматизации", СП 134.13330.2012 "Системы электросвязи зданий и сооружений. Основные положения проектирования".',
    nextWorks: "Расключение и заделка проходок кабельных линий на этаже П5 в осях 13-27/У-К; на этаже П4 в осях 22-36/У-К, 13-20/С-Л; на этаже П3 в осях 20-13/Т-Л, 36-21/У-К; на этаже П2 в осях 31-14/У-Л.",
    extraInfo: "нет", copies: 4, attachments: "Согласно п.3, п.4.", performerOrgId: veles.id,
    vorTitle: section.name, vorCustomerRepId: valer.id, vorContractorRepId: vostrov.id,
  });
  A.setMaterials(act.id, matIds.map((materialId, i) => ({ materialId, position: "б/н", quantity: null, sortOrder: i })));
  A.setVor(act.id, d.vor.map((v, i) => ({ group: v.group, materialId: matIds[v.material - 1], quantity: v.quantity, sortOrder: i })));
  const schemes = [
    "Монтаж кабельных линий на этаже П5 в осях 27-13/У-К",
    "Монтаж кабельных линий на этаже П4 в осях 36-22/У-К",
    "Монтаж кабельных линий на этаже П4 в осях 20-13/У-М",
    "Монтаж кабельных линий на этаже П3 в осях 36-21/У-К",
    "Монтаж кабельных линий на этаже П3 в осях 20-13/Т-Л",
    "Монтаж кабельных линий на этаже П2 в осях 31-14/У-Л",
  ];
  A.setDocuments(act.id, schemes.map((name, i) => ({
    kind: "scheme" as const, number: `К32.В.СТ.АОВ1.01.00.${i + 1}`, name, date: "2026-06-06", fileId: null, sortOrder: i,
  })));
  return { actId: act.id };
}
