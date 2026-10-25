// План 20: наборы инструментов помощника вне книги — справочник (и формы, задача 3).
import type { ToolCall } from "@idk/shared/ai/model";
import type { Proposal, ToolContext } from "@idk/shared/ai/tools";
import { CATALOG_TOOLS, validateCatalogProposal } from "@idk/shared/ai/catalogTool";
import { BUILTIN_CATALOG } from "@idk/shared/catalog/builtin";
import { mergeUserCatalog } from "@idk/shared/catalog/merge";
import type { UserCatalog } from "@idk/shared/catalog/model";
import { apiGet, apiSend } from "../api.ts";
import type { ToolKit } from "./assistant.ts";

export interface CatalogApi {
  user(): Promise<UserCatalog>;
  save(u: UserCatalog): Promise<UserCatalog>;
}
export const catalogApi: CatalogApi = {
  user: () => apiGet<UserCatalog>("/api/catalog/user"),
  save: (u) => apiSend<UserCatalog>("PUT", "/api/catalog/user", u),
};

const json = (v: unknown) => JSON.stringify(v);

/** Справочник: propose_catalog → предложение; применение — дополнения пользователя + отмена прежними. */
export function catalogKit(api: CatalogApi = catalogApi, onChanged: () => void = () => {}): ToolKit {
  return {
    tools: CATALOG_TOOLS,
    async exec(call: ToolCall, ctx: ToolContext) {
      if (call.name !== "propose_catalog") return null;
      const r = validateCatalogProposal(BUILTIN_CATALOG, await api.user(), call.arguments ?? {});
      if (!r.ok) return json({ error: r.error });
      const id = ctx.proposals.length + 1;
      ctx.proposals.push({ id, change: { kind: "catalog", add: r.add }, lines: r.lines });
      return json({ ok: true, proposal: id, note: `Предложение №${id} будет показано пользователю; он сам решит, применять ли его.` });
    },
    async apply(p: Proposal) {
      if (p.change.kind !== "catalog") return null;
      const before = await api.user();
      await api.save(mergeUserCatalog(before, p.change.add));
      onChanged();
      return async () => { await api.save(before); onChanged(); };
    },
  };
}
