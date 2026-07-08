import type { Entity } from "@workspace/game-v2/kernel/entity"
import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game-v2/kernel/vocab"
import {
  eligibleVirtuesForRankUp,
  MAX_VIRTUE_RANK,
  SPARK_LOG_CAPACITY,
  sparkLogBreakdown,
} from "@workspace/game-v2/virtues"

/**
 * The Explore tab's **Virtues card** view model (S2b — UNN-558): the four rank
 * rows plus everything the Spark loop's controls read — the log fill, the
 * per-Virtue breakdown line, and rank-up eligibility. Virtues are authored
 * progression state (no resolved read-unit exists — the rail's Level/Victories
 * precedent), so the builder shapes off the entity; the eligibility/breakdown
 * *derivation* stays in the engine (`spark.ts`), this only arranges it.
 */
export interface VirtuesCardView {
  /** One row per Virtue, {@link VIRTUE_KEYS} order. */
  rows: { virtue: VirtueKey; rank: number }[]
  /** The Virtue rank ceiling (segments per rank bar). */
  maxRank: number
  sparkCount: number
  sparkCapacity: number
  /** The "Wisdom ×2, Empathy ×1" line — empty when the log is. */
  breakdown: { virtue: VirtueKey; count: number }[]
  /** Full log — the card's action swaps from Add Spark to Rank Up. */
  logFull: boolean
  /** Virtues eligible for rank-up (in a full log), {@link VIRTUE_KEYS} order. */
  eligible: VirtueKey[]
  /** Virtues already at {@link MAX_VIRTUE_RANK} — disabled in the dialog. */
  rankCapped: Record<VirtueKey, boolean>
}

export function buildVirtuesCardView(entity: Entity): VirtuesCardView {
  const virtues = entity.components.virtues ?? {
    ranks: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
    sparkLog: [],
  }
  const eligible = eligibleVirtuesForRankUp(virtues)

  return {
    rows: VIRTUE_KEYS.map((virtue) => ({
      virtue,
      rank: virtues.ranks[virtue],
    })),
    maxRank: MAX_VIRTUE_RANK,
    sparkCount: virtues.sparkLog.length,
    sparkCapacity: SPARK_LOG_CAPACITY,
    breakdown: [...sparkLogBreakdown(virtues.sparkLog)],
    logFull: virtues.sparkLog.length >= SPARK_LOG_CAPACITY,
    eligible: VIRTUE_KEYS.filter((virtue) => eligible.has(virtue)),
    rankCapped: Object.fromEntries(
      VIRTUE_KEYS.map((virtue) => [
        virtue,
        virtues.ranks[virtue] >= MAX_VIRTUE_RANK,
      ])
    ) as Record<VirtueKey, boolean>,
  }
}
