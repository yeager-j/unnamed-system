import { z } from "zod/v4"

import type { MechanicDefinition } from "@workspace/game-v2/mechanics/definition"

/**
 * Thief — Thief's Insight. Studying targets learns their Tells; the number per
 * enemy equals the Thief Rank. Each Tell grants +1 to Attack Rolls against that
 * enemy (rulebook `Thief's Insight.md`). Tells are per-enemy and the Suspicion
 * check is a transient d12 roll, so that data is tracked at the table — there is
 * no per-character state, so the mechanic is display-only (discriminant only).
 */
export const thiefsInsightStateSchema = z.object({
  kind: z.literal("thiefs-insight"),
})
export type ThiefsInsightState = z.infer<typeof thiefsInsightStateSchema>

export const thiefsInsight: MechanicDefinition<ThiefsInsightState> = {
  kind: "thiefs-insight",
  displayName: "Thief's Insight",
  tagline:
    "Study enemies to learn their Tells: +1 to Attack Rolls per Tell, plus Tell-gated Skill effects.",
  description: `By spending time studying your targets, you learn their **Tells**. The number of Tells you can learn about a single enemy is equal to your Thief Archetype Rank.

***Tell Benefits.*** You gain \`+1\` to your Attack Rolls for each Tell on the attack target. Additionally, if you learn 2 Tells, the DM will tell you one of that target's Weaknesses (if it has one).

***Suspicion.*** Some of your Skills may list a Tell threshold to gain additional benefits. This represents a minimum number of Tells on your target. When you use such a Skill, the DM will roll a \`d12\`. If the result is lower than the number of Tells on the target, they catch you red-handed and become suspicious. Your accumulated Tells are lost, the Skill's additional effect fails, and you cannot gain Tells on that target again until the end of your next turn.

***Study.*** As a Standard Action on your turn, you can choose one target that you can see in your Zone and learn one of their Tells.`,
  schema: thiefsInsightStateSchema,
  initialState: () => ({ kind: "thiefs-insight" }),
  resetOn: "encounter",
}
