import type { ArchetypeBase } from "@workspace/game-v2/archetypes"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { PathChoice } from "@workspace/game-v2/kernel/vocab"
import type { ManualBonuses } from "@workspace/game-v2/progression/manual-bonuses.schema"

/**
 * Fixture builders for the derivation tests (UNN-500). Inputs are authored here,
 * not pulled from the real catalog, so the unit/integration tests assert
 * *behavior* (clamp, precedence, the formula) against controlled numbers rather
 * than balance data — the engine's fixture-first discipline (UNN-352). The
 * golden-master reuses the same shapes to drive both engines.
 */

/** A fixture {@link ArchetypeBase} — zeros/empty by default; override per test. */
export function makeArchetype(
  overrides: Partial<ArchetypeBase> = {}
): ArchetypeBase {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "attribute", amount: 0, attribute: "strength" },
    lineage: "warrior",
    ...overrides,
  }
}

/** A fixture `GameData` backed by an in-memory archetype map, keyed by slug. */
export function makeTestGameData(
  archetypes: Record<string, ArchetypeBase> = {}
): GameData {
  return {
    getArchetype: (key) => archetypes[key],
  }
}

/** Options for {@link makeDerivedEntity}. */
export interface DerivedEntityOptions {
  id?: string
  name?: string
  level?: number
  pathChoice?: PathChoice
  active?: string | null
  roster?: ReadonlyArray<{ key: string; rank: number }>
  manualBonuses?: ManualBonuses
}

/**
 * A PC entity whose stat capabilities all read `derived` — the shape `resolve`
 * turns into numbers. Sensible defaults (L1, balanced, no archetype/bonuses);
 * override to exercise a case.
 */
export function makeDerivedEntity(options: DerivedEntityOptions = {}): Entity {
  const {
    id = "fixture-pc",
    name = "Fixture",
    level = 1,
    pathChoice = "balanced",
    active = null,
    roster = active ? [{ key: active, rank: 1 }] : [],
    manualBonuses = {},
  } = options

  return {
    id,
    components: {
      identity: { name },
      progression: { level, pathChoice },
      archetypes: {
        active,
        origin: active,
        savedArchetypeRanks: 0,
        roster: [...roster],
      },
      manualBonuses,
      attributes: { source: { kind: "derived" } },
      affinities: { source: { kind: "derived" } },
      vitals: { max: { kind: "derived" } },
      skillPool: { max: { kind: "derived" } },
    },
  }
}
