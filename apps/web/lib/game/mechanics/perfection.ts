import { z } from "zod/v4"
import type { MechanicDefinition, MechanicEffect } from "./types"

/**
 * Warrior — Perfection. A linear chain D → C → B → A → S that climbs on hits
 * and resets when the Warrior is downed or the encounter ends (rulebook
 * `Skills/Mechanics/Perfection.md`). Each step above D adds +1 to the Warrior's
 * Attack Rolls (max +4 at S).
 *
 * State is just the current step. Display labels and the per-step Attack
 * bonus are co-located here so the widget and the engine read the same source.
 */

/** Display labels per rank index, D → S. */
export const PERFECTION_RANK_LABELS = ["D", "C", "B", "A", "S"] as const
export type PerfectionRankLabel = (typeof PERFECTION_RANK_LABELS)[number]

/** Attack Roll bonus per rank index (D contributes nothing). */
export const PERFECTION_ATTACK_BONUSES = [0, 1, 2, 3, 4] as const

export const perfectionStateSchema = z.object({
  kind: z.literal("perfection"),
  rank: z.number().int().min(0).max(4),
})

export type PerfectionState = z.infer<typeof perfectionStateSchema>

export function rankLabel(rank: PerfectionState["rank"]): PerfectionRankLabel {
  return PERFECTION_RANK_LABELS[rank] ?? "D"
}

export function attackBonusForRank(rank: PerfectionState["rank"]): number {
  return PERFECTION_ATTACK_BONUSES[rank] ?? 0
}

export const perfection: MechanicDefinition<PerfectionState> = {
  kind: "perfection",
  displayName: "Perfection",
  schema: perfectionStateSchema,
  initialState: () => ({ kind: "perfection", rank: 0 }),
  effects(state): MechanicEffect[] {
    const amount = attackBonusForRank(state.rank)
    if (amount === 0) return []
    return [
      {
        type: "attackRoll",
        amount,
        source: `Perfection (${rankLabel(state.rank)})`,
      },
    ]
  },
  resetOn: "encounter",
}
