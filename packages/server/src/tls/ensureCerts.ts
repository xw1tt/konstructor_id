import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { createCa, createLeaf } from "./x509.ts";

const RENEW_DAYS = 30;

/** Создаёт CA и сертификат localhost в <dataDir>/tls при первом запуске; leaf перевыпускается за 30 дней до конца. */
export function ensureCerts(dataDir: string): { key: string; cert: string; caCertPath: string } {
  const dir = join(dataDir, "tls");
  mkdirSync(dir, { recursive: true });
  const p = (n: string) => join(dir, n);
  if (!existsSync(p("ca.pem")) || !existsSync(p("ca.key"))) {
    const ca = createCa();
    writeFileSync(p("ca.pem"), ca.certPem);
    writeFileSync(p("ca.key"), ca.keyPem, { mode: 0o600 });
  }
  const ca = { certPem: readFileSync(p("ca.pem"), "utf8"), keyPem: readFileSync(p("ca.key"), "utf8") };
  let needLeaf = !existsSync(p("localhost.pem")) || !existsSync(p("localhost.key"));
  if (!needLeaf) {
    const until = new Date(new X509Certificate(readFileSync(p("localhost.pem"))).validTo).getTime();
    needLeaf = until - Date.now() < RENEW_DAYS * 86400_000;
  }
  if (needLeaf) {
    const leaf = createLeaf(ca);
    writeFileSync(p("localhost.pem"), leaf.certPem);
    writeFileSync(p("localhost.key"), leaf.keyPem, { mode: 0o600 });
  }
  return { key: readFileSync(p("localhost.key"), "utf8"), cert: readFileSync(p("localhost.pem"), "utf8"), caCertPath: p("ca.pem") };
}
