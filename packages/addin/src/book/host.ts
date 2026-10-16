// Где открыта панель: вне Excel (или не загрузилась библиотека Office.js), в старом Excel или в подходящем.
export type HostStatus = "no-office" | "old" | "ok";

export function hostStatus(office: any): HostStatus {
  const req = office?.context?.requirements;
  if (!req?.isSetSupported) return "no-office";
  return req.isSetSupported("ExcelApi", "1.9") ? "ok" : "old";
}

declare const Office: any;
export const currentHost = (): HostStatus => hostStatus(typeof Office === "undefined" ? undefined : Office);
