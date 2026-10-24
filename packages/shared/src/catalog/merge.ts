// План 12, задача 2: слияние встроенного справочника с дополнениями пользователя.
import { checkCatalog, type Catalog, type CatalogDoc, type CatalogSection, type UserCatalog } from "./model.ts";

/** Итоговый справочник: встроенный + дополнения пользователя. own — коды своих документов и видов работ. */
export interface MergedCatalog extends Catalog {
  own: Set<string>;
}

/** Слияние: свои документы и виды работ добавляются, скрытые уходят из выбора, конфликт кода — ошибка. */
export function mergeCatalog(builtin: Catalog, user: UserCatalog): { catalog: MergedCatalog; errors: string[] } {
  const errors: string[] = [];
  const hidden = new Set(user.hidden);

  // Свои документы: конфликт кода со встроенным — ошибка, документ не добавляется.
  const builtinCodes = new Set(builtin.docs.map((d) => d.code));
  const docs: CatalogDoc[] = [...builtin.docs];
  const ownDocs: CatalogDoc[] = [];
  for (const d of user.docs) {
    if (builtinCodes.has(d.code)) errors.push(`Код «${d.code}» занят встроенным документом`);
    else { docs.push(d); ownDocs.push(d); }
  }

  // Разделы: встроенные (виды работ без скрытых, документы-ссылки без скрытых) + свои по коду раздела.
  const sections: CatalogSection[] = builtin.sections.map((s) => ({
    code: s.code, name: s.name,
    works: s.works.filter((w) => !hidden.has(w.code)).map((w) => ({ ...w, docs: w.docs.filter((d) => !hidden.has(d)) })),
  }));
  const byCode = new Map(sections.map((s) => [s.code, s]));
  const ownWorks: string[] = [];
  for (const s of user.sections) {
    const works = s.works.filter((w) => !hidden.has(w.code)).map((w) => ({ ...w, docs: w.docs.filter((d) => !hidden.has(d)) }));
    const target = byCode.get(s.code);
    if (target) target.works.push(...works);
    else { const ns = { code: s.code, name: s.name, works }; sections.push(ns); byCode.set(s.code, ns); }
    ownWorks.push(...works.map((w) => w.code));
  }

  const catalog: Catalog = { version: builtin.version, docs, sections };
  errors.push(...checkCatalog(catalog));
  return { catalog: { ...catalog, own: new Set([...ownDocs.map((d) => d.code), ...ownWorks]) }, errors };
}

/** Объединение наборов дополнений: b добавляется к a, существующие коды не перезаписываются. */
export function mergeUserCatalog(a: UserCatalog, b: UserCatalog): UserCatalog {
  const docCodes = new Set(a.docs.map((d) => d.code));
  const docs = [...a.docs, ...b.docs.filter((d) => !docCodes.has(d.code))];
  const sections = a.sections.map((s) => ({ code: s.code, name: s.name, works: s.works.map((w) => ({ ...w })) }));
  const byCode = new Map(sections.map((s) => [s.code, s]));
  const workCodes = new Set(sections.flatMap((s) => s.works.map((w) => w.code)));
  for (const s of b.sections) {
    let target = byCode.get(s.code);
    if (!target) { target = { code: s.code, name: s.name, works: [] }; sections.push(target); byCode.set(s.code, target); }
    for (const w of s.works) if (!workCodes.has(w.code)) { workCodes.add(w.code); target.works.push(structuredClone(w)); }
  }
  return { docs, sections, hidden: [...new Set([...a.hidden, ...b.hidden])] };
}

/** Дополнения, на которые ссылается шаблон: свои документы шаблона и виды работ с ними. */
export function referencedUserCatalog(user: UserCatalog, docs: { code: string; catalog?: string }[]): UserCatalog {
  const codes = new Set(docs.map((d) => d.catalog ?? d.code));
  const ownDocs = user.docs.filter((d) => codes.has(d.code));
  const ownCodes = new Set(ownDocs.map((d) => d.code));
  const sections: CatalogSection[] = [];
  for (const s of user.sections) {
    const works = s.works.filter((w) => w.docs.some((d) => ownCodes.has(d)));
    if (works.length) sections.push({ code: s.code, name: s.name, works: structuredClone(works) });
  }
  return { docs: structuredClone(ownDocs), sections, hidden: [] };
}
