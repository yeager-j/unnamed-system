import { describe, expect, it } from "vitest"

import {
  resolveTalentsForBuilder,
  resolveTalentsForSheet,
} from "@workspace/game/engine/character/talents/display"
import { TALENT_KEYS } from "@workspace/game/foundation/character/talents/schema"

describe("resolveTalentsForSheet", () => {
  it("returns the active Archetype's Talents as inherited chips, alpha", () => {
    const { chips, remaining } = resolveTalentsForSheet([], "warrior")

    expect(chips).toEqual([
      { key: "athletics", label: "Athletics", inherited: true },
      { key: "climb", label: "Climb", inherited: true },
      { key: "lift", label: "Lift", inherited: true },
    ])
    expect(remaining.map((option) => option.key)).not.toContain("climb")
  })

  it("returns gained Talents as removable chips when no Archetype is active", () => {
    const { chips } = resolveTalentsForSheet(["history", "arcana"], null)

    expect(chips).toEqual([
      { key: "arcana", label: "Arcana", inherited: false },
      { key: "history", label: "History", inherited: false },
    ])
  })

  it("orders inherited chips before gained chips, each block alpha", () => {
    const { chips } = resolveTalentsForSheet(["sneak", "lockpick"], "warrior")

    expect(chips.map((chip) => chip.key)).toEqual([
      "athletics",
      "climb",
      "lift",
      "lockpick",
      "sneak",
    ])
    expect(chips.filter((chip) => chip.inherited).map((c) => c.key)).toEqual([
      "athletics",
      "climb",
      "lift",
    ])
  })

  it("excludes both inherited and gained Talents from remaining", () => {
    const { remaining } = resolveTalentsForSheet(["sneak"], "warrior")
    const keys = remaining.map((option) => option.key)

    for (const known of ["climb", "lift", "athletics", "sneak"]) {
      expect(keys).not.toContain(known)
    }
    expect(remaining).toContainEqual({ key: "arcana", label: "Arcana" })
  })

  it("treats an unknown Archetype key as no inherited Talents", () => {
    const { chips } = resolveTalentsForSheet(["climb"], "not-a-real-archetype")

    expect(chips).toEqual([{ key: "climb", label: "Climb", inherited: false }])
  })
})

describe("resolveTalentsForBuilder", () => {
  it("returns the Origin's Talents in Archetype order, not sorted", () => {
    const { origin } = resolveTalentsForBuilder("warrior")

    expect(origin).toEqual(["climb", "lift", "athletics"])
  })

  it("excludes Origin Talents from selectable, preserving TALENT_KEYS order", () => {
    const { selectable } = resolveTalentsForBuilder("warrior")

    expect(selectable).toEqual(
      TALENT_KEYS.filter((key) => !["climb", "lift", "athletics"].includes(key))
    )
  })

  it("returns an empty Origin and every Talent selectable when no Origin is set", () => {
    expect(resolveTalentsForBuilder(null)).toEqual({
      origin: [],
      selectable: [...TALENT_KEYS],
    })
    expect(resolveTalentsForBuilder("not-a-real-archetype")).toEqual({
      origin: [],
      selectable: [...TALENT_KEYS],
    })
  })
})
