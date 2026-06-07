import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { MASTERY_RANK } from "@workspace/game/engine/archetypes/rank"
import type { RawCharacterInputs } from "@workspace/game/engine/character/derive-hydrated-character"
import { reduceArchetypeEdit } from "@workspace/game/engine/character/reduce/archetypes"

const STABLE_ID = () => "minted-id"

/** Binds the catalog: defaults to the production set, or takes an injected
 *  fixture catalog for the prerequisite cases. */
const reduceArch = (
  raw: Parameters<typeof reduceArchetypeEdit>[0],
  edit: Parameters<typeof reduceArchetypeEdit>[1],
  newId: Parameters<typeof reduceArchetypeEdit>[2],
  catalog: Parameters<typeof reduceArchetypeEdit>[3] = gameData.allArchetypes()
) => reduceArchetypeEdit(raw, edit, newId, catalog)

function rowsById(raw: RawCharacterInputs | null) {
  return new Map(raw?.archetypeRows.map((row) => [row.id, row]))
}

describe("reduceArchetypeEdit — switchActiveArchetype", () => {
  it("patches the active id", () => {
    const raw = makeRawCharacterInputs({
      archetypeRows: [makeArchetypeRow({ id: "a1" })],
    })
    expect(
      reduceArch(
        raw,
        { kind: "switchActiveArchetype", characterArchetypeId: "a1" },
        STABLE_ID
      )?.row.activeArchetypeId
    ).toBe("a1")
  })
})

describe("reduceArchetypeEdit — setInheritanceSlot", () => {
  it("replaces the slot at the edit's index while preserving slots at other indices", () => {
    const raw = makeRawCharacterInputs({
      archetypeRows: [
        makeArchetypeRow({
          id: "a1",
          inheritanceSlots: [
            {
              slotIndex: 0,
              sourceCharacterArchetypeId: "src",
              skillKey: "old",
            },
            {
              slotIndex: 1,
              sourceCharacterArchetypeId: "keep",
              skillKey: "kept",
            },
          ],
        }),
      ],
    })

    const next = reduceArch(
      raw,
      {
        kind: "setInheritanceSlot",
        characterArchetypeId: "a1",
        slotIndex: 0,
        sourceCharacterArchetypeId: "new-src",
        skillKey: "new",
      },
      STABLE_ID
    )

    const slots = next?.archetypeRows.find(
      (row) => row.id === "a1"
    )?.inheritanceSlots
    expect(slots).toContainEqual({
      slotIndex: 1,
      sourceCharacterArchetypeId: "keep",
      skillKey: "kept",
    })
    expect(slots).toContainEqual({
      slotIndex: 0,
      sourceCharacterArchetypeId: "new-src",
      skillKey: "new",
    })
    expect(slots?.filter((slot) => slot.slotIndex === 0)).toHaveLength(1)
  })

  it("is a no-op when the owning row is unknown", () => {
    const raw = makeRawCharacterInputs({
      archetypeRows: [makeArchetypeRow({ id: "a1" })],
    })
    expect(
      reduceArch(
        raw,
        {
          kind: "setInheritanceSlot",
          characterArchetypeId: "ghost",
          slotIndex: 0,
          sourceCharacterArchetypeId: null,
          skillKey: null,
        },
        STABLE_ID
      )
    ).toBeNull()
  })
})

describe("reduceArchetypeEdit — unlockArchetype", () => {
  it("appends the unlocked Archetype at Rank 1 and spends a Saved Rank", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [makeArchetypeRow({ id: "a1", archetypeKey: "warrior" })],
    })

    const next = reduceArch(
      raw,
      { kind: "unlockArchetype", archetypeKey: "mage" },
      STABLE_ID
    )

    const minted = next?.archetypeRows.find((row) => row.id === "minted-id")
    expect(minted?.archetypeKey).toBe("mage")
    expect(minted?.rank).toBe(1)
    expect(minted?.inheritanceSlots).toEqual([])
    expect(minted?.mechanicState).toBeNull()
    expect(next?.row.savedArchetypeRanks).toBe(1)
  })

  it("is a no-op for an unknown Archetype key", () => {
    const raw = makeRawCharacterInputs({ row: { savedArchetypeRanks: 2 } })
    expect(
      reduceArch(
        raw,
        { kind: "unlockArchetype", archetypeKey: "not-a-real-archetype" },
        STABLE_ID
      )
    ).toBeNull()
  })

  it("is a no-op when the Archetype is already owned (a non-matching row alone wouldn't block it)", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "warrior" }),
        makeArchetypeRow({ id: "a2", archetypeKey: "mage" }),
      ],
    })
    expect(
      reduceArch(
        raw,
        { kind: "unlockArchetype", archetypeKey: "mage" },
        STABLE_ID
      )
    ).toBeNull()
  })

  it("is a no-op when no Saved Rank is available", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 0 },
      archetypeRows: [makeArchetypeRow({ id: "a1", archetypeKey: "warrior" })],
    })
    expect(
      reduceArch(
        raw,
        { kind: "unlockArchetype", archetypeKey: "mage" },
        STABLE_ID
      )
    ).toBeNull()
  })
})

describe("reduceArchetypeEdit — rankUpArchetype", () => {
  it("increments only the targeted row's rank, leaving siblings untouched", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "warrior", rank: 1 }),
        makeArchetypeRow({ id: "a2", archetypeKey: "mage", rank: 3 }),
      ],
    })

    const next = reduceArch(
      raw,
      { kind: "rankUpArchetype", characterArchetypeId: "a1" },
      STABLE_ID
    )

    const rows = rowsById(next)
    expect(rows.get("a1")?.rank).toBe(2)
    expect(rows.get("a2")?.rank).toBe(3)
    expect(next?.row.savedArchetypeRanks).toBe(1)
  })

  it("is a no-op at the Mastery Rank", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({
          id: "a1",
          archetypeKey: "warrior",
          rank: MASTERY_RANK,
        }),
      ],
    })
    expect(
      reduceArch(
        raw,
        { kind: "rankUpArchetype", characterArchetypeId: "a1" },
        STABLE_ID
      )
    ).toBeNull()
  })

  it("is a no-op when no Saved Rank is available", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 0 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "warrior", rank: 1 }),
      ],
    })
    expect(
      reduceArch(
        raw,
        { kind: "rankUpArchetype", characterArchetypeId: "a1" },
        STABLE_ID
      )
    ).toBeNull()
  })

  it("is a no-op when the row is unknown", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "warrior", rank: 1 }),
      ],
    })
    expect(
      reduceArch(
        raw,
        { kind: "rankUpArchetype", characterArchetypeId: "ghost" },
        STABLE_ID
      )
    ).toBeNull()
  })
})

describe("reduceArchetypeEdit — unlockArchetype prerequisites (injected catalog)", () => {
  const PREREQ_CATALOG = [
    makeArchetype({ key: "base" }),
    makeArchetype({
      key: "advanced",
      prerequisites: [{ archetype: "base", rank: 5 }],
    }),
  ]

  it("is a no-op when a prerequisite Rank is not yet met", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "base", rank: 4 }),
      ],
    })
    expect(
      reduceArch(
        raw,
        { kind: "unlockArchetype", archetypeKey: "advanced" },
        STABLE_ID,
        PREREQ_CATALOG
      )
    ).toBeNull()
  })

  it("unlocks once every prerequisite is met", () => {
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "base", rank: 5 }),
      ],
    })
    const next = reduceArch(
      raw,
      { kind: "unlockArchetype", archetypeKey: "advanced" },
      STABLE_ID,
      PREREQ_CATALOG
    )
    expect(
      next?.archetypeRows.find((row) => row.id === "minted-id")?.archetypeKey
    ).toBe("advanced")
    expect(next?.row.savedArchetypeRanks).toBe(1)
  })

  it("does not count an owned row outside the catalog toward prerequisites", () => {
    const catalog = [
      makeArchetype({
        key: "advanced",
        prerequisites: [{ archetype: "phantom", rank: 5 }],
      }),
    ]
    const raw = makeRawCharacterInputs({
      row: { savedArchetypeRanks: 2 },
      archetypeRows: [
        makeArchetypeRow({ id: "a1", archetypeKey: "phantom", rank: 9 }),
      ],
    })
    expect(
      reduceArch(
        raw,
        { kind: "unlockArchetype", archetypeKey: "advanced" },
        STABLE_ID,
        catalog
      )
    ).toBeNull()
  })
})
