import { describe, expect, it } from "vitest"

import {
  pathOfDawn,
  setDawnMode,
} from "@workspace/game-v2/mechanics/healer/path-of-dawn"

describe("Path of Dawn", () => {
  it("starts out of Dawn Mode and emits no effect (display-only)", () => {
    expect(pathOfDawn.initialState()).toEqual({
      kind: "path-of-dawn",
      dawnMode: false,
    })
    expect(pathOfDawn.effects).toBeUndefined()
  })

  it("setDawnMode toggles the flag purely", () => {
    const state = pathOfDawn.initialState()
    expect(setDawnMode(state, true)).toEqual({
      kind: "path-of-dawn",
      dawnMode: true,
    })
    expect(state.dawnMode).toBe(false)
  })
})
