// План 16: обращения панели к библиотеке компании на сервере.
import type { LibKind, LibRecord } from "@idk/shared/library/model";
import type { CellValue } from "@idk/shared/workbook/values";
import { apiGet, apiSend } from "../api.ts";

export interface LibraryApi {
  list(kind: LibKind, q?: string): Promise<LibRecord[]>;
  save(kind: LibKind, values: Record<string, CellValue>, fileId: number | null): Promise<{ id: string; created: boolean }>;
  importScan(sha256: string, name: string, mime: string): Promise<{ fileId: number; name: string }>;
}

export const libraryApi: LibraryApi = {
  list: (kind, q = "") => apiGet<LibRecord[]>(`/api/library/${kind}${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  save: (kind, values, fileId) => apiSend("POST", `/api/library/${kind}`, { values, fileId }),
  importScan: (sha, name, mime) => apiSend("POST", `/api/library/files/${sha}/import`, { name, mime }),
};

export const librarySettings = () => apiGet<{ dir: string; isDefault: boolean }>("/api/library/settings");
export const setLibraryDir = (dir: string | null) => apiSend<{ dir: string; isDefault: boolean }>("PUT", "/api/library/settings", { dir });
