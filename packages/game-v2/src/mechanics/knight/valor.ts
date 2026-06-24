import { z } from "zod/v4"

import type {
  MechanicDefinition,
  MechanicEffect,
} from "@workspace/game-v2/mechanics/definition"

/**
 * Knight — Valor. A 0–7 counter built by acting as the party's bulwark (rulebook
 * `Valor.md`). Crossing each threshold unlocks a benefit; only the 3+ threshold is
 * engine-visible — it emits the {@link MechanicEffect} affinity override the
 * resolve fold applies. The others are narrative, surfaced on the widget.
 */
export const VALOR_MAX = 7

export const valorStateSchema = z.object({
  kind: z.literal("valor"),
  value: z.number().int().min(0).max(VALOR_MAX),
})
export type ValorState = z.infer<typeof valorStateSchema>

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

/**
 * Pure transition the owner-mode stepper composes through the persistence layer.
 * Co-located with the definition so game logic stays out of the UI and DB wrapper.
 */
export function adjustValor(state: ValorState, delta: number): ValorState {
  const value = Math.max(0, Math.min(VALOR_MAX, state.value + delta))
  return { ...state, value }
}

export const valor: MechanicDefinition<ValorState> = {
  kind: "valor",
  displayName: "Valor",
  tagline: "Build a 0–7 Valor counter by acting as the bulwark of your party.",
  description: `You have a Valor score (max 7), which accumulates as you act as the heroic bulwark of your party. Some Skills gain additional effects by consuming Valor. You also gain the following benefits provided your Valor meets the threshold:

- \`1+\`: If the Attack Roll of your opportunity attack is 11+ and you deal damage, the target's Move action fails.
- \`2+\`: Enemies must make a saving throw to successfully Disengage with you.
- \`3+\`: Your affinities for Slash, Pierce, and Strike become Resist.
- \`4+\`: You are not Downed by receiving damage to your Weakness.
- \`5+\`: If the Attack Roll of your opportunity attack is 20+ and you deal damage, the target is Downed.

***Knight's Protection.*** When an enemy targets an ally within your Zone for an attack, you can choose to redirect any damage and side effects to yourself. If you do so, you gain 2 Valor. If you do not do so, you lose 1 Valor.`,
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
