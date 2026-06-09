import { describe, expect, it } from "vitest"

import { thiefsInsight } from "@workspace/game/engine/mechanics/thief/thiefs-insight"
import { mechanicStateSchema } from "@workspace/game/foundation/mechanics/schema"

describe("thief's Insight", () => {
  it("has an empty, discriminant-only initial state", () => {
    expect(thiefsInsight.initialState()).toEqual({ kind: "thiefs-insight" })
  })

  it("emits no Effects (no `effects` method) — Tells are tracked at the table", () => {
    expect(thiefsInsight.effects).toBeUndefined()
  })

  it("resets each encounter", () => {
    expect(thiefsInsight.resetOn).toBe("encounter")
  })

  it("produces a state that validates against the persisted union", () => {
    expect(() =>
      mechanicStateSchema.parse(thiefsInsight.initialState())
    ).not.toThrow()
  })
})
