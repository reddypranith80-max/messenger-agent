/** A date `days` from now (negative for the past). Kept out of components, which must stay pure. */
export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60_000);
}
