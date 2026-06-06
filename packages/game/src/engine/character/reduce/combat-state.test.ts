import { describe, expect, it } from "vitest"

import { makeRawCharacterInputs } from "@workspace/game/engine/__fixtures__/character"
import { reduceCombatStateEdit } from "@workspace/game/engine/character/reduce/combat-state"
import { MAX_EXHAUSTION_LEVEL } from "@workspace/game/engine/combat/exhaustion"
import {
  DEFAULT_BATTLE_CONDITIONS,
  type BattleConditions,
} from "@workspace/game/foundation/character/state"

describe("reduceCombatStateEdit — ailments", () => {
  it("replaces the ailment list", () => {
    const raw = makeRawCharacterInputs({ row: { ailments: ["burning"] } })
    expect(
      reduceCombatStateEdit(raw, { kind: "ailments", ailments: ["downed"] })
        ?.row.ailments
    ).toEqual(["downed"])
  })
})

describe("reduceCombatStateEdit — battle conditions", () => {
  it("sets one axis without disturbing the other axes or flags", () => {
    const seeded: BattleConditions = {
      ...DEFAULT_BATTLE_CONDITIONS,
      defense: "decreased",
      charged: true,
    }
    const raw = makeRawCharacterInputs({ row: { battleConditions: seeded } })

    const next = reduceCombatStateEdit(raw, {
      kind: "battleConditionAxis",
      axis: "attack",
      state: "increased",
    })

    expect(next?.row.battleConditions).toStrictEqual({
      ...seeded,
      attack: "increased",
    })
  })

  it("sets the charged flag, merging onto the all-neutral fallback when none persisted", () => {
    const raw = makeRawCharacterInputs({ row: { battleConditions: null } })

    const next = reduceCombatStateEdit(raw, {
      kind: "battleConditionFlag",
      flag: "charged",
      value: true,
    })

    expect(next?.row.battleConditions).toStrictEqual({
      ...DEFAULT_BATTLE_CONDITIONS,
      charged: true,
    })
  })

  it("sets the concentrating flag, preserving an existing axis state", () => {
    const seeded: BattleConditions = {
      ...DEFAULT_BATTLE_CONDITIONS,
      hitEvasion: "increased",
    }
    const raw = makeRawCharacterInputs({ row: { battleConditions: seeded } })

    const next = reduceCombatStateEdit(raw, {
      kind: "battleConditionFlag",
      flag: "concentrating",
      value: true,
    })

    expect(next?.row.battleConditions).toStrictEqual({
      ...seeded,
      concentrating: true,
    })
  })

  it("clears the flag back to false", () => {
    const raw = makeRawCharacterInputs({
      row: {
        battleConditions: { ...DEFAULT_BATTLE_CONDITIONS, concentrating: true },
      },
    })

    const next = reduceCombatStateEdit(raw, {
      kind: "battleConditionFlag",
      flag: "concentrating",
      value: false,
    })

    expect(next?.row.battleConditions?.concentrating).toBe(false)
  })
})

describe("reduceCombatStateEdit — exhaustion", () => {
  it("increments, clamping at the maximum level", () => {
    const raw = makeRawCharacterInputs({
      row: { exhaustion: MAX_EXHAUSTION_LEVEL },
    })
    expect(
      reduceCombatStateEdit(raw, { kind: "exhaustion", direction: "increment" })
        ?.row.exhaustion
    ).toBe(MAX_EXHAUSTION_LEVEL)
  })

  it("increments by one below the ceiling", () => {
    const raw = makeRawCharacterInputs({ row: { exhaustion: 2 } })
    expect(
      reduceCombatStateEdit(raw, { kind: "exhaustion", direction: "increment" })
        ?.row.exhaustion
    ).toBe(3)
  })

  it("decrements, flooring at 0", () => {
    const raw = makeRawCharacterInputs({ row: { exhaustion: 0 } })
    expect(
      reduceCombatStateEdit(raw, { kind: "exhaustion", direction: "decrement" })
        ?.row.exhaustion
    ).toBe(0)
  })

  it("decrements by one above the floor", () => {
    const raw = makeRawCharacterInputs({ row: { exhaustion: 3 } })
    expect(
      reduceCombatStateEdit(raw, { kind: "exhaustion", direction: "decrement" })
        ?.row.exhaustion
    ).toBe(2)
  })
})

describe("reduceCombatStateEdit — clearCombatState", () => {
  it("wipes ailments and resets battle conditions to all-neutral", () => {
    const raw = makeRawCharacterInputs({
      row: {
        ailments: ["downed"],
        battleConditions: { ...DEFAULT_BATTLE_CONDITIONS, attack: "increased" },
      },
    })

    const next = reduceCombatStateEdit(raw, { kind: "clearCombatState" })
    expect(next?.row.ailments).toEqual([])
    expect(next?.row.battleConditions).toStrictEqual(DEFAULT_BATTLE_CONDITIONS)
  })
})
