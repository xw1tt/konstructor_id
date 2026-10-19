// Книга АОВ1 с комплектом №1 (Том 1, Часть 1) из одного акта.
import { aov1Records, AOV1 } from "./aov1Book.ts";

export const kitRecords = (patch: (r: any) => void = () => {}) => {
  const r: any = aov1Records();
  r["Комплекты"] = [{ "№ реестра": "1", "Том": "1", "Часть": "1", "Корпус": "Корпус «В»" }];
  r["АктыКомплектов"] = [{ "Комплект": "1", "Акт": AOV1 }];
  patch(r);
  return r;
};
