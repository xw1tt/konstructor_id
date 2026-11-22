// 0.49: предел шагов помощника за один ответ — настройка этого компьютера (по умолчанию 30).
export const STEPS_KEY = "idk.ai.maxSteps";
export const DEFAULT_STEPS = 30;
export const clampSteps = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(5, Math.round(n))) : DEFAULT_STEPS);
export function maxSteps(): number {
  try {
    const v = localStorage.getItem(STEPS_KEY);
    return v ? clampSteps(Number(v)) : DEFAULT_STEPS;
  } catch {
    return DEFAULT_STEPS;
  }
}
export function setMaxSteps(n: number) {
  try {
    localStorage.setItem(STEPS_KEY, String(clampSteps(n)));
  } catch {
    /* без памяти */
  }
}
