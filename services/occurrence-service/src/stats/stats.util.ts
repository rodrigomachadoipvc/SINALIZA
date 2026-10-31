export const round = (n: number, digits = 2): number => Number(n.toFixed(digits));

/** `YYYY-MM` of every month from the month of `from` to the month of `to` (both `YYYY-MM-DD`). */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const last = to.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
