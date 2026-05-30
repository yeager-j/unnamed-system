import type { CharacterEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import { patchRow, type SliceResult } from "./shared"

type TalentEdit = Extract<CharacterEdit, { kind: "talentAdd" | "talentRemove" }>

/**
 * Talents slice: adds or removes a key from the `gainedTalents` column. Adding
 * a talent already present is a no-op (`null`); the active Archetype's talent
 * roster is re-resolved by the derive.
 */
export function reduceTalentEdit(
  raw: RawCharacterInputs,
  edit: TalentEdit
): SliceResult {
  switch (edit.kind) {
    case "talentAdd":
      return raw.row.gainedTalents.includes(edit.talentKey)
        ? null
        : patchRow(raw, {
            gainedTalents: [...raw.row.gainedTalents, edit.talentKey],
          })

    case "talentRemove":
      return patchRow(raw, {
        gainedTalents: raw.row.gainedTalents.filter(
          (key) => key !== edit.talentKey
        ),
      })
  }
}
