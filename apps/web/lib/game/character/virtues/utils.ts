import { VIRTUE_KEYS, type VirtueKey } from "../state"

/**
 * Validates a character-creation Virtue allocation (rulebook 1.2). A valid
 * creation allocation is:
 *
 * - exactly one Virtue at Rank 2,
 * - exactly two distinct Virtues at Rank 1,
 * - the fourth Virtue at Rank 0,
 * - no ranks outside {0, 1, 2}.
 *
 * Used by both the Step-3 client UI (to gate the Next button + show the
 * "remaining picks" line) and the Server Action's Zod schema (the canonical
 * server-side check).
 */

/**
 * A *valid* virtue allocation — narrowed so each rank is one of {0, 1, 2}.
 * Use this as the type for downstream consumers (action input, picker
 * state) that should never see out-of-domain values. Raw reads from the DB
 * land as `Record<VirtueKey, number>`; pass them through
 * {@link coerceVirtueAllocation} (or a validator) to narrow at the boundary.
 */
export type VirtueAllocation = Record<VirtueKey, 0 | 1 | 2>

/**
 * Wider input shape for the validators below — accepts any integer rank so
 * the validator's "rejects ranks outside {0, 1, 2}" branch can actually be
 * exercised. The DB column is a plain `integer`, so reads also satisfy this.
 */
type RawVirtueAllocation = Record<VirtueKey, number>

export const ZERO_VIRTUE_ALLOCATION: VirtueAllocation = {
  expression: 0,
  empathy: 0,
  wisdom: 0,
  focus: 0,
}

/**
 * Clamps each rank in a raw integer allocation to the {0, 1, 2} domain,
 * returning the narrowed {@link VirtueAllocation} shape. Out-of-domain values
 * are mapped to 0 — a DB-write path can't produce them today (the action
 * schema constrains to literal 0/1/2), but the coercion keeps the type honest
 * at the boundary.
 */
export function coerceVirtueAllocation(
  raw: RawVirtueAllocation
): VirtueAllocation {
  return {
    expression: clampVirtueRank(raw.expression),
    empathy: clampVirtueRank(raw.empathy),
    wisdom: clampVirtueRank(raw.wisdom),
    focus: clampVirtueRank(raw.focus),
  }
}

function clampVirtueRank(n: number): 0 | 1 | 2 {
  return n === 1 ? 1 : n === 2 ? 2 : 0
}

export function isValidCreationAllocation(
  allocation: RawVirtueAllocation
): allocation is VirtueAllocation {
  const ranks = VIRTUE_KEYS.map((key) => allocation[key])
  if (ranks.some((r) => r !== 0 && r !== 1 && r !== 2)) return false
  return (
    ranks.filter((r) => r === 2).length === 1 &&
    ranks.filter((r) => r === 1).length === 2
  )
}

/**
 * Returns `true` if setting `key` to `target` would push the allocation
 * past the rulebook 1.2 creation cap (>1 Virtue at +2, or >2 Virtues at
 * +1). Clearing (`target === 0`) and re-clicking the current rank are
 * never disabled. The Virtues control uses this to disable the
 * cap-violating segment of each `ButtonGroup`; the canonical server-side
 * cap lives in `SetVirtuesSchema` (twos ≤ 1, ones ≤ 2).
 */
export function wouldExceedAllocationCap(
  allocation: VirtueAllocation,
  key: VirtueKey,
  target: 0 | 1 | 2
): boolean {
  if (target === 0) return false
  if (allocation[key] === target) return false
  const next: VirtueAllocation = { ...allocation, [key]: target }
  const twos = VIRTUE_KEYS.filter((k) => next[k] === 2).length
  const ones = VIRTUE_KEYS.filter((k) => next[k] === 1).length
  return twos > 1 || ones > 2
}

/**
 * Returns the +2 Virtue, the +1 Virtues, and an explanation if the
 * allocation isn't yet valid — used by the picker to surface "pick a +2",
 * "pick one more +1", etc.
 */
export function describeAllocationProgress(allocation: RawVirtueAllocation): {
  plusTwo: VirtueKey | null
  plusOnes: VirtueKey[]
  remaining: { plusTwo: boolean; plusOnes: number }
  valid: boolean
} {
  const plusOnes = VIRTUE_KEYS.filter((key) => allocation[key] === 1)
  const plusTwo = VIRTUE_KEYS.filter((key) => allocation[key] === 2)[0] ?? null

  return {
    plusTwo,
    plusOnes,
    remaining: {
      plusTwo: plusTwo === null,
      plusOnes: Math.max(0, 2 - plusOnes.length),
    },
    valid: isValidCreationAllocation(allocation),
  }
}
