// Данные мастера первого акта, заполненные целиком (план 17).
import { emptyWizard, type WizardData } from "@idk/shared/wizard";

const o = (n: string) => ({ shortName: n, fullName: `${n} полное`, inn: "7700000001", ogrn: "1027700000001", address: "Москва" });
export function filled(): WizardData {
  const d = emptyWizard();
  d.object = { name: "ЖК «Пример», корпус 1", address: "Москва, ул. Примерная, 1", city: "Москва" };
  d.orgs = { developer: o("ООО Заказчик"), builder: o("ООО Генподряд"), designer: o("ООО Проект"), performer: o("ООО Монтаж") };
  d.reps = [
    { role: "developer_control", fullName: "Иванов И.И.", position: "Инженер технадзора", org: "ООО Заказчик", authorityDoc: "приказ №1", nrsNumber: "С-77-1" },
    { role: "builder", fullName: "Петров П.П.", position: "Руководитель проекта", org: "ООО Генподряд", authorityDoc: "приказ №2", nrsNumber: "" },
    { role: "builder_control", fullName: "", position: "", org: "", authorityDoc: "", nrsNumber: "" },
    { role: "performer", fullName: "Сидоров С.С.", position: "Прораб", org: "ООО Монтаж", authorityDoc: "приказ №3", nrsNumber: "" },
  ];
  d.section = { code: "Р-01-ЭОМ", name: "Электроосвещение" };
  d.materials = [{ name: "Кабель ВВГнг(А)-LS 3х2,5", mark: "", unit: "м.", manufacturer: "Кабельный завод", quantity: "120,5" }];
  d.act = { number: "ЭОМ-1", date: "2026-10-20", works: "Прокладка кабельных линий", dateStart: "2026-10-01", dateEnd: "2026-10-15",
    normative: "СП 76.13330.2016", nextWorks: "Монтаж светильников" };
  return d;
}

