import { describe, expect, it } from "vitest"

import type { DamageType } from "../affinity"
import type { HydratedSkill } from "../hydrated-character"
import type { SkillKind } from "../skill-kind"
import { sortSkillsByKind } from "./sort"

function makeSkill(
  name: string,
  kind: SkillKind,
  damageType?: DamageType
): HydratedSkill {
  return { name, kind, damageType } as unknown as HydratedSkill
}

describe("sortSkillsByKind", () => {
  it("groups skills by the documented display order: attack, heal, ailment, support, passive", () => {
    const input = [
      makeSkill("Auto-Rakukaja", "passive"),
      makeSkill("Knight's Proclamation", "support"),
      makeSkill("Evil Touch", "ailment"),
      makeSkill("Dia", "heal"),
      makeSkill("Cleave", "attack", "slash"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.kind)).toEqual([
      "attack",
      "heal",
      "ailment",
      "support",
      "passive",
    ])
  })

  it("orders attack skills by damage type per DAMAGE_TYPES (slash → pierce → strike → fire → …)", () => {
    const input = [
      makeSkill("Agi", "attack", "fire"),
      makeSkill("Skewer", "attack", "pierce"),
      makeSkill("Cleave", "attack", "slash"),
      makeSkill("Shield Arts", "attack", "strike"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.name)).toEqual([
      "Cleave",
      "Skewer",
      "Shield Arts",
      "Agi",
    ])
  })

  it("sorts alphabetically by name within the same damage type", () => {
    const input = [
      makeSkill("Tempest Slash", "attack", "slash"),
      makeSkill("Cleave", "attack", "slash"),
      makeSkill("Critical Strike", "attack", "slash"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.name)).toEqual([
      "Cleave",
      "Critical Strike",
      "Tempest Slash",
    ])
  })

  it("keeps a single-kind non-attack list alphabetized", () => {
    const input = [
      makeSkill("Media", "heal"),
      makeSkill("Dia", "heal"),
      makeSkill("Amrita Drop", "heal"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.name)).toEqual([
      "Amrita Drop",
      "Dia",
      "Media",
    ])
  })

  it("returns an empty array for an empty input", () => {
    expect(sortSkillsByKind([])).toEqual([])
  })

  it("does not mutate the input array", () => {
    const input = [
      makeSkill("Auto-Rakukaja", "passive"),
      makeSkill("Cleave", "attack", "slash"),
    ]
    const before = [...input]
    sortSkillsByKind(input)
    expect(input).toEqual(before)
  })
})
