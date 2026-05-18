import { describe, expect, it } from "vitest"
import {
  buildStatComputationCharacter,
  type PersistedArchetypeState,
  type PersistedCharacterState,
} from "./stat-character"
import { warrior } from "./archetypes/warrior"

const baseCharacter: PersistedCharacterState = {
  pathChoice: "balanced",
  level: 3,
  manualBonuses: { hp: 5 },
  activeCharacterArchetypeId: "ca-warrior",
}

function warriorRow(
  overrides: Partial<PersistedArchetypeState> = {}
): PersistedArchetypeState {
  return {
    id: "ca-warrior",
    archetypeKey: "warrior",
    rank: 2,
    inheritanceSlots: [],
    ...overrides,
  }
}

describe("buildStatComputationCharacter", () => {
  it("passes character scalars straight through", () => {
    const result = buildStatComputationCharacter(
      baseCharacter,
      [warriorRow()],
      []
    )
    expect(result.pathChoice).toBe("balanced")
    expect(result.level).toBe(3)
    expect(result.manualBonuses).toEqual({ hp: 5 })
    expect(result.archetypes).toEqual([{ key: "warrior", rank: 2 }])
  })

  it("resolves the active Archetype via the surrogate id", () => {
    const result = buildStatComputationCharacter(
      baseCharacter,
      [
        warriorRow(),
        { id: "ca-mage", archetypeKey: "mage", rank: 5, inheritanceSlots: [] },
      ],
      []
    )
    expect(result.activeArchetypeKey).toBe("warrior")
  })

  it("returns no active Archetype or Skills when none is active", () => {
    const result = buildStatComputationCharacter(
      { ...baseCharacter, activeCharacterArchetypeId: null },
      [warriorRow()],
      []
    )
    expect(result.activeArchetypeKey).toBeNull()
    expect(result.activeSkills).toEqual([])
  })

  it("includes only Skills unlocked at or below the active Rank", () => {
    const result = buildStatComputationCharacter(
      baseCharacter,
      [warriorRow({ rank: 2 })],
      []
    )
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toEqual(["cleave", "windblade"])
  })

  it("includes the Synthesis Skill once the active Rank reaches it", () => {
    const result = buildStatComputationCharacter(
      baseCharacter,
      [warriorRow({ rank: 5 })],
      []
    )
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toContain(warrior.synthesisSkill?.skill)
    expect(keys).toHaveLength(warrior.skills.length + 1)
  })

  it("includes Skills inherited into the active Archetype's slots", () => {
    const result = buildStatComputationCharacter(
      baseCharacter,
      [
        warriorRow({
          rank: 1,
          inheritanceSlots: [
            { slotIndex: 0, sourceCharacterArchetypeId: "ca-mage", skillKey: "zio" },
            { slotIndex: 1, sourceCharacterArchetypeId: null, skillKey: null },
          ],
        }),
      ],
      []
    )
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toContain("cleave")
    expect(keys).toContain("zio")
    expect(keys).not.toContain("windblade")
  })

  it("resolves equipped catalog keys and drops unknown ones", () => {
    const result = buildStatComputationCharacter(
      baseCharacter,
      [warriorRow()],
      ["longsword", "does-not-exist"]
    )
    expect(result.equippedItems.map((item) => item.key)).toEqual(["longsword"])
  })
})
