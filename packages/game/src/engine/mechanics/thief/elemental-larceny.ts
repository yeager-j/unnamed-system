import type { MechanicDefinition } from "@workspace/game/engine/mechanics/types"
import {
  elementalLarcenyStateSchema,
  type ElementalLarcenyState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * Elemental Thief — Elemental Larceny. A thief's-eye twist on Thief's Insight:
 * you still **Study** targets to learn their Tells, but you can also **Mark**
 * them — spending Tells to plant a Weakness the whole party can exploit.
 *
 * Like Thief's Insight, Tells (and the Weaknesses you plant) are tracked at the
 * table, not in the app: there is no per-character state to persist, so the
 * mechanic is display-only. It owns its info card and Combat-tab widget but
 * emits no Effects and exposes no write path.
 */
export const elementalLarceny: MechanicDefinition<ElementalLarcenyState> = {
  kind: "elemental-larceny",
  displayName: "Elemental Larceny",
  tagline:
    "Study enemies to learn Tells, then spend them to plant a Weakness the party can exploit.",
  description: `By studying your targets you learn their **Tells**. The number of Tells you can learn about a single enemy is equal to your Elemental Thief Archetype Rank.

***Tell Benefits.*** You gain \`+1\` to your Attack Rolls for each Tell on the attack target. Additionally, if you learn 2 Tells, the DM will tell you one of that target's Weaknesses (if it has one).

***Study.*** As a Standard Action on your turn, you can choose one target that you can see in your Zone and learn one of their Tells.

***Mark.*** As a Standard Action, you can spend 2 Tells on a target in your Zone to plant a **Weakness** to an element of your choice (Fire, Ice, Elec, or Wind) until the end of your next turn. You and your allies may exploit the planted Weakness like any other.`,
  schema: elementalLarcenyStateSchema,
  initialState: () => ({ kind: "elemental-larceny" }),
  resetOn: "encounter",
}
