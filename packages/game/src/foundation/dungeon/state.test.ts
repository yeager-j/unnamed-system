import { describe, expect, it } from "vitest"

import { createDungeonState, dungeonStateSchema } from "./state"

describe("createDungeonState", () => {
  it("mints a fresh delve at turn 0 with nobody acted and reminders off", () => {
    expect(createDungeonState()).toEqual({
      turnCounter: 0,
      actedCharacterIds: [],
      reminderSettings: {
        randomEncounters: { enabled: false, intervalTurns: 6 },
      },
    })
  })

  it("produces a value the schema parses unchanged (idempotent defaults)", () => {
    const state = createDungeonState()
    expect(dungeonStateSchema.parse(state)).toEqual(state)
  })
})
