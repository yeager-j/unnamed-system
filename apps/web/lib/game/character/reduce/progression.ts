import type { CharacterRow } from "@/lib/db/schema/character"

import type { CharacterEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import { addSpark, rankUpVirtue, type SparkCharacter } from "../leveling"
import { patchRow, type SliceResult } from "./shared"

type ProgressionEdit = Extract<
  CharacterEdit,
  { kind: "victories" | "addSpark" | "rankUpVirtue" }
>

/**
 * Progression slice: banking Victories and the Spark log (adding a Spark,
 * ranking up a Virtue). Victories patch a single column; the Spark operations
 * round-trip through the leveling engine and reject (`null`) when it does.
 */
export function reduceProgressionEdit(
  raw: RawCharacterInputs,
  edit: ProgressionEdit
): SliceResult {
  switch (edit.kind) {
    case "victories":
      return patchRow(raw, {
        victories: Math.max(0, raw.row.victories + edit.delta),
      })

    case "addSpark": {
      const result = addSpark(sparkCharacter(raw), edit.virtue)
      return result.ok ? patchRow(raw, sparkRow(result.value)) : null
    }

    case "rankUpVirtue": {
      const result = rankUpVirtue(sparkCharacter(raw), edit.virtue)
      return result.ok ? patchRow(raw, sparkRow(result.value)) : null
    }
  }
}

/** Projects the spark/virtue columns into the {@link SparkCharacter} the
 *  leveling engine reads. */
function sparkCharacter(raw: RawCharacterInputs): SparkCharacter {
  return {
    sparkLog: raw.row.sparkLog,
    virtues: {
      expression: raw.row.virtueExpression,
      empathy: raw.row.virtueEmpathy,
      wisdom: raw.row.virtueWisdom,
      focus: raw.row.virtueFocus,
    },
  }
}

/** Maps a spark/virtue engine result back onto the flat `characters` columns. */
function sparkRow(value: SparkCharacter): Partial<CharacterRow> {
  return {
    sparkLog: value.sparkLog,
    virtueExpression: value.virtues.expression,
    virtueEmpathy: value.virtues.empathy,
    virtueWisdom: value.virtues.wisdom,
    virtueFocus: value.virtues.focus,
  }
}
