import { hasMasteryBonus } from "@workspace/game-v2/archetypes/archetype"
import type {
  Archetypes,
  InheritanceSlot,
} from "@workspace/game-v2/archetypes/archetypes.schema"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"

/**
 * The **resolved Archetypes read-unit** `resolve` emits when an entity carries an
 * `Archetypes` component — the archetype state the character sheet (and the Atlas /
 * inheritance / display functions) read off the `ResolvedEntity` rather than the
 * authored `Entity`. The sheet renders the resolved entity, so the archetype roster
 * must travel on it; every archetypes function then takes a `ResolvedEntity` alone.
 *
 * It carries the authored roster/active/origin/savedRanks the read side needs plus
 * the two derived facts a re-walk of the catalog would otherwise recompute:
 * `activeLineage` (the active Archetype's Lineage — the attack-roll scaler's
 * self-exclusion key, see `combat/party.ts`) and per-entry `mastered` (rank ≥
 * {@link MASTERY_RANK}). Under a form, `applyForm` has already nulled `active`, so
 * `active`/`activeLineage` resolve to `null` (kit suppression) while `roster`
 * survives (inheritance + mastery persist).
 */
export interface ResolvedRosterEntry {
  key: string
  rank: number
  /** Whether this Archetype's rank confers its Mastery bonus (rank ≥ 5, C4). */
  mastered: boolean
  inheritanceSlots: InheritanceSlot[]
}

export interface ResolvedArchetypes {
  active: string | null
  origin: string | null
  savedArchetypeRanks: number
  /** The active Archetype's Lineage (`null` when no Archetype is active). */
  activeLineage: Lineage | null
  roster: ResolvedRosterEntry[]
}

/**
 * Projects the authored {@link Archetypes} component to its {@link ResolvedArchetypes}
 * read-unit — a near-passthrough that derives `activeLineage` (via the catalog) and
 * the per-entry `mastered` flag. Pure; `resolve` calls it inside the fold.
 */
export function resolveArchetypes(
  archetypes: Archetypes,
  getArchetype: (key: string) => { lineage: Lineage } | undefined
): ResolvedArchetypes {
  const activeLineage = archetypes.active
    ? (getArchetype(archetypes.active)?.lineage ?? null)
    : null

  return {
    active: archetypes.active,
    origin: archetypes.origin,
    savedArchetypeRanks: archetypes.savedArchetypeRanks,
    activeLineage,
    roster: archetypes.roster.map((entry) => ({
      key: entry.key,
      rank: entry.rank,
      mastered: hasMasteryBonus(entry.rank),
      inheritanceSlots: entry.inheritanceSlots,
    })),
  }
}
