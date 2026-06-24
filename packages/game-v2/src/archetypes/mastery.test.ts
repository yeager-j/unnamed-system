import { describe, expect, it } from "vitest"

import type { Mastery } from "@workspace/game-v2/archetypes/archetype"
import { masteryBonuses } from "@workspace/game-v2/archetypes/mastery"

describe("masteryBonuses (C4 — applies at rank ≥ 5 even when inactive)", () => {
  const masteryTable: Record<string, Mastery> = {
    str5: { kind: "attribute", amount: 2, attribute: "strength" },
    hp5: { kind: "hp", amount: 20 },
  }
  const masteryOf = (key: string): Mastery | undefined => masteryTable[key]

  it("sums Mastery for every roster archetype at rank ≥ 5, active or not", () => {
    const pool = masteryBonuses(
      [
        { key: "str5", rank: 5 }, // not the active one — still applies (C4)
        { key: "hp5", rank: 6 },
      ],
      masteryOf
    )
    expect(pool.strength).toBe(2)
    expect(pool.hp).toBe(20)
  })

  it("ignores archetypes below the Mastery rank", () => {
    expect(masteryBonuses([{ key: "str5", rank: 4 }], masteryOf).strength).toBe(
      0
    )
  })

  it("ignores a roster key the catalog doesn't know", () => {
    expect(masteryBonuses([{ key: "ghost", rank: 7 }], masteryOf).hp).toBe(0)
  })
})
