import { describe, expect, it } from "vitest"

import type {
  CharacterArchetypeRow,
  CharacterRow,
} from "@/lib/db/schema/character"

import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "../character/derive-hydrated-character"
import { LINEAGES } from "../character/lineage"
import { atlasNodeState, buildLineageAtlas, unmetPrerequisites } from "./atlas"
import type { Archetype } from "./schema"

const CHARACTER_ID = "char-1"

function archetypeRow(
  partial: Pick<CharacterArchetypeRow, "id" | "archetypeKey" | "rank">
): CharacterArchetypeRow {
  return {
    characterId: CHARACTER_ID,
    inheritanceSlots: [],
    mechanicState: null,
    ...partial,
  }
}

function makeCharacter(options: {
  archetypeRows?: CharacterArchetypeRow[]
  savedArchetypeRanks?: number
  activeArchetypeId?: string | null
  originCharacterArchetypeId?: string | null
}) {
  const archetypeRows = options.archetypeRows ?? []
  const row: CharacterRow = {
    id: CHARACTER_ID,
    shortId: "char-1-short",
    ownerId: "user-1",
    status: "finalized",
    builderStep: 0,
    name: "Test Character",
    pronouns: "they/them",
    portraitUrl: null,
    level: 1,
    pathChoice: "balanced",
    currentHP: 20,
    currentSP: 20,
    hitDiceRemaining: 0,
    skillDiceRemaining: 0,
    manualBonuses: {},
    virtueExpression: 0,
    virtueEmpathy: 0,
    virtueWisdom: 0,
    virtueFocus: 0,
    sparkLog: [],
    victories: 0,
    currency: 0,
    prismaCharges: 2,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: options.activeArchetypeId ?? null,
    originCharacterArchetypeId: options.originCharacterArchetypeId ?? null,
    savedArchetypeRanks: options.savedArchetypeRanks ?? 0,
    ancestryText: null,
    backgroundText: null,
    backstoryText: null,
    personalityTraits: null,
    hopes: null,
    dreams: null,
    fears: null,
    secrets: null,
    gainedTalents: [],
    notes: null,
    identityVersion: 0,
    vitalsVersion: 0,
    inventoryVersion: 0,
    progressionVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }
  const raw: RawCharacterInputs = {
    row,
    archetypeRows,
    inventoryRows: [],
    knives: [],
    chains: [],
  }
  return deriveHydratedCharacter(raw)
}

/** A synthetic Adept that advances from Knight at Rank 5, for prerequisite
 *  logic that the shipped Initiate-only catalog can't exercise on its own. */
const syntheticAdept = {
  key: "synthetic-adept",
  name: "Synthetic Adept",
  lineage: "knight",
  tier: "adept",
  prerequisites: [{ archetype: "knight", rank: 5 }],
  inheritanceSlots: 3,
  talents: [],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 3, magic: -1, agility: 1, luck: 0 },
  affinities: {},
  skills: [],
} satisfies Archetype

describe("unmetPrerequisites", () => {
  it("is empty when the prerequisite Rank is met", () => {
    expect(
      unmetPrerequisites(syntheticAdept, new Map([["knight", 5]]))
    ).toEqual([])
  })

  it("returns the prerequisite when the owned Rank is too low", () => {
    expect(
      unmetPrerequisites(syntheticAdept, new Map([["knight", 4]]))
    ).toEqual([{ archetype: "knight", rank: 5 }])
  })

  it("returns the prerequisite when the parent Archetype is unowned", () => {
    expect(unmetPrerequisites(syntheticAdept, new Map())).toEqual([
      { archetype: "knight", rank: 5 },
    ])
  })
})

describe("atlasNodeState", () => {
  const noOwned = new Map<string, number>()

  it("is unlockable when unowned and all prerequisites are met", () => {
    expect(
      atlasNodeState(syntheticAdept, null, new Map([["knight", 5]]))
    ).toEqual({ kind: "unlockable" })
  })

  it("is locked with the unmet prerequisites when unowned and gated", () => {
    expect(atlasNodeState(syntheticAdept, null, noOwned)).toEqual({
      kind: "locked",
      unmetPrerequisites: [{ archetype: "knight", rank: 5 }],
    })
  })

  it("is owned below the Mastery Rank", () => {
    expect(atlasNodeState(syntheticAdept, 3, noOwned)).toEqual({
      kind: "owned",
      rank: 3,
    })
  })

  it("is mastered at the Mastery Rank", () => {
    expect(atlasNodeState(syntheticAdept, 5, noOwned)).toEqual({
      kind: "mastered",
      rank: 5,
    })
  })
})

describe("buildLineageAtlas", () => {
  it("lists all twelve Lineages in canonical order", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    expect(view.lineages.map((entry) => entry.lineage)).toEqual([...LINEAGES])
  })

  it("gives every Lineage all four tier columns in order", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    for (const entry of view.lineages) {
      expect(entry.columns.map((column) => column.tier)).toEqual([
        "initiate",
        "adept",
        "elite",
        "paragon",
      ])
    }
  })

  it("places a shipped Initiate in its Lineage's Initiate column as unlockable when unowned", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    const knight = view.lineages.find((entry) => entry.lineage === "knight")!
    expect(knight.progress).toEqual({ owned: 0, total: 1 })
    const initiateColumn = knight.columns.find(
      (column) => column.tier === "initiate"
    )!
    expect(initiateColumn.nodes).toHaveLength(1)
    expect(initiateColumn.nodes[0]!.archetype.key).toBe("knight")
    expect(initiateColumn.nodes[0]!.state).toEqual({ kind: "unlockable" })
  })

  it("marks an owned Archetype owned and bumps the Lineage progress", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "knight", rank: 2 }),
        ],
      })
    )
    const knight = view.lineages.find((entry) => entry.lineage === "knight")!
    expect(knight.progress).toEqual({ owned: 1, total: 1 })
    const node = knight.columns.find((column) => column.tier === "initiate")!
      .nodes[0]!
    expect(node.state).toEqual({ kind: "owned", rank: 2 })
    expect(node.characterArchetypeId).toBe("a1")
  })

  it("marks a Rank-5 Archetype mastered", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "mage", rank: 5 }),
        ],
      })
    )
    const node = view.lineages
      .find((entry) => entry.lineage === "mage")!
      .columns.find((column) => column.tier === "initiate")!.nodes[0]!
    expect(node.state).toEqual({ kind: "mastered", rank: 5 })
  })

  it("passes through Saved Ranks, unlocked count, and Origin Lineage", () => {
    const view = buildLineageAtlas(
      makeCharacter({
        archetypeRows: [
          archetypeRow({ id: "a1", archetypeKey: "warrior", rank: 3 }),
          archetypeRow({ id: "a2", archetypeKey: "healer", rank: 1 }),
        ],
        savedArchetypeRanks: 4,
        originCharacterArchetypeId: "a1",
      })
    )
    expect(view.savedRanks).toBe(4)
    expect(view.unlockedCount).toBe(2)
    expect(view.originLineage).toBe("warrior")
  })

  it("carries an Archetype's prerequisite keys as its parent links", () => {
    const view = buildLineageAtlas(makeCharacter({}))
    const knightNode = view.lineages
      .find((entry) => entry.lineage === "knight")!
      .columns.find((column) => column.tier === "initiate")!.nodes[0]!
    expect(knightNode.parentKeys).toEqual([])
  })
})
