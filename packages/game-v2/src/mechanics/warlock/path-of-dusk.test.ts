import { describe, expect, it } from "vitest"

import {
  pathOfDusk,
  setDuskMode,
} from "@workspace/game-v2/mechanics/warlock/path-of-dusk"

describe("Path of Dusk", () => {
  it("starts out of Dusk Mode and emits no effect (display-only)", () => {
    expect(pathOfDusk.initialState()).toEqual({
      kind: "path-of-dusk",
      duskMode: false,
    })
    expect(pathOfDusk.effects).toBeUndefined()
  })

  it("setDuskMode toggles the flag purely", () => {
    const state = pathOfDusk.initialState()
    expect(setDuskMode(state, true)).toEqual({
      kind: "path-of-dusk",
      duskMode: true,
    })
    expect(state.duskMode).toBe(false)
  })
})
