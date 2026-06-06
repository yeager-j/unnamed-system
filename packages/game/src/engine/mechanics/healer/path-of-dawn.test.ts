import { describe, expect, it } from "vitest"

import {
  pathOfDawn,
  setDawnMode,
  type PathOfDawnState,
} from "@workspace/game/engine/mechanics/healer/path-of-dawn"
import { mechanicStateSchema } from "@workspace/game/foundation/mechanics/schema"

describe("path of dawn", () => {
  it("starts with Dawn Mode off", () => {
    expect(pathOfDawn.initialState()).toEqual({
      kind: "path-of-dawn",
      dawnMode: false,
    })
  })

  it("emits no Effects in MVP (no `effects` method)", () => {
    expect(pathOfDawn.effects).toBeUndefined()
  })

  describe("setDawnMode", () => {
    it("toggles Dawn Mode on and off", () => {
      const off = pathOfDawn.initialState()
      const on = setDawnMode(off, true)
      expect(on.dawnMode).toBe(true)
      expect(setDawnMode(on, false).dawnMode).toBe(false)
    })

    it("does not mutate the input state", () => {
      const state: PathOfDawnState = pathOfDawn.initialState()
      setDawnMode(state, true)
      expect(state.dawnMode).toBe(false)
    })

    it("produces a state that still validates", () => {
      expect(() =>
        mechanicStateSchema.parse(setDawnMode(pathOfDawn.initialState(), true))
      ).not.toThrow()
    })
  })
})
