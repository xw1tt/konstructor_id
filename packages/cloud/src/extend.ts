// Этап 1: маршруты баланса, владельца и администратора (план 23); консоль — план 24.
import type { CloudOptions } from "./app.ts";
import { tenantState } from "./billing.ts";
import { ownerRoutes } from "./routes/owner.ts";
import { companyRoutes } from "./routes/company.ts";

export const extendCloud = (publicUrl: string, now: () => Date = () => new Date()): NonNullable<CloudOptions["extend"]> => (r, { auth, db }) => {
  ownerRoutes(r, auth, db, publicUrl, now);
  companyRoutes(r, auth, db, publicUrl);
  return { meExtra: async (tid) => (await tenantState(db, tid)) ?? {} };
};
