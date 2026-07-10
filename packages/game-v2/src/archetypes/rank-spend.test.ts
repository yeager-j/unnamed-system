import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import { applySpendArchetypeRank } from "@workspace/game-v2/archetypes/rank-spend"

function archetype(overrides: Partial<Archetype> & { key: string }): Archetype {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "hp", amount: 0 },
    lineage: "warrior",
    name: overrides.key,
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents: [],
    skills: [],
    ...overrides,
  }
}

const CATALOG = new Map(
  [
    archetype({ key: "knight" }),
    archetype({ key: "mage" }),
    archetype({
      key: "paladin",
      prerequisites: [{ archetype: "knight", rank: 3 }],
    }),
  ].map((a) => [a.key, a])
)

const spend = applySpendArchetypeRank({
  getArchetype: (key) => CATALOG.get(key),
})

function components(
  roster: Archetypes["roster"],
  savedArchetypeRanks = 2
): { archetypes: Archetypes } {
  return {
    archetypes: {
      active: "knight",
      origin: "knight",
      savedArchetypeRanks,
      roster,
    },
  }
}

describe("applySpendArchetypeRank", () => {
  it("unlocks an un-owned Archetype at Rank 1, spending one Saved Rank", () => {
    const result = spend(
      components([{ key: "knight", rank: 1, inheritanceSlots: [] }]),
      "mage"
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.archetypes.savedArchetypeRanks).toBe(1)
      expect(result.value.archetypes.roster).toEqual([
        { key: "knight", rank: 1, inheritanceSlots: [] },
        { key: "mage", rank: 1, inheritanceSlots: [] },
      ])
    }
  })

  it("ranks up an owned Archetype toward Mastery, spending one Saved Rank", () => {
    const result = spend(
      components([{ key: "knight", rank: 4, inheritanceSlots: [] }]),
      "knight"
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.archetypes.savedArchetypeRanks).toBe(1)
      expect(result.value.archetypes.roster).toEqual([
        { key: "knight", rank: 5, inheritanceSlots: [] },
      ])
    }
  })

  it("touches only the archetypes component (single-class write)", () => {
    const result = spend(
      components([{ key: "knight", rank: 1, inheritanceSlots: [] }]),
      "mage"
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.value)).toEqual(["archetypes"])
    }
  })

  it("refuses 'no-saved-ranks' with nothing banked, without mutating", () => {
    const input = components(
      [{ key: "knight", rank: 1, inheritanceSlots: [] }],
      0
    )
    const result = spend(input, "mage")
    expect(result).toEqual({ ok: false, error: "no-saved-ranks" })
    expect(input.archetypes.roster).toEqual([
      { key: "knight", rank: 1, inheritanceSlots: [] },
    ])
    expect(input.archetypes.savedArchetypeRanks).toBe(0)
  })

  it("refuses 'prerequisites-not-met' when unlocking a gated Archetype", () => {
    const result = spend(
      components([{ key: "knight", rank: 1, inheritanceSlots: [] }]),
      "paladin"
    )
    expect(result).toEqual({ ok: false, error: "prerequisites-not-met" })
  })

  it("unlocks a gated Archetype once its prerequisite Rank is met", () => {
    const result = spend(
      components([{ key: "knight", rank: 3, inheritanceSlots: [] }]),
      "paladin"
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.archetypes.roster).toContainEqual({
        key: "paladin",
        rank: 1,
        inheritanceSlots: [],
      })
    }
  })

  it("refuses 'rank-capped' at Mastery Rank", () => {
    const result = spend(
      components([{ key: "knight", rank: 5, inheritanceSlots: [] }]),
      "knight"
    )
    expect(result).toEqual({ ok: false, error: "rank-capped" })
  })

  it("refuses 'invalid-input' for an unknown key on unlock", () => {
    const result = spend(
      components([{ key: "knight", rank: 1, inheritanceSlots: [] }]),
      "nonexistent"
    )
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })
})
