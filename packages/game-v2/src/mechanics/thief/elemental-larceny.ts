import { z } from "zod/v4"

import type { MechanicDefinition } from "@workspace/game-v2/mechanics/definition"

/**
 * Elemental Thief — Elemental Larceny. A thief's-eye twist on Thief's Insight: you
 * still **Study** targets to learn Tells, but you can also **Mark** them —
 * spending Tells to plant a Weakness the party can exploit (rulebook
 * `Thief's Insight.md`). Like Thief's Insight, Tells and planted Weaknesses are
 * tracked at the table, so the mechanic is display-only (discriminant only).
 */
export const elementalLarcenyStateSchema = z.object({
  kind: z.literal("elemental-larceny"),
})
export type ElementalLarcenyState = z.infer<typeof elementalLarcenyStateSchema>

export const elementalLarceny: MechanicDefinition<ElementalLarcenyState> = {
  kind: "elemental-larceny",
  displayName: "Elemental Larceny",
  tagline:
    "Study enemies to learn Tells, then spend them to plant a Weakness the party can exploit.",
  description: `By studying your targets you learn their **Tells**. The number of Tells you can learn about a single enemy is equal to your Elemental Thief Archetype Rank.

***Tell Benefits.*** You gain \`+1\` to your Attack Rolls for each Tell on the attack target. Additionally, if you learn 2 Tells, the DM will tell you one of that target's Weaknesses (if it has one).

***Suspicion.*** Some of your Skills may list a Tell threshold to gain additional benefits. This represents a minimum number of Tells on your target. When you use such a Skill, the DM will roll a \`d12\`. If the result is lower than the number of Tells on the target, they catch you red-handed and become suspicious. Your accumulated Tells are lost, the Skill's additional effect fails, and you cannot gain Tells on that target again until the end of your next turn.

***Study.*** As a Standard Action on your turn, you can choose one target that you can see in your Zone and learn one of their Tells.

***Mark.*** As a Standard Action, you can spend 2 Tells on a target in your Zone to plant a **Weakness** to an element of your choice (Fire, Ice, Elec, or Wind) until the end of your next turn. You and your allies may exploit the planted Weakness like any other.`,
  schema: elementalLarcenyStateSchema,
  initialState: () => ({ kind: "elemental-larceny" }),
  resetOn: "encounter",
}
