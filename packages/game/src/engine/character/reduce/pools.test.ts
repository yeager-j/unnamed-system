import { describe, expect, it } from "vitest"

import {
  makeArchetypeRow,
  makeHydratedCharacter,
  makeRawCharacterInputs,
} from "@workspace/game/engine/__fixtures__/index"
import type { RawCharacterInputs } from "@workspace/game/engine/character/derive-hydrated-character"
import { reducePoolsEdit } from "@workspace/game/engine/character/reduce/pools"
import type { HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"

const ACTIVE = "active-arch"

/** A Level-5 Warrior whose active Archetype contributes cost-bearing Skills, so
 *  the `cast` arm has a real `resolvedCost` to deduct. */
function warriorInputs(row: Partial<RawCharacterInputs["row"]> = {}) {
  return makeRawCharacterInputs({
    row: { level: 5, activeArchetypeId: ACTIVE, ...row },
    archetypeRows: [
      makeArchetypeRow({ id: ACTIVE, archetypeKey: "warrior", rank: 5 }),
    ],
  })
}

function hydrate(raw: RawCharacterInputs): HydratedCharacter {
  return makeHydratedCharacter({
    row: raw.row,
    archetypeRows: raw.archetypeRows,
    inventoryRows: raw.inventoryRows,
    knives: raw.knives,
    chains: raw.chains,
  })
}

const skillCost = (character: HydratedCharacter, key: string) =>
  character.skills.find((skill) => skill.key === key)?.resolvedCost

describe("reducePoolsEdit — manual HP/SP/Prisma affordances", () => {
  it("spends SP, flooring at 0 and rejecting an over-spend differently", () => {
    const raw = warriorInputs({ currentSP: 5 })
    const character = hydrate(raw)

    expect(
      reducePoolsEdit(raw, character, { kind: "spendSP", amount: 3 })?.row
        .currentSP
    ).toBe(2)
    expect(
      reducePoolsEdit(raw, character, { kind: "spendSP", amount: 9 })?.row
        .currentSP
    ).toBe(0)
  })

  it("recovers SP, clamping at the derived max SP", () => {
    const raw = warriorInputs({ currentSP: 10 })
    const character = hydrate(raw)

    expect(
      reducePoolsEdit(raw, character, { kind: "recoverSP", amount: 5 })?.row
        .currentSP
    ).toBe(15)
    expect(
      reducePoolsEdit(raw, character, { kind: "recoverSP", amount: 9999 })?.row
        .currentSP
    ).toBe(character.maxSP)
  })

  it("rejects a non-positive recover-SP amount as a no-op", () => {
    const raw = warriorInputs({ currentSP: 10 })
    expect(
      reducePoolsEdit(raw, hydrate(raw), { kind: "recoverSP", amount: 0 })
    ).toBeNull()
  })

  it("rejects a non-positive spend-SP amount as a no-op", () => {
    const raw = warriorInputs({ currentSP: 10 })
    expect(
      reducePoolsEdit(raw, hydrate(raw), { kind: "spendSP", amount: 0 })
    ).toBeNull()
  })

  it("uses a Prisma charge and refuses at 0", () => {
    const raw = warriorInputs({ prismaCharges: 1 })
    expect(
      reducePoolsEdit(raw, hydrate(raw), { kind: "usePrisma" })?.row
        .prismaCharges
    ).toBe(0)

    const empty = warriorInputs({ prismaCharges: 0 })
    expect(
      reducePoolsEdit(empty, hydrate(empty), { kind: "usePrisma" })
    ).toBeNull()
  })

  it("applies damage, flooring at 0", () => {
    const raw = warriorInputs({ currentHP: 5 })
    expect(
      reducePoolsEdit(raw, hydrate(raw), { kind: "damage", amount: 9 })?.row
        .currentHP
    ).toBe(0)
  })

  it("heals, clamping at the derived max HP", () => {
    const raw = warriorInputs({ currentHP: 10 })
    const character = hydrate(raw)
    expect(
      reducePoolsEdit(raw, character, { kind: "heal", amount: 9999 })?.row
        .currentHP
    ).toBe(character.maxHP)
  })
})

describe("reducePoolsEdit — cast", () => {
  it("deducts an SP Skill's resolved cost from the SP pool", () => {
    const raw = warriorInputs({ currentSP: 50 })
    const character = hydrate(raw)
    const cost = skillCost(character, "windblade")
    expect(cost?.kind).toBe("sp")

    const next = reducePoolsEdit(raw, character, {
      kind: "cast",
      skillKey: "windblade",
    })
    expect(next?.row.currentSP).toBe(raw.row.currentSP - cost!.amount)
    expect(next?.row.currentHP).toBe(raw.row.currentHP)
  })

  it("deducts an HP Skill's resolved cost from the HP pool", () => {
    const raw = warriorInputs({ currentHP: 40 })
    const character = hydrate(raw)
    const cost = skillCost(character, "cleave")
    expect(cost?.kind).toBe("hp")

    const next = reducePoolsEdit(raw, character, {
      kind: "cast",
      skillKey: "cleave",
    })
    expect(next?.row.currentHP).toBe(raw.row.currentHP - cost!.amount)
    expect(next?.row.currentSP).toBe(raw.row.currentSP)
  })

  it("is a no-op when the Skill is not on the character", () => {
    const raw = warriorInputs()
    expect(
      reducePoolsEdit(raw, hydrate(raw), {
        kind: "cast",
        skillKey: "not-a-real-skill",
      })
    ).toBeNull()
  })

  it("is a no-op when the character cannot afford the cast", () => {
    const raw = warriorInputs({ currentSP: 0 })
    const character = hydrate(raw)
    expect(skillCost(character, "windblade")?.kind).toBe("sp")
    expect(
      reducePoolsEdit(raw, character, { kind: "cast", skillKey: "windblade" })
    ).toBeNull()
  })
})
