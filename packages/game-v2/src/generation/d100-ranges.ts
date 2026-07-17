import type { ContentTable } from "./template-set.schema"

/**
 * The pure `weights → d100 ranges` projection (tech design §3, D7) — the wandering
 * panel shows the DM a table's rows with the d100 bands to roll against, but the
 * authored truth stays the row `weight`s; the ranges are derived, never stored.
 * The DM rolls a real d100 and clicks the row it landed in ("the app rolls to
 * fabricate the world; the DM rolls to play the game").
 *
 * The projection normalizes by **largest remainder** with a floor of **width 1
 * per row** — no row is ever unhittable — and is order-preserving and fully
 * deterministic (the tie-break is load-bearing; the panel and any test must agree
 * on the exact bands).
 */

/** One row's inclusive d100 band, `1 ≤ min ≤ max ≤ 100`. */
export interface D100Range {
  min: number
  max: number
}

/**
 * Distributes `total` indivisible units across `quotas` by the **largest
 * remainder method**: floor each quota, then hand the leftover units to the
 * highest fractional remainders, **ties broken by lower index**. Returns the
 * per-index integer allotment (summing to `total`). Deterministic — the
 * lower-index tie-break is what makes two calls byte-identical.
 */
function largestRemainder(quotas: number[], total: number): number[] {
  const allotment = quotas.map((q) => Math.floor(q))
  const assigned = allotment.reduce((sum, n) => sum + n, 0)
  const leftover = total - assigned

  const byRemainder = quotas
    .map((q, index) => ({ index, remainder: q - Math.floor(q) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)

  for (let i = 0; i < leftover; i += 1) {
    const index = byRemainder[i]!.index
    allotment[index] = allotment[index]! + 1
  }
  return allotment
}

/**
 * Projects a {@link ContentTable}'s rows onto contiguous d100 bands ascending
 * from 1. Returns `[]` for a table with no rows and `null` when there are **more
 * than 100 rows** (no width-1 packing fits 100 slots — the panel shows a ">100
 * rows" notice). Otherwise every row reserves a base width of 1 and the remaining
 * `100 − n` is distributed by largest remainder over the quotas `wᵢ·(100 − n)/W`;
 * an all-zero total weight falls back to equal quotas. The result is
 * order-preserving (band `i` is row `i`) and monotone in weight: for `i < j`,
 * `wᵢ ≥ wⱼ ⇒ widthᵢ ≥ widthⱼ`.
 */
export function d100Ranges(table: ContentTable): D100Range[] | null {
  const n = table.rows.length
  if (n === 0) return []
  if (n > 100) return null

  const remaining = 100 - n
  const weights = table.rows.map((row) => Math.max(0, row.weight))
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  const quotas =
    totalWeight === 0
      ? weights.map(() => remaining / n)
      : weights.map((w) => (w * remaining) / totalWeight)
  const widths = largestRemainder(quotas, remaining).map((extra) => extra + 1)

  const ranges: D100Range[] = []
  let cursor = 1
  for (const width of widths) {
    ranges.push({ min: cursor, max: cursor + width - 1 })
    cursor += width
  }
  return ranges
}
