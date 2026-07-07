import type { Archetype } from "@workspace/game-v2/archetypes"
import type { InventoryItemState } from "@workspace/game-v2/items/equipment.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type {
  AttributeScores,
  PartialAffinityChart,
  PathChoice,
} from "@workspace/game-v2/kernel/vocab"
import type { Mechanics } from "@workspace/game-v2/mechanics/mechanics.schema"
import type { ManualBonuses } from "@workspace/game-v2/progression/manual-bonuses.schema"

/**
 * Fixture builders for the derivation tests (UNN-500). Inputs are authored here,
 * not pulled from the real catalog, so the unit/integration tests assert
 * *behavior* (clamp, precedence, the formula) against controlled numbers rather
 * than balance data — the engine's fixture-first discipline (UNN-352). The
 * golden-master reuses the same shapes to drive both engines.
 */

/** A fixture {@link Archetype} — zeros/empty by default; override per test. The
 *  base-derivation tests touch only the `ArchetypeBase` slice; the catalog metadata
 *  carries inert defaults so the same builder serves the display/Atlas fixtures. */
export function makeArchetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "attribute", amount: 0, attribute: "strength" },
    lineage: "warrior",
    key: "fixture",
    name: "Fixture",
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents: [],
    skills: [],
    ...overrides,
  }
}

/** A fixture `GameData` backed by an in-memory archetype map, keyed by slug. */
export function makeTestGameData(
  archetypes: Record<string, Archetype> = {}
): GameData {
  return {
    getArchetype: (key) => archetypes[key],
    allArchetypes: () => Object.values(archetypes),
    // Items/Skills default to empty (PR5). A test needing item/skill content spreads
    // `makeItemLookups({...})` (items/__fixtures__) over this.
    getItem: () => undefined,
    getEquippableItem: () => undefined,
    getSkill: () => undefined,
    getEnemy: () => undefined,
    startingWeaponForLineage: () => undefined,
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
  /** Authored HP depletion (signed; negative = over-max). Default 0 (full HP). */
  damage?: number
  /** Authored SP depletion. Default 0 (full SP). */
  spSpent?: number
  /** Authored consumable `used` counts (omit ⇒ no Resources component). */
  resources?: {
    hitDiceUsed?: number
    skillDiceUsed?: number
    prismaUsed?: number
  }
  /** Authored Exhaustion level 0–6 (omit ⇒ no Exhaustion component). */
  exhaustion?: number
  /** Authored per-mechanic state (omit ⇒ no Mechanics component). */
  mechanics?: Mechanics["states"]
  /** Authored inventory rows (omit ⇒ no Equipment component). */
  equipment?: InventoryItemState[]
}

/**
 * A PC entity (D37): a zeros/neutral/0 `base` on every stat capability, with the
 * `Progression` + `Archetypes` layers supplying the real values `resolve` folds.
 * Sensible defaults (L1, balanced, no archetype/bonuses); override to exercise a case.
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
    damage = 0,
    spSpent = 0,
    resources,
    exhaustion,
    mechanics,
    equipment,
  } = options

  return {
    id,
    components: {
      identity: { name },
      level: { value: level, victories: 0 },
      path: { choice: pathChoice },
      archetypes: {
        active,
        origin: active,
        savedArchetypeRanks: 0,
        roster: roster.map((entry) => ({ ...entry, inheritanceSlots: [] })),
      },
      manualBonuses,
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      affinities: { base: {} },
      vitals: { base: 0, damage },
      skillPool: { base: 0, spSpent },
      // A leveled PC always carries its consumable spend-state (full = zeros).
      resources: {
        hitDiceUsed: resources?.hitDiceUsed ?? 0,
        skillDiceUsed: resources?.skillDiceUsed ?? 0,
        prismaUsed: resources?.prismaUsed ?? 0,
      },
      ...(exhaustion !== undefined
        ? { exhaustion: { level: exhaustion } }
        : {}),
      ...(mechanics !== undefined ? { mechanics: { states: mechanics } } : {}),
      ...(equipment !== undefined ? { equipment: { items: equipment } } : {}),
    },
  }
}

/** Options for {@link makeFlatEntity}. */
export interface FlatEntityOptions {
  id?: string
  name?: string
  attributes?: AttributeScores
  affinities?: PartialAffinityChart
  maxHP?: number
  maxSP?: number
  /** Authored HP depletion (signed; negative = over-max). Default 0 (full HP). */
  damage?: number
  /** Authored SP depletion. Default 0 (full SP). */
  spSpent?: number
  /**
   * Authored per-mechanic state (omit ⇒ no Mechanics component). With no
   * `Archetypes` layer present, every mechanic here is always-on (D36 — an enemy's
   * Arcana-swap / mechanic needs no archetype gating).
   */
  mechanics?: Mechanics["states"]
}

/**
 * An enemy-like entity (D37): an **authored** `base` on each capability and **no**
 * `Progression`/`Archetypes` layers. Exercises the uniform fold's other side —
 * `resolve` must still apply effects (zone/mechanic/manual) on top of the authored
 * base, which the old `flat` short-circuit failed to do.
 */
export function makeFlatEntity(options: FlatEntityOptions = {}): Entity {
  const {
    id = "fixture-enemy",
    name = "Fixture Enemy",
    attributes = { strength: 2, magic: 2, agility: 2, luck: 2 },
    affinities = {},
    maxHP = 100,
    maxSP = 30,
    damage = 0,
    spSpent = 0,
    mechanics,
  } = options

  return {
    id,
    components: {
      identity: { name },
      attributes: { base: attributes },
      affinities: { base: affinities },
      vitals: { base: maxHP, damage },
      skillPool: { base: maxSP, spSpent },
      ...(mechanics !== undefined ? { mechanics: { states: mechanics } } : {}),
    },
  }
}
