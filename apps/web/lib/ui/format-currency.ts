/**
 * Formats a currency amount with grouped thousands and the `gp` unit, e.g.
 * `12,000,000 gp` (PRD §7.7). A fixed `en-US` grouping is used deliberately so
 * the string is identical on the server and the client — a locale-derived
 * separator would differ between the SSR render and hydration and trip React's
 * mismatch check. The grouping character is the only locale-sensitive detail
 * the spec cares about.
 */
const GROUPING = new Intl.NumberFormat("en-US")

/** `12,000,000` — the bare grouped number, no unit. */
export function formatNumber(value: number): string {
  return GROUPING.format(value)
}

/** `12,000,000 gp` — the grouped number with the currency unit. */
export function formatCurrency(value: number): string {
  return `${formatNumber(value)} gp`
}
