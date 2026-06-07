import { describe, expect, it } from "vitest"

import { gameData } from "@workspace/game/data/game-data"
import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeHydratedCharacter,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/character"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  inheritanceSourceGroups,
  isInheritableSkill,
} from "@workspace/game/engine/archetypes/inheritance"
import {
  buildArchetypeEntries,
  type ArchetypeEntry,
  type RankedSkill,
} from "@workspace/game/engine/archetypes/utils"
import {
  deriveHydratedCharacter,
  type RawCharacterInputs,
} from "@workspace/game/engine/character/derive-hydrated-character"
import { type Skill } from "@workspace/game/foundation/skills/schema"

/**
 * Real {@link import("@workspace/game/foundation/skills/schema").SkillKey}s used
 * as **opaque identifiers** — these tests assign each one's unlock Rank in the
 * fixture below, so they assert inheritance *logic*, never the shipped catalog's
 * balance. A rebalance of any of these Skills can't break this slice.
 */
const LOW = "agi" // fixture: unlocked at Rank 1
const MID = "bufu" // fixture: unlocked at Rank 2
const HIGH = "zio" // fixture: unlocked at Rank 4
const SYNTH = "elemental-apocalypse" // fixture: the Mage's Synthesis Skill
const W_LOW = "cleave" // fixture: Warrior Rank 1
const W_MID = "windblade" // fixture: Warrior Rank 2
const W_HIGH = "tempest-slash" // fixture: Warrior Rank 5

/** A minimal passive Skill carrying no effects — enough for `buildArchetypeEntries`
 *  to hydrate the reference; the content is irrelevant to inheritance logic. */
const fxSkill = (key: string): Skill => ({
  kind: "passive",
  key,
  name: key,
  tagline: key,
  description: key,
  isSynthesis: false,
  effects: [],
})

const fxMage = makeArchetype({
  key: "fx-mage",
  lineage: "mage",
  skills: [
    { skill: LOW, rank: 1 },
    { skill: MID, rank: 2 },
    { skill: HIGH, rank: 4 },
  ],
  synthesisSkill: { skill: SYNTH, rank: 5 },
})

const fxWarrior = makeArchetype({
  key: "fx-warrior",
  lineage: "warrior",
  skills: [
    { skill: W_LOW, rank: 1 },
    { skill: W_MID, rank: 2 },
    { skill: W_HIGH, rank: 5 },
  ],
})

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior, fxMage],
  skills: [LOW, MID, HIGH, SYNTH, W_LOW, W_MID, W_HIGH].map(fxSkill),
})

describe("isInheritableSkill", () => {
  it("accepts a Rank-keyed Skill the source has unlocked", () => {
    expect(isInheritableSkill(fxMage, 2, LOW)).toBe(true)
    expect(isInheritableSkill(fxMage, 2, MID)).toBe(true)
  })

  it("rejects a Skill above the source's current Rank", () => {
    expect(isInheritableSkill(fxMage, 2, HIGH)).toBe(false)
  })

  it("rejects the Synthesis Skill (not in the Rank-keyed list)", () => {
    expect(isInheritableSkill(fxMage, 5, SYNTH)).toBe(false)
  })

  it("rejects a Skill the source Archetype does not declare", () => {
    expect(isInheritableSkill(fxMage, 5, W_LOW)).toBe(false)
  })
})

/** Warrior (active, Rank 3) + Mage (Rank 2), no equipment — enough to resolve
 *  every Archetype's ranked Skills for the picker-group assertions. */
function makeRaw(): RawCharacterInputs {
  return makeRawCharacterInputs({
    row: {
      level: 5,
      activeArchetypeId: "arch-warrior",
      originCharacterArchetypeId: "arch-warrior",
    },
    archetypeRows: [
      makeArchetypeRow({
        id: "arch-warrior",
        archetypeKey: "fx-warrior",
        rank: 3,
      }),
      makeArchetypeRow({ id: "arch-mage", archetypeKey: "fx-mage", rank: 2 }),
    ],
  })
}

const derive = (raw: RawCharacterInputs) =>
  deriveHydratedCharacter(raw, TEST_DATA)
const buildEntries = (character: Parameters<typeof buildArchetypeEntries>[0]) =>
  buildArchetypeEntries(character, TEST_DATA)

describe("inheritanceSourceGroups", () => {
  const entries = buildEntries(derive(makeRaw()))

  it("excludes the owner Archetype and lists every other unlocked one", () => {
    const groups = inheritanceSourceGroups(entries, "arch-warrior")
    expect(groups.map((g) => g.sourceCharacterArchetypeId)).toEqual([
      "arch-mage",
    ])
    expect(groups[0]?.archetype.key).toBe("fx-mage")
  })

  it("offers only Skills unlocked at the source's current Rank", () => {
    const [mageGroup] = inheritanceSourceGroups(entries, "arch-warrior")
    expect(mageGroup?.skills.map((s) => s.key).sort()).toEqual(
      [LOW, MID].sort()
    )
  })

  it("offers the owner's Skills (gated by its Rank) when grouping for the Mage's slots", () => {
    const [warriorGroup] = inheritanceSourceGroups(entries, "arch-mage")
    expect(warriorGroup?.archetype.key).toBe("fx-warrior")
    // Warrior is Rank 3, so its Rank-5 Skill (W_HIGH) is excluded.
    expect(warriorGroup?.skills.map((s) => s.key).sort()).toEqual(
      [W_LOW, W_MID].sort()
    )
  })
})

describe("inheritanceSourceGroups source filtering", () => {
  const sampleRankedSkill: RankedSkill = buildEntries(derive(makeRaw()))[0]!
    .ranks[0]!

  function entry(
    id: string,
    rank: number,
    rankedSkillRanks: number[]
  ): ArchetypeEntry {
    return {
      archetype: makeArchetype({ key: `arch-${id}` }),
      row: {
        id,
        characterId: "char-inherit",
        archetypeKey: "fx-warrior",
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
    const entries = buildEntries(derive(rawWithSlot(LOW)))
    const warriorEntry = entries.find((e) => e.row.id === "arch-warrior")
    expect(warriorEntry?.slots[0]?.isValid).toBe(true)
  })

  it("marks a now-over-Rank inherited Skill invalid", () => {
    const entries = buildEntries(derive(rawWithSlot(HIGH)))
    const warriorEntry = entries.find((e) => e.row.id === "arch-warrior")
    expect(warriorEntry?.slots[0]?.isValid).toBe(false)
  })

  it("treats an explicitly-empty slot as valid", () => {
    const raw = makeRaw()
    raw.archetypeRows[0]!.inheritanceSlots = [
      { slotIndex: 0, sourceCharacterArchetypeId: null, skillKey: null },
    ]
    const entries = buildEntries(derive(raw))
    const warriorEntry = entries.find((e) => e.row.id === "arch-warrior")
    expect(warriorEntry?.slots[0]?.isValid).toBe(true)
    expect(warriorEntry?.slots[0]?.resolved).toBeNull()
  })
})

describe("inheritance — real catalog (smoke)", () => {
  it("resolves inheritable Skills between two shipped Archetypes", () => {
    const character = makeHydratedCharacter({
      row: { activeArchetypeId: "w", originCharacterArchetypeId: "w" },
      archetypeRows: [
        makeArchetypeRow({ id: "w", archetypeKey: "warrior", rank: 3 }),
        makeArchetypeRow({ id: "m", archetypeKey: "mage", rank: 2 }),
      ],
    })
    const groups = inheritanceSourceGroups(
      buildArchetypeEntries(character, gameData),
      "w"
    )
    expect(groups.map((g) => g.archetype.key)).toEqual(["mage"])
    expect(groups[0]!.skills.length).toBeGreaterThan(0)
  })
})
