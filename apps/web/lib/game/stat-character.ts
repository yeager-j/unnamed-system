import { getArchetype } from "./archetypes"
import type { InheritanceSlots, ManualBonuses, PathChoice } from "./character"
import { getEquippableItem } from "./items"
import { getSkill } from "./skills"
import type { StatComputationCharacter } from "./stats"

/**
 * Assembles the pure {@link StatComputationCharacter} the derived-value engine
 * consumes from a character's persisted state. This is the one place the
 * Rank/inheritance Skill selection lives, so neither the (pure) stats
 * functions nor every call site has to re-derive it.
 *
 * Pure and storage-agnostic: it takes plain persisted values (not DB rows or a
 * client) and resolves keys against the hardcoded catalogs, so it is unit
 * testable without a database. The thin query wrapper that feeds it lives in
 * `lib/db/character.ts`.
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
}

function activeSkillsFor(
  active: PersistedArchetypeState
): StatComputationCharacter["activeSkills"] {
  const archetype = getArchetype(active.archetypeKey)
  if (!archetype) return []

  const keys = new Set<string>()

  for (const ref of archetype.skills) {
    if (ref.rank <= active.rank) keys.add(ref.skill)
  }
  if (
    archetype.synthesisSkill &&
    active.rank >= archetype.synthesisSkill.rank
  ) {
    keys.add(archetype.synthesisSkill.skill)
  }
  for (const slot of active.inheritanceSlots) {
    if (slot.skillKey) keys.add(slot.skillKey)
  }

  return [...keys]
    .map((key) => getSkill(key))
    .filter((skill) => skill !== undefined)
}

export function buildStatComputationCharacter(
  character: PersistedCharacterState,
  archetypes: readonly PersistedArchetypeState[],
  equippedItemKeys: readonly string[]
): StatComputationCharacter {
  const active = archetypes.find(
    (a) => a.id === character.activeCharacterArchetypeId
  )

  return {
    pathChoice: character.pathChoice,
    level: character.level,
    manualBonuses: character.manualBonuses,
    activeArchetypeKey: active?.archetypeKey ?? null,
    archetypes: archetypes.map((a) => ({ key: a.archetypeKey, rank: a.rank })),
    equippedItems: equippedItemKeys
      .map((key) => getEquippableItem(key))
      .filter((item) => item !== undefined),
    activeSkills: active ? activeSkillsFor(active) : [],
  }
}
