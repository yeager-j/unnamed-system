import { z } from "zod/v4"
import type { MechanicDefinition, MechanicEffect } from "./types"

/**
 * Knight — Valor. A 0–7 counter built up by acting as a bulwark for the party
 * (rulebook `Skills/Mechanics/Valor.md`). Crossing each threshold unlocks a
 * passive benefit:
 *
 * - 1+: opportunity attacks at 11+ deny the target's Move
 * - 2+: enemies must save to Disengage
 * - 3+: Slash / Pierce / Strike affinities become Resist
 * - 4+: damage to a Weakness no longer Downs the Knight
 * - 5+: opportunity attacks at 20+ Down the target
 *
 * Only the 3+ threshold is engine-visible today — it emits {@link AffinityEffect}s
 * the existing pipeline already applies. The other thresholds are narrative
 * effects surfaced on the widget but not modelled as data.
 */

export const VALOR_MAX = 7
export const VALOR_THRESHOLDS = [1, 2, 3, 4, 5] as const

export const VALOR_THRESHOLD_DESCRIPTIONS: Record<
  (typeof VALOR_THRESHOLDS)[number],
  string
> = {
  1: "Opportunity attack at 11+ denies the target's Move",
  2: "Enemies must save to Disengage from you",
  3: "Slash, Pierce, and Strike affinities become Resist",
  4: "Damage to a Weakness no longer Downs you",
  5: "Opportunity attack at 20+ Downs the target",
}

const PHYSICAL_AFFINITY_DAMAGE_TYPES = ["slash", "pierce", "strike"] as const

export const valorStateSchema = z.object({
  kind: z.literal("valor"),
  value: z.number().int().min(0).max(VALOR_MAX),
})

export type ValorState = z.infer<typeof valorStateSchema>

export const valor: MechanicDefinition<ValorState> = {
  kind: "valor",
  displayName: "Valor",
  schema: valorStateSchema,
  initialState: () => ({ kind: "valor", value: 0 }),
  effects(state): MechanicEffect[] {
    if (state.value < 3) return []
    return [
      {
        type: "affinity",
        damageTypes: [...PHYSICAL_AFFINITY_DAMAGE_TYPES],
        affinity: "resist",
        source: `Valor (${state.value})`,
      },
    ]
  },
  resetOn: "encounter",
}
