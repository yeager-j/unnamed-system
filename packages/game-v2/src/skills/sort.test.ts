import { describe, expect, it } from "vitest"

import type { DamageType } from "@workspace/game-v2/kernel/vocab"
import type { SkillKind } from "@workspace/game-v2/kernel/vocab/skills"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
import { sortSkillsByKind } from "@workspace/game-v2/skills/sort"

/** A minimal {@link ResolvedSkill} carrying only the fields the sort reads
 *  (kind, damage type, name) — the resolved cost/roll are irrelevant to order. */
function makeSortable(
  name: string,
  kind: SkillKind,
  damageType?: DamageType | "special"
): ResolvedSkill {
  const skill = {
    name,
    kind,
    ...(damageType ? { damage: { damageType } } : {}),
  }
  return { skill } as ResolvedSkill
}

describe("sortSkillsByKind", () => {
  it("groups skills by the documented display order: attack, heal, ailment, support, passive", () => {
    const input = [
      makeSortable("Auto-Rakukaja", "passive"),
      makeSortable("Knight's Proclamation", "support"),
      makeSortable("Evil Touch", "ailment"),
      makeSortable("Dia", "heal"),
      makeSortable("Cleave", "attack", "slash"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.skill.kind)).toEqual([
      "attack",
      "heal",
      "ailment",
      "support",
      "passive",
    ])
  })

  it("orders attack skills by damage type per DAMAGE_TYPES (slash → pierce → strike → fire → …)", () => {
    const input = [
      makeSortable("Agi", "attack", "fire"),
      makeSortable("Skewer", "attack", "pierce"),
      makeSortable("Cleave", "attack", "slash"),
      makeSortable("Shield Arts", "attack", "strike"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.skill.name)).toEqual([
      "Cleave",
      "Skewer",
      "Shield Arts",
      "Agi",
    ])
  })

  it("sorts alphabetically by name within the same damage type", () => {
    const input = [
      makeSortable("Tempest Slash", "attack", "slash"),
      makeSortable("Cleave", "attack", "slash"),
      makeSortable("Critical Strike", "attack", "slash"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.skill.name)).toEqual([
      "Cleave",
      "Critical Strike",
      "Tempest Slash",
    ])
  })

  it("sorts a `special`-damage attack after every known damage type", () => {
    const input = [
      makeSortable("Elemental Apocalypse", "attack", "special"),
      makeSortable("Megidolaon", "attack", "almighty"),
      makeSortable("Agi", "attack", "fire"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.skill.name)).toEqual([
      "Agi",
      "Megidolaon",
      "Elemental Apocalypse",
    ])
  })

  it("keeps a single-kind non-attack list alphabetized", () => {
    const input = [
      makeSortable("Media", "heal"),
      makeSortable("Dia", "heal"),
      makeSortable("Amrita Drop", "heal"),
    ]
    expect(sortSkillsByKind(input).map((s) => s.skill.name)).toEqual([
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
      makeSortable("Auto-Rakukaja", "passive"),
      makeSortable("Cleave", "attack", "slash"),
    ]
    const before = [...input]
    sortSkillsByKind(input)
    expect(input).toEqual(before)
  })
})
