import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import {
  AFFINITY_DAMAGE_TYPES,
  type Affinity,
  type AffinityDamageType,
} from "@workspace/game-v2/kernel/vocab"

/**
 * The Combat tab's **affinity strip** (design handoff "Affinity strip"): one
 * cell per resistible damage type, in the canonical rulebook order. An entity
 * with no resolved affinity chart reads all-neutral — the strip renders the
 * same shape either way.
 */
export interface AffinityStripCell {
  type: AffinityDamageType
  affinity: Affinity
}

export function buildAffinityStrip(
  resolved: ResolvedEntity
): AffinityStripCell[] {
  const chart = resolved.components.affinities
  return AFFINITY_DAMAGE_TYPES.map((type) => ({
    type,
    affinity: chart?.[type] ?? "neutral",
  }))
}
