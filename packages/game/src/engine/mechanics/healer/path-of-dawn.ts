import { z } from "zod/v4"

import type { MechanicDefinition } from "@workspace/game/foundation/mechanics/types"

/**
 * Healer — Path of Dawn. Light-damage Skills apply Lumina counters to enemies
 * (entering Dawn Mode); HP-restoring or Ailment-curing Skills consume Lumina
 * for Light damage and SP refund (rulebook `Skills/Mechanics/Path of Dawn.md`).
 *
 * State holds only the Dawn Mode flag — the player toggles it as they enter and
 * leave Dawn Mode. Per-enemy Lumina tracking is intentionally out of the app:
 * it lives in the table's combat tracker until a future initiative-tracker
 * ticket gives that data a real consumer (Skill-cast generation/consumption is
 * likewise out of scope).
 */

export const pathOfDawnStateSchema = z.object({
  kind: z.literal("path-of-dawn"),
  dawnMode: z.boolean(),
})

export type PathOfDawnState = z.infer<typeof pathOfDawnStateSchema>

/**
 * Pure transition the owner-mode toggle composes through the persistence
 * layer. Lives next to the definition so game logic stays out of the UI and
 * the DB wrapper, mirroring the Knight's `adjustValor`.
 */
export function setDawnMode(
  state: PathOfDawnState,
  value: boolean
): PathOfDawnState {
  return { ...state, dawnMode: value }
}

export const pathOfDawn: MechanicDefinition<PathOfDawnState> = {
  kind: "path-of-dawn",
  displayName: "Path of Dawn",
  tagline:
    "Light-damage Skills enter Dawn Mode and apply Lumina counters to struck enemies.",
  description: `Searing light magic rains down on your enemies when you take mercy on your allies. When you use a Skill that deals Light damage, you enter into ***Dawn Mode*** and you apply one ***Lumina*** counter on any enemies that took damage (an enemy with Lumina counters is ***Illuminated***). An enemy can have a maximum number of Lumina equal to your Luck.

An Illuminated enemy cannot turn invisible and it lights up the Zone it occupies with bright light.

When you use a Skill that restores HP or cures Ailments, each Illuminated enemy takes \`1d4\` Light damage per Lumina, which are consumed. Additionally, if you were in Dawn Mode, you recover SP equal to the number of Lumina consumed and you exit Dawn Mode.

When combat ends, all unused Lumina disappear and you exit Dawn Mode.`,
  schema: pathOfDawnStateSchema,
  initialState: () => ({
    kind: "path-of-dawn",
    dawnMode: false,
  }),
  resetOn: "encounter",
}
