import { createContext, useContext } from "react";
import { ServerUnavailableError } from "./api.ts";

/** Вкладки сообщают оболочке, что сервер недоступен, через этот контекст. */
export const ServerDownContext = createContext<() => void>(() => {});

/** Оборачивает вызов API: при недоступном сервере показывает баннер, иначе отдаёт текст ошибки. */
export function useGuard() {
  const onDown = useContext(ServerDownContext);
  return async function guard<T>(p: Promise<T>, onError?: (msg: string) => void): Promise<T | undefined> {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ServerUnavailableError) onDown();
      else onError?.((e as Error).message);
      return undefined;
    }
  };
}
