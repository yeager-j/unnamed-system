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

/**
 * The 11 strip cells for any affinity chart, neutral-filled — the shared shaper
 * behind {@link buildAffinityStrip} (the resolved character) and the Archetypes
 * tab's per-Archetype strip (`archetype.affinities`, S2d — UNN-560).
 */
export function affinityCells(
  chart: Partial<Record<AffinityDamageType, Affinity>> | undefined
): AffinityStripCell[] {
  return AFFINITY_DAMAGE_TYPES.map((type) => ({
    type,
    affinity: chart?.[type] ?? "neutral",
  }))
}

export function buildAffinityStrip(
  resolved: ResolvedEntity
): AffinityStripCell[] {
  return affinityCells(resolved.components.affinities)
}
