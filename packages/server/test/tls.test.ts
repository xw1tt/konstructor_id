import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { X509Certificate, createPrivateKey } from "node:crypto";
import { createCa, createLeaf } from "@idk/server/tls/x509";
import { ensureCerts } from "@idk/server/tls/ensureCerts";
import { tmpDir } from "./helpers/tmp.ts";

const hasOpenssl = spawnSync("openssl", ["version"]).status === 0;
const ca = createCa();

function write(dir: string, name: string, pem: string) {
  const p = join(dir, name);
  writeFileSync(p, pem);
  return p;
}
const verify = (caPem: string, leafPem: string) => {
  const d = tmpDir();
  return spawnSync("openssl", ["verify", "-CAfile", write(d, "ca.pem", caPem), write(d, "leaf.pem", leafPem)], { encoding: "utf8" });
};

test("tls: Node разбирает сертификаты, leaf подписан CA и подходит для localhost", () => {
  const leaf = createLeaf(ca);
  const c = new X509Certificate(ca.certPem);
  const l = new X509Certificate(leaf.certPem);
  assert.equal(c.ca, true);
  assert.ok(l.verify(c.publicKey));
  assert.equal(l.checkHost("localhost"), "localhost");
  assert.equal(l.checkIP("127.0.0.1"), "127.0.0.1");
  assert.ok(createPrivateKey(leaf.keyPem));
});

test("tls: openssl принимает цепочку", { skip: !hasOpenssl }, () => {
  const r = verify(ca.certPem, createLeaf(ca).certPem);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /OK/);
});

test("tls: nameConstraints присутствует", { skip: !hasOpenssl }, () => {
  const d = tmpDir();
  const text = execFileSync("openssl", ["x509", "-in", write(d, "ca.pem", ca.certPem), "-noout", "-text"], { encoding: "utf8" });
  assert.match(text, /X509v3 Name Constraints: critical/);
  assert.match(text, /Permitted:/);
  assert.match(text, /DNS:localhost/);
  assert.match(text, /IP:127\.0\.0\.1\/255\.255\.255\.255/);
  assert.match(text, /CA:TRUE/);
});

test("tls: сертификат для другого имени не проходит", { skip: !hasOpenssl }, () => {
  const evil = createLeaf(ca, { dns: ["example.com"], ips: [] });
  const r = verify(ca.certPem, evil.certPem);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /permitted subtree violation/);
});

test("tls: ensureCerts создаёт один раз и переиспользует", () => {
  const d = tmpDir();
  const a = ensureCerts(d);
  assert.ok(existsSync(a.caCertPath));
  const b = ensureCerts(d);
  assert.equal(a.cert, b.cert);
});
