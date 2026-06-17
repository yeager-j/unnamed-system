import { describe, expect, it } from "vitest"

import { makeDungeonState } from "@workspace/game/engine/__fixtures__/dungeon"
import { makeMapInstanceState } from "@workspace/game/engine/__fixtures__/encounter"
import {
  activeActedCharacterIds,
  deriveDungeonRoster,
  dungeonReminders,
} from "@workspace/game/engine/dungeon/selectors"
import type { RandomEncounterInterval } from "@workspace/game/foundation/dungeon/state"

const free = { zoneId: "zone-a", engagement: { status: "free" } as const }

const withRandom = (
  turnCounter: number,
  enabled: boolean,
  intervalTurns: RandomEncounterInterval
) =>
  makeDungeonState({
    turnCounter,
    reminderSettings: { randomEncounters: { enabled, intervalTurns } },
  })

describe("deriveDungeonRoster", () => {
  it("is the Map Instance occupancy keys", () => {
    const instance = makeMapInstanceState({
      occupancy: { "char-a": free, "char-b": free },
    })

    expect(deriveDungeonRoster(instance).sort()).toEqual(["char-a", "char-b"])
  })

  it("is empty for an Instance with no tokens", () => {
    expect(deriveDungeonRoster(makeMapInstanceState())).toEqual([])
  })
})

describe("activeActedCharacterIds", () => {
  it("keeps acted ids that are still in the roster", () => {
    const state = makeDungeonState({ actedCharacterIds: ["char-a", "char-b"] })

    expect(activeActedCharacterIds(state, ["char-a", "char-b"])).toEqual([
      "char-a",
      "char-b",
    ])
  })

  it("ignores a departed character's stale acted entry", () => {
    const state = makeDungeonState({
      actedCharacterIds: ["char-a", "char-gone"],
    })

    expect(activeActedCharacterIds(state, ["char-a", "char-b"])).toEqual([
      "char-a",
    ])
  })

  it("is empty when the roster is empty", () => {
    const state = makeDungeonState({ actedCharacterIds: ["char-a"] })

    expect(activeActedCharacterIds(state, [])).toEqual([])
  })
})

describe("dungeonReminders — random encounter", () => {
  it("fires at a multiple of the configured interval", () => {
    expect(dungeonReminders(withRandom(6, true, 3))).toContainEqual({
      kind: "random-encounter",
      turn: 6,
    })
  })

  it("does not fire off-cadence", () => {
    expect(dungeonReminders(withRandom(7, true, 3))).toEqual([])
  })

  it("does not fire when disabled, even on a multiple", () => {
    expect(dungeonReminders(withRandom(6, false, 3))).toEqual([])
  })

  it("does not fire at turn 0 (the un-started delve)", () => {
    expect(dungeonReminders(withRandom(0, true, 3))).toEqual([])
  })

  it("honors a different interval (every turn at interval 1)", () => {
    expect(dungeonReminders(withRandom(1, true, 1))).toContainEqual({
      kind: "random-encounter",
      turn: 1,
    })
  })
})

describe("dungeonReminders — exhaustion onset", () => {
  it("fires at the first +3 threshold past the 48-turn day (turn 51)", () => {
    expect(dungeonReminders(makeDungeonState({ turnCounter: 51 }))).toEqual([
      { kind: "exhaustion-onset", turn: 51 },
    ])
  })

  it("fires at the next threshold (turn 54)", () => {
    expect(dungeonReminders(makeDungeonState({ turnCounter: 54 }))).toEqual([
      { kind: "exhaustion-onset", turn: 54 },
    ])
  })

  it.each([48, 49, 50, 52, 53])("does not fire at turn %i", (turnCounter) => {
    expect(dungeonReminders(makeDungeonState({ turnCounter }))).toEqual([])
  })

  it("never fires on or before the 48-turn day", () => {
    for (let turn = 0; turn <= 48; turn++) {
      expect(dungeonReminders(makeDungeonState({ turnCounter: turn }))).toEqual(
        []
      )
    }
  })
})

describe("dungeonReminders — both at once", () => {
  it("returns both nudges when the turn is both a random multiple and an exhaustion threshold", () => {
    // turn 54: multiple of interval 6 AND 48 + 3·2.
    const reminders = dungeonReminders(withRandom(54, true, 6))

    expect(reminders).toContainEqual({ kind: "random-encounter", turn: 54 })
    expect(reminders).toContainEqual({ kind: "exhaustion-onset", turn: 54 })
  })
})
