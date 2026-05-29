import { describe, expect, it } from "vitest"

import type { CharacterRow, InventoryItemRow } from "@/lib/db/schema/character"

import { MAX_CURRENCY } from "./currency"
import {
  deriveHydratedCharacter,
  toRawInputs,
  type RawCharacterInputs,
} from "./derive-hydrated-character"
import { reduceCharacter } from "./reduce-character"

const CHARACTER_ID = "char-1"

const inventoryRow = (
  partial: Pick<
    InventoryItemRow,
    "id" | "catalogItemKey" | "equipped" | "quantity"
  >
): InventoryItemRow => ({ characterId: CHARACTER_ID, ...partial })

/** A minimal-but-valid Warrior with an unequipped affinity-armor, an
 *  attribute-granting weapon, and a consumable stack — enough to prove every
 *  derived field re-computes. Cloned per call so tests can't leak. */
function makeRaw(): RawCharacterInputs {
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
    currency: 100,
    prismaCharges: 2,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: "arch-1",
    originCharacterArchetypeId: "arch-1",
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
      {
        id: "arch-1",
        characterId: CHARACTER_ID,
        archetypeKey: "warrior",
        rank: 1,
        inheritanceSlots: [],
        mechanicState: null,
      },
    ],
    inventoryRows: [
      inventoryRow({
        id: "row-mail",
        catalogItemKey: "bladeturn-mail",
        equipped: false,
        quantity: 1,
      }),
      inventoryRow({
        id: "row-cane",
        catalogItemKey: "runed-cane",
        equipped: false,
        quantity: 1,
      }),
      inventoryRow({
        id: "row-drop",
        catalogItemKey: "soul-drop",
        equipped: false,
        quantity: 5,
      }),
    ],
    knives: [],
    chains: [],
  }
}

const make = () => deriveHydratedCharacter(makeRaw())

describe("toRawInputs / deriveHydratedCharacter round-trip", () => {
  it("re-deriving from the stripped inputs reproduces the character", () => {
    const character = make()
    expect(deriveHydratedCharacter(toRawInputs(character))).toEqual(character)
  })
})

describe("reduceCharacter", () => {
  it("equipping armor re-derives the affinity chart", () => {
    const character = make()
    expect(character.affinityChart.slash).not.toBe("resist")

    const next = reduceCharacter(character, {
      kind: "inventory",
      mutation: { kind: "equip", itemId: "row-mail" },
    })

    expect(next.affinityChart.slash).toBe("resist")
    expect(next.inventory.find((i) => i.id === "row-mail")?.equipped).toBe(true)
  })

  it("equipping a weapon re-derives attributes and the weapon attack roll", () => {
    const character = make()
    expect(character.weaponAttackRoll).toBeNull()

    const next = reduceCharacter(character, {
      kind: "inventory",
      mutation: { kind: "equip", itemId: "row-cane" },
    })

    expect(next.attributes.magic).toBe(character.attributes.magic + 1)
    expect(next.weaponAttackRoll).not.toBeNull()
  })

  it("adding a stackable consumable tops up the existing stack", () => {
    const next = reduceCharacter(
      make(),
      {
        kind: "inventory",
        mutation: { kind: "add", catalogItemKey: "soul-drop", quantity: 3 },
      },
      () => "should-not-be-used"
    )

    const drops = next.inventory.filter((i) => i.catalogItemKey === "soul-drop")
    expect(drops).toHaveLength(1)
    expect(drops[0]?.quantity).toBe(8)
  })

  it("setting a stack to 0 removes the row", () => {
    const next = reduceCharacter(make(), {
      kind: "inventory",
      mutation: { kind: "setQuantity", itemId: "row-drop", quantity: 0 },
    })

    expect(next.inventory.some((i) => i.id === "row-drop")).toBe(false)
  })

  it("clamps currency to [0, MAX_CURRENCY]", () => {
    const character = make()
    expect(
      reduceCharacter(character, { kind: "currency", delta: -1000 }).currency
    ).toBe(0)
    expect(
      reduceCharacter(character, { kind: "currency", delta: 1_000_000_000 })
        .currency
    ).toBe(MAX_CURRENCY)
  })

  it("returns the input unchanged when the engine rejects the edit", () => {
    const character = make()
    const next = reduceCharacter(character, {
      kind: "inventory",
      mutation: { kind: "remove", itemId: "does-not-exist" },
    })
    expect(next).toBe(character)
  })

  it("awards victories and clamps at 0", () => {
    const character = make()
    expect(
      reduceCharacter(character, { kind: "victories", delta: 2 }).victories
    ).toBe(2)
    expect(
      reduceCharacter(character, { kind: "victories", delta: -5 }).victories
    ).toBe(0)
  })

  it("applies damage and clamps heal at max HP", () => {
    const character = make()
    const hurt = reduceCharacter(character, { kind: "damage", amount: 5 })
    expect(hurt.currentHP).toBe(character.currentHP - 5)
    const healed = reduceCharacter(hurt, { kind: "heal", amount: 9999 })
    expect(healed.currentHP).toBe(character.maxHP)
  })

  it("steps exhaustion and clamps at 0", () => {
    const character = make()
    const up = reduceCharacter(character, {
      kind: "exhaustion",
      direction: "increment",
    })
    expect(up.exhaustion).toBe(1)
    expect(
      reduceCharacter(character, { kind: "exhaustion", direction: "decrement" })
        .exhaustion
    ).toBe(0)
  })

  it("sets ailments and battle conditions, and clearCombatState wipes them", () => {
    const character = make()
    const ailing = reduceCharacter(character, {
      kind: "ailments",
      ailments: ["downed"],
    })
    expect(ailing.ailments).toEqual(["downed"])

    const buffed = reduceCharacter(ailing, {
      kind: "battleConditionAxis",
      axis: "attack",
      state: "increased",
    })
    expect(buffed.battleConditions?.attack.state).toBe("increased")

    const cleared = reduceCharacter(buffed, { kind: "clearCombatState" })
    expect(cleared.ailments).toEqual([])
    expect(cleared.battleConditions?.attack.state).toBe("neutral")
  })

  it("spends a Prisma charge and refuses at 0", () => {
    const character = make()
    const used = reduceCharacter(character, { kind: "usePrisma" })
    expect(used.prismaCharges).toBe(character.prismaCharges - 1)

    const empty = reduceCharacter(character, { kind: "currency", delta: 0 })
    const drained = { ...empty, prismaCharges: 0 }
    expect(reduceCharacter(drained, { kind: "usePrisma" })).toBe(drained)
  })

  it("steps the active Archetype's Perfection mechanic", () => {
    const character = make()
    const next = reduceCharacter(character, {
      kind: "perfection",
      op: "increment",
    })
    const mechanic = next.activeMechanic?.state
    expect(mechanic?.kind).toBe("perfection")
    expect(mechanic).toMatchObject({ rank: 1 })
  })

  it("ignores a mechanic edit that doesn't match the active Archetype's mechanic", () => {
    // Establish a Perfection state on the active Archetype, then dispatch a
    // Valor edit: it must be a no-op rather than corrupting the Perfection
    // state through the transform's cast.
    const perfected = reduceCharacter(make(), {
      kind: "perfection",
      op: "increment",
    })
    expect(
      reduceCharacter(perfected, { kind: "valor", direction: "increment" })
    ).toBe(perfected)
  })

  it("adds and removes gained talents", () => {
    const character = make()
    const added = reduceCharacter(character, {
      kind: "talentAdd",
      talentKey: "alchemy",
    })
    expect(added.gainedTalents).toContain("alchemy")
    const removed = reduceCharacter(added, {
      kind: "talentRemove",
      talentKey: "alchemy",
    })
    expect(removed.gainedTalents).not.toContain("alchemy")
  })

  it("adds a spark tagged with a virtue", () => {
    const character = make()
    const next = reduceCharacter(character, {
      kind: "addSpark",
      virtue: "wisdom",
    })
    expect(next.sparkLog).toEqual([...character.sparkLog, "wisdom"])
  })
})
