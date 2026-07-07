import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import type { Level } from "@workspace/game-v2/progression/level.schema"
import type { Resources } from "@workspace/game-v2/resources/resources.schema"

/**
 * Victory + level-up transitions (rulebook 1.1, 1.6), component-native on the
 * depletion model (Characters v2 S2a; supersedes the v1-shaped re-home). Each is
 * pure and returns a patch the caller shallow-merges per key — the atomic-op
 * pattern (`vitals/operations.ts`), spanning components where the transition does
 * (`resources/rest.ts` precedent).
 *
 * Level-up **does not restore vitals** (ADR §2.2, settled 2026-07-05): `damage`
 * persists and current HP/SP rises by exactly the max delta, which the depletion
 * model expresses with zero code here. The dice pools DO refill (v1 parity):
 * zeroing the `*Used` counts is the depletion spelling of v1's
 * "refill to the new level's max".
 */

/** Victories needed per level and the hard level ceiling (rulebook 1.1, 1.6). */
export const VICTORIES_PER_LEVEL = 7
export const MAX_LEVEL = 30

/** Saveable Archetype Ranks granted by one level-up (rulebook 1.6). */
export const ARCHETYPE_RANKS_PER_LEVEL = 2

/** Award one Victory. Banking past {@link VICTORIES_PER_LEVEL} is allowed (v1
 *  parity) — overflow carries through the next level-up. */
export function applyAwardVictory(level: Level): Pick<Level, "victories"> {
  return { victories: level.victories + 1 }
}

/** Remove one Victory (a mis-click correction), clamped at 0 — not a refusal. */
export function applyRemoveVictory(level: Level): Pick<Level, "victories"> {
  return { victories: Math.max(0, level.victories - 1) }
}

/** The stored-component slice level-up reads and rewrites. */
export type LevelingComponents = Pick<
  ComponentRegistry,
  "level" | "archetypes" | "resources"
>

/**
 * An entity-level patch: each key holds only the field(s) level-up changed; the
 * caller shallow-merges each onto the matching stored component.
 */
export interface LevelUpPatch {
  level: Level
  archetypes: Pick<Archetypes, "savedArchetypeRanks">
  resources: Pick<Resources, "hitDiceUsed" | "skillDiceUsed">
}

/** Expected, recoverable failures (not programmer errors). */
export type LevelingError = "insufficient-victories" | "max-level"

/**
 * Whether the character may level up now: ≥ {@link VICTORIES_PER_LEVEL} Victories
 * banked and below {@link MAX_LEVEL}.
 */
export function canLevelUp(level: Level): boolean {
  return level.victories >= VICTORIES_PER_LEVEL && level.value < MAX_LEVEL
}

/**
 * Spends {@link VICTORIES_PER_LEVEL} Victories: +1 level (overflow Victories
 * carry), +{@link ARCHETYPE_RANKS_PER_LEVEL} saved Archetype Ranks, and both dice
 * pools refilled (`*Used` zeroed — the level-derived max rises and the spend
 * resets). Fails — without producing a patch — at {@link MAX_LEVEL} (`max-level`,
 * checked first) or with too few Victories (`insufficient-victories`).
 */
export function applyLevelUp(
  components: LevelingComponents
): Result<LevelUpPatch, LevelingError> {
  const { level, archetypes } = components
  if (level.value >= MAX_LEVEL) return err("max-level")
  if (level.victories < VICTORIES_PER_LEVEL) {
    return err("insufficient-victories")
  }

  return ok({
    level: {
      value: level.value + 1,
      victories: level.victories - VICTORIES_PER_LEVEL,
    },
    archetypes: {
      savedArchetypeRanks:
        archetypes.savedArchetypeRanks + ARCHETYPE_RANKS_PER_LEVEL,
    },
    resources: { hitDiceUsed: 0, skillDiceUsed: 0 },
  })
}
