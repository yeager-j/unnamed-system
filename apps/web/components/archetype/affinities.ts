import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@workspace/game-v2/kernel/vocab"

/**
 * Every non-Neutral affinity on an Archetype's chart, in canonical
 * `AFFINITY_DAMAGE_TYPES` order — the one selector behind every affinity
 * surface (the builder Origin card's inline highlights, the summary chip row,
 * the full-block chart). Takes only the `affinities` slice so both catalog
 * shapes satisfy it (UNN-556: the builder passes v2, the sheet passes v1), and
 * returns the `"neutral"`-excluded affinity so callers can render an
 * {@link ArchetypeAffinityChip} without re-narrowing.
 */
export function listNonNeutralAffinities(
  archetype: Pick<Archetype, "affinities">
): { type: AffinityDamageType; affinity: Exclude<Affinity, "neutral"> }[] {
  return AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })
}
