import { describe, expect, it } from "vitest"

import type {
  CharacterArchetypeRow,
  CharacterRow,
} from "@/lib/db/schema/character"

import { makeArchetype } from "../__fixtures__"
import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "../character/derive-hydrated-character"
import { inheritanceSourceGroups, isInheritableSkill } from "./inheritance"
import { mage } from "./mage/mage"
import {
  buildArchetypeEntries,
  type ArchetypeEntry,
  type RankedSkill,
} from "./utils"

describe("isInheritableSkill", () => {
  it("accepts a Rank-keyed Skill the source has unlocked", () => {
    expect(isInheritableSkill(mage, 2, "agi")).toBe(true)
    expect(isInheritableSkill(mage, 2, "bufu")).toBe(true)
  })

  it("rejects a Skill above the source's current Rank", () => {
    expect(isInheritableSkill(mage, 2, "zio")).toBe(false)
  })

  it("rejects the Synthesis Skill (not in the Rank-keyed list)", () => {
    expect(isInheritableSkill(mage, 5, "elemental-apocalypse")).toBe(false)
  })

  it("rejects a Skill the source Archetype does not declare", () => {
    expect(isInheritableSkill(mage, 5, "cleave")).toBe(false)
  })
})

const CHARACTER_ID = "char-inherit"

const archetypeRow = (
  partial: Pick<CharacterArchetypeRow, "id" | "archetypeKey" | "rank">
): CharacterArchetypeRow => ({
  characterId: CHARACTER_ID,
  inheritanceSlots: [],
  mechanicState: null,
  ...partial,
})

/** Warrior (active, Rank 3) + Mage (Rank 2), no equipment — enough to resolve
 *  every Archetype's ranked Skills for the picker-group assertions. */
function makeRaw(): RawCharacterInputs {
  const row: CharacterRow = {
    id: CHARACTER_ID,
    shortId: "char-inherit-short",
    ownerId: "user-1",
    campaignId: null,
    status: "finalized",
    builderStep: 0,
    name: "Inheritor",
    pronouns: "they/them",
    portraitUrl: null,
    level: 5,
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
    activeArchetypeId: "arch-warrior",
    originCharacterArchetypeId: "arch-warrior",
    savedArchetypeRanks: 0,
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

  return {
    row,
    archetypeRows: [
      archetypeRow({ id: "arch-warrior", archetypeKey: "warrior", rank: 3 }),
      archetypeRow({ id: "arch-mage", archetypeKey: "mage", rank: 2 }),
    ],
    inventoryRows: [],
    knives: [],
    chains: [],
  }
}

describe("inheritanceSourceGroups", () => {
  const entries = buildArchetypeEntries(deriveHydratedCharacter(makeRaw()))

  it("excludes the owner Archetype and lists every other unlocked one", () => {
    const groups = inheritanceSourceGroups(entries, "arch-warrior")
    expect(groups.map((g) => g.sourceCharacterArchetypeId)).toEqual([
      "arch-mage",
    ])
    expect(groups[0]?.archetype.key).toBe("mage")
  })

  it("offers only Skills unlocked at the source's current Rank", () => {
    const [mageGroup] = inheritanceSourceGroups(entries, "arch-warrior")
    expect(mageGroup?.skills.map((s) => s.key).sort()).toEqual(["agi", "bufu"])
  })

  it("offers the owner's Skills when grouping for the Mage's slots", () => {
    const [warriorGroup] = inheritanceSourceGroups(entries, "arch-mage")
    expect(warriorGroup?.archetype.key).toBe("warrior")
    expect(warriorGroup?.skills.map((s) => s.key).sort()).toEqual([
      "cleave",
      "tempest-slash",
      "windblade",
    ])
  })
})

describe("inheritanceSourceGroups source filtering", () => {
  const sampleRankedSkill: RankedSkill = buildArchetypeEntries(
    deriveHydratedCharacter(makeRaw())
  )[0]!.ranks[0]!

  function entry(
    id: string,
    rank: number,
    rankedSkillRanks: number[]
  ): ArchetypeEntry {
    return {
      archetype: makeArchetype({ key: `arch-${id}` }),
      row: {
        id,
        characterId: CHARACTER_ID,
        archetypeKey: "warrior",
        rank,
        inheritanceSlots: [],
        mechanicState: null,
      },
      isActive: false,
      ranks: rankedSkillRanks.map((r) => ({ ...sampleRankedSkill, rank: r })),
      synthesis: null,
      slots: [],
    }
  }

  it("drops a source whose Skills are all above its current Rank", () => {
    const groups = inheritanceSourceGroups(
      [entry("owner", 5, [1]), entry("locked", 1, [3, 4])],
      "owner"
    )

    expect(groups).toEqual([])
  })

  it("keeps a source with at least one in-Rank Skill", () => {
    const groups = inheritanceSourceGroups(
      [entry("owner", 5, [1]), entry("available", 2, [1, 3])],
      "owner"
    )

    expect(groups.map((g) => g.sourceCharacterArchetypeId)).toEqual([
      "available",
    ])
    expect(groups[0]?.skills.map((s) => s.rank)).toEqual([1])
  })
})

describe("buildArchetypeEntries inheritance-slot validity", () => {
  function rawWithSlot(skillKey: string): RawCharacterInputs {
    const raw = makeRaw()
    raw.archetypeRows[0]!.inheritanceSlots = [
      {
        slotIndex: 0,
        sourceCharacterArchetypeId: "arch-mage",
        skillKey,
      },
    ]
    return raw
  }

  it("marks an in-Rank inherited Skill valid", () => {
    const entries = buildArchetypeEntries(
      deriveHydratedCharacter(rawWithSlot("agi"))
    )
    const warriorEntry = entries.find((e) => e.row.id === "arch-warrior")
    expect(warriorEntry?.slots[0]?.isValid).toBe(true)
  })

  it("marks a now-over-Rank inherited Skill invalid", () => {
    const entries = buildArchetypeEntries(
      deriveHydratedCharacter(rawWithSlot("zio"))
    )
    const warriorEntry = entries.find((e) => e.row.id === "arch-warrior")
    expect(warriorEntry?.slots[0]?.isValid).toBe(false)
  })

  it("treats an explicitly-empty slot as valid", () => {
    const raw = makeRaw()
    raw.archetypeRows[0]!.inheritanceSlots = [
      { slotIndex: 0, sourceCharacterArchetypeId: null, skillKey: null },
    ]
    const entries = buildArchetypeEntries(deriveHydratedCharacter(raw))
    const warriorEntry = entries.find((e) => e.row.id === "arch-warrior")
    expect(warriorEntry?.slots[0]?.isValid).toBe(true)
    expect(warriorEntry?.slots[0]?.resolved).toBeNull()
  })
})
