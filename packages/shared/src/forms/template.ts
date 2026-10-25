// Шаблон пользователя: имя и документы; у документа форма встроенная (по образцу СБД) или своя (.docx/.xlsx с метками).
import { z } from "zod";
import { PRINT_KINDS, PROTO_KINDS, type PrintKind, type ProtoKind } from "../acts/schemas.ts";
import { PROTO_DEFS } from "../protocols/defs.ts";
import { PrintOptions } from "../templates.ts";

export const SBD_ID = "sbd";

export const BUILTIN_DOC_LABELS: Record<PrintKind, string> = {
  aosr: "АОСР", rim: "РИМ", vd: "ВД", vor: "ВОР", avk: "АВК", kj: "КЖ", ip: "Протокол",
  ...(Object.fromEntries(PROTO_KINDS.map((k) => [k, PROTO_DEFS[k].code])) as Record<ProtoKind, string>),
  rp: "РП",
};
/** Коды, занятые встроенными документами (номера и виды реестра). */
const RESERVED = ["АОСР", "РИМ", "ВД", "ВОР", "АВК", "КЖ", "ИП", "РП", "РМ", ...PROTO_KINDS.map((k) => PROTO_DEFS[k].code)];

export const FormRef = z.object({ file: z.string().min(1), type: z.enum(["docx", "xlsx"]), original: z.string().default("") });
export type FormRef = z.infer<typeof FormRef>;

export const TemplateDoc = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("builtin"), doc: z.enum(PRINT_KINDS), form: FormRef.nullable().default(null),
    catalog: z.string().optional(), works: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("custom"), code: z.string(), name: z.string().trim().min(1, "Укажите название документа"), form: FormRef.nullable().default(null),
    catalog: z.string().optional(), works: z.array(z.string()).optional(),
    scope: z.enum(["act", "kit"]).optional(), scan: z.boolean().optional(),
  }),
]);
export type TemplateDoc = z.infer<typeof TemplateDoc>;

/** print — настройки печати встроенных документов шаблона (п.4 АОСР: «Исполнительная схема» перед каждой схемой). */
export const UserTemplate = z.object({ id: z.string().min(1), name: z.string(), docs: z.array(TemplateDoc), print: PrintOptions.default({}) });
export type UserTemplate = z.infer<typeof UserTemplate>;

export const BUILTIN_SBD: UserTemplate = {
  id: SBD_ID, name: "СБД", print: { schemeEach: false, formSet: "sbd", forms: {}, kjReserve: 2 },
  docs: (["aosr", "rim", "vd", "vor", "avk", "kj", "ip"] as const).map((doc) => ({ kind: "builtin" as const, doc, form: null })),
};

/** Встроенный шаблон «ТИ» (план 14): формы и нумерация по образцам ООО «Техноинжиниринг». */
export const TI_ID = "ti";
export const BUILTIN_TI: UserTemplate = {
  id: TI_ID, name: "ТИ", print: { schemeEach: false, formSet: "ti", forms: {}, kjReserve: 2 },
  docs: (["aosr", "rim", "rp", "vd", "kj", "ip"] as const).map((doc) => ({ kind: "builtin" as const, doc, form: null })),
};
/** Встроенные шаблоны (только чтение). */
export const BUILTIN_TEMPLATES = [BUILTIN_SBD, BUILTIN_TI];
export const isBuiltinTemplate = (id: string) => BUILTIN_TEMPLATES.some((t) => t.id === id);

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

/**
 * Шаблон плана 12 → план 13: свой документ с кодом одного из 16 протоколов и актов (скан или своя форма) становится
 * встроенным; форма пользователя и виды работ сохраняются. Встроенный уже есть — свой удаляется.
 */
export function upgradeTemplate(t: UserTemplate): UserTemplate {
  const docs: TemplateDoc[] = [];
  for (const d of t.docs) {
    if (d.kind !== "custom") { docs.push(d); continue; }
    const kind = PROTO_KINDS.find((k) => PROTO_DEFS[k].code.toUpperCase() === (d.catalog ?? d.code).trim().toUpperCase());
    if (!kind) { docs.push(d); continue; }
    if (t.docs.some((x) => x.kind === "builtin" && x.doc === kind) || docs.some((x) => x.kind === "builtin" && x.doc === kind)) continue;
    docs.push({ kind: "builtin", doc: kind, form: d.form, ...(d.catalog ? { catalog: d.catalog } : {}), ...(d.works ? { works: d.works } : {}) });
  }
  return docs.length === t.docs.length && docs.every((d, i) => d === t.docs[i]) ? t : { ...t, docs };
}
