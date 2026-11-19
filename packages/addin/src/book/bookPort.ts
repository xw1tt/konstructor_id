// 0.36: слой книги для экранов. Экраны работают с BookPort, а не с Excel напрямую: в панели это ExcelPort
// (Office.js), в окне программы — RemotePort (вызовы через сервер к панели книги). Если книга переедет
// в само приложение (вариант Б), появится третья реализация этого же типа — экраны не изменятся.
import type { ExcelPort } from "./excelPort.ts";

export type { ChangeEvent, MergeReport, Selection } from "./excelPort.ts";
export type BookPort = { [K in keyof ExcelPort]: ExcelPort[K] };
