// Выбранный шаблон (форма заказчика) — нужен печати в карточке акта.
import { createContext } from "react";
import { DEFAULT_TEMPLATE, PrintOptions, type TemplateCode } from "@idk/shared/templates";
import { BUILTIN_SBD, type UserTemplate } from "@idk/shared/forms/template";

export const TemplateContext = createContext<TemplateCode>(DEFAULT_TEMPLATE);

/** Настройки печати книги (меню «Шаблоны ▾»). */
export const PrintOptionsContext = createContext<PrintOptions>(PrintOptions.parse({}));

/** Шаблон книги (объект с документами и формами), список шаблонов компьютера и предупреждение о ненайденном. */
export interface TemplatesState { template: UserTemplate; list: UserTemplate[]; warning: string | null; ready: boolean; reload(): void }
export const UserTemplateContext = createContext<TemplatesState>({ template: BUILTIN_SBD, list: [BUILTIN_SBD], warning: null, ready: true, reload() {} });
