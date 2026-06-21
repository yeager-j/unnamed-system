import { describe, expect, it } from "vitest"

import {
  makeDungeonState,
  reduceDungeonFix,
} from "@workspace/game/engine/__fixtures__/dungeon"

describe("reduceDungeon — markActed", () => {
  it("records a character as having acted this turn", () => {
    const next = reduceDungeonFix(makeDungeonState(), {
      kind: "markActed",
      characterId: "char-a",
    })

    expect(next.actedCharacterIds).toEqual(["char-a"])
  })

  it("appends without dropping characters who already acted", () => {
    const next = reduceDungeonFix(
      makeDungeonState({ actedCharacterIds: ["char-a"] }),
      { kind: "markActed", characterId: "char-b" }
    )

    expect(next.actedCharacterIds).toEqual(["char-a", "char-b"])
  })

  it("is idempotent — re-marking an acted character adds no duplicate", () => {
    const next = reduceDungeonFix(
      makeDungeonState({ actedCharacterIds: ["char-a"] }),
      { kind: "markActed", characterId: "char-a" }
    )

    expect(next.actedCharacterIds).toEqual(["char-a"])
  })

  it("leaves the turn counter untouched", () => {
    const next = reduceDungeonFix(makeDungeonState({ turnCounter: 5 }), {
      kind: "markActed",
      characterId: "char-a",
    })

    expect(next.turnCounter).toBe(5)
  })

  it("does not mutate the input state", () => {
    const state = makeDungeonState()
    reduceDungeonFix(state, { kind: "markActed", characterId: "char-a" })

    expect(state.actedCharacterIds).toEqual([])
  })
})

describe("reduceDungeon — advanceTurn", () => {
  it("increments the turn counter by one", () => {
    const next = reduceDungeonFix(makeDungeonState({ turnCounter: 7 }), {
      kind: "advanceTurn",
    })

    expect(next.turnCounter).toBe(8)
  })

  it("clears the acted set for the fresh turn", () => {
    const next = reduceDungeonFix(
      makeDungeonState({
        turnCounter: 3,
        actedCharacterIds: ["char-a", "char-b"],
      }),
      { kind: "advanceTurn" }
    )

    expect(next.actedCharacterIds).toEqual([])
  })

  it("preserves the reminder settings", () => {
    const settings = {
      randomEncounters: { enabled: true, intervalTurns: 3 as const },
    }
    const next = reduceDungeonFix(
      makeDungeonState({ reminderSettings: settings }),
      { kind: "advanceTurn" }
    )

    expect(next.reminderSettings).toEqual(settings)
  })

  it("does not mutate the input state", () => {
    const state = makeDungeonState({
      turnCounter: 2,
      actedCharacterIds: ["char-a"],
    })
    reduceDungeonFix(state, { kind: "advanceTurn" })

    expect(state).toEqual(
      makeDungeonState({ turnCounter: 2, actedCharacterIds: ["char-a"] })
    )
  })
})
