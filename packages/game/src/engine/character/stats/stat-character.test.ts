import { describe, expect, it } from "vitest"

import { warrior } from "@workspace/game/data/archetypes/warrior/warrior"
import { gameData } from "@workspace/game/data/game-data"
import {
  FIXTURE_CHARACTER_ID,
  makeArchetypeRow,
  makeHydratedCharacter,
} from "@workspace/game/engine/__fixtures__/character"
import {
  buildStatContext,
  toStatContext,
  type PersistedArchetypeState,
  type PersistedCharacterState,
} from "@workspace/game/engine/character/stats/stat-character"

/** Binds the production catalog so the boundary call sites stay terse. */
const build = (
  character: PersistedCharacterState,
  archetypes: readonly PersistedArchetypeState[],
  equippedItemKeys: readonly string[]
) => buildStatContext(character, archetypes, equippedItemKeys, gameData)

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
    mechanicState: null,
    ...overrides,
  }
}

describe("buildStatContext", () => {
  it("passes character scalars straight through", () => {
    const result = build(baseCharacter, [warriorRow()], [])
    expect(result.pathChoice).toBe("balanced")
    expect(result.level).toBe(3)
    expect(result.manualBonuses).toEqual({ hp: 5 })
    expect(result.archetypes).toEqual([
      { key: "warrior", rank: 2, mastery: warrior.mastery },
    ])
  })

  it("resolves the active Archetype's Lineage onto the context", () => {
    const result = build(baseCharacter, [warriorRow()], [])
    expect(result.activeLineage).toBe(warrior.lineage)
  })

  it("has a null Lineage when no Archetype is active", () => {
    const result = build(
      { ...baseCharacter, activeCharacterArchetypeId: null },
      [warriorRow()],
      []
    )
    expect(result.activeLineage).toBeNull()
  })

  it("drops an archetype whose key resolves to no catalog entry", () => {
    const result = build(
      baseCharacter,
      [
        warriorRow(),
        warriorRow({ id: "ca-ghost", archetypeKey: "does-not-exist" }),
      ],
      []
    )
    expect(result.archetypes).toEqual([
      { key: "warrior", rank: 2, mastery: warrior.mastery },
    ])
  })

  it("resolves the active Archetype via the surrogate id", () => {
    const result = build(
      baseCharacter,
      [
        warriorRow(),
        {
          id: "ca-mage",
          archetypeKey: "mage",
          rank: 5,
          inheritanceSlots: [],
          mechanicState: null,
        },
      ],
      []
    )
    expect(result.activeArchetypeKey).toBe("warrior")
  })

  it("returns no active Archetype or Skills when none is active", () => {
    const result = build(
      { ...baseCharacter, activeCharacterArchetypeId: null },
      [warriorRow()],
      []
    )
    expect(result.activeArchetypeKey).toBeNull()
    expect(result.activeSkills).toEqual([])
  })

  it("includes only Skills unlocked at or below the active Rank", () => {
    const result = build(baseCharacter, [warriorRow({ rank: 2 })], [])
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toEqual(["cleave", "windblade"])
  })

  it("includes the Synthesis Skill once the active Rank reaches it", () => {
    const result = build(baseCharacter, [warriorRow({ rank: 5 })], [])
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toContain(warrior.synthesisSkill?.skill)
    expect(keys).toHaveLength(warrior.skills.length + 1)
  })

  it("includes Skills inherited into the active Archetype's slots", () => {
    const result = build(
      baseCharacter,
      [
        warriorRow({
          rank: 1,
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "ca-mage",
              skillKey: "zio",
            },
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

  it("returns no Skills when the active Archetype key is unknown", () => {
    const result = build(
      { ...baseCharacter, activeCharacterArchetypeId: "ca-unknown" },
      [
        {
          id: "ca-unknown",
          archetypeKey: "not-a-real-archetype",
          rank: 5,
          inheritanceSlots: [],
          mechanicState: null,
        },
      ],
      []
    )
    expect(result.activeSkills).toEqual([])
  })

  it("drops an inherited slot whose Skill key resolves to nothing", () => {
    const result = build(
      baseCharacter,
      [
        warriorRow({
          rank: 1,
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "ca-mage",
              skillKey: "not-a-real-skill",
            },
          ],
        }),
      ],
      []
    )
    // The unresolvable key is filtered out, leaving only the rank-1 Archetype Skill.
    expect(result.activeSkills.map((skill) => skill.key)).toEqual(["cleave"])
  })

  it("resolves equipped catalog keys and drops unknown ones", () => {
    const result = build(
      baseCharacter,
      [warriorRow()],
      ["longsword", "does-not-exist"]
    )
    expect(result.equippedItems.map((item) => item.key)).toEqual(["longsword"])
  })

  it("includes Skills granted by equipped item effects", () => {
    const result = build(
      baseCharacter,
      [warriorRow({ rank: 1 })],
      ["zephyr-band"]
    )
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toContain("garu")
    expect(keys).toContain("cleave")
  })

  it("does not duplicate an equipment-granted Skill the Archetype already provides", () => {
    const result = build(
      baseCharacter,
      [
        warriorRow({
          rank: 1,
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "ca-mage",
              skillKey: "garu",
            },
          ],
        }),
      ],
      ["zephyr-band"]
    )
    const garuKeys = result.activeSkills.filter((skill) => skill.key === "garu")
    expect(garuKeys).toHaveLength(1)
  })

  describe("active mechanic", () => {
    it("populates activeMechanic from the active row's mechanicState", () => {
      const result = build(
        baseCharacter,
        [warriorRow({ mechanicState: { kind: "perfection", rank: 3 } })],
        []
      )
      expect(result.activeMechanic).toEqual({
        kind: "perfection",
        state: { kind: "perfection", rank: 3 },
      })
    })

    it("coerces a null mechanicState to the mechanic's initialState", () => {
      const result = build(
        baseCharacter,
        [warriorRow({ mechanicState: null })],
        []
      )
      expect(result.activeMechanic).toEqual({
        kind: "perfection",
        state: { kind: "perfection", rank: 0 },
      })
    })

    it("returns null when no Archetype is active", () => {
      const result = build(
        { ...baseCharacter, activeCharacterArchetypeId: null },
        [warriorRow()],
        []
      )
      expect(result.activeMechanic).toBeNull()
    })

    it("returns null when the active Archetype has no declared mechanic", () => {
      // No Archetype in the shipped catalog omits `mechanic` today, so this
      // case is guarded by an unknown archetypeKey — exercises the same
      // null-on-missing-mechanic branch.
      const result = build(
        {
          ...baseCharacter,
          activeCharacterArchetypeId: "ca-unknown",
        },
        [
          {
            id: "ca-unknown",
            archetypeKey: "not-a-real-archetype",
            rank: 1,
            inheritanceSlots: [],
            mechanicState: null,
          },
        ],
        []
      )
      expect(result.activeMechanic).toBeNull()
    })
  })
})

describe("toStatContext", () => {
  it("maps a hydrated character's archetypes, level, and equipped items", () => {
    const character = makeHydratedCharacter({
      row: {
        activeArchetypeId: "arch-1",
        pathChoice: "balanced",
        level: 4,
        manualBonuses: { hp: 2 },
      },
      archetypeRows: [
        makeArchetypeRow({ id: "arch-1", archetypeKey: "warrior", rank: 5 }),
      ],
      inventoryRows: [
        {
          id: "inv-equipped",
          characterId: FIXTURE_CHARACTER_ID,
          catalogItemKey: "longsword",
          equipped: true,
          quantity: 1,
        },
        {
          id: "inv-stowed",
          characterId: FIXTURE_CHARACTER_ID,
          catalogItemKey: "spear",
          equipped: false,
          quantity: 1,
        },
      ],
    })

    const ctx = toStatContext(character, gameData)

    expect(ctx.activeArchetypeKey).toBe("warrior")
    expect(ctx.archetypes).toContainEqual({
      key: "warrior",
      rank: 5,
      mastery: warrior.mastery,
    })
    expect(ctx.level).toBe(4)
    // Only the equipped item is threaded through (the stowed Spear is dropped).
    expect(ctx.equippedItems.map((item) => item.key)).toEqual(["longsword"])
  })
})
