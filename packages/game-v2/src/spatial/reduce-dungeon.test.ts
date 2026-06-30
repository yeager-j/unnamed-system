import { describe, expect, it } from "vitest"

import { free, makeMapInstanceState } from "./__fixtures__/spatial"
import { createDungeonState, type DungeonState } from "./dungeon.schema"
import {
  activeActedCharacterIds,
  deriveDungeonRoster,
  dungeonReminders,
  reduceDungeon,
} from "./reduce-dungeon"

const dungeon = (overrides: Partial<DungeonState> = {}): DungeonState => ({
  ...createDungeonState(),
  ...overrides,
})

describe("reduceDungeon (the exploration turn loop, SD11)", () => {
  describe("markActed", () => {
    it("records a character that has acted this turn", () => {
      const next = reduceDungeon(dungeon(), {
        kind: "markActed",
        characterId: "c1",
      })
      expect(next.actedCharacterIds).toEqual(["c1"])
    })

    it("is a same-ref no-op for an already-acted id (idempotent)", () => {
      const state = dungeon({ actedCharacterIds: ["c1"] })
      const next = reduceDungeon(state, {
        kind: "markActed",
        characterId: "c1",
      })
      expect(next).toBe(state)
    })
  })

  describe("advanceTurn", () => {
    it("increments the counter and clears the acted set", () => {
      const state = dungeon({ turnCounter: 4, actedCharacterIds: ["c1", "c2"] })
      const next = reduceDungeon(state, { kind: "advanceTurn" })
      expect(next.turnCounter).toBe(5)
      expect(next.actedCharacterIds).toEqual([])
    })
  })
})

describe("derived delve roster (not stored, SD11)", () => {
  it("deriveDungeonRoster reads the occupancy keys (characterIds)", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: { c1: free("z1"), c2: free("z1") },
    })
    expect(deriveDungeonRoster(mapInstance).sort()).toEqual(["c1", "c2"])
  })

  it("activeActedCharacterIds prunes stale ids of departed characters at read-time", () => {
    const state = dungeon({ actedCharacterIds: ["c1", "departed"] })
    expect(activeActedCharacterIds(state, ["c1", "c2"])).toEqual(["c1"])
  })
})

describe("dungeonReminders (pure selectors over the turn counter)", () => {
  it("fires the random-encounter nudge at each interval multiple when enabled", () => {
    const state = dungeon({
      turnCounter: 6,
      reminderSettings: {
        randomEncounters: { enabled: true, intervalTurns: 6 },
      },
    })
    expect(dungeonReminders(state)).toContainEqual({
      kind: "random-encounter",
      turn: 6,
    })
  })

  it("never fires random-encounter on the un-started delve (turn 0)", () => {
    const state = dungeon({
      turnCounter: 0,
      reminderSettings: {
        randomEncounters: { enabled: true, intervalTurns: 6 },
      },
    })
    expect(dungeonReminders(state)).toEqual([])
  })

  it("fires exhaustion-onset from turn 49 on the 3-turn cadence, always-on", () => {
    expect(dungeonReminders(dungeon({ turnCounter: 49 }))).toContainEqual({
      kind: "exhaustion-onset",
      turn: 49,
    })
    expect(dungeonReminders(dungeon({ turnCounter: 52 }))).toContainEqual({
      kind: "exhaustion-onset",
      turn: 52,
    })
    expect(dungeonReminders(dungeon({ turnCounter: 50 }))).toEqual([])
  })
})
