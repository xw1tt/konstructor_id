// Этап 1: маршруты баланса, владельца и администратора (план 23); консоль — план 24.
import type { CloudOptions } from "./app.ts";
import { tenantState } from "./billing.ts";
import { ownerRoutes } from "./routes/owner.ts";
import { companyRoutes } from "./routes/company.ts";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@idk/server/http/static";

/** Собранная консоль (npm run build:cloud). */
export const CONSOLE_DIR = fileURLToPath(new URL("../console-dist", import.meta.url));

export const extendCloud = (publicUrl: string, now: () => Date = () => new Date(), consoleDir = CONSOLE_DIR): NonNullable<CloudOptions["extend"]> => (r, { auth, db }) => {
  ownerRoutes(r, auth, db, publicUrl, now);
  companyRoutes(r, auth, db, publicUrl);
  return {
    meExtra: async (tid) => (await tenantState(db, tid)) ?? {},
    // Консоль: /console/…; корень сайта ведёт в неё.
    static: (req, res) => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      if (req.method === "GET" && (path === "/" || path === "/console")) { res.writeHead(302, { location: "/console/" }).end(); return true; }
      return serveStatic("/console/", consoleDir, req, res);
    },
  };
};
