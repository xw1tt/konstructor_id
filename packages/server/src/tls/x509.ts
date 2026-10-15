/**
 * Минимальный генератор X.509 на node:crypto (без сторонних библиотек).
 * Корневой сертификат ограничен nameConstraints: только localhost и 127.0.0.1,
 * поэтому даже при утечке ключа им нельзя подписать сертификат для другого сайта.
 */
import {
  generateKeyPairSync, randomBytes, sign, createHash, createPrivateKey, X509Certificate, type KeyObject,
} from "node:crypto";

// ---- DER ----
const len = (n: number): Buffer => {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag: number, ...content: Buffer[]) => {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
};
const seq = (...c: Buffer[]) => tlv(0x30, ...c);
const set = (...c: Buffer[]) => tlv(0x31, ...c);
const ctx = (n: number, ...c: Buffer[]) => tlv(0xa0 + n, ...c); // [n] constructed
const bool = (v: boolean) => tlv(0x01, Buffer.from([v ? 0xff : 0]));
const nul = () => Buffer.from([0x05, 0x00]);
const octet = (b: Buffer) => tlv(0x04, b);
const bitString = (b: Buffer, unused = 0) => tlv(0x03, Buffer.from([unused]), b);
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
const int = (b: Buffer) => tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
const intN = (n: number) => int(Buffer.from([n]));
function oid(s: string): Buffer {
  const p = s.split(".").map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const stack = [v & 0x7f];
    let x = v >> 7;
    while (x > 0) { stack.unshift((x & 0x7f) | 0x80); x >>= 7; }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}
function time(d: Date): Buffer {
  const iso = d.toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
  return d.getUTCFullYear() < 2050
    ? tlv(0x17, Buffer.from(iso.slice(2) + "Z"))
    : tlv(0x18, Buffer.from(iso + "Z"));
}
const ipBytes = (ip: string) => Buffer.from(ip.split(".").map(Number));

// ---- X.509 ----
const SHA256_RSA = seq(oid("1.2.840.113549.1.1.11"), nul());
const name = (cn: string) => seq(set(seq(oid("2.5.4.3"), utf8(cn))));
const ext = (id: string, critical: boolean, value: Buffer) =>
  critical ? seq(oid(id), bool(true), octet(value)) : seq(oid(id), octet(value));
/** Идентификатор ключа: SHA-1 от SPKI (RFC 5280 допускает любой однозначный способ). */
const keyId = (pub: KeyObject) => createHash("sha1").update(pub.export({ type: "spki", format: "der" })).digest();

export interface Pem { certPem: string; keyPem: string }
export interface Names { dns: string[]; ips: string[] }
const LOCAL: Names = { dns: ["localhost"], ips: ["127.0.0.1"] };

function build(opts: {
  subject: string; issuer: string; days: number;
  pub: KeyObject; signKey: KeyObject; issuerPub: KeyObject; extensions: Buffer[];
}): string {
  const now = new Date(Date.now() - 5 * 60_000);
  const notAfter = new Date(now.getTime() + opts.days * 86400_000);
  const exts = [
    ...opts.extensions,
    ext("2.5.29.14", false, octet(keyId(opts.pub))),
    ext("2.5.29.35", false, seq(tlv(0x80, keyId(opts.issuerPub)))),
  ];
  const tbs = seq(
    ctx(0, intN(2)),
    int(randomBytes(16)),
    SHA256_RSA,
    name(opts.issuer),
    seq(time(now), time(notAfter)),
    name(opts.subject),
    opts.pub.export({ type: "spki", format: "der" }),
    ctx(3, seq(...exts)),
  );
  const sig = sign("sha256", tbs, opts.signKey);
  const der = seq(tbs, SHA256_RSA, bitString(sig));
  const b64 = der.toString("base64").replace(/.{64}/g, "$&\n").replace(/\n$/, "");
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

const generalNames = (n: Names) => [
  ...n.dns.map((d) => tlv(0x82, Buffer.from(d, "ascii"))),
  ...n.ips.map((ip) => tlv(0x87, ipBytes(ip))),
];

export const CA_NAME = "Konstruktor ID Local CA";

export function createCa(): Pem {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const permitted = [
    ...LOCAL.dns.map((d) => seq(tlv(0x82, Buffer.from(d, "ascii")))),
    ...LOCAL.ips.map((ip) => seq(tlv(0x87, Buffer.concat([ipBytes(ip), Buffer.from([255, 255, 255, 255])])))),
  ];
  const certPem = build({
    subject: CA_NAME, issuer: CA_NAME, days: 3650, pub: publicKey, signKey: privateKey, issuerPub: publicKey,
    extensions: [
      ext("2.5.29.19", true, seq(bool(true), intN(0))),
      ext("2.5.29.15", true, bitString(Buffer.from([0x06]), 1)),
      ext("2.5.29.30", true, seq(ctx(0, ...permitted))),
    ],
  });
  return { certPem, keyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string };
}

export function createLeaf(ca: Pem, names: Names = LOCAL, days = 825): Pem {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const caKey = createPrivateKey(ca.keyPem);
  const caPub = new X509Certificate(ca.certPem).publicKey;
  const certPem = build({
    subject: names.dns[0] ?? names.ips[0], issuer: CA_NAME, days, pub: publicKey, signKey: caKey, issuerPub: caPub,
    extensions: [
      ext("2.5.29.19", true, seq()),
      ext("2.5.29.15", true, bitString(Buffer.from([0xa0]), 5)),
      ext("2.5.29.37", false, seq(oid("1.3.6.1.5.5.7.3.1"))),
      ext("2.5.29.17", false, seq(...generalNames(names))),
    ],
  });
  return { certPem, keyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string };
}
