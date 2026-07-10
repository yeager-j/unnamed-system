import { describe, expect, it } from "vitest"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import {
  applySetInheritanceSlot,
  isInheritableSkill,
} from "@workspace/game-v2/archetypes/inheritance"

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

describe("applySetInheritanceSlot", () => {
  const CATALOG = new Map(
    [
      archetype({ key: "knight", name: "Knight", inheritanceSlots: 2 }),
      archetype({ key: "warrior" }),
    ].map((a) => [a.key, a])
  )

  const setSlot = applySetInheritanceSlot({
    getArchetype: (key) => CATALOG.get(key),
  })

  function components(roster: Archetypes["roster"]): {
    archetypes: Archetypes
  } {
    return {
      archetypes: {
        active: "knight",
        origin: "knight",
        savedArchetypeRanks: 0,
        roster,
      },
    }
  }

  const ownerAndSource: Archetypes["roster"] = [
    { key: "knight", rank: 3, inheritanceSlots: [] },
    { key: "warrior", rank: 3, inheritanceSlots: [] },
  ]

  it("fills a slot from another unlocked Archetype's inheritable Skill", () => {
    const result = setSlot(components(ownerAndSource), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "warrior",
      skillKey: "tempest-slash",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.archetypes.roster).toEqual([
        {
          key: "knight",
          rank: 3,
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceArchetypeKey: "warrior",
              skillKey: "tempest-slash",
            },
          ],
        },
        { key: "warrior", rank: 3, inheritanceSlots: [] },
      ])
    }
  })

  it("replaces a configured slot in place (upsert by slotIndex)", () => {
    const roster: Archetypes["roster"] = [
      {
        key: "knight",
        rank: 3,
        inheritanceSlots: [
          { slotIndex: 0, sourceArchetypeKey: "warrior", skillKey: "cleave" },
        ],
      },
      { key: "warrior", rank: 3, inheritanceSlots: [] },
    ]
    const result = setSlot(components(roster), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "warrior",
      skillKey: "tempest-slash",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.archetypes.roster[0]!.inheritanceSlots).toEqual([
        {
          slotIndex: 0,
          sourceArchetypeKey: "warrior",
          skillKey: "tempest-slash",
        },
      ])
    }
  })

  it("clears a slot when both keys are null", () => {
    const roster: Archetypes["roster"] = [
      {
        key: "knight",
        rank: 3,
        inheritanceSlots: [
          { slotIndex: 0, sourceArchetypeKey: "warrior", skillKey: "cleave" },
        ],
      },
    ]
    const result = setSlot(components(roster), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: null,
      skillKey: null,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.archetypes.roster[0]!.inheritanceSlots).toEqual([])
    }
  })

  it("touches only the archetypes component (single-class write)", () => {
    const result = setSlot(components(ownerAndSource), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "warrior",
      skillKey: "tempest-slash",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.value)).toEqual(["archetypes"])
    }
  })

  it("refuses 'not-unlocked' when the owner is not in the roster", () => {
    const result = setSlot(components(ownerAndSource), "rogue", {
      slotIndex: 0,
      sourceArchetypeKey: "warrior",
      skillKey: "tempest-slash",
    })
    expect(result).toEqual({ ok: false, error: "not-unlocked" })
  })

  it("refuses 'not-unlocked' when the source Archetype is not owned", () => {
    const result = setSlot(
      components([{ key: "knight", rank: 3, inheritanceSlots: [] }]),
      "knight",
      {
        slotIndex: 0,
        sourceArchetypeKey: "warrior",
        skillKey: "tempest-slash",
      }
    )
    expect(result).toEqual({ ok: false, error: "not-unlocked" })
  })

  it("refuses 'invalid-input' for a slot index past the Archetype's slot count", () => {
    const result = setSlot(components(ownerAndSource), "knight", {
      slotIndex: 2,
      sourceArchetypeKey: "warrior",
      skillKey: "cleave",
    })
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })

  it("refuses 'invalid-input' for a self-source fill", () => {
    const roster: Archetypes["roster"] = [
      { key: "knight", rank: 3, inheritanceSlots: [] },
    ]
    const result = setSlot(components(roster), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "knight",
      skillKey: "cleave",
    })
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })

  it("refuses 'invalid-input' for a source Rank that hasn't unlocked the Skill", () => {
    const roster: Archetypes["roster"] = [
      { key: "knight", rank: 3, inheritanceSlots: [] },
      { key: "warrior", rank: 2, inheritanceSlots: [] },
    ]
    const result = setSlot(components(roster), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "warrior",
      skillKey: "tempest-slash",
    })
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })

  it("refuses 'invalid-input' for a fill with no source key", () => {
    const result = setSlot(
      components([{ key: "knight", rank: 3, inheritanceSlots: [] }]),
      "knight",
      {
        slotIndex: 0,
        sourceArchetypeKey: null,
        skillKey: "cleave",
      }
    )
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })

  it("refuses 'invalid-input' for a Synthesis Skill (never inheritable)", () => {
    const result = setSlot(components(ownerAndSource), "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "warrior",
      skillKey: "peerless-stonecleaver",
    })
    expect(result).toEqual({ ok: false, error: "invalid-input" })
  })

  it("does not mutate the input roster on refusal", () => {
    const input = components([{ key: "knight", rank: 3, inheritanceSlots: [] }])
    setSlot(input, "knight", {
      slotIndex: 0,
      sourceArchetypeKey: "knight",
      skillKey: "cleave",
    })
    expect(input.archetypes.roster).toEqual([
      { key: "knight", rank: 3, inheritanceSlots: [] },
    ])
  })
})
