// План 20: предложение дополнить справочник — свои документы и виды работ; проверка тем же слиянием, что и при сохранении.
import type { ToolDef } from "./model.ts";
import { CatalogDoc, type Catalog, type CatalogSection, type UserCatalog } from "../catalog/model.ts";
import { mergeCatalog, mergeUserCatalog } from "../catalog/merge.ts";

export const CATALOG_TOOLS: ToolDef[] = [{
  name: "propose_catalog",
  description: "Предложить дополнить справочник (пользователь подтвердит): свои документы и виды работ. Сначала посмотри get_catalog, чтобы не повторять коды и сослаться на существующие документы.",
  parameters: {
    type: "object",
    properties: {
      docs: { type: "array", description: "Новые документы", items: { type: "object", properties: {
        code: { type: "string", description: "Уникальный код, например «АПК»" }, name: { type: "string" },
        clause344: { type: "integer", description: "Пункт 1–13 приложения № 1 к приказу 344/пр" },
        source: { type: "string", description: "Норматив-источник требования" },
        make: { type: "string", enum: ["form", "scan"], description: "form — своя форма Word/Excel, scan — скан" },
        scope: { type: "string", enum: ["act", "kit"], description: "на акт или на комплект" } }, required: ["code", "name", "clause344", "make", "scope"] } },
      works: { type: "array", description: "Новые виды работ", items: { type: "object", properties: {
        section: { type: "string", description: "Код раздела (существующего или нового)" }, sectionName: { type: "string", description: "Название нового раздела" },
        code: { type: "string" }, name: { type: "string" }, docs: { type: "array", items: { type: "string" }, description: "Коды документов вида работ" } },
        required: ["section", "code", "name", "docs"] } },
    },
  },
}];

type Result = { ok: true; add: UserCatalog; lines: string[] } | { ok: false; error: string };

export function validateCatalogProposal(builtin: Catalog, user: UserCatalog, args: Record<string, unknown>): Result {
  const merged = mergeCatalog(builtin, user).catalog;
  const docCodes = new Set(merged.docs.map((d) => d.code.toUpperCase()));
  const workCodes = new Set(merged.sections.flatMap((s) => s.works.map((w) => w.code.toUpperCase())));
  const lines: string[] = [];
  const docs: CatalogDoc[] = [];
  for (const raw of Array.isArray(args.docs) ? args.docs : []) {
    const p = CatalogDoc.safeParse({ source: "", ...(raw as object) });
    if (!p.success) return { ok: false, error: `Документ: ${p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
    if (p.data.make === "builtin") return { ok: false, error: "Встроенные документы добавлять нельзя — только form или scan" };
    if (docCodes.has(p.data.code.toUpperCase())) return { ok: false, error: `Код документа «${p.data.code}» уже есть в справочнике` };
    docCodes.add(p.data.code.toUpperCase());
    docs.push(p.data);
    lines.push(`Новый документ справочника: ${p.data.code} — ${p.data.name} (п. ${p.data.clause344} прил. 1 к 344/пр; ${p.data.make === "scan" ? "скан" : "своя форма"}; ${p.data.scope === "kit" ? "на комплект" : "на акт"}${p.data.source ? `; ${p.data.source}` : ""})`);
  }
  const sections: CatalogSection[] = [];
  for (const raw of Array.isArray(args.works) ? args.works : []) {
    const w = raw as Record<string, unknown>;
    const section = String(w.section ?? "").trim(), code = String(w.code ?? "").trim(), name = String(w.name ?? "").trim();
    const wdocs = Array.isArray(w.docs) ? w.docs.map((d) => String(d).trim()).filter(Boolean) : [];
    if (!section || !code || !name) return { ok: false, error: "Вид работ: нужны section, code и name" };
    if (workCodes.has(code.toUpperCase())) return { ok: false, error: `Код вида работ «${code}» уже есть в справочнике` };
    const missing = wdocs.filter((d) => !docCodes.has(d.toUpperCase()));
    if (missing.length) return { ok: false, error: `Нет документов с кодами: ${missing.join(", ")} — предложи их в docs или возьми коды из get_catalog` };
    const existing = merged.sections.find((s) => s.code.toUpperCase() === section.toUpperCase());
    const sectionName = existing?.name ?? String(w.sectionName ?? "").trim();
    if (!sectionName) return { ok: false, error: `Раздела «${section}» нет — укажи sectionName для нового раздела` };
    // Коды документов — как в справочнике (регистр).
    const canon = (c: string) => [...merged.docs, ...docs].find((d) => d.code.toUpperCase() === c.toUpperCase())!.code;
    const sec = sections.find((s) => s.code === (existing?.code ?? section)) ?? (sections.push({ code: existing?.code ?? section, name: sectionName, works: [] }), sections.at(-1)!);
    sec.works.push({ code, name, docs: wdocs.map(canon) });
    workCodes.add(code.toUpperCase());
    lines.push(`Новый вид работ в разделе «${sectionName}»${existing ? "" : " (новый раздел)"}: ${code} — ${name}; документы: ${wdocs.map(canon).join(", ") || "нет"}`);
  }
  if (!lines.length) return { ok: false, error: "Нечего добавлять: укажи docs и/или works" };
  const add: UserCatalog = { docs, sections, hidden: [] };
  const { errors } = mergeCatalog(builtin, mergeUserCatalog(user, add));
  if (errors.length) return { ok: false, error: errors[0] };
  return { ok: true, add, lines };
}
