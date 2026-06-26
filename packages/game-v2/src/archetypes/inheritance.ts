import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { ArchetypeEntry } from "@workspace/game-v2/archetypes/display"
import { hasUnlockedRank } from "@workspace/game-v2/archetypes/rank"
import type { ResolvedArchetypeSkill } from "@workspace/game-v2/archetypes/resolved-skill"

/**
 * Inheritance Slot resolution (PRD §7.8, ported from v1 `engine/archetypes/
 * inheritance.ts`). A slot on one unlocked Archetype holds a single Skill inherited
 * from **another** unlocked Archetype, chosen from that source's Skills available at
 * the character's current Rank in it. Synthesis Skills cannot be inherited.
 *
 * {@link isInheritableSkill} is the single source of truth the whole feature shares:
 * it backs both the write-path validation (the picker) and the read-side "is this
 * configured slot still valid?" flag (`display.ts`'s resolved slot). It is already
 * key/rank-shaped — no `characterArchetype` row coupling — so it ports verbatim;
 * v2's only change is that callers key the source by Archetype **key**, not row id.
 */

/**
 * Whether `skillKey` is a Skill the `source` Archetype offers for inheritance at
 * `sourceRank`: one of its Rank-keyed Skills (the Synthesis Skill lives on
 * `synthesisSkill`, not `skills`, so it is excluded by construction) whose required
 * Rank the source has unlocked (`>=`, D1/G2).
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
  /** The source Archetype **key** a chosen slot will point at (v2 keys by key). */
  sourceArchetypeKey: string
  archetype: Archetype
  /** The source Archetype's current Rank — the gate on its `skills`. */
  rank: number
  /** Rank-keyed Skills unlocked at the source's current Rank (no Synthesis). */
  skills: ResolvedArchetypeSkill[]
}

/**
 * Builds the owner-mode slot picker's option groups for the Archetype keyed
 * `ownerKey`: every **other** unlocked Archetype, each with the Skills it offers for
 * inheritance at its current Rank (D2). Reuses the already-resolved
 * {@link ArchetypeEntry.ranks} (Synthesis is tracked separately and never appears
 * there) so no catalog/cost work repeats. Sources with no available Skill are dropped.
 */
export function inheritanceSourceGroups(
  entries: ArchetypeEntry[],
  ownerKey: string
): InheritanceSourceGroup[] {
  return entries
    .filter((entry) => entry.key !== ownerKey)
    .map((entry) => ({
      sourceArchetypeKey: entry.key,
      archetype: entry.archetype,
      rank: entry.rank,
      skills: entry.ranks.filter((ranked) =>
        hasUnlockedRank(entry.rank, ranked.rank)
      ),
    }))
    .filter((group) => group.skills.length > 0)
}
