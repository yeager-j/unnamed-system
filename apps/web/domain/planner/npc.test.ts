import { describe, expect, it } from "vitest"

import { isStubNpc } from "./npc"

describe("isStubNpc", () => {
  it("is a stub when arcana, lineage, and narrative are all absent", () => {
    expect(
      isStubNpc({ arcana: null, lineageKey: null, entity: { narrative: null } })
    ).toBe(true)
  })

  it("stops being a stub when any single facet is authored", () => {
    expect(
      isStubNpc({
        arcana: "The Moon",
        lineageKey: null,
        entity: { narrative: null },
      })
    ).toBe(false)
    expect(
      isStubNpc({
        arcana: null,
        lineageKey: "warlock",
        entity: { narrative: null },
      })
    ).toBe(false)
    expect(
      isStubNpc({
        arcana: null,
        lineageKey: null,
        entity: { narrative: { backstory: "Once…" } },
      })
    ).toBe(false)
  })
})
