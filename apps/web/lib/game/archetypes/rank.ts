/**
 * Pure Archetype-Rank predicates, kept in their own **zero-dependency** module
 * so any layer can import them without pulling in (or cycling through) the rest
 * of the archetypes domain. `lib/game/character/reduce-character.ts` is the
 * motivating case: it needs {@link MASTERY_RANK} but lives in a domain the
 * archetypes barrel imports back into (via `utils.ts`), so importing the barrel
 * — or even `schema.ts` — risks a cycle. These constants depend on nothing, so
 * importing this leaf is always safe.
 */

/**
 * The Archetype Rank at which a character permanently gains that Archetype's
 * Mastery bonus (PRD §7.1). It equals the max Rank, so Mastery is simply
 * "at cap"; it is derived from Rank, never stored.
 */
export const MASTERY_RANK = 5

/**
 * Whether an Archetype at the given Rank has unlocked its Mastery bonus.
 * Mastery is automatic at {@link MASTERY_RANK}; the player makes no choice.
 */
export function hasMasteryBonus(rank: number): boolean {
  return rank >= MASTERY_RANK
}

/**
 * Whether an Archetype at `currentRank` has unlocked something the catalog
 * declares at `requiredRank` — a Rank-keyed Skill, the Synthesis Skill, or any
 * future Rank-gated feature. Centralizes the "you have it at Rank N if your
 * Archetype Rank ≥ N" rule so the engine and every read-side surface use the
 * same predicate.
 */
export function hasUnlockedRank(
  currentRank: number,
  requiredRank: number
): boolean {
  return currentRank >= requiredRank
}
