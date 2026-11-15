/** Layout matches the fixed 24-row table on the existing official A4 custody form. */
export const CUSTODY_ROWS_PER_PAGE = 24;

export function paginateCustodyRows<T>(lines: T[]): T[][] {
  if (!lines.length) return [[]];
  const result: T[][] = [];
  for (let i = 0; i < lines.length; i += CUSTODY_ROWS_PER_PAGE) {
    result.push(lines.slice(i, i + CUSTODY_ROWS_PER_PAGE));
  }
  return result;
}
