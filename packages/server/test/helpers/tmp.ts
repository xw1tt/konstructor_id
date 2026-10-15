import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const tmpDir = () => mkdtempSync(join(tmpdir(), "idk-"));
