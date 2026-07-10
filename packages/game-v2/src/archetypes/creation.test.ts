import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import {
  applySetOrigin,
  creationArchetypes,
} from "@workspace/game-v2/archetypes/creation"

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
  [archetype({ key: "warrior" }), archetype({ key: "knight" })].map((a) => [
    a.key,
    a,
  ])
)

const setOrigin = applySetOrigin({ getArchetype: (key) => CATALOG.get(key) })

describe("creationArchetypes", () => {
  const catalog: Archetype[] = [
    archetype({ key: "warrior", tier: "initiate" }),
    archetype({ key: "knight", tier: "adept" }),
    archetype({ key: "mage", tier: "initiate" }),
    archetype({ key: "archmage", tier: "paragon" }),
  ]

  it("returns only the initiate-tier Archetypes (the creation-eligible set)", () => {
    const eligible = creationArchetypes({ allArchetypes: () => catalog })()
    expect(eligible.map((a) => a.key)).toEqual(["warrior", "mage"])
  })

  it("returns an empty list when the catalog has no initiate-tier Archetypes", () => {
    const eligible = creationArchetypes({
      allArchetypes: () => [archetype({ key: "knight", tier: "adept" })],
    })()
    expect(eligible).toEqual([])
  })
})

describe("applySetOrigin", () => {
  it("mints the archetypes component from absent at ORIGIN_ARCHETYPE_RANK (rank 2)", () => {
    const result = setOrigin({}, "warrior")
    expect(result).toEqual({
      ok: true,
      value: {
        archetypes: {
          active: "warrior",
          origin: "warrior",
          savedArchetypeRanks: 0,
          roster: [{ key: "warrior", rank: 2, inheritanceSlots: [] }],
        },
      },
    })
  })

  it("switch = delete-and-replace, preserving banked Saved Ranks", () => {
    const existing: Archetypes = {
      active: "warrior",
      origin: "warrior",
      savedArchetypeRanks: 3,
      roster: [
        { key: "warrior", rank: 4, inheritanceSlots: [] },
        { key: "mage", rank: 2, inheritanceSlots: [] },
      ],
    }
    const result = setOrigin({ archetypes: existing }, "knight")
    expect(result).toEqual({
      ok: true,
      value: {
        archetypes: {
          active: "knight",
          origin: "knight",
          savedArchetypeRanks: 3,
          roster: [{ key: "knight", rank: 2, inheritanceSlots: [] }],
        },
      },
    })
  })

  it("touches only the archetypes component (single-class write)", () => {
    const result = setOrigin({}, "warrior")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.value)).toEqual(["archetypes"])
    }
  })

  it("refuses 'invalid-input' for a key the catalog doesn't define, without mutating", () => {
    const input = {}
    const result = setOrigin(input, "nonexistent")
    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(input).toEqual({})
  })
})
