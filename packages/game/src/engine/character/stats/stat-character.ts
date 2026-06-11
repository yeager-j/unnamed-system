import { hasUnlockedRank } from "@workspace/game/engine/archetypes/rank"
import {
  baseAffinitiesForArchetype,
  baseAttributesForArchetype,
  type StatContext,
} from "@workspace/game/engine/character/stats/stats"
import { getMechanic } from "@workspace/game/engine/mechanics/registry"
import { type GameData } from "@workspace/game/engine/ports"
import { type HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import {
  type InheritanceSlots,
  type ManualBonuses,
  type PathChoice,
} from "@workspace/game/foundation/character/state"
import { type CombatantEffect } from "@workspace/game/foundation/combat/effects"
import { type EquippableItem } from "@workspace/game/foundation/items/schema"
import {
  type ActiveMechanic,
  type MechanicState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * Assembles the pure {@link StatContext} the derived-value engine
 * consumes from a character's persisted state. This is the one place the
 * Rank/inheritance Skill selection lives, so neither the (pure) stats
 * functions nor every call site has to re-derive it.
 *
 * Pure and storage-agnostic: it takes plain persisted values (not DB rows or a
 * client) and resolves keys against the hardcoded catalogs, so it is unit
 * testable without a database. The thin query wrapper that feeds it lives in
 * `lib/db/queries/load-character.ts`.
 */

/** The `characters`-row fields stat computation depends on. */
export interface PersistedCharacterState {
  pathChoice: PathChoice
  level: number
  manualBonuses: ManualBonuses
  /** `characters.activeArchetypeId` — the surrogate id of a row below, or null. */
  activeCharacterArchetypeId: string | null
}

/** One unlocked Archetype's persisted state (`characterArchetype` row). */
export interface PersistedArchetypeState {
  /** Surrogate id; matched against {@link PersistedCharacterState.activeCharacterArchetypeId}. */
  id: string
  archetypeKey: string
  rank: number
  inheritanceSlots: InheritanceSlots
  /** Per-row state for the Archetype's unique mechanic (e.g. Perfection rank).
   *  Null when the player has never set state on this Archetype's mechanic. */
  mechanicState: MechanicState | null
}

/** The catalog slice {@link buildStatContext} (and {@link toStatContext}) read. */
export type StatContextLookups = Pick<
  GameData,
  "getArchetype" | "getSkill" | "getEquippableItem"
>

function activeSkillsFor(
  active: PersistedArchetypeState,
  equippedItems: readonly EquippableItem[],
  lookups: Pick<GameData, "getArchetype" | "getSkill">
): StatContext["activeSkills"] {
  const archetype = lookups.getArchetype(active.archetypeKey)
  if (!archetype) return []

  const keys = new Set<string>()

  for (const ref of archetype.skills) {
    if (hasUnlockedRank(active.rank, ref.rank)) keys.add(ref.skill)
  }
  if (
    archetype.synthesisSkill &&
    hasUnlockedRank(active.rank, archetype.synthesisSkill.rank)
  ) {
    keys.add(archetype.synthesisSkill.skill)
  }
  for (const slot of active.inheritanceSlots) {
    // Stryker disable next-line ConditionalExpression: equivalent — an empty slot.skillKey resolves to undefined via getSkill and is dropped by the filter below, so always-adding changes nothing.
    if (slot.skillKey) keys.add(slot.skillKey)
  }
  for (const item of equippedItems) {
    // Stryker disable next-line ArrayDeclaration: equivalent — a seeded junk element has no `type === "skill"`, so the guard below drops it.
    for (const effect of item.equip.effects ?? []) {
      // Stryker disable next-line ConditionalExpression: equivalent — a non-skill effect has no skillKey, so adding it adds `undefined`, which getSkill drops via the filter below.
      if (effect.type === "skill") keys.add(effect.skillKey)
    }
  }

  return [...keys]
    .map((key) => lookups.getSkill(key))
    .filter((skill) => skill !== undefined)
}

/**
 * Resolves the active Archetype's mechanic state, falling back to the
 * mechanic's `initialState` when the row's `mechanicState` is null and the
 * Archetype has a declared mechanic. Returns null when there is no active
 * Archetype or the Archetype has no mechanic.
 */
function activeMechanicFor(
  active: PersistedArchetypeState | undefined,
  lookups: Pick<GameData, "getArchetype">
): ActiveMechanic | null {
  if (!active) return null

  const archetype = lookups.getArchetype(active.archetypeKey)
  if (!archetype?.mechanic) return null

  const mechanic = getMechanic(archetype.mechanic)
  // Stryker disable next-line ConditionalExpression: equivalent — `archetype.mechanic` is a closed `MechanicKind` union and the mechanics registry is exhaustive over it, so getMechanic never misses for a real Archetype; this guards only runtime-corrupt data (untypeable without a cast). Not the catalog-globalness UNN-354 removes.
  if (!mechanic) return null

  const state = active.mechanicState ?? mechanic.initialState()
  return { kind: archetype.mechanic, state }
}

/**
 * Reconstructs the pure {@link StatContext} from a hydrated
 * character. The single shared row→engine mapping so engine callers (e.g. the
 * rest wrapper) need not re-hand-roll it.
 */
export function toStatContext(lookups: StatContextLookups) {
  return (character: HydratedCharacter): StatContext =>
    buildStatContext(lookups)(
      {
        pathChoice: character.pathChoice,
        level: character.level,
        manualBonuses: character.manualBonuses,
        activeCharacterArchetypeId: character.activeArchetypeId,
      },
      character.archetypeRows.map((archetype) => ({
        id: archetype.id,
        archetypeKey: archetype.archetypeKey,
        rank: archetype.rank,
        inheritanceSlots: archetype.inheritanceSlots,
        mechanicState: archetype.mechanicState,
      })),
      character.inventory
        .filter((item) => item.equipped)
        .map((item) => item.catalogItemKey)
    )
}

export function buildStatContext(lookups: StatContextLookups) {
  return (
    character: PersistedCharacterState,
    archetypes: readonly PersistedArchetypeState[],
    equippedItemKeys: readonly string[],
    contextEffects: readonly CombatantEffect[] = []
  ): StatContext => {
    const active = archetypes.find(
      (a) => a.id === character.activeCharacterArchetypeId
    )

    const equippedItems = equippedItemKeys
      .map((key) => lookups.getEquippableItem(key))
      .filter((item) => item !== undefined)

    const activeArchetypeKey = active?.archetypeKey ?? null
    const activeArchetype = activeArchetypeKey
      ? lookups.getArchetype(activeArchetypeKey)
      : undefined

    return {
      pathChoice: character.pathChoice,
      level: character.level,
      manualBonuses: character.manualBonuses,
      activeArchetypeKey,
      activeLineage: activeArchetype?.lineage ?? null,
      archetypes: archetypes.flatMap((a) => {
        const archetype = lookups.getArchetype(a.archetypeKey)
        return archetype
          ? [{ key: a.archetypeKey, rank: a.rank, mastery: archetype.mastery }]
          : []
      }),
      equippedItems,
      activeSkills: active
        ? activeSkillsFor(active, equippedItems, lookups)
        : [],
      activeMechanic: activeMechanicFor(active, lookups),
      baseAttributes: baseAttributesForArchetype(activeArchetype),
      baseAffinities: baseAffinitiesForArchetype(activeArchetype),
      contextEffects,
    }
  }
}
