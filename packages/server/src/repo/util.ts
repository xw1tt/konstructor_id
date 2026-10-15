/** snake_case строки базы → camelCase объекта API. */
export function camel<T>(row: Record<string, unknown> | undefined): T | undefined {
  if (!row) return undefined;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) o[k.replace(/_(\w)/g, (_, c) => c.toUpperCase())] = v;
  return o as T;
}
export const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
