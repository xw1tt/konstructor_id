// Выбранный шаблон (форма заказчика) — нужен печати в карточке акта.
import { createContext } from "react";
import { DEFAULT_TEMPLATE, type TemplateCode } from "@idk/shared/templates";

export const TemplateContext = createContext<TemplateCode>(DEFAULT_TEMPLATE);
