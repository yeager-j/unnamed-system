import { z } from "zod/v4"

import type {
  MechanicDefinition,
  MechanicEffect,
} from "@workspace/game/foundation/mechanics/types"

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

/**
 * Pure transitions the owner-mode Perfection controls compose through the
 * persistence layer. Pair: a delta-clamping step (mirrors {@link adjustValor})
 * and a total reset to rank D. Both live next to the mechanic definition so
 * game logic stays out of the UI and out of the DB wrapper.
 */
export function adjustPerfection(
  state: PerfectionState,
  delta: number
): PerfectionState {
  const rank = Math.max(
    0,
    Math.min(PERFECTION_RANK_LABELS.length - 1, state.rank + delta)
  )
  return { ...state, rank }
}

export function resetPerfection(state: PerfectionState): PerfectionState {
  return { ...state, rank: 0 }
}

export const perfection: MechanicDefinition<PerfectionState> = {
  kind: "perfection",
  displayName: "Perfection",
  tagline:
    "Land Attack Rolls to climb the chain D → C → B → A → S, adding +1 to your Attack Rolls per step.",
  description: `The flawlessness of your fighting ability is represented by your Perfection, which ranges from D at the lowest to S at the highest. When you begin combat, your Perfection is set to D. When your Perfection increases or decreases, it follows the order of:

D ⇄ C ⇄ B ⇄ A ⇄ S

***Gaining Perfection.*** Your Perfection increases by 1 step when you hit an enemy with an Attack Roll. If you Down an enemy, your Perfection increases by 1 additional step.

***Losing Perfection.*** When you take damage while your Perfection is C or better, make a saving throw. On a fail, your Perfection decreases by 1 step. If you become Fallen or are Downed, your Perfection is set to D.

***Perfection Effects.*** You gain +1 to Attack Rolls for each step above D. For example, at C you gain +1 and at S you gain +4. Some Skills may gain additional effects depending on your Perfection.`,
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
