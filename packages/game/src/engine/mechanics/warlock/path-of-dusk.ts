import type { MechanicDefinition } from "@workspace/game/engine/mechanics/types"
import {
  pathOfDuskStateSchema,
  type PathOfDuskState,
} from "@workspace/game/foundation/mechanics/schema"

/**
 * Warlock — Path of Dusk. Ailment Skills apply Lumina counters to enemies
 * (entering Dusk Mode); Dark Skills consume Lumina
 * for Dark damage and SP refund (rulebook `Skills/Mechanics/Path of Dusk.md`).
 *
 * State holds only the Dusk Mode flag — the player toggles it as they enter and
 * leave Dusk Mode. Per-enemy Lumina tracking is intentionally out of the app:
 * it lives in the table's combat tracker until a future initiative-tracker
 * ticket gives that data a real consumer (Skill-cast generation/consumption is
 * likewise out of scope).
 */

/**
 * Pure transition the owner-mode toggle composes through the persistence
 * layer. Lives next to the definition so game logic stays out of the UI and
 * the DB wrapper, mirroring the Knight's `adjustValor`.
 */
export function setDuskMode(
  state: PathOfDuskState,
  value: boolean
): PathOfDuskState {
  return { ...state, duskMode: value }
}

export const pathOfDusk: MechanicDefinition<PathOfDuskState> = {
  kind: "path-of-dusk",
  displayName: "Path of Dusk",
  tagline:
    "Ailment Skills enter Dusk Mode and apply Lumina counters to struck enemies.",
  description: `Burning dark magic rains down on your enemies as you sap their will to fight. When you use a Skill that lowers stats or inflicts an Ailment, you enter into ***Dusk Mode*** and you apply one ***Lumina*** counter on any enemies that were affected (an enemy with Lumina counters is ***Illuminated***). An enemy can have a maximum number of Lumina equal to your Luck.

An Illuminated enemy cannot turn invisible and it lights up the Zone it occupies with bright light.

When you use a Skill that deals Dark damage, each Illuminated enemy takes **\`1d4\`** Dark damage per Lumina, which are consumed. Additionally, if you were in ***Dusk Mode***, you recover SP equal to the number of Lumina consumed and you exit Dusk Mode.

When combat ends, all unused Lumina disappear and you exit Dusk Mode.`,
  schema: pathOfDuskStateSchema,
  initialState: () => ({
    kind: "path-of-dusk",
    duskMode: false,
  }),
  resetOn: "encounter",
}
