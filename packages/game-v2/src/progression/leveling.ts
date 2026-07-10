import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import type { Level } from "@workspace/game-v2/progression/level.schema"

/**
 * Victory + level-up transitions (rulebook 1.1, 1.6), component-native on the
 * depletion model (Characters v2 S2a; supersedes the v1-shaped re-home). Each is
 * pure and returns **whole updated components** the caller assigns wholesale —
 * the one patch vocabulary the Writers and the guarded column UPDATE speak
 * (UNN-601; `resources/rest.ts` precedent).
 *
 * Level-up is a **single-class write** (ADR §2.2, the load-bearing consequence):
 * it touches only progression-class columns (`level`, `archetypes`). Vitals and
 * dice pools are untouched — `damage`/`*Used` persist, and current rises by
 * exactly the max delta the new level derives (D9). This SUPERSEDES v1's
 * refill-dice-to-new-max (rulebook 1.6's "+1 Hit Die + 2 Skill Dice" is the max
 * growing, which depletion expresses with zero code; refills belong to rests).
 */

/** Victories needed per level and the hard level ceiling (rulebook 1.1, 1.6). */
export const VICTORIES_PER_LEVEL = 7
export const MAX_LEVEL = 30

/** Saveable Archetype Ranks granted by one level-up (rulebook 1.6). */
export const ARCHETYPE_RANKS_PER_LEVEL = 2

/** Award one Victory. Banking past {@link VICTORIES_PER_LEVEL} is allowed (v1
 *  parity) — overflow carries through the next level-up. */
export function applyAwardVictory(level: Level): Level {
  return { ...level, victories: level.victories + 1 }
}

/** Remove one Victory (a mis-click correction), clamped at 0 — not a refusal. */
export function applyRemoveVictory(level: Level): Level {
  return { ...level, victories: Math.max(0, level.victories - 1) }
}

/** The stored-component slice level-up reads and rewrites. */
export type LevelingComponents = Pick<ComponentRegistry, "level" | "archetypes">

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
 * carry) and +{@link ARCHETYPE_RANKS_PER_LEVEL} saved Archetype Ranks. Max HP/SP
 * and the dice maxima rise by deriving from the new level — spent pools persist.
 * Fails — without producing a patch — at {@link MAX_LEVEL} (`max-level`, checked
 * first) or with too few Victories (`insufficient-victories`).
 */
export function applyLevelUp(
  components: LevelingComponents
): Result<Pick<ComponentRegistry, "level" | "archetypes">, LevelingError> {
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
      ...archetypes,
      savedArchetypeRanks:
        archetypes.savedArchetypeRanks + ARCHETYPE_RANKS_PER_LEVEL,
    },
  })
}
