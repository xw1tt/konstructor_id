// 0.36: окно «Конструктор ИД» — отдельная программа KonstruktorID.exe в папке установки (рядом с папкой node).
// Сервер запускает её по кнопке «Открыть в окне»; уже открытое окно программа сама выводит вперёд.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const WINDOW_EXE = "KonstruktorID.exe";

export function windowExe(execPath = process.execPath): string {
  return join(dirname(execPath), "..", WINDOW_EXE);
}

/** null — окна нет (не Windows или запуск из исходников). */
export function defaultWindowLauncher(platform = process.platform, exe = windowExe()): ((screen: string | undefined) => Promise<void>) | null {
  if (platform !== "win32" || !existsSync(exe)) return null;
  return (screen) =>
    new Promise((resolve, reject) => {
      const child = spawn(exe, screen ? [`--screen=${screen}`] : [], { detached: true, stdio: "ignore", windowsHide: false });
      child.once("error", (e) => reject(new Error(`Не удалось открыть окно программы: ${e.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
}
