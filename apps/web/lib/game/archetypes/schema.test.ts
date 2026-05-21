import { describe, expect, it } from "vitest"

import { archetypeSchema, type Archetype, type ArchetypeTier } from "./schema"

const TIER: ArchetypeTier = "initiate"

const SAMPLE_ARCHETYPE: Archetype = {
  key: "sample-archetype",
  name: "Sample Archetype",
  lineage: "warrior",
  tier: TIER,
  prerequisites: [{ archetype: "origin-archetype", rank: 5 }],
  inheritanceSlots: 2,
  talents: ["athletics", "lift"],
  mastery: { kind: "attribute", amount: 1, attribute: "strength" },
  attributes: { strength: 2, magic: -1, agility: 1, luck: 0 },
  affinities: { fire: "resist", ice: "weak" },
  skills: [
    { rank: 1, skill: "cleave" },
    { rank: 3, skill: "tempest-slash" },
  ],
  synthesisSkill: { rank: 5, skill: "peerless-stonecleaver" },
}

describe("archetypeSchema", () => {
  it("round-trips a sample Archetype unchanged", () => {
    const parsed = archetypeSchema.parse(SAMPLE_ARCHETYPE)
    expect(parsed).toEqual(SAMPLE_ARCHETYPE)
  })

  it("matches the sample Archetype snapshot", () => {
    expect(archetypeSchema.parse(SAMPLE_ARCHETYPE)).toMatchSnapshot()
  })

  it("treats synthesisSkill as optional", () => {
    const withoutSynthesis = { ...SAMPLE_ARCHETYPE }
    delete withoutSynthesis.synthesisSkill
    expect(() => archetypeSchema.parse(withoutSynthesis)).not.toThrow()
  })

  it("rejects an out-of-range Attribute score", () => {
    expect(() =>
      archetypeSchema.parse({
        ...SAMPLE_ARCHETYPE,
        attributes: { strength: 8, magic: 0, agility: 0, luck: 0 },
      })
    ).toThrow()
  })
})
