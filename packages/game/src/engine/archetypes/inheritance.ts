import { hasUnlockedRank } from "@workspace/game/engine/archetypes/rank"
import type {
  ArchetypeEntry,
  RankedSkill,
} from "@workspace/game/engine/archetypes/utils"
import type { Archetype } from "@workspace/game/foundation/archetypes/schema"

/**
 * Inheritance Slot configuration (PRD §7.8). A slot on one unlocked Archetype
 * holds a single Skill inherited from **another** unlocked Archetype, chosen
 * from that source's Skills available at the character's current Rank in it.
 * Synthesis Skills cannot be inherited.
 *
 * The two helpers here are the single source of truth the whole feature shares:
 * {@link isInheritableSkill} backs both the write-path validation and the
 * read-side "is this configured slot still valid?" flag, and
 * {@link inheritanceSourceGroups} shapes the owner-mode picker's options.
 */

/**
 * Whether `skillKey` is a Skill the `source` Archetype offers for inheritance
 * at `sourceRank`: one of its Rank-keyed Skills (the Synthesis Skill lives on
 * `synthesisSkill`, not `skills`, so it is excluded by construction) whose
 * required Rank the source has unlocked.
 */
export function isInheritableSkill(
  source: Archetype,
  sourceRank: number,
  skillKey: string
): boolean {
  return source.skills.some(
    (reference) =>
      reference.skill === skillKey &&
      hasUnlockedRank(sourceRank, reference.rank)
  )
}

/** One source Archetype's inheritable Skills, as the slot picker groups them. */
export interface InheritanceSourceGroup {
  /** The source `characterArchetype` row id a chosen slot will point at. */
  sourceCharacterArchetypeId: string
  archetype: Archetype
  /** The source Archetype's current Rank — the gate on `skills`. */
  rank: number
  /** Rank-keyed Skills unlocked at the source's current Rank (no Synthesis). */
  skills: RankedSkill[]
}

/**
 * Builds the owner-mode slot picker's option groups for the Archetype whose row
 * is `ownerRowId`: every **other** unlocked Archetype, each with the Skills it
 * makes available for inheritance at its current Rank. Reuses the already
 * resolved {@link ArchetypeEntry.ranks} (Synthesis Skills are tracked
 * separately and never appear there) so no catalog or cost work repeats.
 * Sources with no available Skills are dropped — they offer nothing to pick.
 */
export function inheritanceSourceGroups(
  entries: ArchetypeEntry[],
  ownerRowId: string
): InheritanceSourceGroup[] {
  return entries
    .filter((entry) => entry.row.id !== ownerRowId)
    .map((entry) => ({
      sourceCharacterArchetypeId: entry.row.id,
      archetype: entry.archetype,
      rank: entry.row.rank,
      skills: entry.ranks.filter((ranked) =>
        hasUnlockedRank(entry.row.rank, ranked.rank)
      ),
    }))
    .filter((group) => group.skills.length > 0)
}
