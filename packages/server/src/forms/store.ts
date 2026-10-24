// Шаблоны пользователя на диске: <dataDir>/templates/<id>/template.json и forms/<файл>. «СБД» — встроенный, не хранится.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_SBD, SBD_ID, UserTemplate, FormRef, validateTemplate, type TemplateDoc } from "@idk/shared/forms/template";
import { HttpError } from "../http/router.ts";
import { openZip, writeZip, ZipError } from "../zip/zip.ts";

export const NEED_OFFICE_FILE = "Нужен файл Word (.docx) или Excel (.xlsx). Старые .doc/.xls сохраните в новом формате";

/** Тип формы по содержимому: .docx — есть word/document.xml, .xlsx — xl/workbook.xml. */
export function formType(buf: Uint8Array): "docx" | "xlsx" | null {
  try {
    const z = openZip(buf);
    return z.has("word/document.xml") ? "docx" : z.has("xl/workbook.xml") ? "xlsx" : null;
  } catch (e) {
    if (e instanceof ZipError) return null;
    throw e;
  }
}

export class TemplateStore {
  private root: string;
  constructor(dataDir: string) {
    this.root = join(dataDir, "templates");
    mkdirSync(this.root, { recursive: true });
  }

  private dir(id: string) {
    if (!/^t-[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, `Шаблон «${id}» не найден`);
    return join(this.root, id);
  }

  list(): UserTemplate[] {
    const own = readdirSync(this.root, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("t-"))
      .flatMap((d) => {
        try { return [UserTemplate.parse(JSON.parse(readFileSync(join(this.root, d.name, "template.json"), "utf8")))]; } catch { return []; }
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return [BUILTIN_SBD, ...own];
  }

  get(id: string): UserTemplate {
    if (id === SBD_ID) return BUILTIN_SBD;
    const f = join(this.dir(id), "template.json");
    if (!existsSync(f)) throw new HttpError(404, `Шаблон «${id}» не найден`);
    return UserTemplate.parse(JSON.parse(readFileSync(f, "utf8")));
  }

  private write(t: UserTemplate) {
    const d = this.dir(t.id);
    mkdirSync(join(d, "forms"), { recursive: true });
    const tmp = join(d, "template.json.tmp");
    writeFileSync(tmp, JSON.stringify(t, null, 2));
    renameSync(tmp, join(d, "template.json"));
  }

  create(name: string, from?: string): UserTemplate {
    const src = from ? this.get(from) : null;
    const t: UserTemplate = { id: `t-${randomUUID()}`, name: name.trim(), docs: [] };
    const errors = validateTemplate(t);
    if (errors.length) throw new HttpError(422, errors[0]);
    mkdirSync(join(this.dir(t.id), "forms"), { recursive: true });
    if (src) t.docs = src.docs.map((d) => ({ ...d, form: d.form ? this.copyForm(src.id, t.id, d.form) : null })) as TemplateDoc[];
    this.write(t);
    return t;
  }

  private copyForm(from: string, to: string, f: FormRef): FormRef {
    const file = `${randomUUID()}.${f.type}`;
    writeFileSync(join(this.dir(to), "forms", file), this.form(from, f.file));
    return { ...f, file };
  }

  save(id: string, body: { name: string; docs: TemplateDoc[] }): UserTemplate {
    if (id === SBD_ID) throw new HttpError(400, "Встроенный шаблон «СБД» не меняется — сделайте копию");
    this.get(id);
    const t = UserTemplate.parse({ id, ...body });
    const errors = validateTemplate(t);
    if (errors.length) throw new HttpError(422, errors[0]);
    for (const d of t.docs) if (d.form && !existsSync(join(this.dir(id), "forms", d.form.file))) throw new HttpError(422, `Нет файла формы «${d.form.original}»`);
    this.write(t);
    return t;
  }

  remove(id: string) {
    if (id === SBD_ID) throw new HttpError(400, "Встроенный шаблон «СБД» не удаляется");
    this.get(id);
    rmSync(this.dir(id), { recursive: true, force: true });
  }

  addForm(id: string, buf: Buffer, original: string): FormRef {
    if (id === SBD_ID) throw new HttpError(400, "Встроенный шаблон «СБД» не меняется — сделайте копию");
    this.get(id);
    const type = formType(buf);
    if (!type) throw new HttpError(422, NEED_OFFICE_FILE);
    const file = `${randomUUID()}.${type}`;
    writeFileSync(join(this.dir(id), "forms", file), buf);
    return { file, type, original };
  }

  form(id: string, file: string): Buffer {
    if (!/^[0-9a-f-]{36}\.(docx|xlsx)$/.test(file)) throw new HttpError(404, "Форма не найдена");
    const f = join(this.dir(id), "forms", file);
    if (!existsSync(f)) throw new HttpError(404, "Форма не найдена");
    return readFileSync(f);
  }

  exportZip(id: string): { name: string; buf: Buffer } {
    const t = this.get(id);
    const forms = t.docs.flatMap((d) => (d.form ? [[`forms/${d.form.file}`, this.form(id, d.form.file)] as [string, Buffer]] : []));
    return { name: `${t.name}.idk-template`, buf: writeZip([["template.json", JSON.stringify(t, null, 2)], ...forms]) };
  }

  importZip(buf: Buffer): UserTemplate {
    let files: Map<string, () => Buffer>;
    let src: UserTemplate;
    try {
      files = openZip(buf);
      src = UserTemplate.parse(JSON.parse(files.get("template.json")?.().toString("utf8") ?? ""));
    } catch {
      throw new HttpError(422, "Это не файл шаблона (.idk-template)");
    }
    const t: UserTemplate = { id: `t-${randomUUID()}`, name: src.name, docs: [] };
    mkdirSync(join(this.dir(t.id), "forms"), { recursive: true });
    t.docs = src.docs.map((d) => {
      if (!d.form) return d;
      const data = files.get(`forms/${d.form.file}`)?.();
      if (!data || formType(data) !== d.form.type) return { ...d, form: null };
      const file = `${randomUUID()}.${d.form.type}`;
      writeFileSync(join(this.dir(t.id), "forms", file), data);
      return { ...d, form: { ...d.form, file } };
    }) as TemplateDoc[];
    this.write(t);
    return t;
  }
}
