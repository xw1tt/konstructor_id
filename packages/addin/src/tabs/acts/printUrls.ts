import type { DocKind } from "@idk/shared/acts/schemas";

export const pdfUrl = (actId: number, doc: DocKind) => `/api/acts/${actId}/pdf/${doc}`;

/** Адрес окна предпросмотра; origin нужен для Office Dialog API (ему нужен абсолютный адрес). */
export const previewUrl = (actId: number, doc: DocKind, origin = "") =>
  `${origin}/addin/preview.html?src=${encodeURIComponent(pdfUrl(actId, doc))}`;
