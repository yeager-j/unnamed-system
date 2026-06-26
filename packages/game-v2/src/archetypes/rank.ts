/**
 * Pure Archetype-Rank predicates, kept in their own **zero-dependency** module so
 * any layer can import them without pulling in (or cycling through) the rest of
 * the archetypes domain (carried from v1 `engine/archetypes/rank.ts`).
 *
 * The Mastery predicates ({@link MASTERY_RANK}, `hasMasteryBonus`) already live on
 * `archetype.ts` (PR2 needed them for the mastery walk); this module adds the
 * remaining rank gate. Both are surfaced together through the archetypes barrel.
 */

/**
 * Whether an Archetype at `currentRank` has unlocked something the catalog
 * declares at `requiredRank` — a Rank-keyed Skill, the Synthesis Skill, or any
 * future Rank-gated feature. Centralizes the "you have it at Rank N if your
 * Archetype Rank ≥ N" rule (G2) so the engine and every read-side surface use the
 * same `>=` predicate.
 */
export function hasUnlockedRank(
  currentRank: number,
  requiredRank: number
): boolean {
  return currentRank >= requiredRank
}
