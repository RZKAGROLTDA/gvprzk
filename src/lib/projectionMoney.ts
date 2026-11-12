/** NumericFormat supplies an ungrouped decimal string; never infer cents from digit count. */
export function parseProjectionMoney(value: string): number | null {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) return null;
  return amount;
}