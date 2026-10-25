// План 18: подключения нейросетей (<dataDir>/ai.json, ключи — только здесь) и журнал расхода (<dataDir>/ai-usage.jsonl).
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Provider, ProviderInput, providerProblems, publicProvider, type ProviderPublic, type Usage } from "@idk/shared/ai/model";
import { HttpError } from "../http/router.ts";

const File = z.object({ active: z.string().nullable().default(null), providers: z.array(Provider).default([]) });
type File = z.infer<typeof File>;

export interface UsageTotal { provider: string; name: string; requests: number; prompt: number; completion: number }

export class AiStore {
  private file: string;
  private usageFile: string;
  constructor(private dataDir: string, private now: () => Date = () => new Date()) {
    this.file = join(dataDir, "ai.json");
    this.usageFile = join(dataDir, "ai-usage.jsonl");
  }

  private read(): File {
    try { return File.parse(JSON.parse(readFileSync(this.file, "utf8"))); } catch { return File.parse({}); }
  }
  private write(f: File) {
    mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(f, null, 2));
    renameSync(tmp, this.file);
  }

  list(): { active: string | null; providers: ProviderPublic[] } {
    const f = this.read();
    return { active: f.active, providers: f.providers.map(publicProvider) };
  }

  get(id: string): Provider {
    const p = this.read().providers.find((x) => x.id === id);
    if (!p) throw new HttpError(404, "Подключение не найдено");
    return p;
  }

  /** Активное подключение, готовое к работе. */
  active(): Provider {
    const f = this.read();
    const p = f.providers.find((x) => x.id === f.active);
    if (!p) throw new HttpError(400, "Не выбрана нейросеть: «Настройки» → «Нейросети»");
    const problems = providerProblems(p);
    if (problems.length) throw new HttpError(400, `${p.name}: ${problems[0]}`);
    return p;
  }

  /** Добавить (id = "new") или изменить; пустой ключ — прежний. Первое подключение становится активным. */
  save(id: string, input: ProviderInput): ProviderPublic {
    const f = this.read();
    const prev = f.providers.find((x) => x.id === id);
    if (id !== "new" && !prev) throw new HttpError(404, "Подключение не найдено");
    const p: Provider = { ...input, id: prev?.id ?? randomUUID(), key: input.key || prev?.key || "" };
    const problems = providerProblems(p);
    if (problems.length) throw new HttpError(400, problems[0]);
    f.providers = prev ? f.providers.map((x) => (x.id === p.id ? p : x)) : [...f.providers, p];
    if (!f.active) f.active = p.id;
    this.write(f);
    return publicProvider(p);
  }

  remove(id: string) {
    const f = this.read();
    if (!f.providers.some((x) => x.id === id)) throw new HttpError(404, "Подключение не найдено");
    f.providers = f.providers.filter((x) => x.id !== id);
    if (f.active === id) f.active = null;
    this.write(f);
  }

  setActive(id: string | null) {
    const f = this.read();
    if (id !== null && !f.providers.some((x) => x.id === id)) throw new HttpError(404, "Подключение не найдено");
    f.active = id;
    this.write(f);
  }

  logUsage(p: Provider, u: Usage) {
    mkdirSync(this.dataDir, { recursive: true });
    appendFileSync(this.usageFile, JSON.stringify({ at: this.now().toISOString(), provider: p.id, name: p.name, ...u }) + "\n");
  }

  /** Итоги текущего месяца по подключениям. */
  usage(): { month: string; totals: UsageTotal[] } {
    const month = this.now().toISOString().slice(0, 7);
    const by = new Map<string, UsageTotal>();
    let text = "";
    try { text = readFileSync(this.usageFile, "utf8"); } catch { /* журнала ещё нет */ }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!String(r.at).startsWith(month)) continue;
        const t = by.get(r.provider) ?? { provider: r.provider, name: r.name, requests: 0, prompt: 0, completion: 0 };
        t.requests++; t.prompt += Number(r.prompt) || 0; t.completion += Number(r.completion) || 0; t.name = r.name;
        by.set(r.provider, t);
      } catch { /* битая строка */ }
    }
    return { month, totals: [...by.values()] };
  }
}
