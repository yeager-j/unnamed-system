import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import { creationArchetypes } from "@workspace/game-v2/archetypes/creation"

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
