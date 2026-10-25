// Этап 1: подключение маршрутов баланса, владельца и консоли (планы 23–24).
import type { CloudOptions } from "./app.ts";

export const extendCloud = (_publicUrl: string): CloudOptions["extend"] => () => ({});
