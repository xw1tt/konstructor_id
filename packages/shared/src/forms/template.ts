// Шаблон пользователя: имя и документы; у документа форма встроенная (по образцу СБД) или своя (.docx/.xlsx с метками).
import { z } from "zod";
import { PRINT_KINDS, type PrintKind } from "../acts/schemas.ts";
import { PrintOptions } from "../templates.ts";

export const SBD_ID = "sbd";

export const BUILTIN_DOC_LABELS: Record<PrintKind, string> = {
  aosr: "АОСР", rim: "РИМ", vd: "ВД", vor: "ВОР", avk: "АВК", kj: "КЖ", ip: "Протокол",
};
/** Коды, занятые встроенными документами (номера и виды реестра). */
const RESERVED = ["АОСР", "РИМ", "ВД", "ВОР", "АВК", "КЖ", "ИП"];

export const FormRef = z.object({ file: z.string().min(1), type: z.enum(["docx", "xlsx"]), original: z.string().default("") });
export type FormRef = z.infer<typeof FormRef>;

export const TemplateDoc = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("builtin"), doc: z.enum(PRINT_KINDS), form: FormRef.nullable().default(null) }),
  z.object({ kind: z.literal("custom"), code: z.string(), name: z.string().trim().min(1, "Укажите название документа"), form: FormRef.nullable().default(null) }),
]);
export type TemplateDoc = z.infer<typeof TemplateDoc>;

/** print — настройки печати встроенных документов шаблона (п.4 АОСР: «Исполнительная схема» перед каждой схемой). */
export const UserTemplate = z.object({ id: z.string().min(1), name: z.string(), docs: z.array(TemplateDoc), print: PrintOptions.default({}) });
export type UserTemplate = z.infer<typeof UserTemplate>;

export const BUILTIN_SBD: UserTemplate = {
  id: SBD_ID, name: "СБД", print: { schemeEach: false },
  docs: (["aosr", "rim", "vd", "vor", "avk", "kj", "ip"] as const).map((doc) => ({ kind: "builtin" as const, doc, form: null })),
};

/** Ошибки шаблона: имя, коды своих документов (формат, повтор, занятые встроенными). */
export function validateTemplate(t: UserTemplate): string[] {
  const out: string[] = [];
  if (!t.name.trim()) out.push("Укажите имя шаблона");
  const seen = new Set<string>();
  for (const d of t.docs) {
    if (d.kind !== "custom") continue;
    const up = d.code.trim().toUpperCase();
    if (!/^[A-Za-zА-Яа-яЁё0-9]{1,10}$/.test(d.code.trim())) out.push(`Код «${d.code}»: 1–10 букв или цифр`);
    else if (RESERVED.includes(up)) out.push(`Код «${d.code}» занят встроенным документом`);
    else if (seen.has(up)) out.push(`Код «${d.code}» уже есть в шаблоне`);
    seen.add(up);
  }
  return out;
}

/** Подпись документа шаблона (кнопка печати, реестр). */
export const docLabel = (d: TemplateDoc) => (d.kind === "builtin" ? BUILTIN_DOC_LABELS[d.doc] : d.name);
