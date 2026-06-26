import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import { isInheritableSkill } from "@workspace/game-v2/archetypes/inheritance"

function archetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    mastery: { kind: "hp", amount: 0 },
    lineage: "warrior",
    key: "warrior",
    name: "Warrior",
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents: [],
    skills: [
      { rank: 1, skill: "cleave" },
      { rank: 3, skill: "tempest-slash" },
    ],
    synthesisSkill: { rank: 5, skill: "peerless-stonecleaver" },
    ...overrides,
  }
}

describe("isInheritableSkill (D1 — the slot-validity / picker predicate, key-based)", () => {
  it("is true for a Rank-keyed Skill the source has unlocked", () => {
    expect(isInheritableSkill(archetype(), 1, "cleave")).toBe(true)
    expect(isInheritableSkill(archetype(), 3, "tempest-slash")).toBe(true)
  })

  it("is true at the exact required Rank (>= boundary)", () => {
    expect(isInheritableSkill(archetype(), 3, "tempest-slash")).toBe(true)
  })

  it("is false for a Skill above the source's current Rank", () => {
    expect(isInheritableSkill(archetype(), 2, "tempest-slash")).toBe(false)
  })

  it("is false for a Skill the source does not declare", () => {
    expect(isInheritableSkill(archetype(), 5, "fireball")).toBe(false)
  })

  it("excludes the Synthesis Skill by construction (it lives on synthesisSkill, not skills)", () => {
    expect(isInheritableSkill(archetype(), 5, "peerless-stonecleaver")).toBe(
      false
    )
  })
})
