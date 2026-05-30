import { applyResolvedCost } from "../../skills"
import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
  applyUsePrisma,
} from "../adjust-pools"
import type { CharacterEdit } from "../character-edit"
import type { RawCharacterInputs } from "../derive-hydrated-character"
import type { HydratedCharacter } from "../hydrated-character"
import { fromResult, type SliceResult } from "./shared"

type PoolsEdit = Extract<
  CharacterEdit,
  {
    kind: "usePrisma" | "damage" | "heal" | "spendSP" | "recoverSP" | "cast"
  }
>

/**
 * Pools / casting slice: the manual HP/SP/Prisma affordances plus Skill casts.
 * Reads derived ceilings (`maxHP`, `maxSP`) and resolved Skill costs off the
 * hydrated `character`, runs the matching pure engine transition, and bridges
 * its {@link import("../../../result").Result} through {@link fromResult} — so an
 * engine rejection (over-spend, empty flask, unknown Skill) becomes a no-op.
 */
export function reducePoolsEdit(
  raw: RawCharacterInputs,
  character: HydratedCharacter,
  edit: PoolsEdit
): SliceResult {
  switch (edit.kind) {
    case "usePrisma":
      return fromResult(raw, applyUsePrisma(raw.row))

    case "damage":
      return fromResult(raw, applyDamage(raw.row, edit.amount))

    case "heal":
      return fromResult(
        raw,
        applyHeal(
          { currentHP: raw.row.currentHP, maxHP: character.maxHP },
          edit.amount
        )
      )

    case "spendSP":
      return fromResult(raw, applySpendSP(raw.row, edit.amount))

    case "recoverSP":
      return fromResult(
        raw,
        applyRecoverSP(
          { currentSP: raw.row.currentSP, maxSP: character.maxSP },
          edit.amount
        )
      )

    case "cast": {
      const cost = character.skills.find(
        (skill) => skill.key === edit.skillKey
      )?.resolvedCost
      if (!cost) return null
      return fromResult(
        raw,
        applyResolvedCost(cost, {
          currentHP: raw.row.currentHP,
          currentSP: raw.row.currentSP,
        })
      )
    }
  }
}
