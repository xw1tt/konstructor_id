// 0.35: файл формы из панели — .docx/.xlsx как есть, старые .doc/.xls переводятся сервером (Word/Excel на компьютере).
import { apiSend } from "../api.ts";

export const FORM_ACCEPT = ".docx,.xlsx,.doc,.xls";
export const isLegacyName = (name: string) => /\.(doc|xls)$/i.test(name);

export async function fileBase64(f: Blob): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Файл формы в base64 (OpenXML) и его имя (у переведённого — .docx/.xlsx). */
export async function readFormFile(f: File): Promise<{ name: string; base64: string; converted: boolean }> {
  const base64 = await fileBase64(f);
  if (!isLegacyName(f.name)) return { name: f.name, base64, converted: false };
  const r = await apiSend<{ file: string; name: string; converted: boolean }>("POST", "/api/forms/convert", { file: base64, name: f.name });
  return { name: r.name, base64: r.file, converted: r.converted };
}

/** File из base64 — для загрузок, принимающих двоичное тело. */
export function base64File(b64: string, name: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name);
}
