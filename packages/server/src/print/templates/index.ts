import type { DocKind } from "@idk/shared/acts/schemas";
import type { DocData } from "../data.ts";
import { aosrHtml } from "./aosr.ts";
import { rimHtml } from "./rim.ts";
import { vdHtml } from "./vd.ts";
import { vorHtml } from "./vor.ts";

export function renderHtml<K extends DocKind>(kind: K, data: DocData[K]): string {
  switch (kind) {
    case "aosr": return aosrHtml(data as DocData["aosr"]);
    case "rim": return rimHtml(data as DocData["rim"]);
    case "vd": return vdHtml(data as DocData["vd"]);
    default: return vorHtml(data as DocData["vor"]);
  }
}
