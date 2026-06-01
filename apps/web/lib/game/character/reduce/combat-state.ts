import { MAX_EXHAUSTION_LEVEL } from "../../combat"
import type { CombatStateEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import { DEFAULT_BATTLE_CONDITIONS } from "../state"
import { patchRow, type SliceResult } from "./shared"

/**
 * Combat-state slice: ailments, the three battle-condition axes, the two
 * battle-condition flags, exhaustion stepping, and the encounter wipe. All
 * patch the flat `characters` columns (`ailments`, `battleConditions`,
 * `exhaustion`).
 */
export function reduceCombatStateEdit(
  raw: RawCharacterInputs,
  edit: CombatStateEdit
): SliceResult {
  const conditions = raw.row.battleConditions ?? DEFAULT_BATTLE_CONDITIONS

  switch (edit.kind) {
    case "ailments":
      return patchRow(raw, { ailments: edit.ailments })

    case "battleConditionAxis":
      return patchRow(raw, {
        battleConditions: { ...conditions, [edit.axis]: edit.state },
      })

    case "battleConditionFlag":
      return patchRow(raw, {
        battleConditions: { ...conditions, [edit.flag]: edit.value },
      })

    case "exhaustion": {
      const next =
        edit.direction === "increment"
          ? Math.min(MAX_EXHAUSTION_LEVEL, raw.row.exhaustion + 1)
          : Math.max(0, raw.row.exhaustion - 1)
      return patchRow(raw, { exhaustion: next })
    }

    case "clearCombatState":
      return patchRow(raw, {
        ailments: [],
        battleConditions: DEFAULT_BATTLE_CONDITIONS,
      })
  }
}
