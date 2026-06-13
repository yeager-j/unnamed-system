import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  FIXTURE_CHARACTER_ID,
  makeArchetypeRow,
  makeHydratedCharacter,
  makeStatContext,
} from "@workspace/game/engine/__fixtures__/character"
import {
  makeAccessory,
  makeWeapon,
} from "@workspace/game/engine/__fixtures__/fixtures"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { makePassiveSkill } from "@workspace/game/engine/__fixtures__/skills"
import {
  applyMechanicTransform,
  buildStatContext,
  toStatContext,
  type PersistedArchetypeState,
  type PersistedCharacterState,
} from "@workspace/game/engine/character/stats/stat-character"
import { type StatContext } from "@workspace/game/engine/character/stats/stats"
import { getMechanic } from "@workspace/game/engine/mechanics/registry"
import { type MechanicStatTransform } from "@workspace/game/engine/mechanics/types"
import { type MechanicState } from "@workspace/game/foundation/mechanics/schema"

/**
 * Real catalog keys used as **opaque ids**: every Rank/Skill/Lineage below is a
 * value this file *assigns* on a fixture, so the assertions prove the
 * stat-context assembly *behavior* (Rank gating, inheritance folding, mechanic
 * coercion) and never the shipped catalog's balance — a rebalance can't break
 * this slice.
 */
const W1 = "cleave" // Warrior Rank 1
const W2 = "windblade" // Warrior Rank 2
const SYN = "elemental-apocalypse" // Warrior Synthesis @5
const M1 = "zio" // Mage Rank 1, also inherited across Archetypes
const GRANTED = "garu" // granted by the fixture accessory

const fxWarrior = makeArchetype({
  key: "warrior",
  lineage: "warrior",
  mechanic: "perfection",
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 2, magic: -1, agility: 1, luck: 0 },
  affinities: { fire: "weak", ice: "resist" },
  skills: [
    { skill: W1, rank: 1 },
    { skill: W2, rank: 2 },
  ],
  synthesisSkill: { skill: SYN, rank: 5 },
})
const fxMage = makeArchetype({
  key: "mage",
  lineage: "mage",
  skills: [{ skill: M1, rank: 1 }],
})
/** A fixture Archetype with no declared mechanic — the real catalog has none,
 *  so only a fixture can exercise the "Archetype has no mechanic" branch. */
const fxNoMechanic = makeArchetype({ key: "nomech", lineage: "warlock" })

const grantAccessory = makeAccessory("zephyr-band", [
  { type: "skill", skillKey: GRANTED },
])

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior, fxMage, fxNoMechanic],
  skills: [W1, W2, SYN, M1, GRANTED].map((key) => makePassiveSkill({ key })),
  items: [makeWeapon("longsword"), makeWeapon("spear"), grantAccessory],
})

/** Binds the fixture catalog so the boundary call sites stay terse. */
const build = (
  character: PersistedCharacterState,
  archetypes: readonly PersistedArchetypeState[],
  equippedItemKeys: readonly string[]
) => buildStatContext(TEST_DATA)(character, archetypes, equippedItemKeys)

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
      { key: "warrior", rank: 2, mastery: fxWarrior.mastery },
    ])
  })

  it("resolves the active Archetype's base attributes and affinities", () => {
    const result = build(baseCharacter, [warriorRow()], [])
    expect(result.baseAttributes).toEqual(fxWarrior.attributes)
    expect(result.baseAffinities.fire).toBe("weak")
    expect(result.baseAffinities.ice).toBe("resist")
    // An uncharted type falls through to Neutral.
    expect(result.baseAffinities.elec).toBe("neutral")
  })

  it("leaves the resolved base untouched for a mechanic with no transform", () => {
    // Perfection (the fixture Warrior's mechanic) declares no `transform`, so
    // the post-hydration transform step is a no-op and the Archetype base flows
    // through unchanged.
    const result = build(
      baseCharacter,
      [warriorRow({ mechanicState: { kind: "perfection", rank: 3 } })],
      []
    )
    expect(result.baseAttributes).toEqual(fxWarrior.attributes)
    expect(result.baseAffinities.fire).toBe("weak")
  })

  it("resolves the active Archetype's Lineage onto the context", () => {
    const result = build(baseCharacter, [warriorRow()], [])
    expect(result.activeLineage).toBe(fxWarrior.lineage)
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
      { key: "warrior", rank: 2, mastery: fxWarrior.mastery },
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
    expect(keys).toEqual([W1, W2])
  })

  it("includes the Synthesis Skill once the active Rank reaches it", () => {
    const result = build(baseCharacter, [warriorRow({ rank: 5 })], [])
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toContain(SYN)
    expect(keys).toHaveLength(fxWarrior.skills.length + 1)
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
              skillKey: M1,
            },
            { slotIndex: 1, sourceCharacterArchetypeId: null, skillKey: null },
          ],
        }),
      ],
      []
    )
    const keys = result.activeSkills.map((skill) => skill.key)
    expect(keys).toContain(W1)
    expect(keys).toContain(M1)
    expect(keys).not.toContain(W2)
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
    expect(result.activeSkills.map((skill) => skill.key)).toEqual([W1])
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
    expect(keys).toContain(GRANTED)
    expect(keys).toContain(W1)
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
              skillKey: GRANTED,
            },
          ],
        }),
      ],
      ["zephyr-band"]
    )
    const grantedKeys = result.activeSkills.filter(
      (skill) => skill.key === GRANTED
    )
    expect(grantedKeys).toHaveLength(1)
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
        state: getMechanic("perfection")!.initialState(),
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
      const result = build(
        { ...baseCharacter, activeCharacterArchetypeId: "ca-nomech" },
        [
          {
            id: "ca-nomech",
            archetypeKey: "nomech",
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
    const character = makeHydratedCharacter(
      {
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
      },
      TEST_DATA
    )

    const ctx = toStatContext(TEST_DATA)(character)

    expect(ctx.activeArchetypeKey).toBe("warrior")
    expect(ctx.archetypes).toContainEqual({
      key: "warrior",
      rank: 5,
      mastery: fxWarrior.mastery,
    })
    expect(ctx.level).toBe(4)
    // Only the equipped item is threaded through (the stowed Spear is dropped).
    expect(ctx.equippedItems.map((item) => item.key)).toEqual(["longsword"])
  })
})

describe("applyMechanicTransform", () => {
  const perfectionState: MechanicState = { kind: "perfection", rank: 2 }

  /** A context with an active mechanic, so a transform can fire against it. */
  const contextWithMechanic = (overrides = {}) =>
    makeStatContext(
      {
        activeMechanic: { kind: "perfection", state: perfectionState },
        activeSkills: [makePassiveSkill({ key: W1 })],
        ...overrides,
      },
      TEST_DATA
    )

  const newAttributes = { strength: -3, magic: 4, agility: 0, luck: 2 }

  it("replaces base attributes, affinities, and active Skills the transform returns", () => {
    const context = contextWithMechanic()
    const shapeSkill = makePassiveSkill({ key: "shape-claw" })
    const transform = (_state: MechanicState, ctx: StatContext) =>
      ({
        baseAttributes: newAttributes,
        baseAffinities: { ...ctx.baseAffinities, fire: "drain" },
        activeSkills: [shapeSkill],
      }) satisfies MechanicStatTransform

    const result = applyMechanicTransform(context, { transform })

    expect(result.baseAttributes).toEqual(newAttributes)
    expect(result.baseAffinities.fire).toBe("drain")
    expect(result.activeSkills).toEqual([shapeSkill])
  })

  it("keeps a field the transform omits", () => {
    const context = contextWithMechanic()
    const transform = () =>
      ({ baseAttributes: newAttributes }) satisfies MechanicStatTransform

    const result = applyMechanicTransform(context, { transform })

    expect(result.baseAttributes).toEqual(newAttributes)
    expect(result.baseAffinities).toEqual(context.baseAffinities)
    expect(result.activeSkills).toEqual(context.activeSkills)
  })

  it("passes the active mechanic's state and the assembled context to the transform", () => {
    const context = contextWithMechanic()
    let received: { state: MechanicState; context: StatContext } | undefined
    const transform = (state: MechanicState, ctx: StatContext) => {
      received = { state, context: ctx }
      return {}
    }

    applyMechanicTransform(context, { transform })

    expect(received?.state).toBe(perfectionState)
    expect(received?.context).toBe(context)
  })

  it("returns the context unchanged when the mechanic declares no transform", () => {
    const context = contextWithMechanic()
    expect(applyMechanicTransform(context, {})).toBe(context)
    expect(applyMechanicTransform(context, undefined)).toBe(context)
  })

  it("returns the context unchanged when no mechanic is active", () => {
    const context = makeStatContext({ activeMechanic: null }, TEST_DATA)
    const transform = () =>
      ({ baseAttributes: newAttributes }) satisfies MechanicStatTransform

    expect(applyMechanicTransform(context, { transform })).toBe(context)
  })
})
