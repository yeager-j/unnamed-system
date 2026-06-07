import { getArchetype } from "@workspace/game/data/archetypes/registry"
import { getEquippableItem } from "@workspace/game/data/items/registry"
import { getSkill } from "@workspace/game/data/skills/registry"
import { hasUnlockedRank } from "@workspace/game/engine/archetypes/rank"
import type {
  ActiveMechanic,
  StatContext,
} from "@workspace/game/engine/character/stats/stats"
import { getMechanic } from "@workspace/game/engine/mechanics/registry"
import { type HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import {
  type InheritanceSlots,
  type ManualBonuses,
  type PathChoice,
} from "@workspace/game/foundation/character/state"
import { type EquippableItem } from "@workspace/game/foundation/items/schema"
import { type MechanicState } from "@workspace/game/foundation/mechanics/schema"

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

function activeSkillsFor(
  active: PersistedArchetypeState,
  equippedItems: readonly EquippableItem[]
): StatContext["activeSkills"] {
  const archetype = getArchetype(active.archetypeKey)
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
    if (slot.skillKey) keys.add(slot.skillKey)
  }
  for (const item of equippedItems) {
    for (const effect of item.equip.effects ?? []) {
      if (effect.type === "skill") keys.add(effect.skillKey)
    }
  }

  return [...keys]
    .map((key) => getSkill(key))
    .filter((skill) => skill !== undefined)
}

/**
 * Resolves the active Archetype's mechanic state, falling back to the
 * mechanic's `initialState` when the row's `mechanicState` is null and the
 * Archetype has a declared mechanic. Returns null when there is no active
 * Archetype or the Archetype has no mechanic.
 */
function activeMechanicFor(
  active: PersistedArchetypeState | undefined
): ActiveMechanic | null {
  if (!active) return null

  const archetype = getArchetype(active.archetypeKey)
  if (!archetype?.mechanic) return null

  const mechanic = getMechanic(archetype.mechanic)
  if (!mechanic) return null

  const state = active.mechanicState ?? mechanic.initialState()
  return { kind: archetype.mechanic, state }
}

/**
 * Reconstructs the pure {@link StatContext} from a hydrated
 * character. The single shared row→engine mapping so engine callers (e.g. the
 * rest wrapper) need not re-hand-roll it.
 */
export function toStatContext(character: HydratedCharacter): StatContext {
  return buildStatContext(
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

export function buildStatContext(
  character: PersistedCharacterState,
  archetypes: readonly PersistedArchetypeState[],
  equippedItemKeys: readonly string[]
): StatContext {
  const active = archetypes.find(
    (a) => a.id === character.activeCharacterArchetypeId
  )

  const equippedItems = equippedItemKeys
    .map((key) => getEquippableItem(key))
    .filter((item) => item !== undefined)

  return {
    pathChoice: character.pathChoice,
    level: character.level,
    manualBonuses: character.manualBonuses,
    activeArchetypeKey: active?.archetypeKey ?? null,
    archetypes: archetypes.map((a) => ({ key: a.archetypeKey, rank: a.rank })),
    equippedItems,
    activeSkills: active ? activeSkillsFor(active, equippedItems) : [],
    activeMechanic: activeMechanicFor(active),
  }
}
