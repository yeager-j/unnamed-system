import { describe, expect, it } from "vitest"

import { elementalLarceny } from "@workspace/game/engine/mechanics/thief/elemental-larceny"
import { mechanicStateSchema } from "@workspace/game/foundation/mechanics/schema"

describe("elemental Larceny", () => {
  it("has an empty, discriminant-only initial state", () => {
    expect(elementalLarceny.initialState()).toEqual({
      kind: "elemental-larceny",
    })
  })

  it("emits no Effects (no `effects` method) — Tells are tracked at the table", () => {
    expect(elementalLarceny.effects).toBeUndefined()
  })

  it("resets each encounter", () => {
    expect(elementalLarceny.resetOn).toBe("encounter")
  })

  it("produces a state that validates against the persisted union", () => {
    expect(() =>
      mechanicStateSchema.parse(elementalLarceny.initialState())
    ).not.toThrow()
  })
})
