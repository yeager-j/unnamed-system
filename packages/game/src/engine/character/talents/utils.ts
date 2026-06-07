import {
  type ArchetypeLookup,
  type TalentLookup,
} from "@workspace/game/engine/ports"
import { type TalentKey } from "@workspace/game/foundation/character/talents/schema"

/**
 * The character's full Talent roster, derived rather than stored. Per rulebook
 * 2.1 Talent Tests, a character's Talents come from three sources:
 *
 *   1. The **active Archetype** (e.g. Warrior grants Climb, Lift, Athletics).
 *   2. The character's **Background**, persisted into `gainedTalents` by the
 *      builder. Background is a free-text field in MVP, so background- and
 *      downtime-gained Talents are indistinguishable in storage.
 *   3. **Downtime learning**, also persisted into `gainedTalents`.
 *
 * Only the active Archetype contributes — switching Archetypes at Respite
 * naturally swaps the derived set. Talents are binary (the +3 bonus applies
 * once regardless of how many sources grant the same Talent), so the union is
 * deduplicated. The returned list is sorted alphabetically by display name so
 * consumers can render it as-is.
 */
export function resolveTalents(
  gainedTalents: TalentKey[],
  activeArchetypeKey: string | null,
  lookups: Pick<ArchetypeLookup, "getArchetype"> & TalentLookup
): TalentKey[] {
  const archetypeTalents = activeArchetypeKey
    ? (lookups.getArchetype(activeArchetypeKey)?.talents ?? [])
    : []
  return [...new Set([...gainedTalents, ...archetypeTalents])].sort((a, b) =>
    (lookups.getTalent(a)?.name ?? a).localeCompare(
      lookups.getTalent(b)?.name ?? b
    )
  )
}
