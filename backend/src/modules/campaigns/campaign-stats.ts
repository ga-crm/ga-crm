/**
 * CMP-3: cost per lead and per issued case, in whole VND. Unknown without a budget, and when
 * there is nothing to divide by.
 */
export function campaignCosts(
  budgetVnd: number | null | undefined,
  leads: number,
  issued: number,
): { perLeadVnd: number | null; perIssuedVnd: number | null } {
  const per = (count: number) =>
    budgetVnd === null || budgetVnd === undefined || count === 0
      ? null
      : Math.round(budgetVnd / count);
  return { perLeadVnd: per(leads), perIssuedVnd: per(issued) };
}

/** CMP-1: a campaign cannot end before it starts. */
export const datesInOrder = (
  startDate?: string | null,
  endDate?: string | null,
): boolean => !startDate || !endDate || startDate <= endDate;

/** Counts of a field across leads, `NONE` for leads without a value. */
export function countBy(
  rows: readonly { _id: string | null; count: number }[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = row._id ?? 'NONE';
    result[key] = (result[key] ?? 0) + row.count;
  }
  return result;
}
