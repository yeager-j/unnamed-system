import { describe, expect, it } from "vitest"

import {
  pathOfDusk,
  setDuskMode,
  type PathOfDuskState,
} from "@workspace/game/engine/mechanics/warlock/path-of-dusk"
import { mechanicStateSchema } from "@workspace/game/foundation/mechanics/schema"

describe("path of Dusk", () => {
  it("starts with Dusk Mode off", () => {
    expect(pathOfDusk.initialState()).toEqual({
      kind: "path-of-dusk",
      duskMode: false,
    })
  })

  it("emits no Effects in MVP (no `effects` method)", () => {
    expect(pathOfDusk.effects).toBeUndefined()
  })

  describe("setDuskMode", () => {
    it("toggles Dusk Mode on and off", () => {
      const off = pathOfDusk.initialState()
      const on = setDuskMode(off, true)
      expect(on.duskMode).toBe(true)
      expect(setDuskMode(on, false).duskMode).toBe(false)
    })

    it("does not mutate the input state", () => {
      const state: PathOfDuskState = pathOfDusk.initialState()
      setDuskMode(state, true)
      expect(state.duskMode).toBe(false)
    })

    it("produces a state that still validates", () => {
      expect(() =>
        mechanicStateSchema.parse(setDuskMode(pathOfDusk.initialState(), true))
      ).not.toThrow()
    })
  })
})
