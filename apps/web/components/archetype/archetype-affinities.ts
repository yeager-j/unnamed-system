import { AFFINITY_DAMAGE_TYPES } from "@/lib/game/affinity"
import type { Archetype } from "@/lib/game/archetypes/schema"

/**
 * Whether an Archetype's chart has any non-Neutral Affinity entries. Used by
 * compact list surfaces to decide whether to render an Affinities section at
 * all — an all-Neutral chart has nothing to chip up.
 */
export function hasNonNeutralAffinities(archetype: Archetype): boolean {
  return AFFINITY_DAMAGE_TYPES.some((type) => {
    const affinity = archetype.affinities[type]
    return affinity !== undefined && affinity !== "neutral"
  })
}
