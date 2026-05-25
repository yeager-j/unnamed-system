import { VIRTUE_KEYS, type VirtueKey } from "../character"

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

export type VirtueAllocation = Record<VirtueKey, number>

export const ZERO_VIRTUE_ALLOCATION: VirtueAllocation = {
  expression: 0,
  empathy: 0,
  wisdom: 0,
  focus: 0,
}

export function isValidCreationAllocation(
  allocation: VirtueAllocation
): boolean {
  const ranks = VIRTUE_KEYS.map((key) => allocation[key])
  if (ranks.some((r) => r !== 0 && r !== 1 && r !== 2)) return false
  return (
    ranks.filter((r) => r === 2).length === 1 &&
    ranks.filter((r) => r === 1).length === 2
  )
}

/**
 * Returns the +2 Virtue, the +1 Virtues, and an explanation if the
 * allocation isn't yet valid — used by the picker to surface "pick a +2",
 * "pick one more +1", etc.
 */
export function describeAllocationProgress(allocation: VirtueAllocation): {
  plusTwo: VirtueKey | null
  plusOnes: VirtueKey[]
  remaining: { plusTwo: boolean; plusOnes: number }
  valid: boolean
} {
  const plusTwoEntries = VIRTUE_KEYS.filter((key) => allocation[key] === 2)
  const plusOneEntries = VIRTUE_KEYS.filter((key) => allocation[key] === 1)
  const plusTwo = plusTwoEntries[0] ?? null
  const plusOnes = plusOneEntries

  const tooManyPlusTwos = plusTwoEntries.length > 1
  const tooManyPlusOnes = plusOneEntries.length > 2
  const overflow = tooManyPlusTwos || tooManyPlusOnes

  return {
    plusTwo,
    plusOnes,
    remaining: {
      plusTwo: plusTwo === null,
      plusOnes: Math.max(0, 2 - plusOnes.length),
    },
    valid: !overflow && isValidCreationAllocation(allocation),
  }
}
