import { readFileSync } from "node:fs";
import type { SignBlock } from "@idk/shared/acts/rows";

export const escapeHtml = (s: string | number) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const e = escapeHtml;

const CSS = readFileSync(new URL("../print.css", import.meta.url), "utf8");

export function page(title: string, body: string, extraClass = ""): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${e(title)}</title><style>${CSS}</style></head>` +
    `<body class="${extraClass}">${body}</body></html>`;
}

/** Заполненное значение: подчёркнутый курсив с мелкой подписью-пояснением под линией. */
export function field(value: string | string[], caption = ""): string {
  const lines = (Array.isArray(value) ? value : [value]).map((v) => `<div class="val">${e(v) || "&nbsp;"}</div>`).join("");
  return `<div class="field">${lines}${caption ? `<div class="cap">${e(caption)}</div>` : ""}</div>`;
}

export function signBlocks(signs: SignBlock[]): string {
  return `<div class="signs">${signs.map((s) =>
    `<div class="sign"><div class="sign-label">${e(s.label)}</div>${s.names.map((n) =>
      `<div class="sign-name">${e(n) || "&nbsp;"}</div><div class="cap">(фамилия, инициалы, подпись)</div>`).join("")}</div>`).join("")}</div>`;
}
