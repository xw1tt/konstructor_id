// План 25: ограничение работы при доступе «только чтение» / «приостановлен» — печать, комплект, ОЖР, свои формы и помощник.
let reason: string | null = null;

/** null — работать можно; текст — почему нельзя (показывается вместо результата). */
export function setAccessBlock(r: string | null) { reason = r; }
export const accessBlock = () => reason;

const BLOCKED = /^\/api\/(print-jobs|print\/|kit-jobs|ojr-jobs|form-jobs|ai\/chat)/;

/** Бросает ошибку с причиной, если путь — работа, а доступ ограничен. */
export function assertAccess(path: string) {
  if (reason && BLOCKED.test(path)) throw new Error(reason);
}
