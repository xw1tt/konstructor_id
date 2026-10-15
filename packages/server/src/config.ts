import { join } from "node:path";
import { homedir } from "node:os";

export interface Config {
  dataDir: string;
  port: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const dataDir =
    env.IDK_DATA_DIR ||
    (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "KonstruktorID") : join(homedir(), ".konstruktor-id"));
  return { dataDir, port: Number(env.IDK_PORT) || 3443 };
}
