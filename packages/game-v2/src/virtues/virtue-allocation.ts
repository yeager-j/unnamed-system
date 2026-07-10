import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game-v2/kernel/vocab"

/**
 * Character-creation Virtue allocation validators, re-homed from v1
 * (`engine/character/virtues/utils.ts`) — rulebook 1.2. A valid creation
 * allocation is:
 *
 * - exactly one Virtue at Rank 2,
 * - exactly two distinct Virtues at Rank 1,
 * - the fourth Virtue at Rank 0,
 * - no ranks outside {0, 1, 2}.
 *
 * Pure functions over a raw allocation record (which maps to `virtues.ranks`);
 * the builder gates its Next button + surfaces the "remaining picks" line with
 * these, and the finalize validation runs the same check server-side.
 */

/**
 * A *valid* virtue allocation — narrowed so each rank is one of {0, 1, 2}. Use
 * this as the type for downstream consumers (action input, picker state) that
 * should never see out-of-domain values. Raw reads land as
 * `Record<VirtueKey, number>`; pass them through {@link coerceVirtueAllocation}
 * (or a validator) to narrow at the boundary.
 */
export type VirtueAllocation = Record<VirtueKey, 0 | 1 | 2>

/**
 * Wider input shape for the validators below — accepts any integer rank so the
 * validator's "rejects ranks outside {0, 1, 2}" branch can actually be exercised.
 */
type RawVirtueAllocation = Record<VirtueKey, number>

export const ZERO_VIRTUE_ALLOCATION: VirtueAllocation = {
  expression: 0,
  empathy: 0,
  wisdom: 0,
  focus: 0,
}

/**
 * Clamps each rank in a raw integer allocation to the {0, 1, 2} domain, returning
 * the narrowed {@link VirtueAllocation} shape. Out-of-domain values map to 0 — a
 * write path can't produce them today, but the coercion keeps the type honest at
 * the boundary.
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
  const twoCount = ranks.filter((r) => r === 2).length
  // Stryker disable next-line EqualityOperator: equivalent — with exactly four ranks all in {0,1,2} (guarded above) and exactly one at rank 2, counting `r === 1` and `r !== 1` both equal 2 iff there are two 1s and one 0, so `!==` is indistinguishable here.
  const oneCount = ranks.filter((r) => r === 1).length
  return twoCount === 1 && oneCount === 2
}

/**
 * Whether an allocation already violates the rulebook 1.2 creation cap: more than
 * one Virtue at +2, or more than two at +1. The single executable home for the
 * cap — the write path checks it on the whole proposed allocation, and
 * {@link wouldExceedAllocationCap} derives its per-segment answer from it.
 */
export function exceedsAllocationCap(allocation: VirtueAllocation): boolean {
  const twos = VIRTUE_KEYS.filter((k) => allocation[k] === 2).length
  const ones = VIRTUE_KEYS.filter((k) => allocation[k] === 1).length
  return twos > 1 || ones > 2
}

/**
 * Returns `true` if setting `key` to `target` would push the allocation past the
 * rulebook 1.2 creation cap. Clearing (`target === 0`) and re-clicking the current
 * rank are never disabled — the Virtues control uses this to disable the
 * cap-violating segment of each control. Derives its answer from
 * {@link exceedsAllocationCap} over the hypothetical next allocation.
 */
export function wouldExceedAllocationCap(
  allocation: VirtueAllocation,
  key: VirtueKey,
  target: 0 | 1 | 2
): boolean {
  if (target === 0) return false
  if (allocation[key] === target) return false
  return exceedsAllocationCap({ ...allocation, [key]: target })
}

/**
 * Returns the +2 Virtue, the +1 Virtues, and an explanation if the allocation
 * isn't yet valid — used by the picker to surface "pick a +2", "pick one more
 * +1", etc.
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
