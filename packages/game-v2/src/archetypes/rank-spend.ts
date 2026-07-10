import { MASTERY_RANK } from "@workspace/game-v2/archetypes/archetype"
import { unmetPrerequisites } from "@workspace/game-v2/archetypes/atlas"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

/**
 * Spending a banked Saved Archetype Rank (the Lineage Atlas growth loop, rulebook
 * 1.6). Homed in its own module rather than the zero-dependency `rank.ts`, since
 * it composes the catalog (`getArchetype`) plus the prerequisite and Mastery
 * rules — the rank *economy*, not a bare rank predicate.
 */

/** The failure modes of a rank spend. Capability presence is the Writer's check. */
export type SpendArchetypeRankError =
  | "no-saved-ranks"
  | "invalid-input"
  | "prerequisites-not-met"
  | "rank-capped"

/**
 * Spends one Saved Rank on `archetypeKey`. One op covers both moves the roster
 * decides between (rule #9): an un-owned key **unlocks** at Rank 1, prerequisites
 * permitting; an owned key **ranks up** toward Mastery ({@link MASTERY_RANK}).
 * Refuses `no-saved-ranks` (nothing to spend), `invalid-input` (unknown key on
 * unlock), `prerequisites-not-met`, or `rank-capped` (already at Mastery) —
 * without producing a patch. Returns the whole updated `archetypes` component
 * (UNN-601); curried deps-first, bound in the composition root.
 */
export function applySpendArchetypeRank(deps: Pick<GameData, "getArchetype">) {
  return (
    components: Pick<ComponentRegistry, "archetypes">,
    archetypeKey: string
  ): Result<Pick<ComponentRegistry, "archetypes">, SpendArchetypeRankError> => {
    const { archetypes } = components
    if (archetypes.savedArchetypeRanks <= 0) return err("no-saved-ranks")

    const owned = archetypes.roster.find((entry) => entry.key === archetypeKey)

    if (owned === undefined) {
      const archetype = deps.getArchetype(archetypeKey)
      if (archetype === undefined) return err("invalid-input")
      const ownedRankByKey = new Map(
        archetypes.roster.map((entry) => [entry.key, entry.rank])
      )
      if (unmetPrerequisites(archetype, ownedRankByKey).length > 0) {
        return err("prerequisites-not-met")
      }
      return ok({
        archetypes: {
          ...archetypes,
          savedArchetypeRanks: archetypes.savedArchetypeRanks - 1,
          roster: [
            ...archetypes.roster,
            { key: archetypeKey, rank: 1, inheritanceSlots: [] },
          ],
        },
      })
    }

    if (owned.rank >= MASTERY_RANK) return err("rank-capped")
    return ok({
      archetypes: {
        ...archetypes,
        savedArchetypeRanks: archetypes.savedArchetypeRanks - 1,
        roster: archetypes.roster.map((entry) =>
          entry.key === archetypeKey
            ? { ...entry, rank: entry.rank + 1 }
            : entry
        ),
      },
    })
  }
}
